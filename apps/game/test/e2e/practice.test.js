// Practice mode (issue #30): the ONE built html file plays the game with NO game server running.
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
//
// It builds dist/practice/pvp-island.html, opens it over file://, and checks: the island draws,
// the Account screen comes first (#46: create an account, saved in the browser), the name can be changed, join works, walking works, opening a
// chest gives +3 coins, bots are on the island, and there are no console errors.
// The only outside request allowed is three.js from the CDN; the test answers it with the same
// file from node_modules (this machine may not reach the CDN).
// With SCREENSHOTS=1 it also saves docs/screenshots/practice.png (phone landscape 844x390, in the arena).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateIsland } from '@pvp/world-gen';
import { circleHitsBox } from '@pvp/collision';
import { RUN, SKIP, launchBrowser, debug, waitDebug, signUpForm, logInForm } from './helpers.js';
import { build, THREE_CDN } from '../../../../scripts/build-practice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const THREE_FILE = path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.min.js');
const SHOT = path.join(ROOT, 'docs', 'screenshots', 'practice.png');
const island = generateIsland();

let browser, file, artifact;

before(async () => {
  if (!RUN) return;
  ({ file, artifact } = await build({ check: false }));
  browser = await launchBrowser();
});
after(async () => { await browser?.close(); });

// A page for the built file: every request that is not the file itself or the three.js CDN is an error.
async function practicePage(contextOptions) {
  const context = await browser.newContext(contextOptions);
  context.setDefaultTimeout(60000); // software WebGL is slow; every wait is for a condition
  const page = await context.newPage();
  const errors = [], outside = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url === THREE_CDN) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(THREE_FILE) });
    if (url.startsWith('file://') || url.startsWith('data:')) return route.continue();
    outside.push(url);
    return route.abort();
  });
  return { context, page, errors, outside };
}

// The Account screen comes first (#46), also in practice mode: create an account (saved in this browser).
async function practiceSignUp(page, name = 'Practice_Kid') {
  await page.locator('#login').waitFor({ state: 'visible', timeout: 60000 });
  await signUpForm(page, name);
  await page.locator('#menu').waitFor({ state: 'visible', timeout: 60000 });
}

const free = (x, z, r = 0.7) => Math.hypot(x, z) < island.playRadius - 3 && !island.grid.near(x, z, r + 1).some(b => circleHitsBox(x, z, r, b));

// A spot `d` meters before `target` along the look direction, with a clear path to it.
function startSpot(target, yaw, dists = [5, 4, 3.5, 6], stopShort = 1.5) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  for (const d of dists) {
    const sx = target.x - fx * d, sz = target.z - fz * d;
    let ok = true;
    for (let t = 0; t <= d - stopShort && ok; t += 0.25) ok = free(sx + fx * t, sz + fz * t);
    if (ok) return { x: sx, z: sz };
  }
  return null;
}

async function holdKey(page, key, done, ms) {
  const t0 = Date.now();
  await page.keyboard.down(key);
  try {
    while (Date.now() - t0 < ms) {
      const s = await debug(page);
      if (done(s)) return s;
      await page.waitForTimeout(100);
    }
    return null;
  } finally {
    await page.keyboard.up(key);
  }
}

async function teleportTo(page, spot) {
  assert.ok(await page.evaluate(({ x, z }) => window.pvpPractice.teleport(x, z), spot), 'teleport');
  await waitDebug(page, s => s.me && Math.hypot(s.me.x - spot.x, s.me.z - spot.z) < 0.5, { what: 'the teleport' });
}

