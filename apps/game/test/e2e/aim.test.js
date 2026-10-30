// Browser check for aiming (issues #37, #40) on a phone: the 🎯 AIM button shows only with the Shootbm (or the
// DM Gun). It is a toggle: a tap zooms the camera in with a round scope ring and tells the server (aim flag 16 in
// 'state'), and it keeps aiming after the finger lets go ('AIM ON'); a second tap zooms back out. Switching to the
// Gun switches aiming off and hides the button.
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
// With SCREENSHOTS=1 it saves docs/screenshots/aim.png (aiming with the Shootbm, phone size).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { generateIsland } from '@pvp/world-gen';
import { RULES } from '@pvp/game-rules';
import { FLAG_AIM } from '@pvp/net-protocol';
import { RUN, SKIP, SLOW, startServer, launchBrowser, debug, waitDebug } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const island = generateIsland(); // the same island as the server

let server, browser;

before(async () => {
  if (!RUN) return;
  server = await startServer({ PVP_TEST_HOOKS: '1', ARENA_SEED: 'aim-test' });
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

// An open place with no walls within `r` meters.
function openSpot(r = 16) {
  for (let d = 0; d < island.playRadius - r; d += 3) {
    for (let a = 0; a < 16; a++) {
      const x = Math.round(Math.cos(a / 16 * Math.PI * 2) * d), z = Math.round(Math.sin(a / 16 * Math.PI * 2) * d);
      if (island.grid.near(x, z, r).length === 0) return { x, z };
    }
  }
  return null;
}

const post = async (url, body, token) => {
  const res = await fetch(`${server.url}${url}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) }, body: JSON.stringify(body),
  });
  assert.equal(res.status, 200, `${url}: ${res.status}`);
  return res.json();
};

// Sign up, get coins (test hook 'debugCoins' on a plain WebSocket), buy weapons and put them in the fast bar
// in this order (#39: only the fast bar comes into the arena). Returns the token.
async function accountWith(prefix, ...weapons) {
  const name = prefix + Date.now().toString(36).slice(-7);
  const { token } = await post('/api/signup', { name, password: 'secret1' });
  const price = weapons.reduce((sum, w) => sum + RULES.WEAPONS[w].price, 0);
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${encodeURIComponent(token)}`);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'debugCoins', n: price }));
  let coins = 0;
  for (let i = 0; i < 100 && coins < price; i++) {
    await new Promise(r => setTimeout(r, 30));
    coins = (await post('/api/me', {}, token)).account.coins;
  }
  ws.close();
  for (const weapon of weapons) {
    await post('/api/buy', { kind: 'weapon', id: weapon }, token);
    await post('/api/bar/put', { kind: 'weapon', id: weapon }, token);
  }
  return token;
}

