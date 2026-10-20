import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../src/index.js';
import {
  RULES, WEAPONS, COLORS, OUTFITS, DEFAULT_SKIN, LOOT_TABLE, HEALS, BASIC_WEAPON,
  validateRules, weaponPrice, weaponDurability, weaponWear, skinPrice, isBuyable, itemPrice, weaponsByRarity,
} from '../src/index.js';
import { readFileSync } from 'node:fs';
// Frozen copy of the old apps/game/shared/config.js (removed in #12), so the rules don't drift by accident.
const oldConfig = JSON.parse(readFileSync(new URL('./fixtures/old-config.json', import.meta.url), 'utf8'));

const copy = () => structuredClone(RULES);

test('real rules validate with zero problems', () => {
  assert.deepEqual(validateRules(RULES), []);
});

// The old file has no durability (issue #21 is packages only), so those fields are left out here.
const withoutDurability = weapons => Object.fromEntries(Object.entries(weapons)
  .map(([id, { durability, wearPerUse, ...w }]) => [id, w]));

test('same named exports and values as the old apps/game/shared/config.js', () => {
  for (const [name, value] of Object.entries(oldConfig)) {
    assert.ok(name in rules, `missing export ${name}`);
    const ours = name === 'WEAPONS' ? withoutDurability(rules[name]) : rules[name];
    const theirs = name === 'WEAPONS' ? withoutDurability(value) : value;
    assert.deepEqual(ours, theirs, `export ${name} differs`);
  }
});

test('every weapon has a durability; the basic weapon never breaks', () => {
  for (const [id, w] of Object.entries(WEAPONS)) {
    assert.ok(w.durability === null || (Number.isInteger(w.durability) && w.durability > 0), id);
  }
  assert.equal(WEAPONS[BASIC_WEAPON].durability, null);
  assert.equal(weaponDurability(BASIC_WEAPON), null);
  assert.equal(weaponDurability('sniper'), 12);
  assert.equal(weaponDurability('rifle'), 150);
  assert.equal(weaponDurability('laser'), null);
  assert.equal(weaponDurability('toString'), null);
  assert.equal(weaponWear('pistol'), 1);
  assert.equal(weaponWear('x', { x: { wearPerUse: 3 } }), 3);
  assert.equal(weaponDurability('x', { x: { durability: 7 } }), 7);
});

test('bad durability and wearPerUse are reported', () => {
  const r = copy();
  delete r.WEAPONS.pistol.durability;
  r.WEAPONS.sword.durability = 0;
  r.WEAPONS.bat.durability = 2.5;
  r.WEAPONS.axe.durability = '10';
  r.WEAPONS.rifle.wearPerUse = 0;
  r.WEAPONS.sniper.wearPerUse = 2; // fine
  assert.deepEqual(validateRules(r), [
    'weapon sword: durability must be null or a whole number > 0',
    'weapon bat: durability must be null or a whole number > 0',
    'weapon axe: durability must be null or a whole number > 0',
    'weapon pistol: missing durability (null = never breaks)',
    'weapon rifle: wearPerUse must be a whole number > 0',
  ]);
});

test('gun without range is reported', () => {
  const r = copy();
  delete r.WEAPONS.pistol.range;
  assert.deepEqual(validateRules(r), ['weapon pistol: gun missing range']);
});

test('two basic weapons are reported', () => {
  const r = copy();
  r.WEAPONS.sword.rarity = 'basic';
  const problems = validateRules(r);
  assert.ok(problems.includes('there must be exactly one basic weapon, found 2 (woodsword, sword)'), JSON.stringify(problems));
});

test('negative prices are reported', () => {
  const r = copy();
  r.WEAPONS.axe.price = -1;
  r.COLORS.red.price = -5;
  r.OUTFITS.hat.cap.price = -10;
  assert.deepEqual(validateRules(r), [
    'weapon axe: price must be a number >= 0',
    'color red: price must be a number >= 0',
    'outfit hat.cap: price must be a number >= 0',
  ]);
});

