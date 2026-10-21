import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../src/index.js';
import {
  RULES, WEAPONS, COLORS, OUTFITS, DEFAULT_SKIN, LOOT_TABLE, POTION, MAX_POTIONS, potionPrice, potionHeal, STARTING_WEAPON, RARITIES, RARITY_COLORS,
  CHEST_COINS, GOLDEN_CHEST_COINS, GOLDEN_CHEST_BOOST, rarityStyle, droppedDurability, chestChance, validateRules, weaponPrice, weaponDurability, weaponWear, skinPrice, isBuyable, itemPrice, weaponsByRarity,
} from '../src/index.js';
import { readFileSync } from 'node:fs';
// Frozen copy of the old apps/game/shared/config.js (removed in #12), so the rules don't drift by accident.
const oldConfig = JSON.parse(readFileSync(new URL('./fixtures/old-config.json', import.meta.url), 'utf8'));

const copy = () => structuredClone(RULES);

test('real rules validate with zero problems', () => {
  assert.deepEqual(validateRules(RULES), []);
});

// The old file has no durability (#21), chest chances or the new rarities (#25), so those fields are left out.
// #25 also removed the wooden sword, added the Gun and replaced BASIC_WEAPON / RARITIES / LOOT_TABLE.
const CHANGED_IN_25 = ['BASIC_WEAPON', 'RARITIES', 'LOOT_TABLE'];
// #28 removed bandages and medkits: the Healing Potion is the only heal.
const REMOVED_IN_28 = ['HEALS', 'MAX_BANDAGES', 'MAX_MEDKITS', 'BANDAGE_HEAL', 'MEDKIT_HEAL'];
const RENAMED_RARITY = { rare: 'epic' };
const comparable = (weapons, { renameRarity }) => Object.fromEntries(Object.entries(weapons)
  .filter(([id]) => id !== 'woodsword' && id !== 'gun')
  .map(([id, { durability, wearPerUse, chestChance: _c, rarity, ...w }]) =>
    [id, { ...w, rarity: renameRarity ? (RENAMED_RARITY[rarity] ?? rarity) : rarity }]));

test('same named exports and values as the old apps/game/shared/config.js (except the #25 changes)', () => {
  for (const [name, value] of Object.entries(oldConfig)) {
    if (CHANGED_IN_25.includes(name)) continue;
    if (REMOVED_IN_28.includes(name)) { assert.ok(!(name in rules), `${name} should be gone (#28)`); continue; }
    assert.ok(name in rules, `missing export ${name}`);
    const ours = name === 'WEAPONS' ? comparable(rules[name], { renameRarity: false }) : rules[name];
    const theirs = name === 'WEAPONS' ? comparable(value, { renameRarity: true }) : value;
    assert.deepEqual(ours, theirs, `export ${name} differs`);
  }
});

test('the Gun is the starting weapon, from the boss\'s card', () => {
  assert.equal(STARTING_WEAPON, 'gun');
  const g = WEAPONS.gun;
  assert.equal(g.type, 'gun');
  assert.equal(g.dmg, 2);
  assert.equal(g.rate, 2);
  assert.equal(g.durability, 15);
  assert.equal(g.chestChance, 15);
  assert.equal(g.price, 3);
  assert.equal(g.rarity, 'common');
  assert.equal(weaponPrice('gun'), 3);
  assert.equal(isBuyable('weapon', 'gun'), true);
  assert.ok(!('woodsword' in WEAPONS), 'no wooden sword any more');
  assert.equal(isBuyable('weapon', 'woodsword'), false);
});

