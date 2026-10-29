/** Optional read-only anonymous smoke check. Does not sign in or send messages. */
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
let playwrightVersion;
for (const candidate of [process.env.CGN_PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); playwrightVersion = require(`${candidate}/package.json`).version; break; } catch { /* Find the locally installed runtime. */ }
}
if (!chromium) throw new Error('Install Playwright or set CGN_PLAYWRIGHT_MODULE.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'extension');
const output = path.join(root, 'tests', 'results');
await mkdir(output, { recursive: true });
let executablePath = process.env.CGN_BROWSER_EXECUTABLE;
if (!executablePath) {
  for (const candidate of ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium']) {
    try { await access(candidate); executablePath = candidate; break; } catch { /* Continue. */ }
  }
}
const profile = await mkdtemp(path.join(os.tmpdir(), 'cgn-anonymous-probe-'));
let context;
const report = {
  timestamp: new Date().toISOString(),
  playwrightVersion,
  scope: 'Anonymous read-only real ChatGPT landing page in isolated temporary profile. No login, no account access, no message sent, no existing browser profile.',
  signedInConversationTested: false,
};
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath, headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1440, height: 1000 },
  });
  report.browserVersion = context.browser()?.version();
  const page = await context.newPage();
  const response = await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
  report.httpStatus = response?.status();
  report.accessBlocked = report.httpStatus >= 400;
  await page.waitForTimeout(3500);
  report.url = page.url();
  report.title = await page.title();
  report.extensionHostPresent = await page.locator('#cgn-host').count() === 1;
  report.composerPresent = await page.locator('#prompt-textarea, textarea, [contenteditable="true"]').count() > 0;
  report.mainRegionPresent = await page.locator('main, [role="main"]').count() > 0;
  const visibleText = await page.locator('body').innerText();
  report.accessChallengePresent = /verify you are human|checking your browser|just a moment|验证您是人类|正在验证|请稍候|cloudflare/i.test(visibleText + report.title);
  report.signInControlPresent = /log in|sign in|登录|登入/i.test(visibleText);
  if (report.extensionHostPresent) {
    await page.getByTestId('cgn-toggle').click({ timeout: 5000 });
    report.navigatorStatus = await page.getByTestId('cgn-status').innerText();
    report.indexedMessages = await page.getByTestId('cgn-count').innerText();
  }
  await page.screenshot({ path: path.join(output, 'real-chatgpt-anonymous.png') });
  report.outcome = report.accessBlocked || report.accessChallengePresent ? 'HTTP error or access/loading challenge; real conversation application DOM not verified.' : report.composerPresent ? 'Anonymous ChatGPT composer accessible; extension presence checked. No real conversation tested.' : 'Landing page accessible, but conversation/composer DOM not confirmed.';
} catch (error) {
  report.error = error.message;
  report.outcome = 'Real site inaccessible or browser check failed; no real ChatGPT behavior verified.';
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  await writeFile(path.join(output, 'real-site-probe.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
