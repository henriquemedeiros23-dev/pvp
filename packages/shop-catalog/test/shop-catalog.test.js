import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, COLORS, OUTFITS, RARITY_COLORS } from '@pvp/game-rules';
import { shopTabs, shopItems, shopWeaponIds, backpackSummary, swatchBackground, OUTFIT_ICONS, potionCard } from '../src/index.js';

const fresh = () => ({
  name: 'Bob', coins: 0,
  owned: ['color:black', 'hat:none', 'face:none', 'back:none', 'shirt:none'],
  skin: { color: 'black', hat: 'none', face: 'none', back: 'none', shirt: 'none' },
  stash: {},
});

test('shopTabs lists the seven tabs in order, and returns copies', () => {
  const tabs = shopTabs();
  assert.deepEqual(tabs.map(t => t.id), ['color', 'hat', 'face', 'back', 'shirt', 'weapon', 'potion']);
  assert.deepEqual(tabs.map(t => t.label), ['Colors', 'Hats', 'Masks', 'Back', 'Clothes', 'Weapons', 'Potions']);
  assert.ok(tabs.every(t => typeof t.hint === 'string' && t.hint));
  tabs[0].label = 'changed';
  assert.equal(shopTabs()[0].label, 'Colors');
});

test('color cards come in rules order with owned / equipped / buy state', () => {
  const acc = { ...fresh(), coins: 60, owned: [...fresh().owned, 'color:red'] };
  const cards = shopItems('color', acc);
  assert.deepEqual(cards.map(c => c.id), Object.keys(COLORS));
  const [black, red, blue] = cards;
  assert.deepEqual(black, { kind: 'color', id: 'black', name: 'Classic Black', price: 0, owned: true, equipped: true, canAfford: true, action: 'equipped', color: '#1b1b1f' });
  assert.equal(red.action, 'equip');
  assert.equal(red.equipped, false);
  assert.equal(blue.action, 'buy');
  assert.equal(blue.canAfford, true);
  const rainbow = cards.find(c => c.id === 'rainbow');
  assert.equal(rainbow.canAfford, false);
  assert.equal(rainbow.pattern, 'rainbow');
});

test('outfit cards have icons and follow rules order', () => {
  for (const slot of ['hat', 'face', 'back', 'shirt']) {
    const cards = shopItems(slot, fresh());
    assert.deepEqual(cards.map(c => c.id), Object.keys(OUTFITS[slot]));
    assert.ok(cards.every(c => c.icon && c.icon === OUTFIT_ICONS[slot][c.id]), slot);
    assert.equal(cards[0].action, 'equipped'); // 'none' is worn by default
  }
  const acc = { ...fresh(), coins: 300, owned: [...fresh().owned, 'hat:crown'], skin: { ...fresh().skin, hat: 'crown' } };
  const hats = shopItems('hat', acc);
  assert.equal(hats.find(c => c.id === 'crown').action, 'equipped');
  assert.equal(hats.find(c => c.id === 'none').action, 'equip');
});

test('weapons are sorted by rarity then price, include the starting Gun, and show the stash', () => {
  const acc = { ...fresh(), coins: 100, stash: { shootbm: 2, supersword: 1, icesword: 0 } };
  const cards = shopItems('weapon', acc);
  assert.deepEqual(cards.map(c => c.id), ['gun', 'shootbm', 'shield', 'electricsword', 'icesword', 'megashield', 'supersword']);
  assert.ok(!cards.some(c => c.id === 'woodsword' || c.id === 'pistol'), 'only the boss\'s weapons');
  assert.equal(cards[0].price, 3);
  const shootbm = cards.find(c => c.id === 'shootbm');
  assert.deepEqual(shootbm, { kind: 'weapon', id: 'shootbm', name: 'Shootbm', price: 7, owned: true, equipped: false, canAfford: true, action: 'buy', rarity: 'common', type: 'gun', stashCount: 2,
    rarityName: 'Common', rarityColor: RARITY_COLORS.common.color, rarityBackground: RARITY_COLORS.common.color });
  const epic = cards.find(c => c.id === 'shield');
  assert.equal(epic.rarityName, 'Epic');
  assert.equal(epic.type, 'shield');
  assert.equal(epic.rarityColor, RARITY_COLORS.epic.color);
  assert.equal(cards.find(c => c.id === 'icesword').owned, false);
  assert.equal(cards.find(c => c.id === 'supersword').canAfford, false);
  assert.equal(cards.find(c => c.id === 'supersword').rarityName, 'Megalegend');
  assert.deepEqual(shopWeaponIds(), cards.map(c => c.id));
});

