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
import { encode } from '@pvp/net-protocol';

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

const shot = async (name, p = page) => {
  if (process.env.SCREENSHOTS !== '1') return;
  const dir = process.env.SCREENSHOTS_DIR || SHOTS;
  fs.mkdirSync(dir, { recursive: true });
  await p.waitForTimeout(800); // let the 3D view draw a few frames
  await p.screenshot({ path: path.join(dir, name) });
};
const isVisible = sel => page.locator(sel).isVisible();

// A new page that records console errors, page crashes and bad answers like the main one.
async function newPage(contextOptions) {
  const context = await browser.newContext(contextOptions);
  const p = await context.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errs.push(m.text()); });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('response', r => { if (r.status() >= 400) errs.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  return { context, page: p, errors: errs };
}

// Sign up through the API and log the page in with the saved token.
async function signedIn(p, prefix) {
  const name = prefix + Date.now().toString(36).slice(-7);
  const res = await fetch(`http://127.0.0.1:${port}/api/signup`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password: 'secret1' }),
  });
  assert.equal(res.status, 200);
  const { token } = await res.json();
  await p.addInitScript(t => localStorage.setItem('pvp.token', t), token);
  await p.goto(`http://127.0.0.1:${port}/?debug=1`);
  await p.locator('#menu').waitFor({ state: 'visible' });
  return name;
}

// The weapon bar after joining: always 5 slots, the starting weapon in the first one, health 100.
async function checkHud(p) {
  await p.waitForFunction(() => document.querySelector('#slots .slot.active'));
  assert.equal(await p.locator('#slots .slot').count(), 5);
  assert.equal(await p.locator('#slots .slot.empty').count(), 4);
  const first = p.locator('#slots .slot').first();
  assert.equal(await first.getAttribute('aria-label'), '1: Gun (100%)'); // everyone starts with the Gun
  assert.match(await first.getAttribute('class'), /\bactive\b/);
  assert.equal(await first.locator('.dur').isVisible(), true); // the Gun wears out: it has a bar
  assert.equal(await p.textContent('#hpText'), '100');
  assert.equal(await p.getAttribute('.hpbar', 'aria-valuenow'), '100');
}

