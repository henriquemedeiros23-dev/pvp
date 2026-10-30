// The Inventory screen, the fast bar (#39) and the extras bar (#50) as data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '@pvp/game-rules';
import { WEAPON_ICONS, POTION_ICON_SVG, bombIconSvg } from '@pvp/hud-model';
import {
  MIN_SPACES, inventoryItemKinds, spaceSize, itemLook, inventoryCount, inventoryCards, barSlots, barSummary,
  extrasSlots, extrasSpaceFor, isHandWeapon, shopWeaponIds, inventorySummary, backpackSummary, trashPrompt,
} from '../src/index.js';

const EMPTY_BAR = [null, null, null, null, null];
const EMPTY_EXTRAS = { shield: null, potion: null, bomb: null, legendarybomb: null };
const account = (o = {}) => ({ coins: 0, stash: {}, potions: 0, bombs: { bomb: 0, legendarybomb: 0 }, bar: EMPTY_BAR, extras: EMPTY_EXTRAS, ...o });
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
  assert.ok(of('shootbm').every(c => c.owned === 3 && c.action === 'toBar' && c.place === 'bar' && c.label === ''));
  assert.ok(of('potion').every(c => c.action === 'toExtras' && c.place === 'extras'), 'potions go into the extras bar (#50)');
  assert.equal(of('bomb')[0].action, 'toExtras');
  assert.equal(of('bomb')[1].action, null, 'a ghost does nothing');
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
  assert.equal(cards.find(c => c.id === 'megashield').place, 'extras', 'a shield goes into the extras bar (#50)');
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

test('inBar counts what is in the fast bar and the extras bar; inventoryCount counts only the Inventory', () => {
  const acc = account({
    stash: { shootbm: 1 }, potions: 2,
    bar: [{ kind: 'weapon', id: 'shootbm', n: 1 }, null, null, { kind: 'weapon', id: 'shootbm', n: 1 }, null],
    extras: { ...EMPTY_EXTRAS, potion: { kind: 'potion', id: 'potion', n: 3 } },
  });
  const cards = inventoryCards(acc);
  assert.ok(cards.filter(c => c.id === 'shootbm').every(c => c.inBar === 2 && c.owned === 1));
  assert.ok(cards.filter(c => c.id === 'potion').every(c => c.inBar === 3 && c.owned === 2));
  assert.equal(inventoryCount(acc, 'weapon', 'shootbm'), 1);
  assert.equal(inventoryCount(acc, 'potion', 'potion'), 2);
  assert.equal(inventoryCount(acc, 'bomb', 'bomb'), 0);
  assert.equal(inventoryCount(acc, 'weapon', '__proto__'), 0);
});

test('the bar view: always 5 slots, keys 1-5, empty ones too; hand weapons only', () => {
  const empty = barSlots(account());
  assert.equal(empty.length, RULES.MAX_SLOTS);
  assert.deepEqual(empty.map(s => s.key), ['1', '2', '3', '4', '5']);
  assert.ok(empty.every(s => s.empty && s.action === null));
  assert.equal(barSlots({}).length, 5, 'an old account without a bar');
  const slots = barSlots(account({
    bar: [null, { kind: 'weapon', id: 'dmgun', n: 1 }, { kind: 'bomb', id: 'bomb', n: 5 }, { kind: 'weapon', id: 'nope', n: 1 }, { kind: 'weapon', id: 'shield', n: 1 }],
  }));
  assert.equal(slots[0].empty, true);
  assert.deepEqual([slots[1].name, slots[1].icon, slots[1].count, slots[1].label, slots[1].action], ['DM Gun', WEAPON_ICONS.dmgun, 1, '', 'fromBar']);
  assert.deepEqual(slots[1].durability, { uses: 30, max: 30, percent: 100, label: '30' });
  assert.equal(slots[2].empty, true, 'a bomb is not a hand weapon (#50)');
  assert.equal(slots[3].empty, true, 'an unknown item shows as empty');
  assert.equal(slots[4].empty, true, 'a shield is not a hand weapon (#50)');
});

