(() => {
  'use strict';
  const CGN = globalThis.CGN ||= {};
  const delay = (ms,signal) => new Promise(resolve => {
    if (signal.aborted) {resolve();return;}
    const done = () => {clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};
    const timer = setTimeout(done,ms);signal.addEventListener('abort',done,{once:true});
  });
  class Navigator {
    constructor({index,rescan,onStatus,onBusy,onActive}) {
      Object.assign(this,{index,rescan,onStatus,onBusy,onActive});
      this.operation = null;this.restoration = null;this.pendingId = null;this.continuation = null;this.highlights = new Map();
      this.onGesture = event => {
        if (event.composedPath().some(el => el?.id === 'cgn-host')) return;
        if (event.type === 'keydown' && !['Escape','ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) return;
        if (this.operation || this.restoration) {
          const restore = event.type === 'keydown' && event.key === 'Escape';
          this.cancel(restore,restore ? '已停止操作，已恢复阅读位置。' : '已停止操作，保留当前阅读位置。');
        }
      };
      for (const name of ['wheel','touchstart','pointerdown','keydown']) window.addEventListener(name,this.onGesture,{capture:true,passive:true});
    }
    scroller() {
      const root = CGN.DOM.conversationRoot();
      if (!root) return null;
      const marked = root.matches('[data-app-action-timeline-scroll]') ? root : root.querySelector('[data-app-action-timeline-scroll]');
      if (marked && marked.clientHeight > 0) return marked;
      const first = this.index.order.find(r => this.index.target(r.id));
      return CGN.DOM.scrollParent(CGN.DOM.layoutTarget?.(first?.element) || first?.element || root.firstElementChild || root);
    }
    readingPosition(scroller,prepend = false) {
      const originalTop = scroller.scrollTop,originalHeight = scroller.scrollHeight,view = CGN.DOM.viewport(scroller);
      let anchor = null;
      // A reading point is often inside a long answer. Preserve its own turn,
      // including an offscreen top, rather than requiring a visible user bubble.
      for (const turn of CGN.DOM.conversationRoot()?.querySelectorAll('[data-turn-key]') || []) {
        const rect = turn.getBoundingClientRect();
        if (rect.height > 0 && rect.bottom > view.top+12 && rect.top < view.bottom-12) {
          anchor = {key:turn.getAttribute('data-turn-key'),offset:rect.top-view.top};break;
        }
      }
      if (!anchor) {
        for (const record of this.index.order) {
          const element = this.index.target(record.id);
          if (!element) continue;
          const layout = CGN.DOM.layoutTarget?.(element) || element,rect = layout.getBoundingClientRect();
          if (rect.bottom > view.top && rect.top < view.bottom) {anchor = {id:record.id,offset:rect.top-view.top};break;}
        }
      }
      const sample = () => {
        const root = CGN.DOM.conversationRoot();
        const element = anchor?.key ? root?.querySelector(`[data-turn-key="${CSS.escape(anchor.key)}"]`) : anchor?.id ? this.index.target(anchor.id) : null;
        const layout = element && (CGN.DOM.layoutTarget?.(element) || element);
        const rect = layout?.getBoundingClientRect(),viewport = CGN.DOM.viewport(scroller);
        return rect?.height > 0 ? {error:rect.top-viewport.top-anchor.offset} : null;
      };
      const restore = () => {
        const point = sample();
        const top = point ? scroller.scrollTop+point.error : originalTop+(prepend ? Math.max(0,scroller.scrollHeight-originalHeight) : 0);
        scroller.scrollTo({top,behavior:'instant'});return !!point;
      };
      restore.settle = async signal => {
        let stable = 0;
        for (let attempt = 0;attempt < 6 && !signal.aborted;attempt++) {
          restore();await delay(180,signal);
          if (signal.aborted) return false;
          this.rescan();
          const point = sample();
          if (point && Math.abs(point.error) < 12) stable++;else stable = 0;
          if (stable >= 2) return true;
        }
        return false;
      };
      return restore;
    }
    cancel(restore = true,status = '') {
      this.restoration?.abort();this.restoration = null;
      const op = this.operation;
      if (!op) {if (status) this.onStatus(status.replace('已恢复阅读位置','已尽量恢复阅读位置'));return;}
      this.operation = null;op.controller.abort();this.index.discoveryDirection = 0;
      op.scroller?.scrollTo({top:op.scroller.scrollTop,behavior:'instant'});
      this.onBusy(false);
      if (restore && op.restore) {
        op.restore();
        const controller = new AbortController();this.restoration = controller;
        if (status) this.onStatus(status.replace('已恢复阅读位置','正在恢复阅读位置'));
        op.restore.settle(controller.signal).then(exact => {
          if (this.restoration !== controller || controller.signal.aborted) return;
          this.restoration = null;
          if (status) this.onStatus(exact ? status : status.replace('已恢复阅读位置','已尽量恢复阅读位置，原位置无法精确确认'));
        });
      } else if (status) this.onStatus(status);
    }
    current(op) {return this.operation === op && !op.controller.signal.aborted;}
    async settle(op,maximum = 1500) {
      let previous = op.scroller.scrollTop,stable = 0;
      const until = performance.now()+maximum;
      while (this.current(op) && performance.now() < until) {
        await delay(65,op.controller.signal);
        if (Math.abs(op.scroller.scrollTop-previous) < 1) stable++;else stable = 0;
        previous = op.scroller.scrollTop;
        if (stable >= 4) break;
      }
      if (this.current(op)) this.rescan();
    }
    async mounted(id,op,maximum = 1100) {
      const until = performance.now()+maximum;
      while (this.current(op)) {
        this.rescan();
        const element = this.index.target(id);
        if (element) return element;
        if (performance.now() >= until) return null;
        await delay(120,op.controller.signal);
      }
      return null;
    }
    alignment(element,scroller) {
      const layout = CGN.DOM.layoutTarget?.(element) || element;
      const rect = layout.getBoundingClientRect(),view = CGN.DOM.viewport(scroller);
      const desired = scroller.scrollTop+rect.top-view.top-Math.min(100,view.height*.22);
      const top = Math.max(0,Math.min(Math.max(0,scroller.scrollHeight-scroller.clientHeight),desired));
      return {top,aligned:Math.abs(scroller.scrollTop-top) < 36};
    }
    async jump(id) {
      this.cancel(false);this.rescan();
      const record = this.index.get(id),scroller = this.scroller();
      if (!record || !scroller) {this.onStatus('当前会话中找不到该问题，未执行跳转。');return false;}
      const controller = new AbortController();
      const op = {controller,scroller,restore:this.readingPosition(scroller)};this.operation = op;
      this.pendingId = id;this.onBusy(true);
      let element = this.index.target(id);
      try {
        if (!element) {
          const placeholder = this.index.placeholder(id);
          const rect = placeholder?.getBoundingClientRect(),view = CGN.DOM.viewport(scroller);
          const knownTop = rect?.height > 0 ? scroller.scrollTop+rect.top-view.top : record.hint?.top;
          if (!Number.isFinite(knownTop)) {
            this.onStatus('该问题原文尚未加载且缺少可靠位置。请点击“加载更早消息”；不会跳转到其他问题。');
            return false;
          }
          this.onStatus('正在恢复所选问题的原文…可随时停止。');
          const step = Math.max(240,view.height*.7);
          // Coordinates are hints; require stable identity and full-text checks.
          for (const offset of [0,-step,step,-step*2,step*2]) {
            if (!this.current(op)) return false;
            scroller.scrollTo({top:Math.max(0,knownTop+offset-Math.min(100,view.height*.22)),behavior:offset === 0 ? this.behavior() : 'instant'});
            await this.settle(op,1100);
            element = await this.mounted(id,op,offset === 0 ? 1400 : 350);
            if (element) break;
          }
        }
        if (!this.current(op)) return false;
        if (!element) {
          const restored = await op.restore.settle(controller.signal);
          if (!this.current(op)) return false;
          this.onStatus(`未能恢复所选问题的原文，${restored ? '已恢复阅读位置' : '已尽量恢复阅读位置，原位置无法精确确认'}。可主动加载历史后重试；未执行跳转。`);
          return false;
        }
        // Remeasure after mounting: the virtualizer may have changed row heights.
        let aligned = false;
        for (let attempt = 0;attempt < 4 && this.current(op);attempt++) {
          scroller.scrollTo({top:this.alignment(element,scroller).top,behavior:this.behavior()});
          await this.settle(op);
          await delay(180,controller.signal);
          element = await this.mounted(id,op,700);
          if (!element) break;
          if (this.alignment(element,scroller).aligned && CGN.DOM.visible(element)) {
            await delay(180,controller.signal);
            if (!this.current(op)) return false;
            this.rescan();element = this.index.target(id);
            if (element && this.alignment(element,scroller).aligned && CGN.DOM.visible(element)) {aligned = true;break;}
          }
        }
        if (!this.current(op)) return false;
        if (!element || !CGN.DOM.visible(element)) {
          this.onStatus('未能确认目标已进入可视区域。页面可能正在重新加载消息；请重试。');return false;
        }
        if (!aligned) {this.onStatus('已找到所选问题原文，但页面布局仍在变化，未能稳定定位。请重试。');return false;}
        this.pendingId = null;this.onActive(id);this.onStatus('已定位到所选问题。');
        this.highlight(CGN.DOM.layoutTarget?.(element) || element);return true;
      } finally {
        if (this.operation === op) {this.operation = null;this.onBusy(false);}
      }
    }
    behavior() {return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';}
    highlight(element) {
      const old = this.highlights.get(element);
      if (old) {clearTimeout(old.timer);old.animation?.cancel();}
      element.setAttribute('data-cgn-highlight','true');
      const animation = element.animate?.([
        {outline:'3px solid rgba(16,163,127,.8)',outlineOffset:'6px'},
        {outline:'3px solid rgba(16,163,127,0)',outlineOffset:'6px'}
      ],{duration:1400,easing:'ease-out'});
      const timer = setTimeout(() => {element.removeAttribute('data-cgn-highlight');this.highlights.delete(element);},1450);
      this.highlights.set(element,{timer,animation});
    }
    async loadEarlier() {
      this.cancel(true);this.rescan();
      const scroller = this.scroller();
      if (!scroller) {this.onStatus('没有找到对话区域，无法加载历史。');return;}
      const controller = new AbortController();
      const op = {controller,scroller,restore:this.readingPosition(scroller,true)};this.operation = op;
      const before = this.index.order.length,started = performance.now(),targetId = this.pendingId;
      this.onBusy(true);this.index.discoveryDirection = -1;
      this.onStatus('正在逐段读取更早提问…可随时停止；完成后恢复阅读位置。');
      let atTop = false,exhausted = false,lastStatus = 0,foundTarget = false;
      try {
        if (this.continuation && this.continuation.scroller === scroller) {
          scroller.scrollTo({top:this.continuation.top,behavior:'instant'});await this.settle(op,500);
        }
        for (let step = 0;step < 120 && this.current(op);step++) {
          const view = CGN.DOM.viewport(scroller),previous = scroller.scrollTop;
          let next = Math.max(0,previous-Math.max(180,view.height*.72));
          // The live page wraps a complete user/assistant turn in one stable
          // data-turn-key node. When reading inside that SAME long turn, its
          // beginning can be visited directly instead of paging through a huge
          // assistant answer. Never leap across unknown gaps or other turns.
          for (const turn of CGN.DOM.conversationRoot()?.querySelectorAll('[data-turn-key]') || []) {
            const rect = turn.getBoundingClientRect();
            if (rect.height > view.height && rect.top < view.top-180 && rect.bottom > view.top+16) {
              next = Math.max(0,Math.min(next,previous+rect.top-view.top-24));
              break;
            }
          }
          const oldHeight = scroller.scrollHeight,oldCount = this.index.order.length;
          scroller.scrollTo({top:next,behavior:'instant'});
          // Overlapping viewport-sized steps collect virtual rows between ends.
          await delay(180,controller.signal);
          if (!this.current(op)) break;
          this.rescan();this.continuation = {scroller,top:scroller.scrollTop};
          if (targetId && this.index.target(targetId)) {foundTarget = true;break;}
          const now = performance.now();
          if (now-lastStatus > 300) {
            this.onStatus(`正在读取更早提问，已索引 ${this.index.order.length} 条（新增 ${this.index.order.length-before} 条）…可随时停止。`);lastStatus = now;
          }
          if (next < 2 && scroller.scrollTop < 2) {
            // Give the website's top sentinel time to deliver older content.
            const deadline = Math.min(performance.now()+8000,started+30000);
            while (this.current(op) && performance.now() < deadline) {
              await delay(180,controller.signal);
              if (!this.current(op)) break;
              this.rescan();
              if (scroller.scrollHeight > oldHeight+4 || scroller.scrollTop > 4 || this.index.order.length > oldCount) break;
            }
            if (!this.current(op)) break;
            if (scroller.scrollTop < 2 && scroller.scrollHeight <= oldHeight+4) {atTop = true;break;}
          }
          if (now-started > 30000 || step === 119) {exhausted = true;break;}
        }
        if (!this.current(op)) return;
        this.index.discoveryDirection = 0;
        if (atTop) this.continuation = null;
        if (foundTarget) {this.operation = null;this.onBusy(false);await this.jump(targetId);return;}
        this.onStatus('历史读取结束，正在恢复原消息的阅读位置…');
        const restored = await op.restore.settle(controller.signal);
        if (!this.current(op)) return;
        this.operation = null;this.onBusy(false);
        const restoreText = restored ? '已恢复阅读位置' : '已尽量恢复阅读位置，原位置无法精确确认';
        const added = this.index.order.length-before;
        const result = atTop
          ? `本次新增 ${added} 条，已读到当前页面顶部，${restoreText}。网站若仍隐藏部分历史，目录可能不完整。`
          : exhausted
            ? `本次新增 ${added} 条，${restoreText}。长对话尚未读完，再点“加载更早消息”会从上次位置继续。`
            : `本次新增 ${added} 条，${restoreText}。未确认已加载全部历史。`;
        this.onStatus(targetId ? `所选问题原文仍未恢复，未执行跳转。${result}` : result);
      } finally {
        if (this.operation === op) {this.operation = null;this.index.discoveryDirection = 0;this.onBusy(false);}
      }
    }
    reset() {
      this.cancel(false);this.pendingId = null;this.continuation = null;this.index.discoveryDirection = 0;
      for (const [el,value] of this.highlights) {clearTimeout(value.timer);value.animation?.cancel();el.removeAttribute('data-cgn-highlight');}
      this.highlights.clear();
    }
    destroy() {
      this.reset();
      for (const name of ['wheel','touchstart','pointerdown','keydown']) window.removeEventListener(name,this.onGesture,true);
    }
  }
  CGN.Navigator = Navigator;
})();
