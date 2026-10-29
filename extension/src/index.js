(() => {
  'use strict';
  const CGN = globalThis.CGN ||= {};
  class MessageIndex {
    constructor() { this.reset(); }
    reset() {
      this.records = new Map(); this.order = []; this.nodes = new WeakMap();
      this.sequence = 0; this.revision = 0; this.ambiguousOrder = false; this.ordinalReliable = true;
      this.discoveryDirection = 0; this.observedDirection = 0; this.lastScrollTop = null;
    }
    ingest(elements) {
      let changed = false;
      const unique = [...new Set(elements)].filter(el => CGN.DOM.eligible(el));
      const fresh = [];
      for (const element of unique) {
        const {key, ordinal} = CGN.DOM.identity(element);
        const value = CGN.DOM.text(element);
        let record = this.records.get(key || this.nodes.get(element));
        if (record && record.element?.isConnected && record.element !== element && CGN.DOM.eligible(record.element) && CGN.DOM.rendered(record.element)) {
          // Duplicate DOM copies with the same stable identity are one message.
          // If the first is hidden, the visible replacement can take over below.
          continue;
        }
        // Without a stable id, equal text is not evidence of equal identity.
        // A new "继续" must never bind to an older, detached "继续".
        if (!record) {
          const id = key || `local:${++this.sequence}`;
          record = {id, stableKey: key, ordinal, text: value, element, available: true};
          this.records.set(id, record); fresh.push(record); changed = true;
        } else {
          if (record.text !== value || !record.available) changed = true;
          record.text = value; record.element = element; record.ordinal = ordinal; record.available = true;
        }
        this.nodes.set(element, record.id);
        record.turnKey = element.closest('[data-turn-key]')?.getAttribute('data-turn-key') || null;
        // A virtualizer removes the message body while retaining a measured turn
        // placeholder. Keep only coordinates/keys, never a detached subtree.
        const layout = CGN.DOM.layoutTarget?.(element) || element;
        const scroller = CGN.DOM.scrollParent(layout);
        const rect = layout.getBoundingClientRect(), view = CGN.DOM.viewport(scroller);
        if (rect.height > 0 && view.height > 0) {
          record.hint = {top:scroller.scrollTop + rect.top - view.top,scrollHeight:scroller.scrollHeight,width:scroller.clientWidth};
          if (this.lastScrollTop !== null && Math.abs(scroller.scrollTop-this.lastScrollTop) > 2) this.observedDirection = Math.sign(scroller.scrollTop-this.lastScrollTop);
          this.lastScrollTop = scroller.scrollTop;
        }
      }
      if (fresh.length) {
        const live = [...this.order, ...fresh].filter(r => r.element?.isConnected && CGN.DOM.eligible(r.element));
        live.sort((a,b) => a.element === b.element ? 0 : a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
        const freshSet = new Set(fresh);
        const all = [...this.order,...fresh];
        const turnPositions = new Map();
        for (const el of CGN.DOM.conversationRoot()?.querySelectorAll('[data-turn-key]') || []) {
          const key = el.getAttribute('data-turn-key');
          if (!turnPositions.has(key)) turnPositions.set(key,turnPositions.size);
        }
        const placeholderOrder = all.every(r => r.turnKey && turnPositions.has(r.turnKey));
        if (live.some((r,i) => i && r.ordinal !== null && live[i-1].ordinal !== null && r.ordinal <= live[i-1].ordinal)) this.ordinalReliable = false;
        const sortable = this.ordinalReliable && all.every(r => r.ordinal !== null) && new Set(all.map(r => r.ordinal)).size === all.length;
        if (!this.order.length) { this.order = live; }
        else if (placeholderOrder) {this.order = all.sort((a,b) => turnPositions.get(a.turnKey)-turnPositions.get(b.turnKey));}
        else if (sortable) {this.order = all.sort((a,b) => a.ordinal-b.ordinal);}
        else {
          const known = new Set(this.order);
          // Explicit upward discovery may mount a batch with no surviving body
          // in common. Its DOM order is reliable; scroll pixel values can shift
          // when ChatGPT remeasures rows and must not determine message order.
          if (!live.some(r => known.has(r)) && (this.discoveryDirection || this.observedDirection) < 0) {
            this.order.unshift(...live.filter(r => freshSet.has(r)));
            changed = this.refreshAvailability() || changed;
            if (changed) this.revision++;
            return changed;
          }
          const nextAnchors = new Array(live.length);
          let nextAnchor = null;
          for (let i = live.length-1; i >= 0; i--) {nextAnchors[i] = nextAnchor;if (known.has(live[i])) nextAnchor = live[i];}
          let previous = null;
          for (let i = 0; i < live.length; i++) {
            const r = live[i]; if (!freshSet.has(r)) {previous = r;continue;}
            const next = nextAnchors[i], prev = previous;
            if (next && this.order.includes(next)) this.order.splice(this.order.indexOf(next),0,r);
            else if (prev) this.order.splice(this.order.indexOf(prev)+1,0,r);
            else if (this.ordinalReliable && r.ordinal !== null && this.order.every(x => x.ordinal !== null)) {
              const pos = this.order.findIndex(x => x.ordinal > r.ordinal);
              this.order.splice(pos < 0 ? this.order.length : pos,0,r);
            } else {
              if (this.order.length && this.order.every(x => !x.element?.isConnected)) this.ambiguousOrder = true;
              this.order.push(r);
            }
            previous = r;
          }
        }
      }
      changed = this.refreshAvailability() || changed;
      if (changed) this.revision++;
      return changed;
    }
    refreshAvailability() {
      let changed = false;
      for (const record of this.order) {
        const identityMatches = !record.stableKey || (record.element && CGN.DOM.identity(record.element).key === record.stableKey);
        const available = !!record.element?.isConnected && identityMatches && CGN.DOM.eligible(record.element) && CGN.DOM.rendered(record.element);
        if (record.available !== available) { record.available = available; changed = true; }
        // Do not keep a detached subtree (potentially many assistant messages) alive.
        if (!available) record.element = null;
      }
      return changed;
    }
    get(id) { return this.records.get(id); }
    placeholder(id) {
      const key = this.get(id)?.turnKey;
      if (!key) return null;
      return CGN.DOM.conversationRoot()?.querySelector(`[data-turn-key="${CSS.escape(key)}"]`) || null;
    }
    entries() { return this.order.map((r,i) => ({id:r.id,text:r.text,available:r.available,number:i+1})); }
    target(id) {
      const r = this.get(id);
      if (!r?.element?.isConnected || !CGN.DOM.eligible(r.element)) return null;
      const identity = CGN.DOM.identity(r.element).key;
      // Never jump to a recycled virtual row or a different message's node.
      if (r.stableKey && r.stableKey !== identity) return null;
      if (CGN.DOM.text(r.element) !== r.text) return null;
      return r.element;
    }
  }
  CGN.MessageIndex = MessageIndex;
})();
