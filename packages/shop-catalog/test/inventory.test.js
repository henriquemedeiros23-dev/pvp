// The Inventory screen and the fast bar (#39) as data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '@pvp/game-rules';
import { WEAPON_ICONS, POTION_ICON_SVG } from '@pvp/hud-model';
import {
  MIN_SPACES, inventoryItemKinds, spaceSize, itemLook, inventoryCount, inventoryCards, barSlots, barSummary,
  shopWeaponIds, inventorySummary, backpackSummary,
} from '../src/index.js';

const EMPTY_BAR = [null, null, null, null, null];
const account = (o = {}) => ({ coins: 0, stash: {}, potions: 0, bombs: { bomb: 0, legendarybomb: 0 }, bar: EMPTY_BAR, ...o });
const kindsOf = cards => [...new Set(cards.map(c => `${c.kind}:${c.id}`))];

test('every item kind: weapons in shop order, then the Healing Potion, then the bombs', () => {
  const kinds = inventoryItemKinds();
  assert.deepEqual(kinds.map(k => k.id), [...shopWeaponIds(), 'potion', 'bomb', 'legendarybomb']);
  assert.equal(spaceSize('weapon', 'icesword'), 1);
  assert.equal(spaceSize('potion', 'potion'), 3);
  assert.equal(spaceSize('bomb', 'bomb'), 5);
  assert.equal(spaceSize('bomb', 'legendarybomb'), 3);
  assert.equal(spaceSize('bomb', 'rocket'), 0);
  assert.equal(spaceSize('hat', 'cap'), 0);
});

test('an empty Inventory shows 2 ghost spaces of everything', () => {
  const cards = inventoryCards(account());
  const kinds = inventoryItemKinds();
  assert.equal(MIN_SPACES, 2);
  assert.equal(cards.length, kinds.length * 2);
  assert.ok(cards.every(c => c.ghost && !c.filled && c.count === 0 && c.action === null && c.durability === null));
  assert.deepEqual(kindsOf(cards), kinds.map(k => `${k.kind}:${k.id}`));
  assert.equal(new Set(cards.map(c => c.key)).size, cards.length, 'keys are unique');
  assert.deepEqual(cards.filter(c => c.first).length, kinds.length);
  // works with no account at all
  assert.equal(inventoryCards(undefined).length, kinds.length * 2);
});

test('owning more makes more spaces (no limit); stacks fill spaces like bar slots', () => {
  const cards = inventoryCards(account({ stash: { shootbm: 3, icesword: 1 }, potions: 7, bombs: { bomb: 4, legendarybomb: 0 } }));
  const of = id => cards.filter(c => c.id === id);
  assert.deepEqual(of('shootbm').map(c => c.count), [1, 1, 1], '3 copies: 3 spaces');
  assert.deepEqual(of('icesword').map(c => [c.filled, c.ghost]), [[true, false], [false, true]], '1 copy + 1 ghost');
  assert.deepEqual(of('potion').map(c => c.count), [3, 3, 1], '7 potions: 3 + 3 + 1');
  assert.deepEqual(of('potion').map(c => c.label), ['×3', '×3', '×1']);
  assert.deepEqual(of('bomb').map(c => c.count), [4, 0]);
  assert.ok(of('shootbm').every(c => c.owned === 3 && c.action === 'toBar' && c.label === ''));
  const many = inventoryCards(account({ stash: { gun: 40 } })).filter(c => c.id === 'gun');
  assert.equal(many.length, 40);
});

