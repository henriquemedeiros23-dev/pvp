// Browser check for headshots (#45). Skipped in a normal `npm test`. Run it with:  npm run test:e2e
// The page's player stands in an open place; a second player (plain WebSocket) stands 5 m in front of it.
// The page's player shoots the Gun (a 'fire' sent on the page's own connection, aimed like the crosshair would)
// 1) at the other player's head: the real server does 2 + 3 = 5 damage, "-5" with "HEADSHOT" floats above
//    the head in orange, and the page's hit marker is the bigger orange one;
// 2) at the chest (2 s later, the Gun is charged again): a normal "-2" and a normal white hit marker.
// With SCREENSHOTS=1 it saves docs/screenshots/headshot.png.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { generateIsland } from '@pvp/world-gen';
import { RULES } from '@pvp/game-rules';
import { RUN, SKIP, startServer, launchBrowser, newPage, signedIn, debug, waitDebug } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const island = generateIsland(); // the same island as the server

let server, browser;

before(async () => {
  if (!RUN) return;
  server = await startServer({ PVP_TEST_HOOKS: '1', ARENA_SEED: 'headshot-test' });
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

// A player on a plain WebSocket (no browser): joins and can teleport (test hook); remembers every message but snapshots.
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
  return { id, seen, ws, teleport: (x, z) => ws.send(JSON.stringify({ t: 'debugTeleport', x, z })) };
}

// Poll the debug view quickly until fn(state) is true (a damage number is only on screen for 2 s).
async function caught(page, fn, what, timeout = 15000) {
  const t0 = Date.now();
  for (;;) {
    const st = await debug(page);
    if (fn(st)) return st;
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what}`);
    await page.waitForTimeout(15);
  }
}

test('a Gun headshot does +3: orange "-5 HEADSHOT" and a bigger hit marker; a chest shot stays "-2"', { skip: SKIP, timeout: 300000 }, async () => {
  const P = await newPage(browser, { viewport: { width: 1100, height: 700 } }, { hooks: true });
  const { context, page, errors } = P;
  const toServer = msg => P.toServer(JSON.stringify(msg)); // the page's own connection (set once it connects)
  let victim = null;
  try {
    await signedIn(page, server.url, 'hs_');
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible' });
    const joined = await waitDebug(page, s => s.mode === 'play' && s.inv, { what: 'joined' });
    assert.equal(joined.inv.weapons[joined.inv.slot], 'gun', 'the free Gun in hand');

    // stand in an open place, the other player 5 m in front (where the camera looks)
    const spot = openSpot();
    assert.ok(spot, 'an open place on the island');
    toServer({ t: 'debugTeleport', x: spot.x, z: spot.z });
    const me = (await waitDebug(page, s => s.me && Math.hypot(s.me.x - spot.x, s.me.z - spot.z) < 0.5, { what: 'the teleport' })).me;
    const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
    const target = { x: me.x + fx * 5, z: me.z + fz * 5 };
    victim = await bot('hv_');
    victim.teleport(target.x, target.z);
    await waitDebug(page, s => s.others.some(o => o.id === victim.id && Math.hypot(o.x - target.x, o.z - target.z) < 0.5), { what: 'the other player in front of me' });
    await page.waitForTimeout(RULES.SPAWN_PROTECT_MS); // its spawn protection is over

    // the Gun's bullets start 0.3 m under the top of my head; aim at a height on the other player
    const muzzle = me.y + RULES.PLAYER_HEIGHT - 0.3;
    const fireAt = h => toServer({ t: 'fire', d: [target.x - me.x, h - muzzle, target.z - me.z] });

    // a first shot into the sky: the browser gets the shot effects ready (a slow first frame), and the Gun charges again
    toServer({ t: 'fire', d: [0, 1, 0.2] });
    await page.waitForTimeout(RULES.WEAPONS.gun.rate * 1000 + 300);

    // 1) the head (the top HEAD_ZONE meters): 2 + 3 = 5
    // (for the picture only: the page's clock runs 10 times slower for a moment, so the number is still bright
    // when the slow software renderer draws it)
    if (process.env.SCREENSHOTS === '1') {
      await page.evaluate(() => {
        const real = performance.now.bind(performance), t0 = real();
        window.__realNow = real;
        performance.now = () => t0 + (real() - t0) / 10;
      });
    }
    fireAt(RULES.PLAYER_HEIGHT - RULES.HEAD_ZONE / 2);
    // catch the orange number while it is on screen (it fades out after 2 s; a slow software renderer may draw
    // only a frame or two in that time), take the picture right then
    const s = await caught(page, st => st.damageNumbers.some(n => n.id === victim.id) && st.hitmark === 'head', 'a headshot number');
    await shot(page, 'headshot.png');
    await page.evaluate(() => { if (window.__realNow) performance.now = window.__realNow; });
    const color = await page.evaluate(id => getComputedStyle(document.querySelector(`.dmgnum[data-id="${id}"]`)).color, victim.id);
    const head = RULES.WEAPONS.gun.dmg + RULES.HEADSHOT_BONUS;
    assert.equal(head, 5);
    assert.deepEqual(s.damageNumbers.find(n => n.id === victim.id), { id: victim.id, text: `-${head}`, badge: 'HEADSHOT', kind: 'head' });
    assert.equal(color, 'rgb(255, 138, 31)', 'orange');
    assert.ok(await page.locator('#hitmark.head').count() === 1, 'the orange hit marker');
    const markScale = () => page.locator('#hitmark').evaluate(el => el.style.getPropertyValue('--hm-scale'));
    assert.equal(await markScale(), '1.6', 'and bigger');
    assert.deepEqual(victim.seen.filter(m => m.t === 'dmg'), [{ t: 'dmg', id: victim.id, amount: head, head: true }]);
    assert.equal(victim.seen.filter(m => m.t === 'hurt').at(-1).hp, 100 - head);

    // 2) the chest, when the Gun is charged again: the normal 2
    await waitDebug(page, st => st.damageNumbers.length === 0, { timeout: 20000, what: 'the number to fade out' });
    await page.waitForTimeout(RULES.WEAPONS.gun.rate * 1000);
    fireAt(1);
    const b = await caught(page, st => st.damageNumbers.some(n => n.id === victim.id) && st.hitmark === 'hit', 'a body shot number');
    assert.deepEqual(b.damageNumbers.find(n => n.id === victim.id), { id: victim.id, text: `-${RULES.WEAPONS.gun.dmg}`, badge: '', kind: 'hit' });
    assert.deepEqual(victim.seen.filter(m => m.t === 'dmg').at(-1), { t: 'dmg', id: victim.id, amount: RULES.WEAPONS.gun.dmg });
    assert.equal(await page.locator('#hitmark.head').count(), 0, 'the normal white hit marker');
    assert.equal(await markScale(), '1');
    assert.deepEqual(errors, []);
  } finally {
    victim?.ws.close();
    await context.close();
  }
});
