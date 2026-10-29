/* Conversation Navigator panel. All UI and styles stay inside its shadow root. */
(() => {
  'use strict';

  const CGN = globalThis.CGN = globalThis.CGN || {};
  const SUMMARY_LENGTH = 52;
  const fold = (value) => String(value).toLowerCase();
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const icon = (kind) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', {
      list: 'M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01',
      close: 'M6 6l12 12M18 6L6 18',
      search: 'M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
      refresh: 'M20 7v5h-5M4 17v-5h5M6.1 6.1A8.3 8.3 0 0 1 20 12M4 12a8.3 8.3 0 0 0 13.9 5.9',
    }[kind] || '');
    svg.append(path);
    return svg;
  };

  // Folded offsets may differ from source offsets (for example, capital İ).
  // Work in code points so an emoji is never split by truncation or highlighting.
  const summarize = (text, query) => {
    text = text.replace(/\s+/g, ' ').trim();
    const points = Array.from(text);
    const foldedParts = points.map(fold);
    const foldedText = foldedParts.join('');
    const first = query ? foldedText.indexOf(query) : -1;
    let matchPoint = -1;
    if (first >= 0) {
      let offset = 0;
      for (let i = 0; i < points.length; i += 1) {
        if (offset + foldedParts[i].length > first) { matchPoint = i; break; }
        offset += foldedParts[i].length;
      }
    }
    const start = matchPoint >= SUMMARY_LENGTH ? Math.max(0, matchPoint - 12) : 0;
    const end = Math.min(points.length, start + SUMMARY_LENGTH);
    return `${start ? '…' : ''}${points.slice(start, end).join('')}${end < points.length ? '…' : ''}`;
  };

  const appendHighlight = (element, text, query) => {
    element.replaceChildren();
    if (!query) { element.append(document.createTextNode(text)); return; }
    const points = Array.from(text);
    let offset = 0;
    const ranges = points.map((point) => {
      const start = offset;
      offset += fold(point).length;
      return { point, start, end: offset };
    });
    const foldedText = fold(text);
    const matches = [];
    let cursor = 0;
    while (cursor < foldedText.length) {
      const index = foldedText.indexOf(query, cursor);
      if (index < 0) break;
      matches.push([index, index + query.length]);
      cursor = index + query.length;
    }
    let chunk = '';
    let marked = false;
    let matchIndex = 0;
    const flush = () => {
      if (!chunk) return;
      if (marked) element.append(make('mark', '', chunk));
      else element.append(document.createTextNode(chunk));
      chunk = '';
    };
    for (const range of ranges) {
      while (matchIndex < matches.length && matches[matchIndex][1] <= range.start) matchIndex += 1;
      const match = matches[matchIndex];
      const nextMarked = Boolean(match && match[0] < range.end && match[1] > range.start);
      if (nextMarked !== marked) { flush(); marked = nextMarked; }
      chunk += range.point;
    }
    flush();
  };

  const STYLES = `
    :host { all: initial; color-scheme: light dark; --cgn-bottom: 168px;
      --bg: #ffffff; --surface: #f7f7f5; --hover: #eeeeeb; --ink: #252723;
      --muted: #70736b; --line: #e4e5df; --accent: #237c67; --selected: #edf5f0;
      --mark: #f4e6aa; --shadow: 0 10px 38px #00000012, 0 2px 8px #00000008;
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      position: fixed; z-index: 2147483000; inset: 0; pointer-events: none;
    }
    :host([data-theme="dark"]) { color-scheme: dark; --bg: #252725; --surface: #2d302d;
      --hover: #383c37; --ink: #e8eae5; --muted: #acb1a7; --line: #41453e;
      --accent: #8dc9ad; --selected: #2e3e35; --mark: #625526;
      --shadow: 0 10px 38px #00000038, 0 2px 8px #00000020;
    }
    @media (prefers-color-scheme: dark) {
      :host(:not([data-theme="light"]):not([data-theme="dark"])) {
        color-scheme: dark; --bg: #252725; --surface: #2d302d; --hover: #383c37;
        --ink: #e8eae5; --muted: #acb1a7; --line: #41453e; --accent: #8dc9ad;
        --selected: #2e3e35; --mark: #625526; --shadow: 0 10px 38px #00000038;
      }
    }
    *, *::before, *::after { box-sizing: border-box; }
    [hidden] { display: none !important; }
    button, input { font: inherit; color: inherit; }
    button { cursor: pointer; -webkit-tap-highlight-color: transparent; }
    button:disabled { cursor: default; opacity: .5; }
    button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .launcher { position: fixed; top: 88px; right: 18px; pointer-events: auto; display: flex;
      align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--line);
      border-radius: 12px; background: var(--bg); color: var(--ink); box-shadow: var(--shadow);
      min-height: 42px; transition: background-color 120ms;
    }
    .launcher:hover { background: var(--surface); }
    .launcher svg { color: var(--muted); }
    .launcher[data-open="true"] { border-color: var(--accent); }
    .bubble { min-width: 22px; padding: 0 5px; border-radius: 5px; background: var(--surface);
      color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; text-align: center; }
    .panel { position: fixed; top: 140px; right: 18px; bottom: var(--cgn-bottom);
      width: 316px; max-width: calc(100vw - 24px); max-height: 620px;
      pointer-events: auto; display: flex; flex-direction: column; overflow: hidden;
      color: var(--ink); background: var(--bg); border: 1px solid var(--line);
      border-radius: 16px; box-shadow: var(--shadow); text-align: left;
    }
    .header { padding: 17px 16px 12px; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .heading { margin: 0; font-size: 15px; font-weight: 650; line-height: 1.5; letter-spacing: .1px; }
    .count { margin-top: 3px; font-size: 11px; color: var(--muted); }
    .icon-button { flex: 0 0 auto; display: grid; place-items: center; width: 28px; height: 28px;
      padding: 0; background: transparent; border: 0; border-radius: 7px; color: var(--muted); }
    .icon-button:hover { color: var(--ink); background: var(--hover); }
    .search-wrap { position: relative; margin: 0 14px 9px; flex-shrink: 0; }
    .search-icon { position: absolute; top: 11px; left: 11px; color: var(--muted); pointer-events: none; }
    .search { width: 100%; height: 40px; border: 1px solid var(--line); border-radius: 9px;
      padding: 8px 34px; background: var(--surface); color: var(--ink); outline-offset: 2px; }
    .search::placeholder { color: var(--muted); opacity: 1; }
    .search::-webkit-search-cancel-button { -webkit-appearance: none; display: none; }
    .clear { position: absolute; top: 6px; right: 5px; }
    .results { color: var(--muted); font-size: 11px; padding: 0 17px 7px; flex-shrink: 0; }
    .scroll { flex: 1 1 auto; min-height: 36px; overflow-y: auto; overscroll-behavior: contain;
      padding: 0 8px 9px; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
    .list { list-style: none; padding: 0; margin: 0; }
    .row { width: 100%; display: flex; align-items: flex-start; gap: 10px; padding: 10px 9px;
      border: 1px solid transparent; border-radius: 9px; background: transparent;
      text-align: left; font-size: 12px; line-height: 1.65; color: var(--ink); }
    .row:hover { background: var(--surface); }
    .row[data-active="true"] { background: var(--selected); border-color: var(--line); }
    .number { padding-top: 1px; min-width: 23px; flex: 0 0 auto; color: var(--muted);
      font-size: 10px; font-variant-numeric: tabular-nums; }
    .row[data-active="true"] .number { color: var(--accent); font-weight: 650; }
    .row-content { min-width: 0; flex: 1; }
    .summary { overflow-wrap: anywhere; white-space: pre-wrap; }
    .detached { display: block; width: fit-content; margin-top: 4px; border-radius: 4px;
      padding: 0 5px; font-size: 10px; line-height: 1.7; color: var(--muted); background: var(--surface); }
    mark { padding: 0; background: var(--mark); color: var(--ink); border-radius: 2px; }
    .empty { padding: 26px 14px; color: var(--muted); font-size: 12px; line-height: 1.8; text-align: center; }
    .footer { flex-shrink: 0; padding: 10px 14px 12px; border-top: 1px solid var(--line); }
    .status { margin: 0 0 9px; color: var(--muted); font-size: 11px; line-height: 1.6;
      overflow-wrap: anywhere; max-height: 5em; overflow-y: auto; }
    .actions { display: flex; align-items: center; gap: 7px; }
    .load, .cancel { flex: 1; min-height: 33px; border: 1px solid var(--line); border-radius: 8px;
      color: var(--ink); background: var(--surface); font-size: 11px; padding: 6px 10px; }
    .load:hover, .cancel:hover { background: var(--hover); }
    .privacy { display: flex; align-items: center; gap: 5px; margin: 8px 0 0; color: var(--muted); font-size: 10px; }
    .dot { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
    @media (max-width: 600px) {
      .launcher { top: 76px; right: 12px; padding: 8px 10px; }
      .panel { top: 126px; right: 12px; width: 304px; }
    }
    @media (max-height: 560px) {
      .launcher { top: 58px; }
      .panel { top: 108px; }
      .header { padding-top: 10px; padding-bottom: 7px; }
      .privacy { display: none; }
      .footer { padding-top: 7px; padding-bottom: 7px; }
    }
    @media (max-height: 480px) {
      .panel { overflow-y: auto; }
      .header { flex-shrink: 0; padding: 7px 12px 5px; align-items: center; }
      .heading { font-size: 13px; }
      .count { margin-top: 0; font-size: 10px; }
      .search-wrap { margin: 0 12px 6px; }
      .search { height: 34px; padding-top: 5px; padding-bottom: 5px; }
      .search-icon { top: 8px; }
      .clear { top: 3px; }
      .results { padding-bottom: 4px; }
      .scroll { flex: 1 0 48px; min-height: 48px; max-height: max(48px, calc(100dvh - var(--cgn-bottom) - 285px)); }
      .row { padding-top: 7px; padding-bottom: 7px; }
      .footer { padding: 6px 12px 8px; }
      .status { font-size: 10px; line-height: 1.45; max-height: 2.9em; margin-bottom: 6px; }
      .load, .cancel { min-height: 30px; padding-top: 4px; padding-bottom: 4px; }
    }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  `;

  class Panel {
    constructor({ onSelect, onLoad, onCancel, onRefresh } = {}) {
      this.callbacks = { onSelect, onLoad, onCancel, onRefresh };
      this.entries = [];
      this.rows = new Map();
      this.activeId = null;
      this.query = '';
      this.busy = false;
      this.open = false;
      this.destroyed = false;
      this.mode = '';
      this.host = make('div');
      this.host.id = 'cgn-host';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      const style = make('style', '', STYLES);
      this.launcher = make('button', 'launcher');
      this.launcher.type = 'button';
      this.launcher.dataset.testid = 'cgn-toggle';
      this.launcher.setAttribute('aria-controls', 'cgn-panel');
      this.launcher.setAttribute('aria-expanded', 'false');
      this.launcher.setAttribute('aria-label', '展开提问导航');
      this.launcher.append(icon('list'));
      this.launcherLabel = make('span', '', '提问导航');
      this.launcherCount = make('span', 'bubble', '0');
      this.launcherCount.setAttribute('aria-hidden', 'true');
      this.launcher.append(this.launcherLabel, this.launcherCount);
      this.launcher.addEventListener('click', () => this.toggle());

      this.panel = make('aside', 'panel');
      this.panel.id = 'cgn-panel';
      this.panel.dataset.testid = 'cgn-panel';
      this.panel.setAttribute('aria-label', '当前对话的提问导航');
      this.panel.hidden = true;
      const header = make('header', 'header');
      const headingGroup = make('div');
      headingGroup.append(make('h2', 'heading', '对话目录'));
      this.count = make('div', 'count', '已索引 0 条提问');
      this.count.dataset.testid = 'cgn-count';
      headingGroup.append(this.count);
      const close = this.iconButton('close', '收起提问导航');
      close.dataset.testid = 'cgn-close';
      close.addEventListener('click', () => this.toggle(false, true));
      header.append(headingGroup, close);

      const searchWrap = make('div', 'search-wrap');
      const searchIcon = icon('search');
      searchIcon.classList.add('search-icon');
      this.search = make('input', 'search');
      this.search.type = 'search';
      this.search.autocomplete = 'off';
      this.search.spellcheck = false;
      this.search.placeholder = '搜索历史提问…';
      this.search.setAttribute('aria-label', '搜索当前目录中的提问');
      this.search.dataset.testid = 'cgn-search';
      // Explicit clear control has a consistent appearance in Chrome and Brave.
      this.search.style.setProperty('-webkit-appearance', 'none');
      this.clear = this.iconButton('close', '清空搜索');
      this.clear.classList.add('clear');
      this.clear.hidden = true;
      this.clear.addEventListener('click', () => {
        this.search.value = '';
        this.setQuery('');
        this.search.focus();
      });
      this.search.addEventListener('input', () => this.setQuery(this.search.value));
      searchWrap.append(searchIcon, this.search, this.clear);
      this.results = make('div', 'results');
      this.results.hidden = true;
      this.scroller = make('div', 'scroll');
      this.list = make('ol', 'list');
      this.list.dataset.testid = 'cgn-list';
      this.empty = make('div', 'empty', '当前页面还没有可识别的提问。');
      this.scroller.append(this.list, this.empty);
      this.list.addEventListener('click', (event) => {
        const row = event.target.closest('button[data-entry-id]');
        if (row && this.list.contains(row)) this.callbacks.onSelect?.(row.dataset.entryId);
      });
      const footer = make('footer', 'footer');
      this.status = make('p', 'status', '仅索引当前页面中已经出现的提问。');
      this.status.dataset.testid = 'cgn-status';
      this.status.setAttribute('role', 'status');
      this.status.setAttribute('aria-live', 'polite');
      this.status.setAttribute('aria-atomic', 'true');
      const actions = make('div', 'actions');
      this.load = make('button', 'load', '加载更早消息');
      this.load.type = 'button';
      this.load.dataset.testid = 'cgn-load';
      this.load.title = '由你主动触发，尝试通过页面加载更早的历史消息';
      this.load.addEventListener('click', () => this.callbacks.onLoad?.());
      this.cancel = make('button', 'cancel', '停止加载');
      this.cancel.type = 'button';
      this.cancel.dataset.testid = 'cgn-cancel';
      this.cancel.hidden = true;
      this.cancel.addEventListener('click', () => this.callbacks.onCancel?.());
      this.refresh = this.iconButton('refresh', '重新扫描当前页面');
      this.refresh.dataset.testid = 'cgn-refresh';
      this.refresh.addEventListener('click', () => this.callbacks.onRefresh?.());
      actions.append(this.load, this.cancel, this.refresh);
      const privacy = make('p', 'privacy');
      privacy.append(make('span', 'dot'), document.createTextNode('仅保存在当前页面内存中'));
      footer.append(this.status, actions, privacy);
      this.panel.append(header, searchWrap, this.results, this.scroller, footer);
      this.shadow.append(style, this.launcher, this.panel);
      this.shadow.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.open) {
          event.preventDefault();
          event.stopPropagation();
          if (this.busy) this.callbacks.onCancel?.();
          this.toggle(false, true);
        }
      });
      document.documentElement.append(this.host);
    }

    iconButton(kind, label) {
      const button = make('button', 'icon-button');
      button.type = 'button';
      button.title = label;
      button.setAttribute('aria-label', label);
      button.append(icon(kind));
      return button;
    }

    toggle(force, restoreFocus = false) {
      if (this.destroyed) return;
      this.open = typeof force === 'boolean' ? force : !this.open;
      this.panel.hidden = !this.open;
      this.launcher.dataset.open = String(this.open);
      this.launcher.setAttribute('aria-expanded', String(this.open));
      this.launcher.setAttribute('aria-label', this.open ? '收起提问导航' : '展开提问导航');
      this.launcherLabel.textContent = this.open ? '收起导航' : '提问导航';
      if (this.open) this.search.focus({ preventScroll: true });
      else if (restoreFocus) this.launcher.focus({ preventScroll: true });
    }

    setQuery(value) {
      const query = fold(String(value).trim());
      this.clear.hidden = !this.search.value;
      if (query === this.query) return;
      this.query = query;
      this.renderList(true);
      this.scroller.scrollTop = 0;
    }

    update(state = {}) {
      if (this.destroyed) return;
      let entriesChanged = false;
      if (Array.isArray(state.entries)) {
        const seen = new Set();
        const next = state.entries.filter((entry) => entry && entry.id != null).map((entry, index) => ({
          id: String(entry.id), text: String(entry.text || '').trim() || '（无文字消息）',
          available: entry.available !== false, number: entry.number ?? index + 1,
        })).filter((entry) => {
          if (seen.has(entry.id)) return false;
          seen.add(entry.id);
          return true;
        });
        entriesChanged = next.length !== this.entries.length || next.some((entry, i) => {
          const old = this.entries[i];
          return !old || entry.id !== old.id || entry.text !== old.text ||
            entry.available !== old.available || entry.number !== old.number;
        });
        if (entriesChanged) this.entries = next;
      }
      if (state.activeId !== undefined) this.setActive(state.activeId);
      if (state.busy !== undefined && this.busy !== Boolean(state.busy)) {
        const previousFocus = this.shadow.activeElement;
        this.busy = Boolean(state.busy);
        this.load.hidden = this.busy;
        this.cancel.hidden = !this.busy;
        this.refresh.disabled = this.busy;
        this.panel.setAttribute('aria-busy', String(this.busy));
        if (this.open && this.busy && previousFocus === this.load) this.cancel.focus({preventScroll:true});
        if (this.open && !this.busy && previousFocus === this.cancel) this.load.focus({preventScroll:true});
      }
      if (state.status !== undefined) this.setStatus(state.status);
      if (state.mode !== undefined) {
        this.mode = String(state.mode);
        this.panel.dataset.mode = this.mode;
      }
      if (entriesChanged) this.renderList();
    }

    renderList(queryChanged = false) {
      const scrollTop = this.scroller.scrollTop;
      const ids = new Set(this.entries.map((entry) => entry.id));
      for (const [id, row] of this.rows) {
        if (!ids.has(id)) { row.item.remove(); this.rows.delete(id); }
      }
      let visibleCount = 0;
      let previous = null;
      for (const entry of this.entries) {
        let row = this.rows.get(entry.id);
        if (!row) {
          const item = make('li');
          const button = make('button', 'row');
          button.type = 'button';
          button.dataset.entryId = entry.id;
          const number = make('span', 'number');
          number.setAttribute('aria-hidden', 'true');
          const content = make('span', 'row-content');
          const summary = make('span', 'summary');
          const badge = make('span', 'detached', '待定位 · 需查找原文');
          badge.title = '该消息曾被索引，目前不在页面中；点击后会尝试重新定位';
          content.append(summary, badge);
          button.append(number, content);
          item.append(button);
          row = { item, button, number, summary, badge, text: null, query: null };
          this.rows.set(entry.id, row);
        }
        const visible = !this.query || fold(entry.text).includes(this.query);
        row.item.hidden = !visible;
        if (visible) visibleCount += 1;
        if (row.text !== entry.text || row.query !== this.query || queryChanged) {
          appendHighlight(row.summary, summarize(entry.text, this.query), this.query);
          row.text = entry.text;
          row.query = this.query;
        }
        row.button.title = entry.text;
        row.button.setAttribute('aria-label', `第 ${entry.number} 条提问：${entry.text}${entry.available ? '' : '。原文暂不在页面中，点击尝试定位'}`);
        row.number.textContent = String(entry.number).padStart(2, '0');
        row.badge.hidden = entry.available;
        row.button.dataset.available = String(entry.available);
        this.applyActive(row, entry.id === this.activeId);
        const expected = previous ? previous.nextSibling : this.list.firstChild;
        if (expected !== row.item) this.list.insertBefore(row.item, expected);
        previous = row.item;
      }
      this.count.textContent = `已索引 ${this.entries.length} 条提问`;
      this.launcherCount.textContent = String(this.entries.length);
      this.results.hidden = !this.query;
      this.results.textContent = `找到 ${visibleCount} 条 · 共索引 ${this.entries.length} 条`;
      this.empty.hidden = visibleCount > 0;
      this.empty.textContent = this.query ? '没有找到匹配的提问。试试更短的关键词。' : '当前页面还没有可识别的提问。\n发送提问或滚动到历史消息后会自动更新。';
      this.scroller.scrollTop = scrollTop;
    }

    applyActive(row, active) {
      row.button.dataset.active = String(active);
      if (active) row.button.setAttribute('aria-current', 'location');
      else row.button.removeAttribute('aria-current');
    }

    setActive(id) {
      const next = id == null ? null : String(id);
      if (next === this.activeId) return;
      const old = this.rows.get(this.activeId);
      if (old) this.applyActive(old, false);
      this.activeId = next;
      const row = this.rows.get(next);
      if (row) this.applyActive(row, true);
    }

    setStatus(value) {
      const text = String(value || '');
      if (this.status.textContent !== text) this.status.textContent = text;
      this.status.hidden = !text;
    }

    resetConversation() {
      if (this.destroyed) return;
      this.search.value = '';
      this.query = '';
      this.clear.hidden = true;
      this.setActive(null);
      this.renderList(true);
      this.scroller.scrollTop = 0;
      this.panel.scrollTop = 0;
    }

    setGeometry({ bottom } = {}) {
      if (!Number.isFinite(bottom)) return;
      this.host.style.setProperty('--cgn-bottom', `${Math.max(12, bottom)}px`);
    }

    setTheme(dark) {
      if (typeof dark === 'boolean') this.host.dataset.theme = dark ? 'dark' : 'light';
      else delete this.host.dataset.theme;
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.host.remove();
      this.rows.clear();
      this.entries = [];
      this.callbacks = {};
    }
  }

  CGN.Panel = Panel;
})();
