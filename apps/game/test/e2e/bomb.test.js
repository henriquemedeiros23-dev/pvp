// Browser check for bombs (issue #32) in the real game with the real server.
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
//
// A player gets coins (test-only 'debugCoins', the server runs with PVP_TEST_HOOKS=1), buys 2 Bombs and a
// pack of 3 Legendary Bombs in the shop, joins, sees the bomb buttons, presses B: the bomb flies, lands
// with a red square and explodes ('boom') 3 s after the throw. No console errors.
// With SCREENSHOTS=1 it also saves docs/screenshots/bomb.png: bombs on the ground with their RED squares,
// before they explode.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode } from '@pvp/net-protocol';
import { RUN, SKIP, startServer, launchBrowser, newPage, signedIn, debug, waitDebug, SLOW } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');

let server, browser;

before(async () => {
  if (!RUN) return;
  server = await startServer({ PVP_TEST_HOOKS: '1', ARENA_SEED: 'bomb-test' });
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

const until = async (fn, what, ms = SLOW) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
};

test('bombs: buy in the shop, join, B throws one, red square, it explodes after 3 s', { skip: SKIP, timeout: 300000 }, async () => {
  const { context, page, errors } = await newPage(browser, { viewport: { width: 1100, height: 700 } });
  try {
    // the real server, but the test may also talk to it (test hooks) and to the page
    let toServer = null, toPage = null;
    const received = [], sent = [];
    await page.routeWebSocket(/\/\?token=/, ws => {
      const srv = ws.connectToServer();
      toServer = text => srv.send(text);
      toPage = text => ws.send(text);
      ws.onMessage(m => { try { sent.push(JSON.parse(String(m))); } catch { /* not JSON */ } srv.send(m); });
      srv.onMessage(m => { try { received.push(JSON.parse(String(m))); } catch { /* not JSON */ } ws.send(m); });
    });
    await signedIn(page, server.url, 'bo_');

    // join once to get coins through the test hook, then leave
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: SLOW });
    toServer(JSON.stringify({ t: 'debugCoins', n: 66 }));
    await page.waitForFunction(() => document.getElementById('hudCoins').textContent === '66');
    await page.click('#btnLeave');
    await page.locator('#menu').waitFor({ state: 'visible' });

    // the shop's Bombs tab: a Bomb for 3 coins, a pack of 3 Legendary Bombs for 60
    await page.click('#btnShop');
    await page.click('#shop .tabs button[data-tab="bomb"]');
    const cards = page.locator('#shopGrid .card');
    assert.equal(await cards.count(), 2);
    assert.deepEqual(await cards.locator('.name').allTextContents(), ['Bomb', 'Legendary Bomb ×3']);
    assert.deepEqual(await cards.locator('button.buy').allTextContents(), ['3', '60']);
    assert.equal(await cards.locator('.potion-icon svg circle').count(), 2, 'round bomb icons');
    for (let i = 0; i < 2; i++) {
      await cards.nth(0).locator('button.buy').click();
      await page.waitForFunction(n => document.getElementById('shopCoins').textContent === String(66 - 3 * n), i + 1);
    }
    await cards.nth(1).locator('button.buy').click();
    await page.waitForFunction(() => document.getElementById('shopCoins').textContent === '0');
    assert.match(await cards.nth(1).locator('.tag').last().textContent(), /3 in Inventory/);
    await page.click('#btnShopBack');
    // into the extras bar (#50): each bomb has its own space; only the bars come into the arena
    await page.click('#btnInventory');
    await page.click('#invGrid .inv-card[data-id="bomb"][data-filled="1"]');
    await page.locator('#invExtras .slot[data-space="bomb"][data-id="bomb"]').waitFor();
    await page.click('#invGrid .inv-card[data-id="legendarybomb"][data-filled="1"]');
    await page.locator('#invExtras .slot[data-space="legendarybomb"][data-id="legendarybomb"]').waitFor();
    assert.equal(await page.locator('#invBar .slot.empty').count(), 5, 'bombs never take a fast-bar slot');
    await page.click('#btnInvBack');
    assert.match(await page.textContent('#menuBackpack'), /Extras: 2× Bomb, 3× Legendary Bomb/);

    // join: the bombs come along, two buttons with their counts
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: SLOW });
    await page.locator('#btnBomb_bomb').waitFor({ state: 'visible' });
    assert.equal(await page.textContent('#btnBomb_bomb .bcount'), '2');
    assert.equal(await page.textContent('#btnBomb_legendarybomb .bcount'), '3');
    assert.match(await page.getAttribute('#btnBomb_bomb', 'title'), /^Bomb \(B\)/);

    // B throws a Bomb: the server sends 'bomb', the page draws it, it lands with the red square and explodes
    const thrownAt = Date.now();
    await page.keyboard.press('b');
    await until(() => sent.some(m => m.t === 'throw'), 'the throw message');
    assert.equal(sent.find(m => m.t === 'throw').b, 'bomb');
    await until(() => received.some(m => m.t === 'bomb'), 'the bomb message');
    const thrown = received.find(m => m.t === 'bomb');
    assert.equal(thrown.area, 2);
    assert.ok(Math.hypot(thrown.to[0] - thrown.from[0], thrown.to[2] - thrown.from[2]) <= 7.01, 'at most 7 m away');
    await page.waitForFunction(() => document.getElementById('btnBomb_bomb').querySelector('.bcount').textContent === '1');
    await until(() => received.some(m => m.t === 'boom'), 'the explosion', 15000);
    const boom = received.find(m => m.t === 'boom');
    assert.equal(boom.id, thrown.id);
    assert.ok(Date.now() - thrownAt >= 2900, 'not before 3 s');
    await waitDebug(page, s => s.booms >= 1 && s.bombs.length === 0, { what: 'the explosion on the page' });

    // the picture: a Bomb and a Legendary Bomb on the ground in front of us, with their red squares
    // (sent to the page only, with a long fuse, so the screenshot has time)
    const s = await debug(page);
    // d meters ahead and r meters to the right (so the stickman does not hide them)
    const fx = Math.sin(s.me.yaw), fz = Math.cos(s.me.yaw), rx = -fz, rz = fx;
    const at = (d, r = 0) => [+(s.me.x + fx * d + rx * r).toFixed(2), 0, +(s.me.z + fz * d + rz * r).toFixed(2)];
    const from = [s.me.x, 1.5, s.me.z];
    toPage(encode('bomb', { id: 900001, by: 999, b: 'legendarybomb', from, to: at(7.5, 2.2), fly: 0, ms: 60000, area: 5 }));
    toPage(encode('bomb', { id: 900002, by: 999, b: 'bomb', from, to: at(4, 1.4), fly: 0, ms: 60000, area: 2 }));
    await waitDebug(page, x => x.bombs.length === 2 && x.bombs.every(b => b.landed), { what: 'the bombs on the ground' });
    if (process.env.SCREENSHOTS === '1') {
      fs.mkdirSync(SHOTS, { recursive: true });
      await waitDebug(page, x => x.effects === 0, { what: 'the smoke of the real explosion to clear', timeout: 60000 });
      await page.screenshot({ path: path.join(SHOTS, 'bomb.png') });
    }
    toPage(encode('boom', { id: 900001, b: 'legendarybomb', x: at(7.5, 2.2)[0], y: 0, z: at(7.5, 2.2)[2], area: 5 }));
    await waitDebug(page, x => x.booms >= 2 && x.bombs.length === 1, { what: 'the second explosion' });

    await page.click('#btnLeave');
    await page.locator('#menu').waitFor({ state: 'visible' });
    // the unused bombs went back into their extras spaces
    await page.waitForFunction(() => /Extras: Bomb, 3× Legendary Bomb/.test(document.getElementById('menuBackpack').textContent));
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
