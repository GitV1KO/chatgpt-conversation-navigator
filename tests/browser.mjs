import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { fixtureHTML } from './fixture.mjs';

const require = createRequire(import.meta.url);
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(project, 'extension');
const output = path.join(project, 'tests', 'results');
await mkdir(output, { recursive: true });

function loadPlaywright() {
  const candidates = [process.env.CGN_PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const api = require(candidate);
      const version = require(`${candidate}/package.json`).version;
      return { ...api, runtimeVersion: version, runtimeModule: candidate === 'playwright' ? 'playwright' : 'CGN_PLAYWRIGHT_MODULE override' };
    } catch { /* Try the next documented runtime. */ }
  }
  throw new Error('Playwright is unavailable. Run npm install, or set CGN_PLAYWRIGHT_MODULE to its absolute module directory.');
}

async function browserExecutable() {
  if (process.env.CGN_BROWSER_EXECUTABLE) return process.env.CGN_BROWSER_EXECUTABLE;
  for (const candidate of [
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/brave-browser', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ]) {
    try { await access(candidate); return candidate; } catch { /* Try the next platform. */ }
  }
  return undefined; // Playwright's bundled Chromium, installed with `npx playwright install chromium`.
}

const { chromium, runtimeVersion, runtimeModule } = loadPlaywright();
const profile = await mkdtemp(path.join(os.tmpdir(), 'cgn-browser-test-'));
const requests = [];
const results = [];
let context;
let page;
const errors = [];
const started = new Date().toISOString();
const host = '#cgn-host';
const entries = () => page.locator(`${host} [data-entry-id]:visible`);
const ui = id => page.getByTestId(`cgn-${id}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitCount(count) {
  await page.waitForFunction(({ count }) => {
    const nodes = document.querySelector('#cgn-host')?.shadowRoot?.querySelectorAll('[data-entry-id]');
    return nodes && [...nodes].filter(node => node.getClientRects().length > 0).length === count;
  }, { count }, { timeout: 6000 });
}

async function fresh(name, count, pathname = `/c/test-${name}`) {
  await page?.close();
  page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => errors.push({ scenario: name, message: error.message }));
  await page.goto(`https://chatgpt.com${pathname}${count === undefined ? '' : '?count=' + count}`);
  await page.locator(host).waitFor({ state: 'attached' });
  // #cgn-host must be created by the manifest's isolated content scripts.
  assert.equal(await page.evaluate(() => Boolean(document.querySelector('#cgn-host')?.shadowRoot)), true);
  await ui('toggle').click();
  await ui('panel').waitFor({ state: 'visible' });
  await waitCount(count ?? 80);
}

async function check(name, action) {
  const start = performance.now();
  try {
    const details = await action();
    await rm(path.join(output, `failure-${name}.png`), { force: true });
    results.push({ name, passed: true, durationMs: Math.round(performance.now() - start), ...(details ? { details } : {}) });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, durationMs: Math.round(performance.now() - start), error: error.stack || String(error) });
    console.log(`FAIL ${name}: ${error.message}`);
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, `failure-${name}.png`) }).catch(() => {});
  }
}

