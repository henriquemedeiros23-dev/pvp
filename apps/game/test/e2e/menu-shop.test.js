// Browser check for the menu and shop screens (issue #11).
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
// Needs Chromium for Playwright (PLAYWRIGHT_BROWSERS_PATH or CHROMIUM_PATH). Set SCREENSHOTS=1 to
// save screenshots to docs/screenshots/.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, '..', '..', 'server.js');
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const RUN = process.env.E2E === '1';

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

// Find a Chromium binary: CHROMIUM_PATH, or the newest chromium-* under PLAYWRIGHT_BROWSERS_PATH.
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = path.join(root, d, sub);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { /* none */ }
  return undefined; // let Playwright decide
}

// Never touch the real accounts file (issue #19): every run gets its own temp file.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvp-test-'));
const dataFile = path.join(dataDir, 'accounts.json');
let child, port, browser, page;
const errors = [];      // console errors and page crashes
const badResponses = []; // HTTP answers >= 400 (the wrong-password login is expected)

before(async () => {
  if (!RUN) return;
  port = await freePort();
  child = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(port), DATA_FILE: dataFile }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
    child.stdout.on('data', d => { if (String(d).includes('running')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`server exited (${code})`)); });
  });
  const { chromium } = await import('playwright');
  browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  page.on('console', m => {
    // failed requests are checked through badResponses (with their address)
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  page.on('response', r => { if (r.status() >= 400) badResponses.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  page.on('pageerror', e => errors.push(String(e)));
});

// stop the server (it saves accounts on SIGTERM), then remove the temp data
const stopServer = async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
};

after(async () => {
  await browser?.close();
  await stopServer();
});

const shot = async name => {
  if (process.env.SCREENSHOTS !== '1') return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(800); // let the 3D view draw a few frames
  await page.screenshot({ path: path.join(SHOTS, name) });
};
const isVisible = sel => page.locator(sel).isVisible();

test('sign up, shop, join the arena, leave: no errors', { skip: !RUN && 'set E2E=1 to run (npm run test:e2e)', timeout: 120000 }, async () => {
  await page.goto(`http://127.0.0.1:${port}/?debug=1`); // ?debug: window.pvpDebug() shows the game state
  await page.locator('#login').waitFor({ state: 'visible' });

  // sign up
  const name = 'e2e_' + Date.now().toString(36).slice(-8);
  await page.fill('#loginName', name);
  await page.fill('#loginPass', 'secret1');
  await page.click('#btnSignup');
  await page.locator('#menu').waitFor({ state: 'visible' });
  assert.equal(await page.textContent('#menuName'), name);
  assert.equal(await page.textContent('#menuCoins'), '0');
  assert.match(await page.textContent('#menuBackpack'), /Backpack is empty/);
  await shot('menu.png');

  // shop: colors first, then every tab
  await page.click('#btnShop');
  await page.locator('#shop').waitFor({ state: 'visible' });
  assert.ok(await page.locator('#shopGrid .card').count() >= 5);
  assert.equal(await page.textContent('#shopGrid .card.equipped .name'), 'Classic Black');
  for (const tab of ['hat', 'face', 'back', 'shirt', 'weapon']) {
    await page.click(`#shop .tabs button[data-tab="${tab}"]`);
    assert.ok(await page.locator(`#shop .tabs button[data-tab="${tab}"].active`).count() === 1, tab);
    assert.ok(await page.locator('#shopGrid .card').count() >= 3, tab);
  }
  assert.equal(await page.textContent('#shopGrid .card:first-child .name'), 'Bat');
  // with 0 coins every weapon's buy button is disabled
  assert.equal(await page.locator('#shopGrid .card button:not([disabled])').count(), 0);
  await page.click('#shop .tabs button[data-tab="color"]');
  await shot('shop.png');

  // back to the menu, join the arena
  await page.click('#btnShopBack');
  await page.locator('#menu').waitFor({ state: 'visible' });
  await page.click('#btnJoin');
  await page.locator('#hud').waitFor({ state: 'visible', timeout: 20000 });
  assert.equal(await isVisible('#menu'), false);
  assert.equal(await isVisible('#loading'), false);
  await shot('in-game.png');

  // walk forward for a second with the keyboard: the stickman must move
  await page.waitForFunction(() => window.pvpDebug?.().me != null);
  const start = (await page.evaluate(() => window.pvpDebug())).me;
  await page.keyboard.down('w');
  await page.waitForTimeout(1000);
  await page.keyboard.up('w');
  await page.waitForTimeout(200);
  const end = (await page.evaluate(() => window.pvpDebug())).me;
  const moved = Math.hypot(end.x - start.x, end.z - start.z);
  assert.ok(moved > 1, `player should move forward, moved ${moved.toFixed(2)} m`);
  assert.equal((await page.evaluate(() => window.pvpDebug())).mode, 'play');

  // leave
  await page.click('#btnLeave');
  await page.locator('#menu').waitFor({ state: 'visible' });
  assert.equal(await isVisible('#hud'), false);
  assert.equal((await page.evaluate(() => window.pvpDebug())).mode, 'menu');

  // log out and back in with the saved account
  await page.click('#btnLogout');
  await page.locator('#login').waitFor({ state: 'visible' });
  await page.fill('#loginName', name);
  await page.fill('#loginPass', 'wrong');
  await page.click('#btnLogin');
  await page.waitForFunction(() => document.getElementById('loginError').textContent.length > 0);
  assert.equal(await page.textContent('#loginError'), 'Wrong name or password');
  await page.fill('#loginPass', 'secret1');
  await page.click('#btnLogin');
  await page.locator('#menu').waitFor({ state: 'visible' });

  // reload: the saved token logs in automatically
  await page.reload();
  await page.locator('#menu').waitFor({ state: 'visible' });
  assert.equal(await page.textContent('#menuName'), name);

  assert.deepEqual(errors, []);
  assert.deepEqual(badResponses, ['400 /api/login']);
});
