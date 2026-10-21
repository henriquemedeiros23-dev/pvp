// Automatic play test (issue #13): real browsers play the real game.
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
//
// 1) One player signs up, joins the arena, walks to a chest, opens it with the Open button,
//    gets coins, walks onto the loot to pick it up, leaves, and the menu shows the new coins.
// 2) Two players join; each sees the other's stickman; one leaves and the other sees it.
// No console errors or page crashes are allowed.
//
// Software WebGL draws only ~3 frames a second, so walking across the island would take minutes.
// The server is started with PVP_TEST_HOOKS=1, which lets this test move a player with a
// test-only 'debugTeleport' message (sent through the game's own WebSocket). All other moving,
// opening and picking up happens with the real controls.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateIsland } from '@pvp/world-gen';
import { circleHitsBox } from '@pvp/collision';
import { RUN, SKIP, startServer, launchBrowser, newPage, signedIn, debug, waitDebug } from './helpers.js';

let server, browser;
const island = generateIsland(); // the same island the server and the game use

before(async () => {
  if (!RUN) return;
  server = await startServer({ PVP_TEST_HOOKS: '1', ARENA_SEED: 'play-test' });
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

const teleport = (h, x, z) => h.toServer(JSON.stringify({ t: 'debugTeleport', x, z }));

// Is a stickman-sized circle at (x, z) free of walls and inside the play area?
const free = (x, z, r = 0.7) => Math.hypot(x, z) < island.playRadius - 3 && !island.grid.near(x, z, r + 1).some(b => circleHitsBox(x, z, r, b));

// A spot `d` meters before `target` (seen along the player's look direction) with a clear straight
// path up to `stopShort` meters before the target. So holding W from there walks right to it.
function startSpot(target, yaw, { dists = [5, 4, 3.5, 6], stopShort = 1.5 } = {}) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  for (const d of dists) {
    const sx = target.x - fx * d, sz = target.z - fz * d;
    let ok = true;
    for (let t = 0; t <= d - stopShort && ok; t += 0.25) ok = free(sx + fx * t, sz + fz * t);
    if (ok) return { x: sx, z: sz };
  }
  return null;
}

// Hold a key until done() is true (checked about 10 times a second) or the time runs out.
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

async function teleportTo(h, spot) {
  teleport(h, spot.x, spot.z);
  await waitDebug(h.page, s => s.me && Math.hypot(s.me.x - spot.x, s.me.z - spot.z) < 0.5, { what: 'the teleport' });
}

const hudNumber = async (page, sel) => Number(await page.textContent(sel));

test('play: sign up, join, open a chest, pick up the loot, leave', { skip: SKIP, timeout: 180000 }, async () => {
  const h = await newPage(browser, undefined, { hooks: true });
  const { page } = h;
  try {
    // sign up with the login screen
    await page.goto(`${server.url}/?debug=1`);
    await page.locator('#login').waitFor({ state: 'visible' });
    const name = 'play_' + Date.now().toString(36).slice(-7);
    await page.fill('#loginName', name);
    await page.fill('#loginPass', 'secret1');
    await page.click('#btnSignup');
    await page.locator('#menu').waitFor({ state: 'visible' });
    assert.equal(await page.textContent('#menuCoins'), '0');

    // join
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: 20000 });
    let s = await waitDebug(page, x => x.me && x.inv, { what: 'joining' });
    assert.equal(await hudNumber(page, '#hudCoins'), 0);

    // the nearest closed chest we can walk to in a straight line
    const open = new Set(s.openChests.map(c => c.id));
    const byDistance = island.chests.filter(c => !open.has(c.id))
      .sort((a, b) => Math.hypot(a.x - s.me.x, a.z - s.me.z) - Math.hypot(b.x - s.me.x, b.z - s.me.z));
    let chest = null, spot = null;
    for (const c of byDistance) { spot = startSpot(c, s.me.yaw); if (spot) { chest = c; break; } }
    assert.ok(chest, 'no chest with a clear path found');

    // jump close to it (test hook), then walk to it with the W key until the Open button shows
    await teleportTo(h, spot);
    assert.equal(await page.locator('#btnOpen').isVisible(), false);
    s = await holdKey(page, 'w', x => x.nearChest === chest.id, 20000);
    assert.ok(s, `walking should reach chest ${chest.id}`);
    await page.locator('#btnOpen').waitFor({ state: 'visible' });

    // open it with the Open button
    const before = h.received.length;
    await page.click('#btnOpen', { force: true }); // force: the button pulses on purpose, so it is never "stable"
    await page.waitForFunction(() => Number(document.getElementById('hudCoins').textContent) > 0, null, { timeout: 10000 });
    const coins = await hudNumber(page, '#hudCoins');
    assert.equal(coins, 3, 'a chest gives exactly 3 coins');
    // the lid opens (it turns to about -1.9 radians)
    s = await waitDebug(page, x => x.openChests.some(c => c.id === chest.id && c.lid < -1.5), { what: 'the chest lid to open' });
    assert.equal(s.nearChest, null); // an open chest can't be opened again
    // a loot item fell out next to it, and the page draws it
    const drop = h.received.slice(before).find(m => m.t === 'item+');
    assert.ok(drop, 'the chest should drop an item');
    assert.ok(Math.hypot(drop.x - chest.x, drop.z - chest.z) < 2, 'the item lands next to the chest');
    s = await waitDebug(page, x => x.items.some(it => it.id === drop.id) || h.received.some(m => m.t === 'item-' && m.id === drop.id), { what: 'the item to show' });
    assert.ok(s.items.some(it => it.id === drop.id), `the item was picked up before walking to it (stopped too close: ${JSON.stringify({ me: s.me, drop })})`);

    assert.equal(drop.kind, 'weapon', 'a chest gives exactly one weapon');
    assert.ok(!s.inv.weapons.includes(drop.weapon), `this seed should give a weapon we don't have yet, got ${drop.weapon}`);

    // walk onto it: it is picked up (a new weapon slot, or one more bandage / medkit)
    const inv0 = s.inv;
    const counts = async () => [await page.locator('#slots .slot:not(.empty)').count(), await hudNumber(page, '#bandageCount'), await hudNumber(page, '#medkitCount')];
    const hud0 = await counts();
    const itemSpot = startSpot(drop, s.me.yaw, { dists: [3, 2.5, 3.5, 4, 2], stopShort: 1 });
    assert.ok(itemSpot, 'no clear path to the item');
    await teleportTo(h, itemSpot);
    s = await holdKey(page, 'w', x => !x.items.some(it => it.id === drop.id), 20000);
    assert.ok(s, 'walking onto the item should pick it up');
    s = await waitDebug(page, x => x.inv.weapons.length + x.inv.bandages + x.inv.medkits > inv0.weapons.length + inv0.bandages + inv0.medkits, { what: 'the inventory to change' });
    if (drop.kind === 'weapon') assert.ok(s.inv.weapons.includes(drop.weapon));
    else assert.equal(s.inv[drop.kind + 's'], inv0[drop.kind + 's'] + 1);
    await page.waitForFunction(() => document.getElementById('toast').textContent.startsWith('Picked up'), null, { timeout: 5000 });
    const hud1 = await counts();
    assert.notDeepEqual(hud1, hud0, 'the HUD should show the picked up item');

    console.log(`play: opened chest ${chest.id}, +${coins} coins, picked up ${drop.kind === 'weapon' ? drop.weapon : drop.kind}`);

    // leave: the menu shows the new coin total
    await page.click('#btnLeave');
    await page.locator('#menu').waitFor({ state: 'visible' });
    await page.waitForFunction(c => document.getElementById('menuCoins').textContent === String(c), coins, { timeout: 5000 });
    assert.equal((await debug(page)).mode, 'menu');
    assert.deepEqual(h.errors, []);
  } finally {
    await h.context.close();
  }
});

