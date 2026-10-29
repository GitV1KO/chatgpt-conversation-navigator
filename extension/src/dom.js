/* Semantic DOM adapter. No site CSS classes or private application APIs. */
(() => {
  'use strict';
  const CGN = globalThis.CGN ||= {};
  // ChatGPT has shipped two DOM adapters. The search-unit keys expose the
  // author role in the current UI; their inner content wrapper is the same unit.
  const USER_UNIT = '[data-chatgpt-search-unit-key$=":user"], [data-content-search-unit-key$=":user"]';
  const USER = `[data-message-author-role="user"], [data-turn="user"], ${USER_UNIT}`;
  const USER_HEADING = '[data-conversation-role="user"]';
  const ASSISTANT = '[data-message-author-role="assistant"], [data-turn="assistant"], [data-chatgpt-search-unit-key$=":assistant"], [data-content-search-unit-key$=":assistant"]';
  const FALLBACK = 'article[aria-label], [role="article"][aria-label]';
  const SELECTOR = `${USER}, ${USER_HEADING}, ${FALLBACK}`;
  const EXCLUDE = `script, style, noscript, button, svg, textarea, input, select, [hidden], [aria-hidden="true"], [contenteditable="true"], [data-conversation-role], ${ASSISTANT}`;
  const BLOCKS = new Set(['P','DIV','PRE','LI','TR','H1','H2','H3','H4','BLOCKQUOTE','SECTION']);
  function isActivePage(el) {
    return el instanceof Element && el.isConnected &&
      !el.closest('[data-app-shell-active-page="false"], [hidden], [aria-hidden="true"], [inert]') &&
      !!el.getClientRects().length;
  }
  function conversationRoot() {
    const roots = [...document.querySelectorAll('[data-thread-find-target="conversation"]')];
    const conversationId = /\/c\/([^/]+)(?:\/|$)/.exec(location.pathname)?.[1];
    const identified = roots.filter(el => el.getAttribute('data-chatgpt-conversation-selection-target'));
    if (conversationId && identified.length) {
      // The app keeps previous workspaces mounted (display:none) across SPA
      // navigation. URL identity and the active page must both agree; waiting
      // is safer than exposing the previous conversation's index.
      return identified.find(el =>
        el.getAttribute('data-chatgpt-conversation-selection-target').toLowerCase() === conversationId.toLowerCase() &&
        isActivePage(el)
      ) || null;
    }
    if (roots.length) return roots.find(isActivePage) || null;
    return [...document.querySelectorAll('main, [role="main"]')].find(isActivePage) || null;
  }
  function isAssistant(el) { return el instanceof Element && !!el.closest(ASSISTANT); }
  function eligible(el, root = conversationRoot()) {
    if (!(el instanceof Element) || !root || !root.contains(el)) return false;
    if (el.closest('[data-app-shell-active-page="false"], [hidden], [aria-hidden="true"], [inert], aside, nav, [role="dialog"], form, [contenteditable="true"]')) return false;
    if (isAssistant(el)) return false;
    if (el.matches(USER) || el.matches(USER_HEADING)) return true;
    return el.matches(FALLBACK) && /^(you said\s*[:：]|你说\s*[:：]|您说\s*[:：])/i.test(el.getAttribute('aria-label') || '');
  }
  function layoutTarget(el) {
    if (!el || el.getClientRects().length) return el;
    // A mounted turn can retain its placeholder while its content is skipped
    // by content-visibility. Never substitute another message as its target.
    const turn = el.closest('[data-turn-key], [data-content-search-turn-key], [data-testid^="conversation-turn-"], article, [role="article"]');
    if (!turn?.getClientRects().length) return el;
    for (let node = el; node && node !== turn.parentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return el;
    }
    return turn;
  }
  function rendered(el) { return !!layoutTarget(el)?.getClientRects().length; }
  function canonical(el) {
    const outer = el.closest('[data-chatgpt-search-unit-key$=":user"]');
    if (outer) return outer;
    if (el.matches(USER_HEADING)) {
      const turn = el.closest('[data-turn-key], [data-content-search-turn-key], [data-testid^="conversation-turn-"], article, [role="article"]');
      const unit = turn?.querySelector(USER);
      return unit ? canonical(unit) : null;
    }
    const unit = el.matches(USER_UNIT) ? el : el.querySelector(USER_UNIT);
    if (unit) return unit.closest('[data-chatgpt-search-unit-key$=":user"]') || unit;
    // Prefer the inner role node; the turn may also contain headers and controls.
    const role = el.matches('[data-message-author-role="user"]') ? el : el.querySelector('[data-message-author-role="user"]');
    return role || el;
  }
  function candidates(scope, root = conversationRoot()) {
    if (!scope || !root) return [];
    const set = new Set();
    const add = el => {
      if (!eligible(el, root)) return;
      const node = canonical(el);
      if (node && eligible(node, root) && rendered(node)) set.add(node);
    };
    if (scope instanceof Element) {
      if (scope.closest('#cgn-host')) return [];
      // Assistant streaming is the dominant mutation source. Do not traverse it.
      if (isAssistant(scope)) return [];
      const parent = scope.closest(SELECTOR);
      if (parent) add(parent);
      if (scope.matches(SELECTOR)) add(scope);
    }
    for (const el of scope.querySelectorAll?.(SELECTOR) || []) add(el);
    // A fallback article can contain a marked user node already found above.
    return [...set].filter(el => ![...set].some(other => other !== el && el.contains(other)));
  }
  function text(el) {
    const out = [];
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) { out.push(node.nodeValue); return; }
      if (!(node instanceof Element) || node.matches(EXCLUDE)) return;
      if (node.tagName === 'IMG') {
        const alt = node.getAttribute('alt')?.trim();
        out.push(` [图片${alt ? `：${alt}` : ''}] `); return;
      }
      if (node.tagName === 'BR') { out.push('\n'); return; }
      if (BLOCKS.has(node.tagName)) out.push('\n');
      for (const child of node.childNodes) walk(child);
      if (node.tagName === 'TD' || node.tagName === 'TH') out.push('\t');
      if (BLOCKS.has(node.tagName)) out.push('\n');
    };
    walk(el);
    const value = out.join('').replace(/\u200b/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (value) return value;
    // No file names are guessed from unrelated controls.
    return el.querySelector('img, picture') ? '[图片消息]' : '[非文本消息或附件]';
  }
  function identity(el) {
    const unit = el.closest('[data-chatgpt-search-unit-key], [data-content-search-unit-key]');
    const idsValue = el.getAttribute('data-chatgpt-search-message-ids') || el.closest('[data-chatgpt-search-message-ids]')?.getAttribute('data-chatgpt-search-message-ids');
    let messageIds = [];
    if (idsValue?.trim()) {
      try {
        const parsed = JSON.parse(idsValue);
        if (Array.isArray(parsed) && parsed.every(id => typeof id === 'string' && id.trim())) messageIds = parsed.map(id => id.trim());
      } catch { /* The live UI uses a plain UUID for a single message. */ }
      if (!messageIds.length) messageIds = idsValue.trim().split(/[\s,]+/).filter(Boolean);
      messageIds = [...new Set(messageIds)].sort();
    }
    const turnKey = el.closest('[data-turn-key]')?.getAttribute('data-turn-key');
    const unitKey = unit?.getAttribute('data-chatgpt-search-unit-key') || unit?.getAttribute('data-content-search-unit-key');
    const slot = /:(\d+):user$/.exec(unitKey || '')?.[1] || '0';
    const turn = el.closest('[data-testid^="conversation-turn-"], article, [role="article"]');
    const messageId = el.getAttribute('data-message-id') || turn?.getAttribute('data-message-id');
    const testId = turn?.getAttribute('data-testid') || el.getAttribute('data-testid');
    const match = /^conversation-turn-(\d+)$/.exec(testId || '');
    const anchorId = turn?.id || el.id;
    return {
      key: messageIds.length === 1 ? `message:${messageIds[0]}` : messageIds.length ? `messages:${JSON.stringify(messageIds)}` : messageId ? `message:${messageId}` : turnKey ? `turn-key:${turnKey}:user:${slot}` : match ? `turn:${match[1]}` : anchorId ? `anchor:${anchorId}` : null,
      // fallback-turn-N is a rendering/search identifier, not proven to be a
      // permanent chronological ordinal. Preserve DOM order for the new UI.
      ordinal: match ? Number(match[1]) : null
    };
  }
  function scrollParent(el) {
    for (let p = el?.parentElement; p && p !== document.body; p = p.parentElement) {
      const style = getComputedStyle(p);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && p.scrollHeight > p.clientHeight + 4) return p;
    }
    return document.scrollingElement || document.documentElement;
  }
  function viewport(scroller) {
    if (scroller === document.scrollingElement || scroller === document.documentElement) return {top: 0, bottom: window.innerHeight, height: window.innerHeight};
    const r = scroller.getBoundingClientRect();
    const top = Math.max(0, r.top), bottom = Math.min(window.innerHeight, r.bottom);
    return {top, bottom, height: Math.max(0, bottom - top)};
  }
  function visible(el) {
    if (!el?.isConnected || !eligible(el) || !rendered(el)) return false;
    const r = layoutTarget(el).getBoundingClientRect(), v = viewport(scrollParent(el));
    return r.bottom > v.top + 12 && r.top < v.bottom - 12 && r.right > 0 && r.left < window.innerWidth;
  }
  CGN.DOM = {USER, SELECTOR, ASSISTANT, isAssistant, isActivePage, conversationRoot, eligible, rendered, layoutTarget, candidates, text, identity, scrollParent, viewport, visible};
})();