test('practice file: no server; Account screen, join, walk, open a chest for +3 coins', { skip: SKIP, timeout: 240000 }, async () => {
  assert.ok(fs.statSync(file).size < 5 * 1024 * 1024, 'under 5 MB');
  const h = await practicePage({ viewport: { width: 1100, height: 700 } });
  const { page } = h;
  try {
    await page.goto(`${pathToFileURL(file).href}?debug=1&seed=e2e`);
    // the Account screen first: create an account (saved in this browser)
    await practiceSignUp(page, 'Practice_Kid');
    await page.locator('#practiceBadge').waitFor({ state: 'visible' });
    assert.equal(await page.title(), 'PvP Island (Practice)');
    assert.equal(await page.textContent('#practiceBadge'), 'Practice mode');
    assert.equal(await page.textContent('#menuName'), 'Practice_Kid');
    assert.equal(await page.textContent('#menuCoins'), '0');
    assert.equal(await page.locator('#btnLogout').isVisible(), true);

    // change the name
    await page.click('#btnRename');
    await page.fill('#renameInput', 'x');
    await page.press('#renameInput', 'Enter');
    await page.waitForFunction(() => /3 to 16/.test(document.getElementById('renameError').textContent));
    await page.fill('#renameInput', 'Boss_Kid');
    await page.press('#renameInput', 'Enter');
    await page.waitForFunction(() => document.getElementById('menuName').textContent === 'Boss_Kid');

    // join: the bots are there too
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: 60000 });
    let s = await waitDebug(page, x => x.me && x.inv, { what: 'joining' });
    await page.waitForFunction(() => Number(document.getElementById('hudPlayers').textContent) === 4, null, { timeout: 60000 });

    // walk: hold W and we move
    const p0 = s.me;
    s = await holdKey(page, 'w', x => Math.hypot(x.me.x - p0.x, x.me.z - p0.z) > 1, 90000); // ~0.2 m a second at 0.6 fps: wait for the condition, not a time
    assert.ok(s, 'walking with W should move the player');

    // a closed chest with a clear path, far from the bots
    const open = new Set(s.openChests.map(c => c.id));
    const bots = await page.evaluate(() => { const { arena } = window.pvpPractice.server; return window.pvpPractice.server.bots.ids().map(id => arena.getPlayer(id)); });
    const farFromBots = c => Math.min(...bots.map(b => Math.hypot(b.x - c.x, b.z - c.z)));
    let chest = null, spot = null;
    for (const c of island.chests.filter(c => !open.has(c.id)).sort((a, b) => farFromBots(b) - farFromBots(a))) {
      spot = startSpot(c, s.me.yaw);
      if (spot) { chest = c; break; }
    }
    assert.ok(chest, 'no chest with a clear path');
    await teleportTo(page, spot);
    s = await holdKey(page, 'w', x => x.nearChest === chest.id, 90000); // ~0.2 m a second at 0.6 fps: wait for the condition, not a time
    assert.ok(s, `walking should reach chest ${chest.id}`);
    await page.locator('#btnOpen').waitFor({ state: 'visible' });
    await page.click('#btnOpen', { force: true });
    await page.waitForFunction(() => Number(document.getElementById('hudCoins').textContent) > 0, null, { timeout: 60000 });
    assert.equal(Number(await page.textContent('#hudCoins')), 3, 'a chest gives exactly 3 coins');
    await waitDebug(page, x => x.openChests.some(c => c.id === chest.id), { what: 'the chest to open' });

    // back to the menu: the coins are saved on the account
    await page.click('#btnLeave');
    await page.locator('#menu').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.getElementById('menuCoins').textContent === '3', null, { timeout: 60000 });

    // the page is kept: after a reload the Account screen, then log in: the same player with the same coins
    await page.reload();
    await page.locator('#login').waitFor({ state: 'visible', timeout: 60000 });
    assert.equal(await page.inputValue('#loginName'), 'Boss_Kid'); // the last name is filled in
    await logInForm(page, 'Boss_Kid');
    await page.locator('#menu').waitFor({ state: 'visible', timeout: 60000 });
    await page.waitForFunction(() => document.getElementById('menuName').textContent === 'Boss_Kid' && document.getElementById('menuCoins').textContent === '3', null, { timeout: 60000 });

    assert.deepEqual(h.errors, []);
    assert.deepEqual(h.outside, [], 'no outside requests except three.js');
  } finally {
    await h.context.close();
  }
});

// The artifact viewer puts the fragment into its own page; this wrapper copies what it adds.
function artifactWrapper(fragment) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>*, *::before, *::after { box-sizing: border-box; }
:root { padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
body { margin: 0; }</style></head><body>
${fragment}
</body></html>`;
}

test('artifact version: boots inside a wrapper page, join works, no console errors', { skip: SKIP, timeout: 120000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvp-artifact-'));
  const wrapper = path.join(dir, 'wrapper.html');
  fs.writeFileSync(wrapper, artifactWrapper(fs.readFileSync(artifact, 'utf8')));
  const h = await practicePage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const { page } = h;
  try {
    await page.goto(`${pathToFileURL(wrapper).href}?debug=1&seed=artifact`);
    await practiceSignUp(page);
    assert.equal(await page.title(), 'PvP Island');
    await page.locator('#practiceBadge').waitFor({ state: 'visible' });
    // full height inside the wrapper, with our own background
    const size = await page.evaluate(() => ({ h: document.getElementById('view').clientHeight, bg: getComputedStyle(document.body).backgroundColor }));
    assert.equal(size.h, 390);
    assert.equal(size.bg, 'rgb(22, 19, 31)');
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: 60000 });
    await waitDebug(page, x => x.me && x.inv, { what: 'joining' });
    assert.deepEqual(h.errors, []);
    assert.deepEqual(h.outside, []);
  } finally {
    await h.context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('practice file: the island draws (screenshot on a phone in landscape)', { skip: SKIP, timeout: 120000 }, async () => {
  const h = await practicePage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const { page } = h;
  try {
    await page.goto(`${pathToFileURL(file).href}?debug=1&seed=screenshot`);
    await practiceSignUp(page);
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: 60000 });
    await waitDebug(page, x => x.me && x.inv, { what: 'joining' });
    // stand in an open place (free 5 m behind for the camera, 14 m ahead) and put Bot 1 in front of us
    const s = await debug(page);
    const fx = Math.sin(s.me.yaw), fz = Math.cos(s.me.yaw);
    const clear = (x, z) => { for (let t = -5; t <= 14; t += 0.5) if (!free(x + fx * t, z + fz * t, 1.2)) return false; return true; };
    let spot = null;
    for (let r = 20; r < island.playRadius - 20 && !spot; r += 4) {
      for (let a = 0; a < 24 && !spot; a++) {
        const x = Math.cos(a / 24 * Math.PI * 2) * r, z = Math.sin(a / 24 * Math.PI * 2) * r;
        if (clear(x, z)) spot = { x, z };
      }
    }
    assert.ok(spot, 'an open place');
    await teleportTo(page, spot);
    const botSpot = { x: spot.x + fx * 8 - fz * 2.5, z: spot.z + fz * 8 + fx * 2.5 };
    for (let i = 0; i < 20; i++) { // keep it there for a few frames (software WebGL is slow)
      await page.evaluate(({ x, z }) => { const { server } = window.pvpPractice; server.arena.teleport(server.bots.ids()[0], { x, y: 0, z }); }, botSpot);
      await page.waitForTimeout(100);
    }
    const png = await page.screenshot(process.env.SCREENSHOTS === '1' ? { path: SHOT } : {});
    assert.ok(png.length > 60000, `the screenshot looks empty (${png.length} bytes)`);
    assert.deepEqual(h.errors, []);
    assert.deepEqual(h.outside, []);
  } finally {
    await h.context.close();
  }
});
