import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../src/index.js';
import {
  RULES, WEAPONS, COLORS, OUTFITS, DEFAULT_SKIN, LOOT_TABLE, HEALS, STARTING_WEAPON, RARITIES, RARITY_COLORS,
  CHEST_COINS, GOLDEN_CHEST_COINS, GOLDEN_CHEST_BOOST, WEAPON_TYPES, isShield, rarityRank, rarityStyle, droppedDurability, chestChance, validateRules, weaponPrice, weaponDurability, weaponWear, skinPrice, isBuyable, itemPrice, weaponsByRarity,
} from '../src/index.js';
import { readFileSync } from 'node:fs';
// Frozen copy of the old apps/game/shared/config.js (removed in #12), so the rules don't drift by accident.
const oldConfig = JSON.parse(readFileSync(new URL('./fixtures/old-config.json', import.meta.url), 'utf8'));

const copy = () => structuredClone(RULES);

test('real rules validate with zero problems', () => {
  assert.deepEqual(validateRules(RULES), []);
});

// The old file has no durability (#21), chest chances or the new rarities (#25).
// #25 replaced BASIC_WEAPON / RARITIES / LOOT_TABLE; #26 replaced every weapon with the boss's cards.
const CHANGED = ['BASIC_WEAPON', 'RARITIES', 'LOOT_TABLE', 'WEAPONS'];