test('two players see each other; when one leaves the other sees it', { skip: SKIP, timeout: 180000 }, async () => {
  const a = await newPage(browser, undefined, { hooks: true });
  const b = await newPage(browser, undefined, { hooks: true });
  try {
    const nameA = await signedIn(a.page, server.url, 'pa_');
    const nameB = await signedIn(b.page, server.url, 'pb_');
    for (const h of [a, b]) {
      await h.page.click('#btnJoin');
      await h.page.locator('#hud').waitFor({ state: 'visible', timeout: 20000 });
    }
    // spawns can be far apart (out of view): put B next to A
    const meA = (await waitDebug(a.page, s => s.me, { what: 'A to join' })).me;
    await waitDebug(b.page, s => s.me, { what: 'B to join' });
    const spot = [[3, 0], [-3, 0], [0, 3], [0, -3]].map(([dx, dz]) => ({ x: meA.x + dx, z: meA.z + dz })).find(p => free(p.x, p.z)) ?? meA;
    await teleportTo(b, spot);

    // each one sees 2 players and the other's stickman close by
    for (const [h, other] of [[a, nameB], [b, nameA]]) {
      await h.page.waitForFunction(() => document.getElementById('hudPlayers').textContent === '2', null, { timeout: 15000 });
      // (the other stickman glides to where it is, so wait until it is drawn close by)
      const near = x => x.others.some(o => o.name === other && Math.hypot(o.x - x.me.x, o.z - x.me.z) < 6);
      const s = await waitDebug(h.page, near, { timeout: 15000, what: `${other}'s stickman close by` });
      assert.equal(s.others.length, 1);
    }

    // B leaves: A sees 1 player and no other stickman
    await b.page.click('#btnLeave');
    await b.page.locator('#menu').waitFor({ state: 'visible' });
    await a.page.waitForFunction(() => document.getElementById('hudPlayers').textContent === '1', null, { timeout: 15000 });
    await waitDebug(a.page, x => x.others.length === 0, { what: "B's stickman to go away" });

    await a.page.click('#btnLeave');
    await a.page.locator('#menu').waitFor({ state: 'visible' });
    assert.deepEqual(a.errors, []);
    assert.deepEqual(b.errors, []);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