test('the extras bar (#50): 4 fixed spaces with a drawing of what goes there', () => {
  const empty = extrasSlots(account());
  assert.deepEqual(empty.map(s => [s.space, s.hintName, s.max, s.fill]), [
    ['shield', 'Shield', 1, ''], ['potion', 'Healing Potions', 3, '0/3'], ['bomb', 'Bombs', 5, '0/5'], ['legendarybomb', 'Legendary Bombs', 3, '0/3'],
  ]);
  assert.ok(empty.every(s => s.empty && s.action === null && s.count === 0));
  assert.equal(empty[0].hintIcon, WEAPON_ICONS.shield);
  assert.equal(empty[0].hintColor, RULES.RARITY_COLORS.epic.color, 'the Shield is epic');
  assert.equal(empty[1].hintIconSvg, POTION_ICON_SVG);
  assert.equal(empty[2].hintIconSvg, bombIconSvg(RULES.BOMBS.bomb.color));
  assert.equal(empty[3].hintIconSvg, bombIconSvg(RULES.BOMBS.legendarybomb.color));
  assert.equal(empty[3].hintColor, RULES.RARITY_COLORS.legendary.color);
  assert.equal(extrasSlots({}).length, 4, 'an old account without extras');
  const slots = extrasSlots(account({
    extras: {
      shield: { kind: 'weapon', id: 'megashield', n: 1 }, potion: { kind: 'potion', id: 'potion', n: 2 },
      bomb: { kind: 'bomb', id: 'legendarybomb', n: 1 }, // the wrong space: shows as empty
      legendarybomb: { kind: 'bomb', id: 'legendarybomb', n: 3 },
    },
  }));
  assert.deepEqual([slots[0].name, slots[0].icon, slots[0].action, slots[0].fill, slots[0].isShield], ['Mega Shield', WEAPON_ICONS.megashield, 'fromExtras', '', true]);
  assert.deepEqual(slots[0].durability, { uses: 70, max: 70, percent: 100, label: '70' });
  assert.deepEqual([slots[1].name, slots[1].count, slots[1].label, slots[1].fill], ['Healing Potion', 2, '×2', '2/3']);
  assert.equal(slots[2].empty, true);
  assert.deepEqual([slots[3].name, slots[3].fill, slots[3].rarityColor], ['Legendary Bomb', '3/3', RULES.RARITY_COLORS.legendary.color]);
  assert.equal(extrasSpaceFor('weapon', 'shield'), 'shield');
  assert.equal(extrasSpaceFor('bomb', 'bomb'), 'bomb');
  assert.equal(extrasSpaceFor('weapon', 'gun'), null);
  assert.equal(isHandWeapon('weapon', 'gun'), true);
  assert.equal(isHandWeapon('weapon', 'megashield'), false);
});

test('barSummary and inventorySummary for the menu', () => {
  assert.equal(barSummary(account()), 'Fast bar is empty: you get the free Gun. Fill it in your Inventory!');
  assert.equal(barSummary(account({
    bar: [{ kind: 'weapon', id: 'shootbm', n: 1 }, null, null, null, null],
    extras: { ...EMPTY_EXTRAS, shield: { kind: 'weapon', id: 'megashield', n: 1 }, potion: { kind: 'potion', id: 'potion', n: 3 } },
  })), 'Fast bar: Shootbm (4 free) · Extras: Mega Shield, 3× Healing Potion');
  assert.equal(barSummary(account({ extras: { ...EMPTY_EXTRAS, bomb: { kind: 'bomb', id: 'bomb', n: 2 } } })),
    'Fast bar is empty: you get the free Gun. Fill it in your Inventory! · Extras: 2× Bomb');
  const full = Array.from({ length: 5 }, () => ({ kind: 'weapon', id: 'gun', n: 1 }));
  assert.equal(barSummary(account({ bar: full })), 'Fast bar: Gun, Gun, Gun, Gun, Gun');
  assert.equal(inventorySummary(account({ stash: { gun: 2 } })), 'Inventory: 2× Gun');
  assert.equal(backpackSummary, inventorySummary);
});

