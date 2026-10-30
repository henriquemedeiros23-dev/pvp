// Browser check for the fight feedback on a phone (issues #35 and #33).
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
// 1) After a shot, "Charging 1.9s" shows just under the crosshair with a "25%" hint (a hit now does 25%, #38),
//    and goes away when the Gun is ready. The player has two Guns (one bought): switching to the second one
//    hides it (that Gun is ready) and it fires right away (#38: each weapon charges on its own).
// 2) Two more players (plain WebSockets) stand in front of the phone player; one shoots the other with the Gun:
//    the real server sends 'dmg' and "-2" floats above the hit player's head. Faked 'dmg' messages also show
//    a shock tick, "Blocked" and "KO!".
// With SCREENSHOTS=1 it saves docs/screenshots/charging.png and docs/screenshots/damage-numbers.png.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { generateIsland } from '@pvp/world-gen';
import { RULES } from '@pvp/game-rules';
import { encode } from '@pvp/net-protocol';
import { RUN, SKIP, SLOW, startServer, launchBrowser, debug, waitDebug, openAndLogIn } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const island = generateIsland(); // the same island as the server

let server, browser;

before(async () => {
  if (!RUN) return;
  server = await startServer({ PVP_TEST_HOOKS: '1', ARENA_SEED: 'feedback-test' });
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

const shot = async (page, name) => {
  if (process.env.SCREENSHOTS !== '1') return;
  const dir = process.env.SCREENSHOTS_DIR || SHOTS;
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, name) });
};

// An open place with no walls within `r` meters (so nothing stands between the players).
function openSpot(r = 12) {
  for (let d = 0; d < island.playRadius - r; d += 3) {
    for (let a = 0; a < 16; a++) {
      const x = Math.round(Math.cos(a / 16 * Math.PI * 2) * d), z = Math.round(Math.sin(a / 16 * Math.PI * 2) * d);
      if (island.grid.near(x, z, r).length === 0) return { x, z };
    }
  }
  return null;
}

// Sign up, get 6 coins (test hook 'debugCoins' on a plain WebSocket), buy two Guns and put them in the fast bar
// (#39: only the bar comes into the arena), then log the page in.
async function signedInWithTwoGuns(page, prefix) {
  const name = prefix + Date.now().toString(36).slice(-7);
  const post = async (url, body, token) => {
    const res = await fetch(`${server.url}${url}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) }, body: JSON.stringify(body),
    });
    assert.equal(res.status, 200, `${url}: ${res.status}`);
    return res.json();
  };
  const { token } = await post('/api/signup', { name, password: 'secret1' });
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${encodeURIComponent(token)}`);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'debugCoins', n: 2 * RULES.WEAPONS.gun.price }));
  let coins = 0;
  for (let i = 0; i < 100 && coins < 2 * RULES.WEAPONS.gun.price; i++) {
    await new Promise(r => setTimeout(r, 30));
    coins = (await post('/api/me', {}, token)).account.coins;
  }
  ws.close();
  for (let i = 0; i < 2; i++) {
    await post('/api/buy', { kind: 'weapon', id: 'gun' }, token);
    await post('/api/bar/put', { kind: 'weapon', id: 'gun' }, token);
  }
  await openAndLogIn(page, server.url, name); // the Account screen (#46)
}