test('works with missing account parts and unknown tabs', () => {
  assert.deepEqual(shopItems('nope', fresh()), []);
  const cards = shopItems('color', null);
  assert.ok(cards.every(c => !c.owned && !c.equipped && c.action === 'buy'));
  assert.equal(cards[0].canAfford, true); // free item
  assert.equal(shopItems('weapon', {}).every(c => c.stashCount === 0), true);
});

test('custom rules are used when passed in', () => {
  const rules = {
    ...RULES,
    COLORS: { pink: { name: 'Pink', price: 5, color: '#f0f' } },
    WEAPONS: { b: { name: 'B', rarity: 'epic', price: 1 }, a: { name: 'A', rarity: 'epic', price: 1 }, z: { name: 'Z', rarity: 'common', price: 9 }, q: { name: 'Q', rarity: 'weird', price: 0 } },
  };
  assert.deepEqual(shopItems('color', { coins: 5 }, rules).map(c => [c.id, c.canAfford]), [['pink', true]]);
  assert.deepEqual(shopWeaponIds(rules), ['z', 'a', 'b', 'q']);
  assert.equal(shopItems('weapon', {}, rules).at(-1).rarityName, 'weird');
  assert.equal(backpackSummary({ stash: { b: 1, z: 3 } }, rules), 'Backpack: 3× Z, 1× B');
});

test('backpackSummary text', () => {
  assert.equal(backpackSummary(fresh()), 'Backpack is empty. Buy weapons in the shop!');
  assert.equal(backpackSummary({ stash: { supersword: 1, shootbm: 2, icesword: 0 } }), 'Backpack: 2× Shootbm, 1× Supersword');
  assert.equal(backpackSummary(undefined), 'Backpack is empty. Buy weapons in the shop!');
  assert.equal(backpackSummary({ stash: { shootbm: 1 }, potions: 2 }), 'Backpack: 1× Shootbm, 2× Healing Potion');
  assert.equal(backpackSummary({ stash: {}, potions: 1 }), 'Backpack: 1× Healing Potion');
});

test('swatchBackground gives a CSS value for every color', () => {
  for (const c of shopItems('color', fresh())) assert.equal(typeof swatchBackground(c), 'string');
  assert.equal(swatchBackground({ color: '#123456' }), '#123456');
  assert.match(swatchBackground({ pattern: 'rainbow' }), /gradient/);
});

test('same input gives the same output (deterministic)', () => {
  const acc = { ...fresh(), coins: 123, stash: { megashield: 1 } };
  for (const t of shopTabs()) assert.deepEqual(shopItems(t.id, acc), shopItems(t.id, acc));
  assert.equal(backpackSummary(acc), backpackSummary(acc));
});

test('the Healing Potion card (the boss\'s card): 10 coins, Common (green), full H.P in 5 s', () => {
  const cards = shopItems('potion', { ...fresh(), coins: 12, potions: 2 });
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0], {
    kind: 'potion', id: 'potion', name: 'Healing Potion', price: 10,
    owned: true, equipped: false, canAfford: true, action: 'buy',
    rarity: 'common', stashCount: 2,
    rarityName: 'Common', rarityColor: RARITY_COLORS.common.color, rarityBackground: RARITY_COLORS.common.color,
    healPercent: 100, drinkSeconds: 5, chestChance: 15, maxCarry: 3,
  });
  assert.equal(shopItems('potion', { coins: 9 })[0].canAfford, false);
  assert.equal(shopItems('potion', fresh())[0].stashCount, 0, 'old accounts without potions: 0');
  assert.deepEqual(potionCard({ coins: 10 }), shopItems('potion', { coins: 10 })[0]);
  assert.deepEqual(shopItems('potion', fresh(), { ...RULES, POTION: undefined }), []);
});
