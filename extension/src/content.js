(() => {
  'use strict';
  const CGN = globalThis.CGN;
  // Safe reinjection during development; a single listener/observer set per tab.
  CGN.app?.destroy();
  const index = new CGN.MessageIndex();
  const routePath = () => location.pathname.replace(/\/+$/,'') || '/';
  const routeKey = () => {const conversation = /\/c\/([^/]+)$/.exec(routePath());return conversation ? `/c/${conversation[1]}` : routePath();};
  let route = routeKey(), previousPath = routePath(), activeId = null, busy = false, status = '', mode = 'ready';
  let destroyed = false, scheduled = 0, geometryTimer = 0, routeTimer = 0;
  let quarantine = new WeakMap(), pending = new Set(), removed = false;
  let root = null, lastUnknownScan = 0;
  const initialStatus = '仅索引页面已加载的提问；需要更多历史时可主动加载。';
  const panel = new CGN.Panel({
    onSelect:id => navigator.jump(id),
    onLoad:() => navigator.loadEarlier(),
    onCancel:() => navigator.cancel(true,'已停止加载，已恢复阅读位置。'),
    onRefresh:() => {scan();setStatus(index.order.length ? `已识别 ${index.order.length} 条提问。未加载的历史可主动扫描。` : '尚未识别到用户提问；当前页面可能尚未加载，或网页消息结构需要适配。');}
  });
  function setStatus(value) {status = value;panel.setStatus(value);}
  function publish() {
    if (index.ambiguousOrder) status = '页面缺少稳定顺序信息，部分离屏记录的相对顺序无法确认；请手动滚动后重新识别。';
    panel.update({entries:index.entries(),activeId,busy,status,mode});
  }
  const navigator = new CGN.Navigator({
    index,rescan:() => scan(),onStatus:setStatus,
    onBusy:value => {busy = value;publish();},
    onActive:id => {activeId = id;panel.setActive(id);if (innerWidth < 760) panel.toggle(false,true);}
  });
  function fingerprint(el) {return `${CGN.DOM.identity(el).key}\n${CGN.DOM.text(el)}`;}
  function allowed(el) {
    const prior = quarantine.get(el);
    if (prior === undefined) return true;
    if (fingerprint(el) !== prior) {quarantine.delete(el);return true;}
    return false;
  }
  function checkRoute() {
    if (route === routeKey()) return false;
    const next = routeKey();
    // Sending the first message promotes a new-chat URL to /c/id without a new DOM.
    const nextPath = routePath();
    const conversationMatch = /^(.*)\/c\/[^/]+$/.exec(nextPath);
    const base = conversationMatch ? conversationMatch[1] || '/' : null;
    const promoted = previousPath === base && index.order.length > 0 && index.order.every(r => index.target(r.id));
    route = next; previousPath = nextPath; navigator.reset(); activeId = null; pending.clear(); clearTimeout(scheduled); scheduled = 0;
    if (!promoted) {
      quarantine = new WeakMap();
      for (const record of index.order) if (record.element?.isConnected) quarantine.set(record.element,`${record.stableKey}\n${record.text}`);
      index.reset();
    }
    status = promoted ? initialStatus : '正在等待当前会话内容…仅显示此会话已识别的提问。';
    mode = 'waiting';panel.update({entries:index.entries(),activeId,busy:false,status,mode});
    // Reset search for a different conversation through an explicit panel hook.
    if (!promoted) panel.resetConversation?.();
    geometry(); return true;
  }
  function scan() {
    if (destroyed) return;
    checkRoute(); root = CGN.DOM.conversationRoot();
    const candidates = CGN.DOM.candidates(root);
    const elements = candidates.filter(allowed);
    const changed = index.ingest(elements);
    const nextMode = !root ? 'waiting' : !index.order.length ? 'empty' : 'ready';
    if (!index.order.length && root && !candidates.length) status = '尚未识别到用户提问。可能是新会话、内容未加载或页面结构变化；无法确认时请重新扫描。';
    if (index.order.length && (mode !== 'ready' || status.includes('正在等待'))) status = initialStatus;
    const modeChanged = mode !== nextMode; mode = nextMode;
    if (changed || modeChanged) publish();
    return changed;
  }
  function flush() {
    scheduled = 0;
    if (destroyed) return;
    if (checkRoute()) {scan();return;}
    const currentRoot = CGN.DOM.conversationRoot();
    if (currentRoot !== root) {root = currentRoot;pending.clear();scan();geometry();return;}
    const elements = new Set();
    for (const node of pending) {
      if (!node.isConnected) continue;
      for (const el of CGN.DOM.candidates(node,root)) if (allowed(el)) elements.add(el);
    }
    pending.clear();
    if (!index.order.length && !elements.size) {scan();return;}
    const changed = index.ingest([...elements]);
    const availabilityChanged = removed && index.refreshAvailability(); removed = false;
    if (changed || availabilityChanged) {
      mode = index.order.length ? 'ready' : 'empty';
      if (status.includes('正在等待') || status.startsWith('尚未')) status = initialStatus;
      publish();
    }
  }
  function schedule() {if (!scheduled) scheduled = setTimeout(flush,140);}
  const observer = new MutationObserver(mutations => {
    if (destroyed) return;
    checkRoute();
    let relevant = false;
    for (const m of mutations) {
      const el = m.target.nodeType === Node.ELEMENT_NODE ? m.target : m.target.parentElement;
      if (!el || el.closest('#cgn-host')) continue;
      if (m.type === 'attributes') {pending.add(el);relevant = true;continue;}
      const user = el.closest(CGN.DOM.SELECTOR);
      if (user && CGN.DOM.eligible(user)) {pending.add(user);relevant = true;continue;}
      if (CGN.DOM.isAssistant(el)) continue;
      if (m.type === 'childList') {
        for (const node of m.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) {pending.add(node);relevant = true;}
        if (m.removedNodes.length && root?.contains(el)) {removed = true;relevant = true;}
      }
    }
    if (relevant) schedule();
  });
  function geometry() {
    if (destroyed) return;
    const composer = [...document.querySelectorAll('#prompt-textarea, [data-testid="composer"], form textarea, main [contenteditable="true"]')].find(el => !el.closest('[data-app-shell-active-page="false"]') && el.getClientRects().length);
    const rect = composer?.getBoundingClientRect();
    const bottom = rect && rect.top > innerHeight * .35 && rect.top < innerHeight ? innerHeight-rect.top+24 : 140;
    panel.setGeometry({bottom});
    const html = document.documentElement;
    const theme = html.getAttribute('data-theme') || html.getAttribute('data-color-scheme');
    const dark = html.classList.contains('dark') || theme === 'dark' || (!html.classList.contains('light') && theme !== 'light' && (html.style.colorScheme === 'dark' || matchMedia('(prefers-color-scheme: dark)').matches));
    panel.setTheme(dark);
  }
  function scheduleGeometry() {if (!geometryTimer) geometryTimer = setTimeout(() => {geometryTimer = 0;geometry();},100);}
  const themeObserver = new MutationObserver(scheduleGeometry);
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme','data-color-scheme','style']});
  const media = matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',scheduleGeometry);
  window.addEventListener('resize',scheduleGeometry,{passive:true});
  window.visualViewport?.addEventListener('resize',scheduleGeometry,{passive:true});
  const onRouteEvent = () => {if (checkRoute()) scan();};
  window.addEventListener('popstate',onRouteEvent);window.addEventListener('hashchange',onRouteEvent);
  function tick() {
    if (destroyed) return;
    if (!document.hidden) {
      if (checkRoute()) scan();
      // Rare structural recovery, only while no recognized messages are present.
      else if (!index.order.length && performance.now()-lastUnknownScan > 4000) {lastUnknownScan = performance.now();scan();}
      if (!document.getElementById('cgn-host')) document.documentElement.append(panel.host);
      geometry();
    }
    routeTimer = setTimeout(tick,900);
  }
  const onPageHide = event => {if (!event.persisted) app.destroy();};
  const onVisibility = () => {if (!document.hidden) {checkRoute();scan();geometry();}};
  window.addEventListener('pagehide',onPageHide);document.addEventListener('visibilitychange',onVisibility);
  const app = {destroy() {
    if (destroyed) return;destroyed = true;
    observer.disconnect();themeObserver.disconnect();navigator.destroy();panel.destroy();index.reset();
    clearTimeout(scheduled);clearTimeout(routeTimer);clearTimeout(geometryTimer);pending.clear();
    window.removeEventListener('resize',scheduleGeometry);window.visualViewport?.removeEventListener('resize',scheduleGeometry);
    media.removeEventListener('change',scheduleGeometry);window.removeEventListener('popstate',onRouteEvent);window.removeEventListener('hashchange',onRouteEvent);
    window.removeEventListener('pagehide',onPageHide);document.removeEventListener('visibilitychange',onVisibility);
    if (CGN.app === app) delete CGN.app;
  }};
  CGN.app = app;status = initialStatus;
  observer.observe(document.body || document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-message-author-role','data-turn','data-message-id','data-testid','hidden','aria-hidden','aria-label','data-chatgpt-search-unit-key','data-content-search-unit-key','data-conversation-role','data-chatgpt-search-message-ids','data-turn-key','data-content-search-turn-key','data-thread-find-target','data-chatgpt-conversation-selection-target','data-app-shell-active-page']});
  scan();publish();geometry();routeTimer = setTimeout(tick,900);
})();