test('pure: same input, same output; the account is not changed', () => {
  const acc = account({ stash: { shootbm: 2 }, potions: 4, bar: [{ kind: 'weapon', id: 'gun', n: 1 }, null, null, null, null], extras: { bomb: { kind: 'bomb', id: 'bomb', n: 2 } } });
  const copy = JSON.parse(JSON.stringify(acc));
  assert.deepEqual(inventoryCards(acc), inventoryCards(acc));
  assert.deepEqual(barSlots(acc), barSlots(acc));
  assert.deepEqual(extrasSlots(acc), extrasSlots(acc));
  assert.deepEqual(acc, copy);
});

test('other rules: a 3-slot bar, 1 space minimum', () => {
  const rules = { ...RULES, MAX_SLOTS: 3 };
  assert.equal(barSlots(account({ bar: [null, null, null] }), rules).length, 3);
  const cards = inventoryCards(account({ stash: { gun: 1 } }), RULES, { minSpaces: 1 });
  assert.equal(cards.length, inventoryItemKinds().length);
});

test('durability (#51): worn copies show their uses left, full ones first; bar and extras too', () => {
  const acc = account({
    stash: { icesword: 3, shootbm: 1 }, wear: { icesword: [5, 30], shootbm: [99], nope: [1] },
    bar: [{ kind: 'weapon', id: 'dmgun', n: 1, dur: 6 }, { kind: 'weapon', id: 'gun', n: 1 }, null, null, null],
    extras: { ...EMPTY_EXTRAS, shield: { kind: 'weapon', id: 'shield', n: 1, dur: 15 } },
  });
  const ice = inventoryCards(acc).filter(c => c.id === 'icesword');
  assert.deepEqual(ice.map(c => c.dur), [null, 30, 5], 'full first, then the worn ones, best first');
  assert.deepEqual(ice.map(c => c.durability.label), ['50', '30', '5']);
  assert.deepEqual(ice[2].durability, { uses: 5, max: 50, percent: 10, label: '5' });
  const sb = inventoryCards(acc).find(c => c.id === 'shootbm' && c.filled);
  assert.equal(sb.dur, null, 'a bad saved value is full');
  const slots = barSlots(acc);
  assert.deepEqual(slots[0].durability, { uses: 6, max: 30, percent: 20, label: '6' });
  assert.equal(slots[1].durability.percent, 100);
  assert.deepEqual(extrasSlots(acc)[0].durability, { uses: 15, max: 60, percent: 25, label: '15' });
  assert.equal(inventoryCards(acc).find(c => c.id === 'potion').dur, null);
});

test('the trash (#53): the "are you sure?" words', () => {
  const sword = trashPrompt('weapon', 'icesword');
  assert.equal(sword.question, 'Are you sure you want to destroy this weapon?');
  assert.equal(sword.note, 'It will be gone forever. No coins back.');
  assert.deepEqual([sword.name, sword.icon, sword.yes, sword.no], ['Ice Sword', WEAPON_ICONS.icesword, 'YES', 'NO']);
  assert.equal(trashPrompt('weapon', 'gun').question, 'Are you sure you want to destroy this weapon?');
  assert.equal(trashPrompt('weapon', 'megashield').question, 'Are you sure you want to destroy this Mega Shield?');
  const potions = trashPrompt('potion', 'potion', { count: 3 });
  assert.equal(potions.question, 'Are you sure you want to destroy this Healing Potion?');
  assert.equal(potions.note, 'Only ONE is destroyed. You keep 2. No coins back.');
  assert.equal(potions.iconSvg, POTION_ICON_SVG);
  assert.equal(trashPrompt('bomb', 'legendarybomb').question, 'Are you sure you want to destroy this Legendary Bomb?');
  assert.equal(trashPrompt('weapon', 'pistol'), null);
  assert.equal(trashPrompt('hat', 'crown'), null);
});
