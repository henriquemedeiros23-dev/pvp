import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, MAX_SLOTS, WEAPONS } from '@pvp/game-rules';
import { slotBar, durabilityView, heldDurabilityView, healthView, pickSlot, brokeMessage, shieldView, WEAPON_ICONS, DURABILITY_LEVELS } from '../src/index.js';

test('slotBar always gives MAX_SLOTS slots, empty ones included', () => {
  for (const inv of [undefined, null, {}, { weapons: [] }, { weapons: ['gun'], slot: 0 }]) {
    const bar = slotBar(inv);
    assert.equal(bar.length, MAX_SLOTS);
    assert.deepEqual(bar.map(s => s.index), [0, 1, 2, 3, 4]);
    assert.deepEqual(bar.map(s => s.key), ['1', '2', '3', '4', '5']);
  }
  const [first, second] = slotBar({ weapons: ['gun'], dur: [15], slot: 0 });
  assert.deepEqual(first, {
    index: 0, key: '1', weapon: 'gun', name: 'Gun', icon: WEAPON_ICONS.gun,
    rarity: 'common', active: true, empty: false,
    durability: { usesLeft: 15, max: 15, ratio: 1, percent: 100, level: 'good' },
  });
  assert.deepEqual(second, {
    index: 1, key: '2', weapon: null, name: '', icon: '', rarity: null, active: false, empty: true, durability: null,
  });
});

test('slotBar marks the active slot and adds durability for weapons that can break', () => {
  const rules = { ...RULES, WEAPONS: { ...RULES.WEAPONS, gun: { ...RULES.WEAPONS.gun, durability: null } } };
  const bar = slotBar({ weapons: ['gun', 'electricsword', 'supersword'], dur: [null, 25, 2], slot: 1 }, rules);
  assert.deepEqual(bar.map(s => s.active), [false, true, false, false, false]);
  assert.equal(bar[0].durability, null, 'a weapon that never breaks has no bar');
  assert.deepEqual(bar[1].durability, { usesLeft: 25, max: 50, ratio: 0.5, percent: 50, level: 'low' });
  assert.equal(bar[2].durability.level, 'critical');
  assert.equal(bar[2].rarity, 'megalegend');
  assert.equal(bar[2].icon, '🗡️');
});

test('slotBar treats missing dur as full and unknown weapons as empty', () => {
  const bar = slotBar({ weapons: ['icesword', 'laser'], slot: 0 });
  assert.equal(bar[0].durability.ratio, 1);
  assert.equal(bar[0].durability.level, 'good');
  assert.equal(bar[1].empty, true);
});

test('durability levels: green above 50%, yellow 20-50%, red below 20%', () => {
  const max = WEAPONS.icesword.durability; // 50
  const level = left => durabilityView('icesword', left).level;
  assert.equal(level(50), 'good');
  assert.equal(level(26), 'good');
  assert.equal(level(25), 'low');        // exactly 50%
  assert.equal(level(10), 'low');        // exactly 20%
  assert.equal(level(9), 'critical');
  assert.equal(level(0), 'critical');
  assert.equal(durabilityView('icesword', 999).usesLeft, max);
  assert.equal(durabilityView('icesword', -5).ratio, 0);
  assert.equal(durabilityView('x', 5, { ...RULES, WEAPONS: { x: { name: 'X', durability: null } } }), null);
  assert.equal(durabilityView('nope', 5), null);
  assert.deepEqual(DURABILITY_LEVELS, { good: 0.5, low: 0.2 });
});

test('slotBar and durabilityView use the rules they are given', () => {
  const rules = { ...RULES, MAX_SLOTS: 3, WEAPONS: { stick: { name: 'Stick', rarity: 'common', durability: 4 } } };
  const bar = slotBar({ weapons: ['stick'], dur: [1], slot: 0 }, rules);
  assert.equal(bar.length, 3);
  assert.equal(bar[0].icon, '❔');
  assert.deepEqual(bar[0].durability, { usesLeft: 1, max: 4, ratio: 0.25, percent: 25, level: 'low' });
});

test('healthView clamps, rounds and flags low health', () => {
  assert.deepEqual(healthView(100), { hp: 100, max: 100, ratio: 1, percent: 100, low: false, text: '100', label: '100%' });
  assert.equal(healthView(30).label, '30%');
  assert.equal(healthView(50, 200).label, '25%');
  assert.equal(healthView(36).low, false);
  assert.equal(healthView(35).low, true);
  assert.equal(healthView(-4).hp, 0);
  assert.equal(healthView(140).hp, 100);
  assert.equal(healthView(42.6).text, '43');
  assert.equal(healthView(undefined).hp, 0);
  assert.equal(healthView(50, 200).percent, 25);
});