test('rarities and their colors', () => {
  assert.deepEqual(RARITIES, ['common', 'epic', 'legendary', 'megalegend']);
  assert.equal(RARITY_COLORS.common.name, 'Common');
  assert.deepEqual(Object.keys(RARITY_COLORS), RARITIES);
  assert.equal(RARITY_COLORS.megalegend.color2, '#0b0b12'); // blue + black
  assert.deepEqual(weaponsByRarity('megalegend'), []);
  assert.deepEqual(rarityStyle('common'), { id: 'common', name: 'Common', color: '#3cc24a', color2: '#1f7a2b', background: '#3cc24a' });
  assert.match(rarityStyle('megalegend').background, /linear-gradient.*#2f6fff.*#0b0b12/);
  assert.equal(rarityStyle('rare'), null);
  assert.equal(rarityStyle('toString'), null);
  const r = copy();
  r.RARITY_COLORS.epic.color = 'purple';
  delete r.RARITY_COLORS.megalegend;
  assert.deepEqual(validateRules(r), [
    'RARITY_COLORS.epic.color: "purple" is not a valid hex color',
    'RARITY_COLORS: missing rarity "megalegend"',
  ]);
});

test('chest chances: every weapon has one and they add up to 100', () => {
  let total = 0;
  for (const id of Object.keys(WEAPONS)) total += chestChance(id);
  assert.equal(total, 100);
  assert.equal(chestChance('gun'), 15);
  assert.equal(chestChance('laser'), 0);
  assert.equal(CHEST_COINS, 3);
  assert.equal(GOLDEN_CHEST_COINS, 10);
  assert.deepEqual(GOLDEN_CHEST_BOOST, { epic: 2, legendary: 2, megalegend: 2 });
  const r = copy();
  r.WEAPONS.gun.chestChance = 20;
  delete r.WEAPONS.sniper.chestChance;
  r.WEAPONS.rocket.chestChance = -1;
  assert.deepEqual(validateRules(r), [
    'weapon sniper: missing chestChance (percent, 0 = never in chests)',
    'weapon rocket: chestChance must be a number from 0 to 100',
    'weapon chestChance values must add up to 100, they add up to 102',
  ]);
});

test('dropped weapons: more than half keeps it, half or less becomes half (rounded up)', () => {
  assert.equal(droppedDurability('gun', 15), 15);
  assert.equal(droppedDurability('gun', 8), 8);   // 8 of 15 is more than half
  assert.equal(droppedDurability('gun', 7), 8);   // 7.5 rounded up
  assert.equal(droppedDurability('gun', 1), 8);
  assert.equal(droppedDurability('sniper', 6), 6); // exactly half -> half
  assert.equal(droppedDurability('sniper', 7), 7);
  assert.equal(droppedDurability('sniper', 2), 6);
  assert.equal(droppedDurability('x', 1, { x: { durability: null } }), null);
  assert.equal(droppedDurability('gun', undefined), 15);
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

test('the starting weapon must exist', () => {
  const r = copy();
  r.STARTING_WEAPON = 'woodsword';
  assert.deepEqual(validateRules(r), ['STARTING_WEAPON "woodsword" is not a weapon']);
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
  r.WEAPONS.spear.rarity = 'rare';
  delete r.WEAPONS.sword.dmg;
  r.STARTING_WEAPON = 'laser';
  r.COLORS.blue.color = 'blue';
  r.OUTFITS.face.none.price = 5;
  delete r.OUTFITS.back.none;
  r.DEFAULT_SKIN.color = 'gold';
  const problems = validateRules(r);
  for (const expected of [
    'weapon rocket: explosive missing radius',
    'weapon bat: unknown type "laser"',
    'weapon spear: unknown rarity "rare"',
    'weapon sword: missing dmg',
    'STARTING_WEAPON "laser" is not a weapon',
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
  assert.equal(weaponPrice(STARTING_WEAPON), 3);
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
  assert.equal(isBuyable('weapon', STARTING_WEAPON), true);
  assert.equal(isBuyable('weapon', 'nope'), false);
  assert.equal(isBuyable('color', 'gold'), true);
  assert.equal(isBuyable('hat', 'wizard'), true);
  assert.equal(isBuyable('hat', 'none'), true);
  assert.equal(isBuyable('cape', 'redcape'), false);
  assert.equal(itemPrice('weapon', 'rifle'), 120);
  assert.equal(itemPrice('shirt', 'vest'), 100);
});

test('weaponsByRarity', () => {
  assert.deepEqual(weaponsByRarity('basic'), []);
  assert.deepEqual(weaponsByRarity('common'), ['gun', 'sword', 'bat', 'pistol']);
  assert.deepEqual(weaponsByRarity('epic'), ['spear', 'axe', 'shotgun', 'rifle', 'grenade']);
  assert.deepEqual(weaponsByRarity('legendary'), ['sniper', 'rocket', 'mine']);
  assert.deepEqual(weaponsByRarity('mythic'), []);
  assert.deepEqual(weaponsByRarity('epic'), LOOT_TABLE.epic);
});

test('exported data is deep-frozen', () => {
  for (const obj of [RULES, WEAPONS, WEAPONS.pistol, POTION, LOOT_TABLE, LOOT_TABLE.epic, RARITY_COLORS, RARITY_COLORS.epic,
    COLORS, COLORS.gold, OUTFITS, OUTFITS.hat, OUTFITS.hat.crown, DEFAULT_SKIN]) {
    assert.ok(Object.isFrozen(obj));
  }
  assert.throws(() => { WEAPONS.pistol.dmg = 999; }, TypeError);
  assert.throws(() => { LOOT_TABLE.epic.push('sniper'); }, TypeError);
  assert.equal(WEAPONS.pistol.dmg, 18);
});

test('the Healing Potion, from the boss\'s card (#28): the only heal', () => {
  assert.equal(POTION.id, 'potion');
  assert.equal(POTION.name, 'Healing Potion');
  assert.equal(POTION.healPercent, 100, 'full H.P');
  assert.equal(POTION.drinkMs, 5000, 'drinking takes 5 seconds');
  assert.equal(POTION.chestChance, 15, '15% from chests');
  assert.equal(POTION.price, 10, '10 coins');
  assert.equal(POTION.rarity, 'common', 'Common (green)');
  assert.equal(MAX_POTIONS, 3);
  assert.equal(RULES.POTION, POTION);
  assert.equal(RULES.MAX_POTIONS, 3);
  assert.equal(potionPrice('potion'), 10);
  assert.equal(potionPrice('bandage'), undefined);
  assert.equal(itemPrice('potion', 'potion'), 10);
  assert.equal(isBuyable('potion', 'potion'), true);
  assert.equal(isBuyable('potion', 'medkit'), false);
  assert.equal(potionHeal(1, 100), 100);
  assert.equal(potionHeal(0, 100), 100);
  assert.equal(potionHeal(60, 100, { ...POTION, healPercent: 25 }), 85);
  for (const gone of ['HEALS', 'MAX_BANDAGES', 'MAX_MEDKITS', 'BANDAGE_HEAL', 'MEDKIT_HEAL']) assert.ok(!(gone in RULES), gone);
});

test('validateRules checks the potion', () => {
  const r = copy();
  r.POTION = { ...r.POTION, drinkMs: 0, price: -1, rarity: 'mythic', healPercent: 0 };
  r.MAX_POTIONS = -1;
  const p = validateRules(r);
  assert.ok(p.includes('POTION: drinkMs must be a whole number > 0'), p);
  assert.ok(p.includes('POTION: price must be a number >= 0'));
  assert.ok(p.includes('POTION: unknown rarity "mythic"'));
  assert.ok(p.includes('POTION: healPercent must be a number from 1 to 100'));
  assert.ok(p.includes('MAX_POTIONS must be a whole number >= 0'));
  delete r.POTION;
  r.MAX_POTIONS = 3;
  assert.deepEqual(validateRules(r), [], 'rules without a potion are fine');
});
