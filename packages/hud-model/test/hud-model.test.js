import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, MAX_SLOTS, WEAPONS } from '@pvp/game-rules';
import { slotBar, durabilityView, healthView, pickSlot, brokeMessage, WEAPON_ICONS, DURABILITY_LEVELS } from '../src/index.js';

test('slotBar always gives MAX_SLOTS slots, empty ones included', () => {
  for (const inv of [undefined, null, {}, { weapons: [] }, { weapons: ['woodsword'], slot: 0 }]) {
    const bar = slotBar(inv);
    assert.equal(bar.length, MAX_SLOTS);
    assert.deepEqual(bar.map(s => s.index), [0, 1, 2, 3, 4]);
    assert.deepEqual(bar.map(s => s.key), ['1', '2', '3', '4', '5']);
  }
  const [first, second] = slotBar({ weapons: ['woodsword'], dur: [null], slot: 0 });
  assert.deepEqual(first, {
    index: 0, key: '1', weapon: 'woodsword', name: 'Wooden Sword', icon: WEAPON_ICONS.woodsword,
    rarity: 'basic', active: true, empty: false, durability: null,
  });
  assert.deepEqual(second, {
    index: 1, key: '2', weapon: null, name: '', icon: '', rarity: null, active: false, empty: true, durability: null,
  });
});

test('slotBar marks the active slot and adds durability for weapons that can break', () => {
  const bar = slotBar({ weapons: ['woodsword', 'pistol', 'sniper'], dur: [null, 30, 2], slot: 1 });
  assert.deepEqual(bar.map(s => s.active), [false, true, false, false, false]);
  assert.equal(bar[0].durability, null);
  assert.deepEqual(bar[1].durability, { usesLeft: 30, max: 60, ratio: 0.5, percent: 50, level: 'low' });
  assert.equal(bar[2].durability.level, 'critical');
  assert.equal(bar[2].rarity, 'legendary');
});

test('slotBar treats missing dur as full and unknown weapons as empty', () => {
  const bar = slotBar({ weapons: ['rifle', 'laser'], slot: 0 });
  assert.equal(bar[0].durability.ratio, 1);
  assert.equal(bar[0].durability.level, 'good');
  assert.equal(bar[1].empty, true);
});

test('durability levels: green above 50%, yellow 20-50%, red below 20%', () => {
  const max = WEAPONS.pistol.durability; // 60
  const level = left => durabilityView('pistol', left).level;
  assert.equal(level(60), 'good');
  assert.equal(level(31), 'good');
  assert.equal(level(30), 'low');        // exactly 50%
  assert.equal(level(12), 'low');        // exactly 20%
  assert.equal(level(11), 'critical');
  assert.equal(level(0), 'critical');
  assert.equal(durabilityView('pistol', 999).usesLeft, max);
  assert.equal(durabilityView('pistol', -5).ratio, 0);
  assert.equal(durabilityView('woodsword', 5), null);
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
  assert.deepEqual(healthView(100), { hp: 100, max: 100, ratio: 1, percent: 100, low: false, text: '100' });
  assert.equal(healthView(36).low, false);
  assert.equal(healthView(35).low, true);
  assert.equal(healthView(-4).hp, 0);
  assert.equal(healthView(140).hp, 100);
  assert.equal(healthView(42.6).text, '43');
  assert.equal(healthView(undefined).hp, 0);
  assert.equal(healthView(50, 200).percent, 25);
});

test('pickSlot: keys, next/previous and only filled slots', () => {
  const inv = { weapons: ['woodsword', 'pistol', 'bat'], slot: 0 };
  assert.equal(pickSlot(inv, '1'), 1);
  assert.equal(pickSlot(inv, 2), 2);
  assert.equal(pickSlot(inv, '4'), null);   // empty slot
  assert.equal(pickSlot(inv, '0'), null);   // already holding it
  assert.equal(pickSlot(inv, '+'), 1);
  assert.equal(pickSlot(inv, '-'), 2);
  assert.equal(pickSlot({ weapons: ['woodsword'], slot: 0 }, '+'), null);
  assert.equal(pickSlot(null, '1'), null);
  assert.equal(pickSlot(inv, 'x'), null);
  assert.equal(pickSlot(inv, ''), null);
});

test('brokeMessage names the weapon', () => {
  assert.equal(brokeMessage('pistol'), 'Your Pistol broke!');
  assert.equal(brokeMessage('nope'), 'Your weapon broke!');
});

test('same input, same output (deterministic)', () => {
  const inv = { weapons: ['woodsword', 'shotgun'], dur: [null, 7], slot: 1 };
  assert.deepEqual(slotBar(inv), slotBar(structuredClone(inv)));
});