test('cards carry the look: icon, name, rarity colors, durability, shield', () => {
  const cards = inventoryCards(account({ stash: { icesword: 1, megashield: 1, supersword: 1 }, potions: 1, bombs: { legendarybomb: 3 } }));
  const ice = cards.find(c => c.id === 'icesword' && c.filled);
  assert.equal(ice.icon, WEAPON_ICONS.icesword);
  assert.equal(ice.name, 'Ice Sword');
  assert.equal(ice.rarityName, 'Epic');
  assert.equal(ice.rarityColor, RULES.RARITY_COLORS.epic.color);
  assert.deepEqual(ice.durability, { uses: 50, max: 50, percent: 100, label: '50' });
  assert.equal(ice.isShield, false);
  assert.equal(cards.find(c => c.id === 'megashield').isShield, true);
  const sup = cards.find(c => c.id === 'supersword');
  assert.notEqual(sup.rarityBackground, sup.rarityColor, 'Megalegend has two colors');
  const pot = cards.find(c => c.id === 'potion');
  assert.equal(pot.iconSvg, POTION_ICON_SVG);
  assert.equal(pot.icon, undefined);
  const lb = cards.find(c => c.id === 'legendarybomb');
  assert.match(lb.iconSvg, /<svg/);
  assert.match(lb.iconSvg, /#ffc531/i, 'the gold bomb');
  assert.equal(itemLook('weapon', 'pistol'), null);
  assert.equal(itemLook('potion', 'medkit'), null);
});

test('inBar counts what is in the fast bar; inventoryCount counts only the Inventory', () => {
  const acc = account({
    stash: { shootbm: 1 }, potions: 2,
    bar: [{ kind: 'weapon', id: 'shootbm', n: 1 }, { kind: 'potion', id: 'potion', n: 3 }, null, { kind: 'weapon', id: 'shootbm', n: 1 }, null],
  });
  const cards = inventoryCards(acc);
  assert.ok(cards.filter(c => c.id === 'shootbm').every(c => c.inBar === 2 && c.owned === 1));
  assert.ok(cards.filter(c => c.id === 'potion').every(c => c.inBar === 3 && c.owned === 2));
  assert.equal(inventoryCount(acc, 'weapon', 'shootbm'), 1);
  assert.equal(inventoryCount(acc, 'potion', 'potion'), 2);
  assert.equal(inventoryCount(acc, 'bomb', 'bomb'), 0);
  assert.equal(inventoryCount(acc, 'weapon', '__proto__'), 0);
});

test('the bar view: always 5 slots, keys 1-5, empty ones too', () => {
  const empty = barSlots(account());
  assert.equal(empty.length, RULES.MAX_SLOTS);
  assert.deepEqual(empty.map(s => s.key), ['1', '2', '3', '4', '5']);
  assert.ok(empty.every(s => s.empty && s.action === null));
  assert.equal(barSlots({}).length, 5, 'an old account without a bar');
  const slots = barSlots(account({
    bar: [null, { kind: 'weapon', id: 'dmgun', n: 1 }, { kind: 'bomb', id: 'bomb', n: 5 }, { kind: 'weapon', id: 'nope', n: 1 }, { kind: 'potion', id: 'potion', n: 2 }],
  }));
  assert.equal(slots[0].empty, true);
  assert.deepEqual([slots[1].name, slots[1].icon, slots[1].count, slots[1].label, slots[1].action], ['DM Gun', WEAPON_ICONS.dmgun, 1, '', 'fromBar']);
  assert.deepEqual(slots[1].durability, { uses: 30, max: 30, percent: 100, label: '30' });
  assert.deepEqual([slots[2].name, slots[2].count, slots[2].label], ['Bomb', 5, '×5']);
  assert.match(slots[2].iconSvg, /<svg/);
  assert.equal(slots[3].empty, true, 'an unknown item shows as empty');
  assert.deepEqual([slots[4].name, slots[4].label], ['Healing Potion', '×2']);
});

test('barSummary and inventorySummary for the menu', () => {
  assert.equal(barSummary(account()), 'Fast bar is empty: you get the free Gun. Fill it in your Inventory!');
  assert.equal(barSummary(account({
    bar: [{ kind: 'weapon', id: 'shootbm', n: 1 }, { kind: 'weapon', id: 'megashield', n: 1 }, { kind: 'potion', id: 'potion', n: 3 }, null, null],
  })), 'Fast bar: Shootbm, Mega Shield, 3× Healing Potion (2 free)');
  const full = Array.from({ length: 5 }, () => ({ kind: 'weapon', id: 'gun', n: 1 }));
  assert.equal(barSummary(account({ bar: full })), 'Fast bar: Gun, Gun, Gun, Gun, Gun');
  assert.equal(inventorySummary(account({ stash: { gun: 2 } })), 'Inventory: 2× Gun');
  assert.equal(backpackSummary, inventorySummary);
});

test('pure: same input, same output; the account is not changed', () => {
  const acc = account({ stash: { shootbm: 2 }, potions: 4, bar: [{ kind: 'bomb', id: 'bomb', n: 2 }, null, null, null, null] });
  const copy = JSON.parse(JSON.stringify(acc));
  assert.deepEqual(inventoryCards(acc), inventoryCards(acc));
  assert.deepEqual(barSlots(acc), barSlots(acc));
  assert.deepEqual(acc, copy);
});

test('other rules: a 3-slot bar, 1 space minimum', () => {
  const rules = { ...RULES, MAX_SLOTS: 3 };
  assert.equal(barSlots(account({ bar: [null, null, null] }), rules).length, 3);
  const cards = inventoryCards(account({ stash: { gun: 1 } }), RULES, { minSpaces: 1 });
  assert.equal(cards.length, inventoryItemKinds().length);
});