test('other broken rules are reported', () => {
  const r = copy();
  delete r.WEAPONS.rocket.radius;
  r.WEAPONS.bat.type = 'laser';
  r.WEAPONS.spear.rarity = 'epic';
  delete r.WEAPONS.sword.dmg;
  r.BASIC_WEAPON = 'sword';
  r.COLORS.blue.color = 'blue';
  r.OUTFITS.face.none.price = 5;
  delete r.OUTFITS.back.none;
  r.DEFAULT_SKIN.color = 'gold';
  const problems = validateRules(r);
  for (const expected of [
    'weapon rocket: explosive missing radius',
    'weapon bat: unknown type "laser"',
    'weapon spear: unknown rarity "epic"',
    'weapon sword: missing dmg',
    'BASIC_WEAPON "sword" is not the basic weapon',
    'color blue: "blue" is not a valid hex color',
    'outfit slot face: "none" must be free',
    'outfit slot back: missing "none"',
    'DEFAULT_SKIN.color: "gold" is not free',
    'DEFAULT_SKIN.face: "none" is not free',
    'DEFAULT_SKIN.back: unknown item "none"',
  ]) assert.ok(problems.includes(expected), `expected "${expected}" in ${JSON.stringify(problems)}`);
});

test('validateRules does not throw on garbage', () => {
  assert.deepEqual(validateRules(null), ['rules must be an object']);
  assert.ok(validateRules({}).length > 0);
});

test('weaponPrice', () => {
  assert.equal(weaponPrice('sniper'), 200);
  assert.equal(weaponPrice('bat'), 25);
  assert.equal(weaponPrice(BASIC_WEAPON), undefined);
  assert.equal(weaponPrice('laser'), undefined);
  assert.equal(weaponPrice('toString'), undefined);
});

test('skinPrice', () => {
  assert.equal(skinPrice('color', 'rainbow'), 400);
  assert.equal(skinPrice('color', 'black'), 0);
  assert.equal(skinPrice('hat', 'crown'), 300);
  assert.equal(skinPrice('face', 'none'), 0);
  assert.equal(skinPrice('back', 'redcape'), 150);
  assert.equal(skinPrice('shirt', 'armor'), 220);
  assert.equal(skinPrice('hat', 'redcape'), undefined);
  assert.equal(skinPrice('shoes', 'none'), undefined);
  assert.equal(skinPrice('hat', '__proto__'), undefined);
});

test('isBuyable and itemPrice', () => {
  assert.equal(isBuyable('weapon', 'rocket'), true);
  assert.equal(isBuyable('weapon', BASIC_WEAPON), false);
  assert.equal(isBuyable('weapon', 'nope'), false);
  assert.equal(isBuyable('color', 'gold'), true);
  assert.equal(isBuyable('hat', 'wizard'), true);
  assert.equal(isBuyable('hat', 'none'), true);
  assert.equal(isBuyable('cape', 'redcape'), false);
  assert.equal(itemPrice('weapon', 'rifle'), 120);
  assert.equal(itemPrice('shirt', 'vest'), 100);
});

test('weaponsByRarity', () => {
  assert.deepEqual(weaponsByRarity('basic'), ['woodsword']);
  assert.deepEqual(weaponsByRarity('common'), ['sword', 'bat', 'pistol']);
  assert.deepEqual(weaponsByRarity('legendary'), ['sniper', 'rocket', 'mine']);
  assert.deepEqual(weaponsByRarity('mythic'), []);
  assert.deepEqual(weaponsByRarity('rare'), LOOT_TABLE.rare);
});

test('exported data is deep-frozen', () => {
  for (const obj of [RULES, WEAPONS, WEAPONS.pistol, HEALS.medkit, LOOT_TABLE, LOOT_TABLE.rare,
    COLORS, COLORS.gold, OUTFITS, OUTFITS.hat, OUTFITS.hat.crown, DEFAULT_SKIN]) {
    assert.ok(Object.isFrozen(obj));
  }
  assert.throws(() => { WEAPONS.pistol.dmg = 999; }, TypeError);
  assert.throws(() => { LOOT_TABLE.rare.push('sniper'); }, TypeError);
  assert.equal(WEAPONS.pistol.dmg, 18);
});
