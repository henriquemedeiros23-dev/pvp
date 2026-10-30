// Browser check for the name bar above every other player (#54). Skipped in a normal `npm test`.
// Run it with:  npm run test:e2e
// A phone (landscape) player stands in an open place; two other players (plain WebSockets) stand in front of it.
// 1) each of them has a name bar with its name and full H.P; there is no bar for your own player;
// 2) the page shoots one of them: its bar shows the new H.P (redrawn once), the other bar is not redrawn;
// 3) the farther player's bar is bigger in the world (so it stays readable on screen);
// 4) a player more than 60 m away has its bar hidden.
// With SCREENSHOTS=1 it saves docs/screenshots/name-bar.png (2 players with their name bars).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { generateIsland } from '@pvp/world-gen';
import { RULES } from '@pvp/game-rules';
import { NAME_BAR } from '@pvp/hud-model';
import { RUN, SKIP, startServer, launchBrowser, newPage, signedIn, waitDebug } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const island = generateIsland(); // the same island as the server

let server, browser;

before(async () => {
  if (!RUN) return;
  server = await startServer({ PVP_TEST_HOOKS: '1', ARENA_SEED: 'name-bar-test' });
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

// An open place with no walls within `r` meters.
function openSpot(r = 12) {
  for (let d = 0; d < island.playRadius - r; d += 3) {
    for (let a = 0; a < 16; a++) {
      const x = Math.round(Math.cos(a / 16 * Math.PI * 2) * d), z = Math.round(Math.sin(a / 16 * Math.PI * 2) * d);
      if (island.grid.near(x, z, r).length === 0) return { x, z };
    }
  }
  return null;
}

// A free place `d` meters from (x, z), inside the play area.
function farSpot(x, z, d) {
  for (let a = 0; a < 32; a++) {
    const px = x + Math.cos(a / 32 * Math.PI * 2) * d, pz = z + Math.sin(a / 32 * Math.PI * 2) * d;
    if (Math.hypot(px, pz) < island.playRadius - 4 && island.grid.near(px, pz, 2).length === 0) return { x: px, z: pz };
  }
  return null;
}

// A player on a plain WebSocket (no browser): joins and can teleport (test hook).
async function bot(prefix) {
  const name = prefix + Date.now().toString(36).slice(-6);
  const res = await fetch(`${server.url}/api/signup`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password: 'secret1' }),
  });
  assert.equal(res.status, 200);
  const { token } = await res.json();
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${encodeURIComponent(token)}`);
  let id = null;
  ws.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'welcome') id = m.id; });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'join' }));
  for (let i = 0; i < 200 && id == null; i++) await new Promise(r => setTimeout(r, 20));
  assert.ok(id != null, 'the bot joined');
  return { id, name, ws, teleport: (x, z) => ws.send(JSON.stringify({ t: 'debugTeleport', x, z })) };
}

test('every other player has a clear name bar: name, H.P, bigger far away, hidden past 60 m, none on yourself', { skip: SKIP, timeout: 300000 }, async () => {
  const P = await newPage(browser, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }, { hooks: true });
  const { context, page, errors } = P;
  const toServer = msg => P.toServer(JSON.stringify(msg));
  const bots = [];
  try {
    await signedIn(page, server.url, 'nb_');
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible' });
    await waitDebug(page, s => s.mode === 'play' && s.inv, { what: 'joined' });

    const spot = openSpot();
    assert.ok(spot, 'an open place on the island');
    toServer({ t: 'debugTeleport', x: spot.x, z: spot.z });
    const s0 = await waitDebug(page, s => s.me && Math.hypot(s.me.x - spot.x, s.me.z - spot.z) < 0.5, { what: 'the teleport' });
    const me = s0.me;
    const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw), rx = -fz, rz = fx; // forward and right, like the camera
    const near = { x: me.x + fx * 6 - rx * 2.4, z: me.z + fz * 6 - rz * 2.4 };
    const far = { x: me.x + fx * 10 + rx * 2.2, z: me.z + fz * 10 + rz * 2.2 };
    const a = await bot('na_'); bots.push(a);
    const b = await bot('nf_'); bots.push(b);
    a.teleport(near.x, near.z);
    b.teleport(far.x, far.z);
    const at = (s, id, p) => s.others.some(o => o.id === id && Math.hypot(o.x - p.x, o.z - p.z) < 0.5);
    await waitDebug(page, s => at(s, a.id, near) && at(s, b.id, far) && s.nameBars.every(n => n.visible), { what: 'the two players in front of me with their bars' });
    await page.waitForTimeout(RULES.SPAWN_PROTECT_MS); // spawn protection over (and the bubble gone, for the picture)

    // 1) a bar for each of them, with their name and full H.P, none for me
    let s = await waitDebug(page, st => st.nameBars.length === 2, { what: 'two name bars' });
    assert.ok(!s.nameBars.some(n => n.id === s.id), 'no name bar over your own player');
    for (const p of [a, b]) {
      const n = s.nameBars.find(x => x.id === p.id);
      assert.equal(n.text, p.name);
      assert.equal(n.hp, 100);
      assert.equal(n.level, 'good');
      assert.equal(n.visible, true);
    }
    // 3) the farther one is bigger in the world (same-ish size on screen)
    const hA = s.nameBars.find(x => x.id === a.id).height, hB = s.nameBars.find(x => x.id === b.id).height;
    assert.ok(hB > hA, `the farther bar is bigger (${hB} > ${hA})`);
    await shot(page, 'name-bar.png');

    // 2) shoot the near one in the body: its bar shows 98, redrawn once; the other is not redrawn
    const drawsB = s.nameBars.find(x => x.id === b.id).draws;
    const drawsA = s.nameBars.find(x => x.id === a.id).draws;
    const muzzle = me.y + RULES.PLAYER_HEIGHT - 0.3;
    toServer({ t: 'fire', d: [near.x - me.x, 1 - muzzle, near.z - me.z] });
    const hit = 100 - RULES.WEAPONS.gun.dmg;
    s = await waitDebug(page, st => st.nameBars.find(x => x.id === a.id)?.hp === hit, { what: 'the hurt H.P on the bar' });
    assert.equal(s.nameBars.find(x => x.id === a.id).draws, drawsA + 1, 'redrawn once');
    assert.equal(s.nameBars.find(x => x.id === b.id).draws, drawsB, 'the other bar is not redrawn');

    // 4) far away (more than 60 m): hidden
    const away = farSpot(me.x, me.z, NAME_BAR.hideDistance + 8);
    assert.ok(away, 'a free place far away');
    b.teleport(away.x, away.z);
    s = await waitDebug(page, st => at(st, b.id, away), { what: 'the far player' });
    s = await waitDebug(page, st => st.nameBars.find(x => x.id === b.id)?.visible === false, { what: 'its bar hidden' });
    assert.equal(s.nameBars.find(x => x.id === a.id).visible, true, 'the close one still shows');
    assert.deepEqual(errors, []);
  } finally {
    for (const p of bots) p.ws.close();
    await context.close();
  }
});
