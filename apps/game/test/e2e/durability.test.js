// Browser check for issue #51 ("when I go to the menu and back to the game, my weapons are at full durability")
// in the real game with the real server. Skipped in a normal `npm test`. Run it with:  npm run test:e2e
//
// A player with a bought Gun and a Shield in the bars joins, shoots 3 times, goes to the menu: the Inventory shows
// the Gun worn (12 of 15), and joining again the Gun still has 12 shots left (not full). No console errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { RULES } from '@pvp/game-rules';
import { RUN, SKIP, SLOW, startServer, launchBrowser, newPage, openAndLogIn, waitDebug } from './helpers.js';

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
let server, browser;

before(async () => {
  if (!RUN) return;
  server = await startServer({ PVP_TEST_HOOKS: '1', ARENA_SEED: 'durability-test' });
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

const post = async (url, body, token) => {
  const res = await fetch(`${server.url}${url}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) }, body: JSON.stringify(body),
  });
  assert.equal(res.status, 200, `${url}: ${res.status}`);
  return res.json();
};

// Sign up, get coins (test hook 'debugCoins'), buy the items and put them in the bars.
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
  return { token, name };
}

test('durability (#51): shoot, go to the menu, join again: the weapon is still worn', { skip: SKIP, timeout: 300000 }, async () => {
  const tab = await newPage(browser, PHONE, { hooks: true });
  const { context, page, errors } = tab;
  try {
    const max = RULES.WEAPONS.gun.durability;
    const { name, token } = await accountWith('dur_', 'gun', 'shield');
    await openAndLogIn(page, server.url, name);
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: SLOW });
    const joined = await waitDebug(page, s => s.mode === 'play' && s.inv, { what: 'joined' });
    assert.deepEqual(joined.inv.weapons, ['gun'], 'the bought Gun from the fast bar (no free one)');
    assert.equal(joined.inv.dur[0], max);

    // 3 shots (the Gun shoots once every 2 s)
    for (let i = 1; i <= 3; i++) {
      tab.toServer(JSON.stringify({ t: 'fire', d: [0, 1, 0] }));
      await waitDebug(page, s => s.inv.dur[0] === max - i, { what: `shot ${i}` });
      await page.waitForTimeout(RULES.WEAPONS.gun.rate * 1000 + 150);
    }
    const before = (await waitDebug(page, s => s.inv.dur[0] === max - 3, { what: '3 shots' })).inv.dur[0];
    const shownBefore = await page.textContent('#durText');

    // to the menu: the account keeps the worn Gun
    await page.click('#btnLeave');
    await page.locator('#menu').waitFor({ state: 'visible' });
    const acc = (await post('/api/me', {}, token)).account;
    assert.deepEqual(acc.bar[0], { kind: 'weapon', id: 'gun', n: 1, dur: before });
    assert.deepEqual(acc.extras.shield, { kind: 'weapon', id: 'shield', n: 1 }, 'the unused Shield is still full');

    // the Inventory shows it worn, with a shorter durability bar
    await page.click('#btnInventory');
    const slot = page.locator('#invBar .slot[data-slot="0"][data-id="gun"]');
    await slot.waitFor();
    assert.match(await slot.getAttribute('aria-label'), new RegExp(`durability ${before}\\b`));
    const width = await slot.locator('.dur i').evaluate(e => e.style.width);
    assert.equal(width, `${Math.round((before / max) * 100)}%`);
    await page.click('#btnInvBack');
    await page.locator('#menu').waitFor({ state: 'visible' });

    // join again: not full
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: SLOW });
    const again = await waitDebug(page, s => s.mode === 'play' && s.inv && s.inv.weapons.length > 0, { what: 'joined again' });
    assert.deepEqual(again.inv.weapons, ['gun']);
    assert.equal(again.inv.dur[0], before, 'the same uses left as before the menu');
    await page.waitForFunction(t => document.getElementById('durText').textContent === t, shownBefore);

    await page.click('#btnLeave');
    await page.locator('#menu').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
