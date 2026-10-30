// Browser check for the Inventory, the fast bar (issue #39) and the extras bar (#50) in the real game with the real server.
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
//
// On a phone: get coins (test-only 'debugCoins', the server runs with PVP_TEST_HOOKS=1), buy a Shootbm, a DM Gun
// and a Healing Potion, open the Inventory (at least 2 spaces of everything), put the DM Gun into the fast bar and
// the potion into its extras space (the 4 extras spaces show drawings when empty), join: ONLY those are in the
// arena (no Shootbm, no free Gun). Leave: the Shootbm is still in the Inventory, the DM Gun and the potion are
// back in their slot and space. No console errors.
// Saves docs/screenshots/inventory.png (phone upright) and inventory-landscape.png.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryItemKinds } from '@pvp/shop-catalog';
import { RUN, SKIP, startServer, launchBrowser, newPage, signedIn, waitDebug, SLOW } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

let server, browser;

before(async () => {
  if (!RUN) return;
  server = await startServer({ PVP_TEST_HOOKS: '1', ARENA_SEED: 'inventory-test' });
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

// every element is inside the screen, and big enough for a finger
async function checkTouchable(page, selector, { min = 44 } = {}) {
  const vp = page.viewportSize();
  const boxes = await page.locator(selector).evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  assert.ok(boxes.length > 0, `${selector}: none`);
  for (const b of boxes) {
    assert.ok(b.w >= min && b.h >= min, `${selector}: ${b.w}x${b.h} is too small to tap`);
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= vp.width + 0.5 && b.y + b.h <= vp.height + 0.5, `${selector}: off screen ${JSON.stringify(b)} in ${vp.width}x${vp.height}`);
  }
}

const filled = (page, id) => page.locator(`#invGrid .inv-card[data-id="${id}"][data-filled="1"]`);
const barIds = page => page.locator('#invBar .slot').evaluateAll(els => els.map(e => e.dataset.id || null));
const extrasIds = page => page.locator('#invExtras .slot').evaluateAll(els => els.map(e => [e.dataset.space, e.dataset.id || null]));

test('inventory: buy 2 weapons and a potion, the weapon into the fast bar, the potion into the extras bar, only the bars come into the arena', { skip: SKIP, timeout: 300000 }, async () => {
  const tab = await newPage(browser, PHONE, { hooks: true }); // tab.toServer is set once the game connects
  const { context, page, errors } = tab;
  try {
    await signedIn(page, server.url, 'iv_');
    assert.match(await page.textContent('#menuBackpack'), /Fast bar is empty/);
    await page.locator('#btnInventory').waitFor({ state: 'visible' });

    // join once to get coins through the test hook, then leave
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: SLOW });
    const first = await waitDebug(page, s => s.mode === 'play' && s.inv, { what: 'joined' });
    assert.deepEqual(first.inv.weapons, ['gun'], 'an empty bar: the free Gun');
    tab.toServer(JSON.stringify({ t: 'debugCoins', n: 37 }));
    await page.waitForFunction(() => document.getElementById('hudCoins').textContent === '37');
    await page.click('#btnLeave');
    await page.locator('#menu').waitFor({ state: 'visible' });

    // buy a Shootbm (7), a DM Gun (20) and a Healing Potion (10): they go to the Inventory
    await page.click('#btnShop');
    await page.click('#shop .tabs button[data-tab="weapon"]');
    assert.match(await page.textContent('#shopHint'), /Inventory/);
    for (const [name, left] of [['Shootbm', 30], ['DM Gun', 10]]) {
      await page.locator('#shopGrid .card').filter({ has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) }).locator('button.buy').click();
      await page.waitForFunction(n => document.getElementById('shopCoins').textContent === String(n), left);
    }
    await page.click('#shop .tabs button[data-tab="potion"]');
    await page.click('#shopGrid .card button.buy');
    await page.waitForFunction(() => document.getElementById('shopCoins').textContent === '0');
    assert.match(await page.textContent('#shopGrid .card .tag:last-of-type'), /1 in Inventory/);
    await page.click('#btnShopBack');
    assert.match(await page.textContent('#menuBackpack'), /Fast bar is empty/, 'buying does not fill the bar');

    // the Inventory: at least 2 spaces of every item, filled or ghost
    await page.click('#btnInventory');
    await page.locator('#inventory').waitFor({ state: 'visible' });
    for (const { id } of inventoryItemKinds()) {
      assert.ok(await page.locator(`#invGrid .inv-card[data-id="${id}"]`).count() >= 2, `2 spaces of ${id}`);
    }
    assert.equal(await filled(page, 'shootbm').count(), 1);
    assert.equal(await filled(page, 'dmgun').count(), 1);
    assert.equal(await filled(page, 'potion').count(), 1);
    assert.equal(await page.locator('#invGrid .inv-card.ghost[data-id="supersword"]').count(), 2, 'not owned: 2 ghost spaces');
    assert.deepEqual(await barIds(page), [null, null, null, null, null], '5 empty bar slots');
    assert.equal(await page.locator('#invGrid .inv-card[data-id="potion"] .icon svg .liquid').count() >= 2, true, 'the flask icon');
    // the extras bar (#50): 4 empty spaces, each with a drawing of what goes there
    assert.deepEqual(await extrasIds(page), [['shield', null], ['potion', null], ['bomb', null], ['legendarybomb', null]]);
    assert.equal(await page.locator('#invExtras .slot.empty').count(), 4);
    assert.equal(await page.textContent('#invExtras .slot[data-space="shield"] .icon'), '🛡️');
    assert.equal(await page.locator('#invExtras .slot[data-space="potion"] .icon svg .liquid').count(), 1, 'a faint flask');
    assert.equal(await page.locator('#invExtras .slot[data-space="bomb"] .icon svg').count(), 1, 'a faint bomb');
    assert.equal(await page.textContent('#invExtras .slot[data-space="potion"] .cnt'), '0/3');
    const faint = await page.locator('#invExtras .slot[data-space="shield"] .icon').evaluate(e => Number(getComputedStyle(e).opacity));
    assert.ok(faint < 0.5, `an empty space's drawing is faint: ${faint}`);
    await page.click('#invExtras .slot[data-space="shield"]');
    assert.match(await page.textContent('#invError'), /Shield/);

    // tap bar slot 3 first, then the DM Gun: it goes into slot 3
    await page.click('#invBar .slot[data-slot="2"]');
    await page.locator('#invBar .slot.picked[data-slot="2"]').waitFor();
    await filled(page, 'dmgun').click();
    await page.locator('#invBar .slot[data-slot="2"][data-id="dmgun"]').waitFor();
    assert.deepEqual(await barIds(page), [null, null, 'dmgun', null, null]);
    assert.equal(await filled(page, 'dmgun').count(), 0, 'it left the Inventory');
    assert.equal(await filled(page, 'shootbm').count(), 1);
    // tap the potion: it goes into its own extras space, not the fast bar
    await filled(page, 'potion').click();
    await page.locator('#invExtras .slot[data-space="potion"][data-id="potion"]').waitFor();
    assert.equal(await page.textContent('#invExtras .slot[data-space="potion"] .cnt'), '1/3');
    assert.deepEqual(await barIds(page), [null, null, 'dmgun', null, null]);
    // a ghost space says where to get it
    await page.click('#invGrid .inv-card.ghost[data-id="supersword"] >> nth=0');
    assert.match(await page.textContent('#invError'), /SHOP/);

    // phone upright and sideways: big touch targets, all on screen
    await checkTouchable(page, '#invBar .slot', { min: 48 });
    await checkTouchable(page, '#invExtras .slot', { min: 48 });
    await checkTouchable(page, '#btnInvBack');
    const firstCard = page.locator('#invGrid .inv-card').first();
    const box = await firstCard.boundingBox();
    assert.ok(box.width >= 48 && box.height >= 48, `cards are big enough: ${box.width}x${box.height}`);
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'inventory.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(200);
    await checkTouchable(page, '#invBar .slot', { min: 44 });
    await checkTouchable(page, '#invExtras .slot', { min: 44 });
    await checkTouchable(page, '#btnInvBack');
    const gridBox = await page.locator('#invGrid').boundingBox();
    assert.ok(gridBox.height >= 100, `the grid still has room sideways: ${gridBox.height}`);
    await page.screenshot({ path: path.join(SHOTS, 'inventory-landscape.png') });
    await page.setViewportSize(PHONE.viewport);

    // tap a bar item: back to the Inventory; tap it again in the Inventory: into the first free slot
    await page.click('#invBar .slot[data-id="dmgun"]');
    await page.locator('#invBar .slot[data-slot="2"].empty').waitFor();
    await filled(page, 'dmgun').click();
    await page.locator('#invBar .slot[data-slot="0"][data-id="dmgun"]').waitFor();
    assert.deepEqual(await barIds(page), ['dmgun', null, null, null, null]);
    // the same for an extras space
    await page.click('#invExtras .slot[data-space="potion"]');
    await page.locator('#invExtras .slot.empty[data-space="potion"]').waitFor();
    assert.equal(await filled(page, 'potion').count(), 1, 'back in the Inventory');
    await filled(page, 'potion').click();
    await page.locator('#invExtras .slot[data-space="potion"][data-id="potion"]').waitFor();

    await page.click('#btnInvBack');
    await page.locator('#menu').waitFor({ state: 'visible' });
    assert.match(await page.textContent('#menuBackpack'), /Fast bar: DM Gun \(4 free\) · Extras: Healing Potion/);

    // join: ONLY the bar comes along (no free Gun, no Shootbm)
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: SLOW });
    const inArena = await waitDebug(page, s => s.mode === 'play' && s.inv && s.inv.weapons.length > 0 && s.inv.weapons[0] !== 'gun', { what: 'joined with the bar' });
    assert.deepEqual(inArena.inv.weapons, ['dmgun'], 'only the DM Gun from the bar');
    assert.equal(inArena.inv.potions, 1, 'the potion from the extras bar');
    assert.equal(await page.locator('#slots .slot:not(.empty)').count(), 1);

    // leave: the DM Gun and the potion go back into their slot and space, the Shootbm never left the Inventory
    await page.click('#btnLeave');
    await page.locator('#menu').waitFor({ state: 'visible' });
    await page.waitForFunction(() => /Fast bar: DM Gun.*Extras: Healing Potion/.test(document.getElementById('menuBackpack').textContent));
    await page.click('#btnInventory');
    await page.locator('#invBar .slot[data-slot="0"][data-id="dmgun"]').waitFor();
    assert.deepEqual(await barIds(page), ['dmgun', null, null, null, null]);
    assert.deepEqual(await extrasIds(page), [['shield', null], ['potion', 'potion'], ['bomb', null], ['legendarybomb', null]]);
    assert.equal(await filled(page, 'shootbm').count(), 1, 'the Shootbm is still in the Inventory');
    assert.equal(await filled(page, 'dmgun').count(), 0);

    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