// Nothing in the bottom HUD may cover another control, and all of it must be on screen.
async function checkPhoneLayout(p, { width, height }) {
  const boxes = await p.evaluate(() => Object.fromEntries(['hotbar', 'stick', 'btnFire', 'btnJump', 'btnCrouch', 'btnLeave'].map(id => {
    const r = document.getElementById(id).getBoundingClientRect();
    return [id, { l: r.left, t: r.top, r: r.right, b: r.bottom }];
  })));
  const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  for (const [id, b] of Object.entries(boxes)) {
    assert.ok(b.l >= 0 && b.t >= 0 && b.r <= width && b.b <= height, `${id} is off screen at ${width}x${height}`);
  }
  for (const other of ['stick', 'btnFire', 'btnJump', 'btnCrouch', 'btnLeave']) {
    assert.ok(!overlap(boxes.hotbar, boxes[other]), `the weapon bar covers ${other} at ${width}x${height}`);
  }
}

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
  assert.equal(await page.textContent('#shopGrid .card:first-child .name'), 'Gun'); // cheapest Common first
  assert.equal(await page.textContent('#shopGrid .card:first-child .tag .rar'), 'Common');
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
  await checkHud(page);
  await shot('in-game.png');

  // walk forward with the keyboard: the stickman must move more than 1 m.
  // Software WebGL (swiftshader) can draw only a few frames a second, and the game caps one
  // frame's step at 0.05 s, so we hold W until 1 m is reached (at most 5 s) instead of a fixed second.
  await page.waitForFunction(() => window.pvpDebug?.().me != null);
  const start = (await page.evaluate(() => window.pvpDebug())).me;
  await page.evaluate(() => { window.__frames = 0; const tick = () => { window.__frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const t0 = Date.now();
  await page.keyboard.down('w');
  let moved = 0;
  while (Date.now() - t0 < 5000) {
    await page.waitForTimeout(100);
    const me = (await page.evaluate(() => window.pvpDebug())).me;
    moved = Math.hypot(me.x - start.x, me.z - start.z);
    if (moved > 1) break;
  }
  await page.keyboard.up('w');
  const secs = (Date.now() - t0) / 1000;
  const fps = (await page.evaluate(() => window.__frames)) / secs;
  console.log(`walk: moved ${moved.toFixed(2)} m in ${secs.toFixed(1)} s at ${fps.toFixed(1)} fps (software WebGL)`);
  assert.ok(moved > 1, `player should move forward, moved ${moved.toFixed(2)} m in ${secs.toFixed(1)} s at ${fps.toFixed(1)} fps`);
  assert.equal((await page.evaluate(() => window.pvpDebug())).mode, 'play');

  // leave: the menu asks for the account after the server says 'left'
  const meAfterLeave = page.waitForResponse(r => new URL(r.url()).pathname === '/api/me');
  await page.click('#btnLeave');
  await page.locator('#menu').waitFor({ state: 'visible' });
  assert.equal(await isVisible('#hud'), false);
  assert.equal((await page.evaluate(() => window.pvpDebug())).mode, 'menu');
  assert.equal((await (await meAfterLeave).json()).online, 0); // already out of the arena
  assert.match(await page.textContent('#menuBackpack'), /Backpack is empty/);

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

test('phone in landscape: menu and weapon bar fit (844x390 and 667x375)', { skip: !RUN && 'set E2E=1 to run (npm run test:e2e)', timeout: 120000 }, async () => {
  for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
    const { context, page: p, errors: errs } = await newPage({ viewport, isMobile: true, hasTouch: true });
    try {
      await signedIn(p, 'ph_');
      const tag = `${viewport.width}x${viewport.height}`;
      if (viewport.width === 844) await shot('menu-phone.png', p);
      await p.click('#btnJoin');
      await p.locator('#hud').waitFor({ state: 'visible', timeout: 20000 });
      assert.equal(await p.locator('#stick').isVisible(), true, `touch controls at ${tag}`);
      await checkHud(p);
      await checkPhoneLayout(p, viewport);
      if (viewport.width === 844) await shot('hud-phone.png', p);
      // tapping an empty slot does nothing; tapping the first one keeps it
      await p.locator('#slots .slot').nth(3).tap();
      await p.locator('#slots .slot').first().tap();
      assert.match(await p.locator('#slots .slot').first().getAttribute('class'), /\bactive\b/);
      await p.click('#btnLeave');
      await p.locator('#menu').waitFor({ state: 'visible' });
      assert.deepEqual(errs, [], tag);
    } finally {
      await context.close();
    }
  }
});

test('join gives up after a few seconds when the arena does not answer', { skip: !RUN && 'set E2E=1 to run (npm run test:e2e)', timeout: 60000 }, async () => {
  const { context, page: p, errors: errs } = await newPage({ viewport: { width: 1100, height: 700 } });
  try {
    // 1) the socket opens but the server never says 'welcome'
    let closeRightAway = false;
    await p.routeWebSocket(/\/\?token=/, ws => { if (closeRightAway) ws.close(); /* else: a silent server */ });
    await signedIn(p, 'to_');
    await p.click('#btnJoin');
    await p.locator('#loading').waitFor({ state: 'visible' });
    await p.locator('#menu').waitFor({ state: 'visible', timeout: 15000 });
    assert.equal(await p.locator('#loading').isVisible(), false);
    assert.match(await p.textContent('#menuMessage'), /didn't answer/);
    assert.equal((await p.evaluate(() => window.pvpDebug())).mode, 'menu');

    // 2) the socket is closed right away
    closeRightAway = true;
    await p.click('#btnJoin');
    await p.waitForFunction(() => /connect/i.test(document.getElementById('menuMessage').textContent));
    assert.equal(await p.locator('#menu').isVisible(), true);
    assert.equal(await p.locator('#loading').isVisible(), false);
    assert.deepEqual(errs, []);
  } finally {
    await context.close();
  }
});

test('weapon bar: durability colors, tap to switch, a broken weapon flashes', { skip: !RUN && 'set E2E=1 to run (npm run test:e2e)', timeout: 90000 }, async () => {
  const { context, page: p, errors: errs } = await newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  try {
    // talk to the real server, but let the test send extra messages to the page
    let toPage = null;
    const sentSlots = [];
    await p.routeWebSocket(/\/\?token=/, ws => {
      const server = ws.connectToServer();
      toPage = msg => ws.send(msg);
      ws.onMessage(m => { if (String(m).includes('"slot"')) sentSlots.push(JSON.parse(m).i); server.send(m); });
    });
    await signedIn(p, 'du_');
    await p.click('#btnJoin');
    await p.locator('#hud').waitFor({ state: 'visible', timeout: 20000 });
    await checkHud(p);

    const inv = { weapons: ['gun', 'pistol', 'shotgun', 'sniper'], dur: [15, 60, 10, 1], slot: 1, bandages: 2, medkits: 1, coins: 0, hp: 100 };
    toPage(encode('inv', inv));
    await p.waitForFunction(() => document.querySelectorAll('#slots .slot.empty').length === 1);
    const levels = await p.$$eval('#slots .slot', els => els.map(b => (b.querySelector('.dur').hidden ? null : b.querySelector('.dur').dataset.level)));
    assert.deepEqual(levels, ['good', 'good', 'low', 'critical', null]);
    assert.match(await p.locator('#slots .slot').nth(1).getAttribute('class'), /\bactive\b/);
    await shot('hud-phone-weapons.png', p);

    // tap a slot: the game asks the server for it
    await p.locator('#slots .slot').nth(2).tap();
    for (let i = 0; i < 40 && !sentSlots.includes(2); i++) await p.waitForTimeout(50);
    assert.ok(sentSlots.includes(2), `tapping slot 3 should send it, sent ${JSON.stringify(sentSlots)}`);

    // the sniper breaks: toast and a flash on its slot
    toPage(encode('broke', { slot: 3, weapon: 'sniper' }));
    toPage(encode('inv', { ...inv, weapons: inv.weapons.slice(0, 3), dur: inv.dur.slice(0, 3) }));
    await p.waitForFunction(() => document.querySelector('#slots .slot:nth-child(4)').classList.contains('broke'));
    assert.equal(await p.textContent('#toast'), 'Your Sniper broke!');
    assert.equal(await p.locator('#slots .slot.empty').count(), 2);
    await p.waitForFunction(() => !document.querySelector('#slots .slot.broke'), null, { timeout: 3000 });

    // every weapon broke (the Gun too): 5 empty slots and no errors
    toPage(encode('inv', { ...inv, weapons: [], dur: [], slot: 0 }));
    await p.waitForFunction(() => document.querySelectorAll('#slots .slot.empty').length === 5);

    await p.click('#btnLeave');
    await p.locator('#menu').waitFor({ state: 'visible' });
    assert.deepEqual(errs, []);
  } finally {
    await context.close();
  }
});
