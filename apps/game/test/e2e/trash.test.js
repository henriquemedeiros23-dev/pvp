// Browser check for the trash (issue #53) in the real game with the real server.
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
//
// On a phone: get coins (test-only 'debugCoins', the server runs with PVP_TEST_HOOKS=1), buy a Shootbm and a DM Gun,
// open the Inventory, tap 🗑️ (trash mode), tap the Shootbm: "Are you sure you want to destroy this weapon?",
// YES: it is gone (no coins back, still gone after opening the Inventory again). Then 🗑️ + the DM Gun + NO: it is
// still there. A bar item can be trashed too (asked first). 🗑️ twice cancels. No console errors.
// Saves docs/screenshots/trash.png (phone upright, the "are you sure?" box).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUN, SKIP, startServer, launchBrowser, newPage, signedIn, waitDebug, SLOW } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

let server, browser;

before(async () => {
  if (!RUN) return;
  server = await startServer({ PVP_TEST_HOOKS: '1', ARENA_SEED: 'trash-test' });
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

const filled = (page, id) => page.locator(`#invGrid .inv-card[data-id="${id}"][data-filled="1"]`);
const dialogOpen = page => page.locator('#trashDialog').evaluate(e => !e.classList.contains('hidden'));
const trashOn = page => page.locator('#btnTrash').evaluate(e => e.classList.contains('on'));

test('trash: buy 2 weapons, trash one (YES: gone), try the other and press NO (still there)', { skip: SKIP, timeout: 300000 }, async () => {
  const tab = await newPage(browser, PHONE, { hooks: true });
  const { context, page, errors } = tab;
  try {
    await signedIn(page, server.url, 'tr_');
    await page.locator('#btnInventory').waitFor({ state: 'visible' });

    // join once to get coins through the test hook, then leave
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: SLOW });
    await waitDebug(page, s => s.mode === 'play' && s.inv, { what: 'joined' });
    tab.toServer(JSON.stringify({ t: 'debugCoins', n: 30 }));
    await page.waitForFunction(() => document.getElementById('hudCoins').textContent === '30');
    await page.click('#btnLeave');
    await page.locator('#menu').waitFor({ state: 'visible' });

    // buy a Shootbm (7) and a DM Gun (20)
    await page.click('#btnShop');
    await page.click('#shop .tabs button[data-tab="weapon"]');
    for (const [name, left] of [['Shootbm', 23], ['DM Gun', 3]]) {
      await page.locator('#shopGrid .card').filter({ has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) }).locator('button.buy').click();
      await page.waitForFunction(n => document.getElementById('shopCoins').textContent === String(n), left);
    }
    await page.click('#btnShopBack');
    await page.click('#btnInventory');
    await page.locator('#inventory').waitFor({ state: 'visible' });
    await filled(page, 'shootbm').waitFor();
    assert.equal(await filled(page, 'dmgun').count(), 1);

    // the small 🗑️ button in the corner: big enough for a finger, on screen
    const box = await page.locator('#btnTrash').boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44 && box.width <= 80, `small but tappable: ${box.width}x${box.height}`);
    assert.ok(box.x + box.width <= PHONE.viewport.width && box.y < 100, `in the top corner: ${JSON.stringify(box)}`);
    assert.equal(await trashOn(page), false);
    assert.equal(await page.locator('#trashHint').isVisible(), false);

    // 🗑️ twice: on, then cancelled
    await page.click('#btnTrash');
    assert.equal(await trashOn(page), true);
    assert.match(await page.textContent('#trashHint'), /Tap an item to destroy it/);
    assert.equal(await page.locator('#trashHint').isVisible(), true);
    await page.click('#btnTrash');
    assert.equal(await trashOn(page), false);
    assert.equal(await page.locator('#trashHint').isVisible(), false);

    // 🗑️ + the Shootbm: are you sure? YES: gone forever, no coins back
    await page.click('#btnTrash');
    await filled(page, 'shootbm').click();
    await page.locator('#trashDialog').waitFor({ state: 'visible' });
    assert.equal(await page.textContent('#trashQuestion'), 'Are you sure you want to destroy this weapon?');
    assert.equal(await page.textContent('#trashItem .name'), 'Shootbm');
    assert.equal(await page.textContent('#trashYes'), 'YES');
    assert.equal(await page.textContent('#trashNo'), 'NO');
    const yesColor = await page.locator('#trashYes').evaluate(e => getComputedStyle(e).backgroundImage);
    assert.match(yesColor, /255, 74, 58|184, 20, 20/, 'YES is red');
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'trash.png') });
    await page.click('#trashYes');
    await page.waitForFunction(() => !document.querySelector('#invGrid .inv-card[data-id="shootbm"][data-filled="1"]'));
    assert.equal(await dialogOpen(page), false);
    assert.equal(await trashOn(page), false, 'trash mode turns off');
    assert.equal(await page.textContent('#invCoins'), '3', 'no coins back');
    assert.equal(await filled(page, 'dmgun').count(), 1, 'only the Shootbm');

    // 🗑️ + the DM Gun, NO: still there, trash mode off
    await page.click('#btnTrash');
    await filled(page, 'dmgun').click();
    await page.locator('#trashDialog').waitFor({ state: 'visible' });
    assert.equal(await page.textContent('#trashQuestion'), 'Are you sure you want to destroy this weapon?');
    await page.click('#trashNo');
    assert.equal(await dialogOpen(page), false);
    assert.equal(await trashOn(page), false);
    assert.equal(await filled(page, 'dmgun').count(), 1, 'still there');

    // trash mode off: a tap puts it in the fast bar like before; a bar item asks first too (NO again)
    await filled(page, 'dmgun').click();
    await page.locator('#invBar .slot[data-slot="0"][data-id="dmgun"]').waitFor();
    await page.click('#btnTrash');
    await page.click('#invBar .slot[data-slot="0"]');
    await page.locator('#trashDialog').waitFor({ state: 'visible' });
    assert.equal(await page.textContent('#trashItem .name'), 'DM Gun');
    await page.click('#trashNo');
    assert.equal(await page.locator('#invBar .slot[data-slot="0"][data-id="dmgun"]').count(), 1, 'still in the bar');

    // open the Inventory again (fresh from the server): the Shootbm is still gone
    await page.click('#btnInvBack');
    await page.locator('#menu').waitFor({ state: 'visible' });
    await page.click('#btnInventory');
    await page.locator('#invBar .slot[data-slot="0"][data-id="dmgun"]').waitFor();
    assert.equal(await filled(page, 'shootbm').count(), 0);
    assert.equal(await trashOn(page), false);

    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