// A player on a plain WebSocket (no browser): joins, can teleport (test hook) and shoot.
async function bot(prefix) {
  const name = prefix + Date.now().toString(36).slice(-6);
  const res = await fetch(`${server.url}/api/signup`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password: 'secret1' }),
  });
  assert.equal(res.status, 200);
  const { token } = await res.json();
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${encodeURIComponent(token)}`);
  const seen = [];
  let id = null;
  ws.on('message', d => {
    const m = JSON.parse(String(d));
    if (m.t === 'welcome') id = m.id;
    if (m.t !== 'snap') seen.push(m);
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'join' }));
  for (let i = 0; i < 200 && id == null; i++) await new Promise(r => setTimeout(r, 20));
  assert.ok(id != null, 'the bot joined');
  return {
    id, seen, ws,
    teleport: (x, z) => ws.send(JSON.stringify({ t: 'debugTeleport', x, z })),
    fire: d => ws.send(JSON.stringify({ t: 'fire', d })),
  };
}

test('phone: "Charging" after a shot, and damage numbers above heads', { skip: SKIP, timeout: 300000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  context.setDefaultTimeout(SLOW);
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  // the real server, plus: the test can teleport the page's player and send extra messages to the page
  let toServer = null, toPage = null, fires = 0;
  await page.routeWebSocket(/\/\?token=/, ws => {
    const s = ws.connectToServer();
    toServer = text => s.send(text);
    toPage = text => ws.send(text);
    ws.onMessage(text => { // count the page's 'fire' messages (and pass everything on)
      if (/"t":"fire"/.test(String(text))) fires++;
      s.send(text);
    });
  });
  const bots = [];
  try {
    await signedInWithTwoGuns(page, 'fb_');
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible' });
    const joined = await waitDebug(page, s => s.mode === 'play' && s.inv, { what: 'joined' });
    assert.deepEqual(joined.inv.weapons, ['gun', 'gun'], 'the two Guns from the fast bar');

    // stand in an open place
    const spot = openSpot();
    assert.ok(spot, 'an open place on the island');
    toServer(JSON.stringify({ t: 'debugTeleport', x: spot.x, z: spot.z }));
    const me = (await waitDebug(page, s => s.me && Math.hypot(s.me.x - spot.x, s.me.z - spot.z) < 0.5, { what: 'the teleport' })).me;
    assert.equal((await debug(page)).charge, '', 'nothing under the crosshair before a shot');

    // 1) hold the fire button: one Gun shot, then "Charging 1.9s" (the Gun's rate is 2 s) under the crosshair
    const box = await page.locator('#btnFire').boundingBox();
    const cdp = await context.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await touch('touchStart', [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 3 }]);
    await page.waitForFunction(() => /^Charging \d\.\ds$/.test(document.getElementById('chargeText').textContent)
      && !document.getElementById('charge').classList.contains('hidden'), null, { polling: 30 });
    await touch('touchEnd', []);
    await shot(page, 'charging.png');
    const first = (await debug(page)).charge;
    const secs = Number(first.match(/(\d\.\d)s/)[1]);
    assert.ok(secs > 0 && secs <= RULES.WEAPONS.gun.rate, `counts down from the Gun's ${RULES.WEAPONS.gun.rate} s: ${first}`);
    // the small text sits just under the crosshair (the middle of the screen)
    const cb = await page.locator('#charge').boundingBox();
    assert.ok(Math.abs(cb.x + cb.width / 2 - 422) < 4 && cb.y > 195 && cb.y < 230, JSON.stringify(cb));
    // #38: while it charges a small "25%" says a hit now does only 25% of the damage
    assert.equal((await debug(page)).chargeHint, `${RULES.CHARGING_DAMAGE * 100}%`);
    assert.equal(await page.locator('#chargeHint').textContent(), '25%');
    assert.ok(await page.locator('#chargeHint').isVisible());
    assert.equal(fires, 1, 'one shot');
    // switch to the second Gun: it is ready, so nothing shows under the crosshair ...
    await page.locator('#slots .slot[data-slot="1"]').dispatchEvent('pointerdown');
    await waitDebug(page, s => s.inv.slot === 1 && s.charge === '', { what: 'slot 2 in hand, nothing charging' });
    // ... and it fires right away (the first Gun is still charging)
    await touch('touchStart', [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 4 }]);
    await touch('touchEnd', []);
    const second = await waitDebug(page, s => s.inv.dur[1] === RULES.WEAPONS.gun.durability - 1 && /^Charging/.test(s.charge),
      { what: 'the second Gun shot at once' });
    assert.equal(fires, 2, 'the second shot was sent');
    assert.deepEqual(second.inv.dur, [RULES.WEAPONS.gun.durability - 1, RULES.WEAPONS.gun.durability - 1], 'one shot from each Gun');
    // ... and goes away when the Gun is ready (after a short "Ready!")
    await waitDebug(page, s => s.charge === '', { what: 'the charge to finish' });

    // 2) two players in front of me: a target 6 m ahead, a shooter 3 m to its side
    const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
    const target = { x: me.x + fx * 6, z: me.z + fz * 6 };
    const shooterAt = { x: target.x - fz * 3, z: target.z + fx * 3 };
    const victim = await bot('fv_');
    const shooter = await bot('fs_');
    bots.push(victim, shooter);
    victim.teleport(target.x, target.z);
    shooter.teleport(shooterAt.x, shooterAt.z);
    await waitDebug(page, s => [victim.id, shooter.id].every(id => s.others.some(o => o.id === id && Math.hypot(o.x - (id === victim.id ? target.x : shooterAt.x), o.z - (id === victim.id ? target.z : shooterAt.z)) < 0.5)), { what: 'the two players in front of me' });
    await page.waitForTimeout(RULES.SPAWN_PROTECT_MS); // the target's spawn protection is over

    // the shooter aims at the target's chest and shoots: everyone near gets 'dmg', the page shows "-2" over the target
    const aim = [target.x - shooterAt.x, 1 - (RULES.PLAYER_HEIGHT - 0.3), target.z - shooterAt.z];
    shooter.fire(aim);
    const s = await waitDebug(page, st => st.damageNumbers.some(n => n.id === victim.id), { timeout: 15000, what: 'a damage number over the target' });
    assert.deepEqual(s.damageNumbers.find(n => n.id === victim.id), { id: victim.id, text: `-${RULES.WEAPONS.gun.dmg}`, badge: '', kind: 'hit' });
    for (const b of bots) assert.deepEqual(b.seen.filter(m => m.t === 'dmg'), [{ t: 'dmg', id: victim.id, amount: RULES.WEAPONS.gun.dmg }]);

    // more kinds (faked messages): a shock tick on the target, "Blocked" over the shooter, "KO!" over me
    toPage(encode('dmg', { id: victim.id, amount: 1, shock: true }));
    toPage(encode('dmg', { id: shooter.id, amount: 0, blocked: true }));
    toPage(encode('dmg', { id: (await debug(page)).id, amount: 15, ko: true }));
    const all = await waitDebug(page, st => st.damageNumbers.length >= 4, { timeout: 15000, what: 'every damage number' });
    const kinds = all.damageNumbers.map(n => `${n.kind}:${n.text}${n.badge}`).sort();
    assert.deepEqual(kinds, ['blocked:Blocked', 'hit:-2', 'ko:-15KO!', 'shock:-1']);
    await shot(page, 'damage-numbers.png');

    // they float away after 2 seconds
    await waitDebug(page, st => st.damageNumbers.length === 0, { timeout: 20000, what: 'the numbers to fade out' });
    assert.equal(await page.locator('.dmgnum:not([hidden])').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    for (const b of bots) b.ws.close();
    await context.close();
  }
});