// Another player (plain WebSocket) standing somewhere, so there is someone to aim at in the picture.
async function standingPlayer(x, z) {
  const { token } = await post('/api/signup', { name: 'tg_' + Date.now().toString(36).slice(-6), password: 'secret1' });
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${encodeURIComponent(token)}`);
  let id = null;
  ws.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'welcome') id = m.id; });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'join' }));
  for (let i = 0; i < 200 && id == null; i++) await new Promise(r => setTimeout(r, 20));
  assert.ok(id != null, 'the target joined');
  ws.send(JSON.stringify({ t: 'debugTeleport', x, z }));
  return { id, ws };
}

test('phone: tap 🎯 AIM with the Shootbm to aim until tapped again; switching to the Gun stops it', { skip: SKIP, timeout: 300000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  context.setDefaultTimeout(SLOW);
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  // the real server; the test sees the page's 'state' flags and can teleport the page's player
  let toServer = null, lastFlags = 0, aimStates = 0;
  await page.routeWebSocket(/\/\?token=/, ws => {
    const s = ws.connectToServer();
    toServer = text => s.send(text);
    ws.onMessage(text => {
      const m = /"t":"state"/.test(String(text)) ? JSON.parse(String(text)) : null;
      if (m) { lastFlags = m.f; if (m.f & FLAG_AIM) aimStates++; }
      s.send(text);
    });
  });
  let target = null;
  try {
    const token = await accountWith('aim_', 'gun', 'shootbm');
    await page.addInitScript(t => localStorage.setItem('pvp.token', t), token);
    await page.goto(`${server.url}/?debug=1`);
    await page.locator('#menu').waitFor({ state: 'visible', timeout: SLOW });
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible' });
    const joined = await waitDebug(page, s => s.mode === 'play' && s.inv, { what: 'joined' });
    assert.deepEqual(joined.inv.weapons, ['gun', 'shootbm'], 'a Gun and a Shootbm from the fast bar');

    // the Gun in hand: no AIM button
    assert.equal(joined.inv.slot, 0);
    assert.equal(joined.aim.canAim, false);
    assert.equal(joined.aim.button, false);
    assert.equal(await page.locator('#btnAim').isVisible(), false);

    // stand in an open place, someone 14 m in front to aim at
    const spot = openSpot();
    assert.ok(spot, 'an open place on the island');
    toServer(JSON.stringify({ t: 'debugTeleport', x: spot.x, z: spot.z }));
    const me = (await waitDebug(page, s => s.me && Math.hypot(s.me.x - spot.x, s.me.z - spot.z) < 0.5, { what: 'the teleport' })).me;
    const tx = me.x + Math.sin(me.yaw) * 14, tz = me.z + Math.cos(me.yaw) * 14;
    target = await standingPlayer(tx, tz);
    await waitDebug(page, s => s.others.some(o => o.id === target.id && Math.hypot(o.x - tx, o.z - tz) < 0.5), { what: 'the target in front' });

    // the Shootbm in hand: the AIM button shows
    await page.locator('#slots .slot[data-slot="1"]').dispatchEvent('pointerdown');
    const withShootbm = await waitDebug(page, s => s.inv.slot === 1 && s.aim.button, { what: 'the AIM button with the Shootbm' });
    assert.equal(withShootbm.aim.canAim, true);
    assert.equal(withShootbm.aim.aiming, false, 'not aiming before the button is held');
    assert.equal(withShootbm.aim.fov, withShootbm.aim.baseFov, 'no zoom yet');
    assert.equal(withShootbm.aim.scope, false);
    assert.ok(await page.locator('#btnAim').isVisible());

    // tap the AIM button (a real touch, finger down and up again): aiming stays on, fully zoomed in, scope ring,
    // the server is told
    const box = await page.locator('#btnAim').boundingBox();
    const cdp = await context.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const tap = async () => {
      await touch('touchStart', [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 7 }]);
      await touch('touchEnd', []);
    };
    await tap();
    const aimed = await waitDebug(page, s => s.aim.aiming && s.aim.amount === 1, { what: 'fully aimed after a tap' });
    assert.equal(aimed.aim.on, true, 'the toggle is on');
    assert.equal(aimed.aim.label, 'AIM ON');
    assert.equal(aimed.aim.zoom, RULES.WEAPONS.shootbm.aim.zoom);
    assert.ok(aimed.aim.fov < aimed.aim.baseFov * 0.6, `zoomed in: fov ${aimed.aim.fov} (was ${aimed.aim.baseFov})`);
    assert.equal(aimed.aim.scope, true, 'the scope ring shows');
    assert.ok(await page.locator('#scope').isVisible());
    await page.waitForFunction(() => {
      const b = document.getElementById('btnAim');
      return b.classList.contains('pressed') && b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true';
    });
    await page.waitForTimeout(400); // the finger is up for a while: still aiming
    const still = await debug(page);
    assert.equal(still.aim.aiming, true, 'keeps aiming after letting go');
    assert.equal(still.aim.amount, 1);
    for (let i = 0; i < 100 && !(lastFlags & FLAG_AIM); i++) await page.waitForTimeout(50);
    assert.ok(lastFlags & FLAG_AIM, 'the aim flag goes to the server');
    if (process.env.SCREENSHOTS === '1') {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.SCREENSHOTS_DIR || SHOTS, 'aim.png') });
    }

    // tap again: zoom back out
    await tap();
    const released = await waitDebug(page, s => !s.aim.aiming && s.aim.amount === 0, { what: 'zoomed back out after the second tap' });
    assert.equal(released.aim.on, false);
    assert.equal(released.aim.label, 'AIM');
    assert.equal(released.aim.fov, released.aim.baseFov);
    assert.equal(released.aim.scope, false);
    assert.equal(await page.locator('#btnAim.on').count(), 0, 'no "on" look any more');
    for (let i = 0; i < 100 && (lastFlags & FLAG_AIM); i++) await page.waitForTimeout(50);
    assert.equal(lastFlags & FLAG_AIM, 0, 'the server is told we stopped');
    assert.ok(aimStates > 0);

    // aim again, then switch to the Gun: aiming switches off and the AIM button hides
    await tap();
    await waitDebug(page, s => s.aim.aiming && s.aim.on, { what: 'aiming again' });
    await page.locator('#slots .slot[data-slot="0"]').dispatchEvent('pointerdown');
    const gun = await waitDebug(page, s => s.inv.slot === 0 && !s.aim.button, { what: 'the AIM button hidden with the Gun' });
    assert.equal(gun.aim.canAim, false);
    assert.equal(gun.aim.aiming, false);
    assert.equal(gun.aim.on, false, 'switching to the Gun switches aiming off');
    assert.equal(await page.locator('#btnAim').isVisible(), false);
    for (let i = 0; i < 100 && (lastFlags & FLAG_AIM); i++) await page.waitForTimeout(50);
    assert.equal(lastFlags & FLAG_AIM, 0, 'the server is told we stopped');

    // back to the Shootbm: the button shows, but aiming stays off until tapped
    await page.locator('#slots .slot[data-slot="1"]').dispatchEvent('pointerdown');
    const back = await waitDebug(page, s => s.inv.slot === 1 && s.aim.button, { what: 'the AIM button back with the Shootbm' });
    assert.equal(back.aim.on, false);
    assert.equal(back.aim.aiming, false);
    assert.deepEqual(errors, []);
  } finally {
    target?.ws.close();
    await context.close();
  }
});