try {
  const manifest = JSON.parse(await readFile(path.join(extension, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  context = await chromium.launchPersistentContext(profile, {
    executablePath: await browserExecutable(),
    headless: process.env.CGN_HEADED !== '1',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if ((url.hostname === 'chatgpt.com' || url.hostname === 'chat.openai.com') && request.resourceType() === 'document') {
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixtureHTML() });
    } else {
      requests.push({ url: request.url(), resourceType: request.resourceType() });
      await route.abort();
    }
  });

  await check('actual-manifest-injection-and-user-only-index', async () => {
    await fresh('injection');
    assert.equal(await page.locator(host).count(), 1);
    assert.equal(await entries().count(), 80);
    assert.match(await ui('count').innerText(), /80/);
    assert.doesNotMatch(await ui('list').innerText(), /助手回答/);
    return { injection: 'Manifest V3 content_scripts; no addScriptTag or extension-script evaluation', messages: 80 };
  });

  await check('rich-message-extraction-image-and-safe-literal-text', async () => {
    await fresh('rich');
    const texts = await entries().allTextContents();
    assert.match(texts[0], /第一条提问/);
    assert.match(texts[1], /JavaScript/);
    assert.match(texts[2], /Markdown/);
    assert.match(texts[3], /图片/);
    assert.match(texts[8], /图片|图像|附件/);
    const first = entries().first();
    const tooltip = await first.getAttribute('title') || await first.locator('[title]').first().getAttribute('title').catch(() => '');
    assert.ok(tooltip.length > 60, 'Long message must preserve complete hover text.');
    assert.ok((texts[0].match(/…|\.\.\./)), 'Long summary must end with an ellipsis.');
    assert.equal(await page.evaluate(() => document.querySelector('#cgn-host').shadowRoot.querySelectorAll('img').length), 0);
  });

  await check('duplicate-text-distinct-targets-and-clone-deduplication', async () => {
    await fresh('duplicates');
    const duplicateRows = entries().filter({ hasText: '这个问题会重复出现' });
    assert.equal(await duplicateRows.count(), 2);
    const ids = await duplicateRows.evaluateAll(nodes => nodes.map(n => n.dataset.entryId));
    assert.notEqual(ids[0], ids[1]);
    await page.evaluate(() => window.fixture.clone('u-5'));
    await sleep(500);
    await waitCount(80);
  });

  await check('css-hidden-duplicate-rebinds-to-rendered-stable-target', async () => {
    await fresh('hidden-duplicate', 5);
    await page.evaluate(() => {
      const original = document.querySelector('[data-message-id="u-1"]').closest('article');
      const clone = original.cloneNode(true);
      clone.id = 'visible-duplicate';
      original.style.display = 'none';
      original.after(clone);
    });
    await sleep(250);
    await waitCount(5);
    await entries().first().click();
    await page.waitForFunction(() => /已定位/.test(document.querySelector('#cgn-host').shadowRoot.querySelector('[data-testid="cgn-status"]').textContent));
    assert.equal(await page.locator('#visible-duplicate [data-cgn-highlight]').count(), 1);
    const rect = await page.locator('#visible-duplicate [data-message-id="u-1"]').boundingBox();
    assert.ok(rect.y >= 56 && rect.y < 500);
  });

  await check('search-chinese-case-insensitive-and-highlight', async () => {
    await fresh('search');
    await ui('search').fill('hElLo');
    await waitCount(1);
    assert.match(await entries().first().innerText(), /HELLO/);
    assert.ok(await ui('list').locator('mark').count() > 0);
    await ui('search').fill('表格');
    await waitCount(1);
    assert.match(await entries().first().innerText(), /Markdown/);
    await ui('search').fill('<img src=x');
    await waitCount(1);
    assert.equal(await ui('list').locator('img').count(), 0);
    await ui('search').fill('');
    await waitCount(80);
  });

  await check('scroll-to-target-selection-and-transient-highlight', async () => {
    await fresh('jump');
    await entries().first().click();
    await page.waitForFunction(() => {
      const r = document.querySelector('[data-message-id="u-1"]').getBoundingClientRect();
      return r.top >= 56 && r.top < 500;
    });
    await page.waitForFunction(() => /已定位/.test(document.querySelector('#cgn-host').shadowRoot.querySelector('[data-testid="cgn-status"]').textContent));
    assert.match(await ui('status').innerText(), /已定位/);
    assert.ok(await page.locator('[data-cgn-highlight]').count() > 0);
    assert.ok((await entries().first().getAttribute('aria-current')) || (await entries().first().getAttribute('aria-selected')) === 'true');
    await ui('search').fill('HELLO');
    await entries().first().click();
    await page.waitForFunction(() => {
      const r = document.querySelector('[data-message-id="u-7"]').getBoundingClientRect();
      return r.top >= 56 && r.top < 500;
    });
    await sleep(1900);
    assert.equal(await page.locator('[data-cgn-highlight]').count(), 0);
  });

  await check('smooth-scroll-animation-with-normal-motion-preference', async () => {
    await fresh('smooth-scroll', 40);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await entries().first().click();
    const positions = await page.evaluate(async () => {
      const values = [];
      for (let i = 0; i < 15; i++) {
        values.push(document.querySelector('main').scrollTop);
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      return values;
    });
    assert.ok(new Set(positions).size > 3, 'Expected intermediate browser scroll positions during smooth navigation.');
    await page.waitForFunction(() => /已定位/.test(document.querySelector('#cgn-host').shadowRoot.querySelector('[data-testid="cgn-status"]').textContent));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    return { distinctScrollPositions: new Set(positions).size };
  });

  await check('new-message-and-late-role-attribute-update', async () => {
    await fresh('new-message', 5);
    await page.locator('textarea').fill('刚刚发送的新问题');
    await page.locator('form button').click();
    await waitCount(6);
    assert.match(await entries().last().innerText(), /刚刚发送/);
    await page.evaluate(() => window.fixture.lateRole());
    await waitCount(7);
    assert.match(await entries().last().innerText(), /延迟标记/);
  });

  await check('assistant-streaming-preserves-list-nodes-and-search', async () => {
    await fresh('streaming', 20);
    await ui('search').fill('普通');
    await page.evaluate(() => {
      window.testFirstRow = document.querySelector('#cgn-host').shadowRoot.querySelector('[data-entry-id]');
      window.testListMutations = 0;
      window.testListObserver = new MutationObserver(records => window.testListMutations += records.length);
      window.testListObserver.observe(document.querySelector('#cgn-host').shadowRoot.querySelector('[data-testid="cgn-list"]'), { childList: true, subtree: true });
      const p = window.fixture.assistant();
      let n = 0; window.testStreamInterval = setInterval(() => { p.textContent += ' 流式 token '+n++; if (n === 100) clearInterval(window.testStreamInterval); }, 8);
    });
    await sleep(1300);
    const state = await page.evaluate(() => {
      window.testListObserver.disconnect();
      return { identical: window.testFirstRow === document.querySelector('#cgn-host').shadowRoot.querySelector('[data-entry-id]'), mutations: window.testListMutations };
    });
    assert.equal(state.identical, true);
    assert.equal(state.mutations, 0);
    assert.equal(await ui('search').inputValue(), '普通');
    return { assistantMutations: 100, navigationListMutations: state.mutations };
  });

  await check('spa-delayed-route-replacement-excludes-previous-chat', async () => {
    await fresh('spa', 12);
    await ui('search').fill('普通');
    await page.evaluate(() => window.fixture.route('/c/second-chat', 4, 'second', 1500));
    // Isolated-world scripts detect a bare history.pushState through bounded polling.
    await sleep(1100);
    const during = await entries().allTextContents();
    assert.equal(during.length, 0, 'Previous conversation must not leak during delayed route replacement.');
    await waitCount(4);
    assert.equal(await ui('search').inputValue(), '');
    assert.ok((await entries().evaluateAll(nodes => nodes.map(n => n.dataset.entryId))).every(id => !id.includes('u-')));
    await page.evaluate(() => window.fixture.route('/', 0, 'new', 80));
    await waitCount(0);
    await sleep(200);
    await page.evaluate(() => window.fixture.route('/c/brand-new-chat', 1, 'brand-new', 80));
    await waitCount(1);
  });

  await check('spa-synchronous-route-and-dom-replacement', async () => {
    await fresh('spa-synchronous', 8);
    await page.evaluate(() => {
      history.pushState({}, '', '/c/synchronous-destination');
      window.fixture.reset(3, 'synchronous', { rich: false });
    });
    await waitCount(3);
    const ids = await entries().evaluateAll(nodes => nodes.map(node => node.dataset.entryId));
    assert.ok(ids.every(id => id.includes('synchronous-')));
  });

  await check('route-trailing-slash-preserves-message-identities', async () => {
    await fresh('trailing-slash', 4);
    await page.evaluate(() => {
      window.testExistingRow = document.querySelector('#cgn-host').shadowRoot.querySelector('[data-entry-id]');
      history.pushState({}, '', location.pathname + '/');
    });
    await sleep(1100);
    await waitCount(4);
    assert.equal(await page.evaluate(() => window.testExistingRow === document.querySelector('#cgn-host').shadowRoot.querySelector('[data-entry-id]')), true);
  });

  await check('new-chat-and-custom-gpt-url-promotion-preserves-messages', async () => {
    for (const [initial, promoted] of [['/', '/c/first-created-chat'], ['/g/g-testfixture', '/g/g-testfixture/c/first-custom-chat']]) {
      await fresh('promotion', 2, initial);
      await page.evaluate(destination => {
        window.testExistingRow = document.querySelector('#cgn-host').shadowRoot.querySelector('[data-entry-id]');
        history.pushState({}, '', destination);
      }, promoted);
      await sleep(1100);
      await waitCount(2);
      assert.equal(await page.evaluate(() => window.testExistingRow === document.querySelector('#cgn-host').shadowRoot.querySelector('[data-entry-id]')), true);
    }
  });

  await check('equal-unkeyed-messages-never-guess-replacement-identity', async () => {
    await fresh('unkeyed', 0);
    await page.evaluate(() => {
      for (let i = 0; i < 2; i++) {
        const article = document.createElement('article');
        article.innerHTML = '<div data-message-author-role="user"><p>没有稳定标识的重复提问</p></div>';
        document.querySelector('#turns').append(article);
      }
    });
    await waitCount(2);
    await page.evaluate(() => {
      document.querySelector('#turns article').remove();
      const article = document.createElement('article');
      article.innerHTML = '<div data-message-author-role="user"><p>没有稳定标识的重复提问</p></div>';
      document.querySelector('#turns').append(article);
    });
    await waitCount(3);
    await entries().first().click();
    assert.doesNotMatch(await ui('status').innerText(), /已定位/);
  });

  await check('recycled-virtual-node-cannot-redirect-old-entry', async () => {
    await fresh('recycled', 5);
    await page.evaluate(() => {
      const node = document.querySelector('[data-message-id="u-1"]');
      node.dataset.messageId = 'recycled-user';
      node.textContent = '这是复用节点上的另一个用户问题';
    });
    await waitCount(6);
    const old = page.locator(`${host} [data-entry-id]`).filter({ hasText: '第一条提问' });
    await old.click();
    assert.doesNotMatch(await ui('status').innerText(), /已定位/);
    assert.equal(await page.locator('[data-cgn-highlight]').count(), 0);
  });

  await check('prepend-history-order-and-remounted-target', async () => {
    await fresh('prepend', 15);
    await page.evaluate(() => window.fixture.prepend(3));
    await waitCount(18);
    const ids = await entries().evaluateAll(nodes => nodes.map(n => n.dataset.entryId));
    assert.ok(ids[0].includes('older-1'));
    assert.ok(ids[3].includes('u-1'));
    await page.evaluate(() => window.fixture.remount('u-2'));
    await sleep(350);
    await entries().nth(4).click();
    await page.waitForFunction(() => document.querySelector('[data-message-id="u-2"]').getBoundingClientRect().top < 500);
    await page.waitForFunction(() => /已定位/.test(document.querySelector('#cgn-host').shadowRoot.querySelector('[data-testid="cgn-status"]').textContent));
    assert.match(await ui('status').innerText(), /已定位/);
  });

  await check('disjoint-virtual-windows-merge-by-reliable-turn-ordinals', async () => {
    await fresh('disjoint-window', 0);
    const setOrdinals = values => {
      const turns = document.querySelector('#turns');
      turns.replaceChildren();
      for (const value of values) {
        const article = document.createElement('article');
        article.dataset.testid = 'conversation-turn-' + value;
        const user = document.createElement('div');
        user.dataset.messageAuthorRole = 'user';
        user.textContent = '序号 ' + value;
        article.append(user); turns.append(article);
      }
    };
    await page.evaluate(setOrdinals, [0, 10, 20]);
    await waitCount(3);
    await page.evaluate(setOrdinals, [5, 15]);
    await waitCount(5);
    const titles = await entries().evaluateAll(nodes => nodes.map(node => node.title));
    assert.deepEqual(titles, ['序号 0', '序号 5', '序号 10', '序号 15', '序号 20']);
  });

  await check('missing-virtualized-target-honest-status-no-false-success', async () => {
    await fresh('missing', 20);
    await page.evaluate(() => window.fixture.remove('u-1'));
    await sleep(350);
    const before = await page.locator('main').evaluate(node => node.scrollTop);
    await entries().first().click();
    await sleep(250);
    assert.match(await ui('status').innerText(), /未加载|无法定位|不可用|不在页面/);
    assert.doesNotMatch(await ui('status').innerText(), /已定位/);
    assert.equal(await page.locator('main').evaluate(node => node.scrollTop), before);
    assert.equal(await page.locator('[data-cgn-highlight]').count(), 0);
  });

  await check('explicit-history-loading-indexes-arriving-older-messages', async () => {
    await fresh('load-history', 15);
    await page.evaluate(() => window.fixture.armHistory(3));
    await ui('load').click();
    await page.waitForFunction(() => document.querySelector('[data-message-id="older-1"]'), null, { timeout: 6000 });
    await waitCount(18);
    await ui('cancel').click({ timeout: 500 }).catch(() => {});
    return { loadedEarlierMessages: 3, activation: 'User explicitly clicked history loading control' };
  });

  await check('history-load-cancellation-restores-scroll-position', async () => {
    await fresh('cancel-load', 40);
    const before = await page.locator('main').evaluate(node => node.scrollTop);
    await ui('load').click();
    await ui('cancel').waitFor({ state: 'visible' });
    await ui('cancel').click();
    await sleep(400);
    const after = await page.locator('main').evaluate(node => node.scrollTop);
    assert.ok(Math.abs(after - before) <= 3, `Cancellation scroll position changed: ${before} -> ${after}`);
    assert.match(await ui('status').innerText(), /取消|停止/);
  });

  await check('escape-stops-explicit-history-loading', async () => {
    await fresh('escape-loading', 40);
    const before = await page.locator('main').evaluate(node => node.scrollTop);
    await ui('load').click();
    await ui('cancel').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await ui('cancel').waitFor({ state: 'hidden' });
    assert.ok(Math.abs(await page.locator('main').evaluate(node => node.scrollTop) - before) <= 3);
    assert.match(await ui('status').innerText(), /取消|停止/);
  });

  await check('semantic-fallback-and-unknown-markup-status', async () => {
    await fresh('fallback', 0);
    await page.evaluate(() => window.fixture.fallback());
    await waitCount(1);
    assert.match(await entries().first().innerText(), /语义降级/);
    await page.evaluate(() => { history.pushState({}, '', '/c/unknown-markup'); window.fixture.unknown(); });
    await waitCount(0);
    await page.waitForFunction(() => /无法识别|未识别|结构|兼容/.test(document.querySelector('#cgn-host').shadowRoot.querySelector('[data-testid="cgn-status"]').textContent));
  });

  await check('collapse-expand-maintains-navigation-state', async () => {
    await fresh('collapse', 20);
    await ui('search').fill('JavaScript');
    await waitCount(1);
    await ui('toggle').click();
    assert.equal(await ui('panel').isVisible(), false);
    assert.equal(await ui('toggle').isVisible(), true);
    await ui('toggle').click();
    assert.equal(await ui('panel').isVisible(), true);
    assert.equal(await ui('search').inputValue(), 'JavaScript');
    await waitCount(1);
  });

  await check('narrow-window-jump-collapses-panel-for-reading', async () => {
    await fresh('narrow-jump', 20);
    await page.setViewportSize({ width: 390, height: 844 });
    await entries().first().click();
    await ui('panel').waitFor({ state: 'hidden' });
    assert.equal(await ui('toggle').isVisible(), true);
    const rect = await page.locator('[data-message-id="u-1"]').boundingBox();
    assert.ok(rect.y >= 56 && rect.y < 500);
  });

  await check('responsive-light-dark-and-input-clearance', async () => {
    await fresh('responsive', 30);
    for (const dark of [false, true]) {
      await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
      await page.evaluate(value => window.fixture.dark(value), dark);
      for (const [width, height] of [[1440, 1000], [390, 844], [720, 540]]) {
        await page.setViewportSize({ width, height });
        await sleep(150);
        const panel = await ui('panel').boundingBox();
        const composer = await page.locator('form').boundingBox();
        assert.ok(panel.x >= -1 && panel.y >= -1 && panel.x + panel.width <= width + 1 && panel.y + panel.height <= height + 1, `Panel overflows ${width}x${height}.`);
        assert.ok(panel.y + panel.height <= composer.y + 2, `Panel overlaps the composer at ${width}x${height}.`);
        await page.screenshot({ path: path.join(output, `panel-${dark ? 'dark' : 'light'}-${width}x${height}.png`) });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    return { screenshots: 6, viewportSizes: ['1440x1000', '390x844', '720x540'] };
  });

  await check('long-conversation-200-users-no-initial-auto-scroll', async () => {
    await fresh('performance', 200);
    await page.locator('main').evaluate(node => { node.scrollTop = 1600; });
    const before = await page.locator('main').evaluate(node => node.scrollTop);
    await sleep(1200);
    assert.equal(await page.locator('main').evaluate(node => node.scrollTop), before);
    const timings = await page.evaluate(async () => {
      const start = performance.now();
      const p = window.fixture.assistant();
      for (let i = 0; i < 1000; i++) p.textContent = 'assistant token ' + i;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return { assistantMutations: 1000, frameCompletionMs: Math.round(performance.now() - start) };
    });
    assert.equal(await entries().count(), 200);
    assert.ok(timings.frameCompletionMs < 1000, 'Synthetic streaming blocked rendering for more than 1s.');
    return timings;
  });

  await check('legacy-chat-openai-match-and-refresh', async () => {
    await page?.close();
    page = await context.newPage();
    await page.goto('https://chat.openai.com/c/legacy-fixture');
    await page.locator(host).waitFor({ state: 'attached' });
    await ui('toggle').click();
    await waitCount(80);
    await ui('refresh').click();
    await waitCount(80);
    await page.reload();
    await page.locator(host).waitFor({ state: 'attached' });
    await ui('toggle').click();
    await waitCount(80);
  });

  await check('no-network-requests-or-persisted-conversation-content', async () => {
    assert.deepEqual(requests, [], 'Fixture interactions attempted unexpected network requests.');
    const storage = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length }));
    assert.deepEqual(storage, { local: 0, session: 0, databases: 0 });
    assert.deepEqual(errors, [], 'Page JavaScript errors occurred.');
    return { blockedOrUnexpectedPageRequests: requests.length, browserStorage: storage };
  });
} catch (error) {
  results.push({ name: 'browser-harness', passed: false, error: error.stack || String(error) });
  console.error(error.message);
} finally {
  const browserVersion = context?.browser()?.version() ?? null;
  await context?.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(error => console.warn(`Temporary profile cleanup: ${error.message}`));
  const report = {
    started, finished: new Date().toISOString(), browserVersion, playwrightVersion: runtimeVersion, playwrightModule: runtimeModule,
    mode: 'Actual unpacked Manifest V3 extension in an isolated browser profile, routed synthetic https://chatgpt.com and legacy-domain documents; no real ChatGPT connection or account access.',
    passed: results.filter(result => result.passed).length,
    failed: results.filter(result => !result.passed).length,
    results,
    remainingManualChecks: [
      'Real signed-in ChatGPT DOM, branch/edit controls and website-specific virtualized history loading.',
      'Unpacked extension manual installation and UI behavior on current Chrome.',
      'Browser zoom, operating-system screen readers, touch/keyboard interaction and real-world long-session memory use.',
    ],
  };
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
  const md = [`# 浏览器测试结果`, '', `开始：${started}`, `浏览器：${browserVersion || '启动失败'}`, `Playwright：${runtimeVersion}（${runtimeModule}）`, '', report.mode, '', `通过：${report.passed}；失败：${report.failed}。`, '', '| 测试 | 结果 | 耗时 |', '| --- | --- | --- |', ...results.map(result => `| ${result.name} | ${result.passed ? 'PASS' : 'FAIL'} | ${result.durationMs ?? '-'} ms |`), '', '## 仍需人工验证', '', ...report.remainingManualChecks.map(item => `- ${item}`), ''].join('\n');
  await writeFile(path.join(output, 'browser-results.md'), md);
  console.log(`\n${report.passed} passed, ${report.failed} failed. Report: ${path.join(output, 'browser-results.json')}`);
  process.exitCode = report.failed ? 1 : 0;
}
