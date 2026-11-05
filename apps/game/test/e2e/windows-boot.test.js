// Issue #58: "Windows: login/signup buttons do nothing". Skipped in a normal `npm test`. Run it with:  npm run test:e2e
//
// (a) A Windows clone (Git core.autocrlf=true) has CRLF line endings in public/. The production server must still
//     give the import map the right CSP hash (browsers hash it with \n only), so Create account works.
// (b) When the game's code cannot load (the import map blocked by the CSP, a module that does not arrive, the three.js
//     CDN unreachable in the practice file), tapping Create account must NOT reload the page (the boxes keep what was
//     typed) and the Account screen says "The game could not load. Check your internet and reload the page."
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BOOT_MESSAGE } from '@pvp/boot-guard';
import { RUN, SKIP, SLOW, startServer, launchBrowser, newPage, signUpForm } from './helpers.js';
import { build, THREE_CDN } from '../../../../scripts/build-practice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const GAME = path.join(ROOT, 'apps', 'game');
// Two folders deep in the repo (like apps/game), so the copied server finds ../../packages and node_modules.
const CRLF_GAME = path.join(ROOT, 'dist', 'crlf-game');

let browser, server, crlfServer, practiceFile;

// A copy of the game server with every text file in public/ turned into Windows (CRLF) line endings.
function makeCrlfCopy() {
  fs.rmSync(CRLF_GAME, { recursive: true, force: true });
  fs.mkdirSync(CRLF_GAME, { recursive: true });
  fs.copyFileSync(path.join(GAME, 'server.js'), path.join(CRLF_GAME, 'server.js'));
  fs.cpSync(path.join(GAME, 'public'), path.join(CRLF_GAME, 'public'), { recursive: true });
  const walk = dir => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, d.name);
      if (d.isDirectory()) walk(f);
      else if (/\.(html|js|css|json|svg)$/.test(d.name)) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/\r?\n/g, '\r\n'));
    }
  };
  walk(path.join(CRLF_GAME, 'public'));
}

before(async () => {
  if (!RUN) return;
  makeCrlfCopy();
  crlfServer = await startServer({ NODE_ENV: 'production' }, { serverFile: path.join(CRLF_GAME, 'server.js') });
  server = await startServer({ NODE_ENV: 'production' });
  ({ file: practiceFile } = await build({ check: false }));
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await crlfServer?.stop();
  await server?.stop();
  fs.rmSync(CRLF_GAME, { recursive: true, force: true });
});

// Counts main-frame navigations after the first load, and leaves a marker that a reload would wipe out.
async function watchReloads(page) {
  let navigations = 0;
  page.on('framenavigated', f => { if (f === page.mainFrame()) navigations++; });
  await page.evaluate(() => { window.__noReload = 'still here'; });
  return async () => ({ navigations, marker: await page.evaluate(() => window.__noReload ?? null), url: page.url() });
}

test('(a) production server with a CRLF index.html (Windows clone): no CSP block, Create account works', { skip: SKIP, timeout: 180000 }, async () => {
  const html = fs.readFileSync(path.join(CRLF_GAME, 'public', 'index.html'), 'utf8');
  assert.ok(html.includes('\r\n'), 'the copy really has CRLF line endings');
  const { context, page, errors } = await newPage(browser);
  const violations = [];
  await page.exposeFunction('reportViolation', v => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => window.reportViolation(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  try {
    const res = await page.goto(`${crlfServer.url}/`);
    assert.match(res.headers()['content-security-policy'], /script-src 'self' https:\/\/cdn\.jsdelivr\.net 'sha256-/);
    await page.locator('#login').waitFor({ state: 'visible', timeout: SLOW });
    await page.waitForFunction(() => document.documentElement.dataset.boot === 'ready', null, { timeout: SLOW });
    await signUpForm(page, 'Win' + Date.now().toString(36).slice(-6));
    await page.locator('#menu').waitFor({ state: 'visible', timeout: SLOW });
    assert.deepEqual(violations, [], 'no Content-Security-Policy violation');
    assert.equal(await page.locator('#bootError').isVisible(), false);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

// Fill "Create an account", tap it, and check: no reload, the boxes keep the name, the message shows.
async function tapCreateAndExpectMessage(page) {
  await page.locator('#login').waitFor({ state: 'visible', timeout: SLOW });
  await page.locator('#bootError').waitFor({ state: 'visible', timeout: SLOW });
  assert.equal((await page.locator('#bootError').textContent()).trim(), BOOT_MESSAGE);
  const check = await watchReloads(page);
  const before = page.url();
  await signUpForm(page, 'NoReload1');
  await page.waitForTimeout(800); // a native submit would navigate right away
  const after = await check();
  assert.equal(after.navigations, 0, 'the page did not navigate');
  assert.equal(after.marker, 'still here', 'the page did not reload');
  assert.equal(after.url, before, 'no "?" added to the address');
  assert.equal(await page.inputValue('#signupName'), 'NoReload1', 'the boxes keep what was typed');
  assert.equal(await page.locator('#bootError').isVisible(), true);
  assert.equal((await page.locator('#bootError').textContent()).trim(), BOOT_MESSAGE);
  assert.equal(await page.locator('#menu').isVisible(), false);
}

test('(b1) the import map is blocked by the CSP (the #58 bug itself): no reload, the message shows', { skip: SKIP, timeout: 180000 }, async () => {
  const { context, page } = await newPage(browser);
  try {
    // Change the import map's text by one space AFTER the server hashed it: the browser blocks it, like on Windows.
    await page.route(`${server.url}/`, async route => {
      const res = await route.fetch();
      const body = (await res.text()).replace('<script type="importmap">', '<script type="importmap"> ');
      await route.fulfill({ response: res, body });
    });
    await page.goto(`${server.url}/`);
    await tapCreateAndExpectMessage(page);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.boot), 'failed');
  } finally {
    await context.close();
  }
});

test('(b2) a game module does not arrive (api-client blocked): no reload, the message shows', { skip: SKIP, timeout: 180000 }, async () => {
  const { context, page } = await newPage(browser);
  try {
    await page.route('**/packages/api-client/src/**', route => route.abort());
    await page.goto(`${server.url}/`);
    await tapCreateAndExpectMessage(page);
  } finally {
    await context.close();
  }
});

test('(b3) practice file: the three.js CDN cannot be reached: no reload, the message shows', { skip: SKIP, timeout: 180000 }, async () => {
  const context = await browser.newContext();
  context.setDefaultTimeout(SLOW);
  const page = await context.newPage();
  try {
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url === THREE_CDN) return route.abort('internetdisconnected');
      if (url.startsWith('file://') || url.startsWith('data:')) return route.continue();
      return route.abort();
    });
    await page.goto(pathToFileURL(practiceFile).href);
    await tapCreateAndExpectMessage(page);
  } finally {
    await context.close();
  }
});