test('heldDurabilityView follows the weapon in your hand', () => {
  const inv = { weapons: ['gun', 'shootbm', 'supersword'], dur: [15, 15, 1], slot: 1 };
  assert.deepEqual(heldDurabilityView(inv), {
    weapon: 'shootbm', name: 'Shootbm', ratio: 0.75, percent: 75, level: 'good', label: '75%', infinite: false, empty: false,
  });
  assert.equal(heldDurabilityView({ ...inv, slot: 2 }).level, 'critical');
  assert.equal(heldDurabilityView({ ...inv, slot: 2 }).label, `${Math.round(100 / WEAPONS.supersword.durability)}%`);
  assert.deepEqual(heldDurabilityView({ ...inv, slot: 0 }), {
    weapon: 'gun', name: 'Gun', ratio: 1, percent: 100, level: 'good', label: '100%', infinite: false, empty: false,
  }); // a new Gun starts at 100%
  const forever = { ...RULES, WEAPONS: { ...RULES.WEAPONS, gun: { ...RULES.WEAPONS.gun, durability: null } } };
  assert.deepEqual(heldDurabilityView({ ...inv, slot: 0 }, forever), {
    weapon: 'gun', name: 'Gun', ratio: 1, percent: 100, level: 'good', label: '∞', infinite: true, empty: false,
  }); // a weapon that never breaks: full bar with ∞
  assert.equal(heldDurabilityView({ weapons: ['icesword'], slot: 0 }).ratio, 1); // missing dur = full
});

test('heldDurabilityView with nothing in your hand, and with other rules', () => {
  for (const inv of [undefined, null, {}, { weapons: [] }, { weapons: ['shootbm'], slot: 3 }, { weapons: ['laser'], slot: 0 }, { weapons: ['shield'], slot: 0 }]) {
    const v = heldDurabilityView(inv);
    assert.equal(v.empty, true);
    assert.equal(v.ratio, 0);
    assert.equal(v.label, '–');
    assert.equal(v.level, null);
  }
  const rules = { ...RULES, WEAPONS: { stick: { name: 'Stick', rarity: 'common', durability: 4 } } };
  assert.equal(heldDurabilityView({ weapons: ['stick'], dur: [1], slot: 0 }, rules).label, '25%');
  const a = { weapons: ['gun', 'icesword'], dur: [15, 7], slot: 1 };
  assert.deepEqual(heldDurabilityView(a), heldDurabilityView(structuredClone(a)));
});

test('pickSlot: keys, next/previous and only filled slots', () => {
  const inv = { weapons: ['gun', 'shootbm', 'icesword'], slot: 0 };
  assert.equal(pickSlot(inv, '1'), 1);
  assert.equal(pickSlot(inv, 2), 2);
  assert.equal(pickSlot(inv, '4'), null);   // empty slot
  assert.equal(pickSlot(inv, '0'), null);   // already holding it
  assert.equal(pickSlot(inv, '+'), 1);
  assert.equal(pickSlot(inv, '-'), 2);
  assert.equal(pickSlot({ weapons: ['gun'], slot: 0 }, '+'), null);
  assert.equal(pickSlot(null, '1'), null);
  assert.equal(pickSlot(inv, 'x'), null);
  assert.equal(pickSlot(inv, ''), null);
});

test('brokeMessage names the weapon', () => {
  assert.equal(brokeMessage('shootbm'), 'Your Shootbm broke!');
  assert.equal(brokeMessage('megashield'), 'Your Mega Shield broke!');
});

test('shieldView: the small Shield bar for the shield on your arm', () => {
  for (const inv of [undefined, null, {}, { shield: null }, { shield: { id: 'laser', dur: 3 } }]) assert.equal(shieldView(inv), null);
  assert.deepEqual(shieldView({ shield: { id: 'shield', dur: 45 } }, true), {
    weapon: 'shield', name: 'Shield', icon: '🛡️', up: true, usesLeft: 45, max: 60, ratio: 0.75, percent: 75, level: 'good', label: '45',
  });
  const mega = shieldView({ shield: { id: 'megashield', dur: 7 } });
  assert.deepEqual([mega.name, mega.max, mega.level, mega.label, mega.up], ['Mega Shield', 70, 'critical', '7', false]);
  assert.equal(shieldView({ shield: { id: 'shield' } }).percent, 100, 'missing dur = full');
  assert.equal(brokeMessage('nope'), 'Your weapon broke!');
});

test('same input, same output (deterministic)', () => {
  const inv = { weapons: ['gun', 'icesword'], dur: [15, 7], slot: 1, shield: { id: 'shield', dur: 3 } };
  assert.deepEqual(shieldView(inv), shieldView(structuredClone(inv)));
  assert.deepEqual(slotBar(inv), slotBar(structuredClone(inv)));
});