test('same named exports and values as the old apps/game/shared/config.js (except the #25/#26 changes)', () => {
  for (const [name, value] of Object.entries(oldConfig)) {
    if (CHANGED.includes(name)) continue;
    assert.ok(name in rules, `missing export ${name}`);
    assert.deepEqual(rules[name], value, `export ${name} differs`);
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

test('the weapon list is exactly the boss\'s cards (#26), nothing else', () => {
  assert.deepEqual(Object.keys(WEAPONS), ['gun', 'shootbm', 'electricsword', 'icesword', 'shield', 'megashield', 'supersword']);
  assert.deepEqual(WEAPON_TYPES, ['melee', 'gun', 'shield']);
  for (const old of ['sword', 'bat', 'spear', 'axe', 'pistol', 'shotgun', 'rifle', 'sniper', 'grenade', 'rocket', 'mine']) {
    assert.ok(!Object.hasOwn(WEAPONS, old), `${old} is gone`);
    assert.equal(isBuyable('weapon', old), false);
  }
  const card = id => { const w = WEAPONS[id]; return [w.name, w.type, w.dmg, w.rate, w.durability, w.chestChance, w.price, w.rarity]; };
  assert.deepEqual(card('shootbm'), ['Shootbm', 'gun', 5, 3, 20, 15, 7, 'common']);
  assert.equal(WEAPONS.shootbm.pellets, 1, 'one bullet');
  assert.deepEqual(card('electricsword'), ['Electric Sword', 'melee', 15, 2, 50, 5, 30, 'epic']);
  assert.deepEqual(WEAPONS.electricsword.shock, { dmg: 1, everyMs: 5000, forMs: 15000 });
  assert.deepEqual(card('icesword'), ['Ice Sword', 'melee', 10, 3, 50, 4, 35, 'epic']);
  assert.equal(WEAPONS.icesword.freezeMs, 2000);
  assert.deepEqual(card('shield'), ['Shield', 'shield', undefined, undefined, 60, 6, 25, 'epic']);
  assert.deepEqual(card('megashield'), ['Mega Shield', 'shield', undefined, undefined, 70, 1, 75, 'legendary']);
  assert.equal(WEAPONS.megashield.reflect, 0.25);
  assert.equal(WEAPONS.shield.reflect, undefined);
  assert.deepEqual(card('supersword'), ['Supersword', 'melee', 100, 1.5, 40, 0.3, 150, 'megalegend']);
  assert.equal(WEAPONS.supersword.knockout, true);
  assert.equal(WEAPONS.supersword.shieldWear, 5);
  assert.equal(isShield('shield'), true);
  assert.equal(isShield('megashield'), true);
  assert.equal(isShield('gun'), false);
  assert.equal(isShield('nope'), false);
  assert.equal(rarityRank('common'), 0);
  assert.equal(rarityRank('megalegend'), 3);
  assert.equal(rarityRank('rare'), -1);
});

test('chest chances are weights from the cards: they do not have to add up to 100', () => {
  const nums = Object.fromEntries(Object.keys(WEAPONS).map(id => [id, chestChance(id)]));
  assert.deepEqual(nums, { gun: 15, shootbm: 15, electricsword: 5, icesword: 4, shield: 6, megashield: 1, supersword: 0.3 });
  assert.equal(chestChance('laser'), 0);
  assert.equal(CHEST_COINS, 3);
  assert.equal(GOLDEN_CHEST_COINS, 10);
  assert.deepEqual(GOLDEN_CHEST_BOOST, { epic: 2, legendary: 2, megalegend: 2 });
  const r = copy();
  r.WEAPONS.gun.chestChance = 250; // any size is fine, it is a weight
  delete r.WEAPONS.shootbm.chestChance;
  r.WEAPONS.icesword.chestChance = -1;
  assert.deepEqual(validateRules(r), [
    'weapon shootbm: missing chestChance (a weight, 0 = never in chests)',
    'weapon icesword: chestChance must be a number >= 0',
  ]);
  const none = copy();
  for (const w of Object.values(none.WEAPONS)) w.chestChance = 0;
  assert.deepEqual(validateRules(none), ['at least one weapon needs a chestChance above 0 (chests always give one weapon)']);
});

test('specials and shields are checked', () => {
  const r = copy();
  r.WEAPONS.electricsword.shock = { dmg: 1, everyMs: 0, forMs: 15000 };
  r.WEAPONS.icesword.freezeMs = -2;
  r.WEAPONS.supersword.knockout = 'yes';
  r.WEAPONS.supersword.shieldWear = 0.5;
  r.WEAPONS.megashield.reflect = 2;
  r.WEAPONS.gun.reflect = 0.5;
  r.WEAPONS.shield.durability = null;
  assert.deepEqual(validateRules(r), [
    'weapon gun: reflect must be a number from 0 to 1, on a shield',
    'weapon electricsword: shock must be { dmg, everyMs, forMs } with numbers > 0',
    'weapon icesword: freezeMs must be a number > 0',
    'weapon shield: a shield needs a durability (blocked hits), a whole number > 0',
    'weapon megashield: reflect must be a number from 0 to 1, on a shield',
    'weapon supersword: knockout must be true or false',
    'weapon supersword: shieldWear must be a whole number > 0',
  ]);
  const s = copy();
  s.STARTING_WEAPON = 'shield';
  assert.deepEqual(validateRules(s), ['STARTING_WEAPON "shield" must not be a shield']);
});

test('dropped weapons: more than half keeps it, half or less becomes half (rounded up)', () => {
  assert.equal(droppedDurability('gun', 15), 15);
  assert.equal(droppedDurability('gun', 8), 8);   // 8 of 15 is more than half
  assert.equal(droppedDurability('gun', 7), 8);   // 7.5 rounded up
  assert.equal(droppedDurability('gun', 1), 8);
  assert.equal(droppedDurability('shootbm', 10), 10); // exactly half -> half
  assert.equal(droppedDurability('shootbm', 11), 11);
  assert.equal(droppedDurability('shootbm', 2), 10);
  assert.equal(droppedDurability('shield', 5), 30, 'shields too');
  assert.equal(droppedDurability('x', 1, { x: { durability: null } }), null);
  assert.equal(droppedDurability('gun', undefined), 15);
});

test('bad durability and wearPerUse are reported', () => {
  const r = copy();
  delete r.WEAPONS.shootbm.durability;
  r.WEAPONS.electricsword.durability = 0;
  r.WEAPONS.icesword.durability = 2.5;
  r.WEAPONS.supersword.durability = '10';
  r.WEAPONS.gun.wearPerUse = 0;
  r.WEAPONS.icesword.wearPerUse = 2; // fine
  assert.deepEqual(validateRules(r), [
    'weapon gun: wearPerUse must be a whole number > 0',
    'weapon shootbm: missing durability (null = never breaks)',
    'weapon electricsword: durability must be null or a whole number > 0',
    'weapon icesword: durability must be null or a whole number > 0',
    'weapon supersword: durability must be null or a whole number > 0',
  ]);
});

test('gun without range is reported', () => {
  const r = copy();
  delete r.WEAPONS.shootbm.range;
  assert.deepEqual(validateRules(r), ['weapon shootbm: gun missing range']);
});

test('the starting weapon must exist', () => {
  const r = copy();
  r.STARTING_WEAPON = 'woodsword';
  assert.deepEqual(validateRules(r), ['STARTING_WEAPON "woodsword" is not a weapon']);
});

test('negative prices are reported', () => {
  const r = copy();
  r.WEAPONS.icesword.price = -1;
  r.COLORS.red.price = -5;
  r.OUTFITS.hat.cap.price = -10;
  assert.deepEqual(validateRules(r), [
    'weapon icesword: price must be a number >= 0',
    'color red: price must be a number >= 0',
    'outfit hat.cap: price must be a number >= 0',
  ]);
});

test('other broken rules are reported', () => {
  const r = copy();
  r.WEAPONS.shootbm.type = 'laser';
  r.WEAPONS.icesword.rarity = 'rare';
  delete r.WEAPONS.electricsword.dmg;
  delete r.WEAPONS.megashield.price;
  r.STARTING_WEAPON = 'laser';
  r.COLORS.blue.color = 'blue';
  r.OUTFITS.face.none.price = 5;
  delete r.OUTFITS.back.none;
  r.DEFAULT_SKIN.color = 'gold';
  const problems = validateRules(r);
  for (const expected of [
    'weapon shootbm: unknown type "laser"',
    'weapon icesword: unknown rarity "rare"',
    'weapon electricsword: missing dmg',
    'weapon megashield: missing price',
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
  assert.equal(weaponPrice('supersword'), 150);
  assert.equal(weaponPrice('shootbm'), 7);
  assert.equal(weaponPrice('megashield'), 75);
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
  assert.equal(isBuyable('weapon', 'megashield'), true);
  assert.equal(isBuyable('weapon', STARTING_WEAPON), true);
  assert.equal(isBuyable('weapon', 'nope'), false);
  assert.equal(isBuyable('color', 'gold'), true);
  assert.equal(isBuyable('hat', 'wizard'), true);
  assert.equal(isBuyable('hat', 'none'), true);
  assert.equal(isBuyable('cape', 'redcape'), false);
  assert.equal(itemPrice('weapon', 'icesword'), 35);
  assert.equal(itemPrice('shirt', 'vest'), 100);
});

test('weaponsByRarity', () => {
  assert.deepEqual(weaponsByRarity('basic'), []);
  assert.deepEqual(weaponsByRarity('common'), ['gun', 'shootbm']);
  assert.deepEqual(weaponsByRarity('epic'), ['electricsword', 'icesword', 'shield']);
  assert.deepEqual(weaponsByRarity('legendary'), ['megashield']);
  assert.deepEqual(weaponsByRarity('megalegend'), ['supersword']);
  assert.deepEqual(weaponsByRarity('mythic'), []);
  assert.deepEqual(weaponsByRarity('epic'), LOOT_TABLE.epic);
});

test('exported data is deep-frozen', () => {
  for (const obj of [RULES, WEAPONS, WEAPONS.shootbm, WEAPONS.electricsword.shock, HEALS.medkit, LOOT_TABLE, LOOT_TABLE.epic, RARITY_COLORS, RARITY_COLORS.epic,
    COLORS, COLORS.gold, OUTFITS, OUTFITS.hat, OUTFITS.hat.crown, DEFAULT_SKIN]) {
    assert.ok(Object.isFrozen(obj));
  }
  assert.throws(() => { WEAPONS.shootbm.dmg = 999; }, TypeError);
  assert.throws(() => { LOOT_TABLE.epic.push('supersword'); }, TypeError);
  assert.equal(WEAPONS.shootbm.dmg, 5);
});
