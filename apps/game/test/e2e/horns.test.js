// Browser check for the Demon Horns hat (issue #42) in the real game with the real server.
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
//
// On a phone screen a player gets 50 coins (test-only 'debugCoins', the server runs with PVP_TEST_HOOKS=1),
// finds the Demon Horns (😈, 50 coins) in the shop's hat tab, buys and wears them, and the menu shows
// the stickman with the horns. No console errors.
// With SCREENSHOTS=1 it also saves docs/screenshots/demon-horns.png (the menu preview wearing the horns).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIP, RUN, startServer, launchBrowser, newPage, signedIn, SLOW } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');

let server, browser;

before(async () => {
  if (!RUN) return;
  server = await startServer({ PVP_TEST_HOOKS: '1', ARENA_SEED: 'horns-test' });
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

test('Demon Horns: 50 coins in the hat tab, buy, wear, the menu preview wears them', { skip: SKIP, timeout: 300000 }, async () => {
  const hooked = await newPage(browser, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }, { hooks: true });
  const { context, page, errors } = hooked;
  try {
    await signedIn(page, server.url, 'dh_');

    // join once to get 50 coins through the test hook, then leave
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: SLOW });
    hooked.toServer(JSON.stringify({ t: 'debugCoins', n: 50 }));
    await page.waitForFunction(() => document.getElementById('hudCoins').textContent === '50');
    await page.click('#btnLeave');
    await page.locator('#menu').waitFor({ state: 'visible' });

    // the hat tab: Demon Horns with the devil icon, for 50 coins
    await page.click('#btnShop');
    await page.click('#shop .tabs button[data-tab="hat"]');
    const card = page.locator('#shopGrid .card', { hasText: 'Demon Horns' });
    assert.equal(await card.count(), 1);
    assert.equal(await card.locator('.icon').textContent(), '😈');
    assert.equal(await card.locator('button.buy').textContent(), '50');
    await card.locator('button.buy').click();
    await page.waitForFunction(() => document.getElementById('shopCoins').textContent === '0');
    await card.locator('button', { hasText: 'Wear' }).click();
    await card.locator('button.on').waitFor({ state: 'visible' });
    assert.equal(await card.locator('button.on').textContent(), 'Wearing');

    // back to the menu: the preview stickman wears the horns
    await page.click('#btnShopBack');
    await page.locator('#menu').waitFor({ state: 'visible' });
    if (process.env.SCREENSHOTS === '1') {
      const dir = process.env.SCREENSHOTS_DIR || SHOTS;
      fs.mkdirSync(dir, { recursive: true });
      await page.waitForTimeout(1500); // let the 3D view draw a few frames
      await page.screenshot({ path: path.join(dir, 'demon-horns.png') });
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
