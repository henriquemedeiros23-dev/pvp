import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../src/index.js';
import {
  CHARGING_DAMAGE, MIN_FIRE_GAP_MS, chargingDamage,
  BOMBS, isBomb, bombPrice, bombMaxCarry, bombCounts, inBombArea,
  RULES, WEAPONS, COLORS, OUTFITS, DEFAULT_SKIN, LOOT_TABLE, POTION, MAX_POTIONS, potionPrice, potionHeal, STARTING_WEAPON, RARITIES, RARITY_COLORS,
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
// #28 removed bandages and medkits: the Healing Potion is the only heal.
const REMOVED_IN_28 = ['HEALS', 'MAX_BANDAGES', 'MAX_MEDKITS', 'BANDAGE_HEAL', 'MEDKIT_HEAL'];
// #36: an opened chest now comes back after 2 minutes (was 15 s).
const CHANGED_IN_36 = { CHEST_RESPAWN_MS: 120000 };
// #42 added the Demon Horns hat; everything else in OUTFITS stays the same.
const ADDED_IN_42 = { OUTFITS: o => { const c = structuredClone(o); delete c.hat.horns; return c; } };
// #44: the boss made Zebra Stripes 50 (was 150), Shiny Gold 75 (was 250) and Rainbow 100 (was 400); the rest of COLORS stays.
const CHANGED_IN_44 = {
  COLORS: o => { const c = structuredClone(o); c.zebra.price = 150; c.gold.price = 250; c.rainbow.price = 400; return c; },
};

test('same named exports and values as the old apps/game/shared/config.js (except the #25/#26/#28/#36/#42/#44 changes)', () => {
  for (const [name, value] of Object.entries(oldConfig)) {
    if (CHANGED.includes(name)) continue;
    if (name in CHANGED_IN_36) { assert.equal(rules[name], CHANGED_IN_36[name], `${name} changed in #36`); continue; }
    if (name in CHANGED_IN_44) { assert.deepEqual(CHANGED_IN_44[name](rules[name]), value, `export ${name} differs (beyond #44)`); continue; }
    if (name in ADDED_IN_42) { assert.deepEqual(ADDED_IN_42[name](rules[name]), value, `export ${name} differs (beyond #42)`); continue; }
    if (REMOVED_IN_28.includes(name)) { assert.ok(!(name in rules), `${name} should be gone (#28)`); continue; }
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

test('the weapon list is exactly the boss\'s cards (#26, #32), nothing else', () => {
  assert.deepEqual(Object.keys(WEAPONS), ['gun', 'shootbm', 'electricsword', 'icesword', 'shield', 'megashield', 'supersword', 'dmgun', 'supergun']);
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
  assert.deepEqual(card('megashield'), ['Mega Shield', 'shield', undefined, undefined, 70, 1, 100, 'legendary']);
  assert.equal(WEAPONS.megashield.reflect, 0.25);
  assert.equal(WEAPONS.shield.reflect, undefined);
  assert.deepEqual(card('supersword'), ['Supersword', 'melee', 100, 1.5, 40, 0.3, 250, 'megalegend']);
  // #32: the boss's numbers from the issue, not the ones written on the cards
  assert.deepEqual(card('dmgun'), ['DM Gun', 'gun', 15, 3, 30, 7, 20, 'epic']);
  assert.deepEqual(card('supergun'), ['Supergun', 'gun', 25, 2, 30, 1.5, 70, 'legendary']);
  assert.equal(WEAPONS.dmgun.pellets, 1, 'one bullet');
  assert.equal(WEAPONS.supergun.pellets, 1, 'one bullet');
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
  assert.deepEqual(nums, { gun: 15, shootbm: 15, electricsword: 5, icesword: 4, shield: 6, megashield: 1, supersword: 0.3, dmgun: 7, supergun: 1.5 });
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
  assert.equal(weaponPrice('supersword'), 250);
  assert.equal(weaponPrice('shootbm'), 7);
  assert.equal(weaponPrice('megashield'), 100);
  assert.equal(weaponPrice(STARTING_WEAPON), 3);
  assert.equal(weaponPrice('laser'), undefined);
  assert.equal(weaponPrice('toString'), undefined);
});

test('skinPrice', () => {
  assert.equal(skinPrice('color', 'rainbow'), 100);
  assert.equal(skinPrice('color', 'gold'), 75);
  assert.equal(skinPrice('color', 'zebra'), 50);
  assert.equal(skinPrice('color', 'black'), 0);
  assert.equal(skinPrice('hat', 'crown'), 300);
  assert.equal(skinPrice('hat', 'horns'), 50);
  assert.equal(OUTFITS.hat.horns.name, 'Demon Horns');
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
  assert.deepEqual(weaponsByRarity('epic'), ['electricsword', 'icesword', 'shield', 'dmgun']);
  assert.deepEqual(weaponsByRarity('legendary'), ['megashield', 'supergun']);
  assert.deepEqual(weaponsByRarity('megalegend'), ['supersword']);
  assert.deepEqual(weaponsByRarity('mythic'), []);
  assert.deepEqual(weaponsByRarity('epic'), LOOT_TABLE.epic);
});

test('exported data is deep-frozen', () => {
  for (const obj of [RULES, WEAPONS, WEAPONS.shootbm, WEAPONS.electricsword.shock, POTION, LOOT_TABLE, LOOT_TABLE.epic, RARITY_COLORS, RARITY_COLORS.epic,
    COLORS, COLORS.gold, OUTFITS, OUTFITS.hat, OUTFITS.hat.crown, DEFAULT_SKIN]) {
    assert.ok(Object.isFrozen(obj));
  }
  assert.throws(() => { WEAPONS.shootbm.dmg = 999; }, TypeError);
  assert.throws(() => { LOOT_TABLE.epic.push('supersword'); }, TypeError);
  assert.equal(WEAPONS.shootbm.dmg, 5);
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

test('bombs from the boss\'s cards (#32): thrown counters, not weapon slots', () => {
  assert.deepEqual(Object.keys(BOMBS), ['bomb', 'legendarybomb']);
  const card = id => { const b = BOMBS[id]; return [b.name, b.dmg, b.area, b.maxThrow, b.fuseMs, b.hurtsThrower, b.maxCarry, b.pack, b.price, b.chestChance, b.rarity]; };
  assert.deepEqual(card('bomb'), ['Bomb', 3, 2, 7, 3000, true, 5, 1, 3, 10, 'common']);
  assert.deepEqual(card('legendarybomb'), ['Legendary Bomb', 10, 5, 15, 3000, false, 3, 3, 60, 2, 'legendary']);
  assert.equal(RULES.BOMBS, BOMBS);
  assert.ok(Object.isFrozen(BOMBS.bomb));
  assert.equal(isBomb('bomb'), true);
  assert.equal(isBomb('gun'), false);
  assert.equal(isBomb('toString'), false);
  assert.equal(bombPrice('legendarybomb'), 60, 'a pack of 3 for 60 coins');
  assert.equal(itemPrice('bomb', 'bomb'), 3);
  assert.equal(isBuyable('bomb', 'legendarybomb'), true);
  assert.equal(isBuyable('bomb', 'gun'), false);
  assert.equal(isBuyable('weapon', 'bomb'), false, 'bombs are not weapons');
  assert.equal(bombMaxCarry('bomb'), 5);
  assert.equal(bombMaxCarry('legendarybomb'), 3);
  assert.equal(bombMaxCarry('nope'), 0);
  assert.deepEqual(bombCounts(undefined), { bomb: 0, legendarybomb: 0 });
  assert.deepEqual(bombCounts({ bomb: 9, legendarybomb: -1, rocket: 2 }), { bomb: 9, legendarybomb: 0 });
  assert.deepEqual(bombCounts({ bomb: 9, legendarybomb: 7 }, { cap: true }), { bomb: 5, legendarybomb: 3 });
  assert.deepEqual(bombCounts({ bomb: 1.5 }), { bomb: 0, legendarybomb: 0 });
});

test('the bomb area is a square centred where it lands (edges count)', () => {
  assert.equal(inBombArea('bomb', 10, 10, 11, 9), true);   // 2x2: 1 m each way
  assert.equal(inBombArea('bomb', 10, 10, 11.01, 10), false);
  assert.equal(inBombArea('legendarybomb', 0, 0, 2.5, -2.5), true); // 5x5
  assert.equal(inBombArea('legendarybomb', 0, 0, 0, 2.6), false);
  assert.equal(inBombArea('nope', 0, 0, 0, 0), false);
});

test('bad bombs are reported', () => {
  const r = copy();
  r.BOMBS.bomb.dmg = 0;
  r.BOMBS.bomb.hurtsThrower = 'yes';
  r.BOMBS.legendarybomb.pack = 4;
  r.BOMBS.legendarybomb.rarity = 'mythic';
  r.BOMBS.gun = { ...r.BOMBS.bomb, dmg: 3, hurtsThrower: true };
  assert.deepEqual(validateRules(r), [
    'bomb bomb: dmg must be a number > 0',
    'bomb bomb: hurtsThrower must be true or false',
    'bomb legendarybomb: pack must not be more than maxCarry',
    'bomb legendarybomb: unknown rarity "mythic"',
    'bomb gun: the id is also a weapon',
  ]);
  assert.deepEqual(validateRules({ ...RULES, BOMBS: 5 }).filter(p => p.startsWith('BOMBS')), ['BOMBS must be an object']);
});

test('charging (#38): a hit while the weapon is still charging does 25% (rounded, at least 1)', () => {
  assert.equal(CHARGING_DAMAGE, 0.25);
  assert.equal(RULES.CHARGING_DAMAGE, 0.25);
  assert.equal(MIN_FIRE_GAP_MS, 150);
  assert.equal(RULES.MIN_FIRE_GAP_MS, 150);
  assert.equal(chargingDamage(2), 1);    // 0.5 rounds to 1
  assert.equal(chargingDamage(5), 1);    // 1.25
  assert.equal(chargingDamage(10), 3);   // 2.5 rounds up
  assert.equal(chargingDamage(15), 4);   // 3.75
  assert.equal(chargingDamage(25), 6);   // 6.25
  assert.equal(chargingDamage(100), 25); // the Supersword while charging: no knockout, 25
  assert.equal(chargingDamage(1, 0.1), 1, 'at least 1');
  assert.equal(chargingDamage(10, 0.5), 5, 'the factor can be tuned');
  assert.equal(chargingDamage(0), 0);
  assert.equal(chargingDamage(undefined), 0);
});

test('bad charging numbers are reported', () => {
  assert.deepEqual(validateRules({ ...RULES, CHARGING_DAMAGE: 2, MIN_FIRE_GAP_MS: -1 }).slice(-2), [
    'CHARGING_DAMAGE must be a number from 0 to 1',
    'MIN_FIRE_GAP_MS must be a whole number of ms >= 0',
  ]);
  const without = { ...RULES };
  delete without.CHARGING_DAMAGE;
  delete without.MIN_FIRE_GAP_MS;
  assert.deepEqual(validateRules(without), [], 'optional');
});

test('aiming (#37): only the Shootbm and the DM Gun can aim', () => {
  const aimers = Object.keys(WEAPONS).filter(id => rules.canAim(id));
  assert.deepEqual(aimers, ['shootbm', 'dmgun']);
  assert.deepEqual(rules.aimDef('shootbm'), { zoom: 2, spreadMul: 0.3, moveMul: 0.6 });
  assert.deepEqual(rules.aimDef(WEAPONS.dmgun), { zoom: 2, spreadMul: 0.3, moveMul: 0.6 }, 'a weapon object works too');
  for (const id of ['gun', 'supergun', 'electricsword', 'shield', 'nope', undefined, null]) assert.equal(rules.aimDef(id), null, String(id));
  assert.equal(rules.canAim('gun'), false);
  assert.equal(rules.aimDef({ type: 'melee', aim: { zoom: 2, spreadMul: 0.3, moveMul: 0.6 } }), null, 'a sword cannot aim');
  assert.equal(rules.aimDef({ type: 'gun', aim: { zoom: 0.5, spreadMul: 0.3, moveMul: 0.6 } }), null, 'bad numbers: cannot aim');
  assert.deepEqual(rules.aimMultipliers('shootbm', true), { zoom: 2, spreadMul: 0.3, moveMul: 0.6 });
  assert.deepEqual(rules.aimMultipliers('shootbm', false), { zoom: 1, spreadMul: 1, moveMul: 1 }, 'not aiming');
  assert.deepEqual(rules.aimMultipliers('gun', true), { zoom: 1, spreadMul: 1, moveMul: 1 }, 'the Gun ignores aiming');
});

test('bad aim numbers are reported', () => {
  const r = copy();
  r.WEAPONS.shootbm.aim = { zoom: 0.5, spreadMul: 2, moveMul: 0 };
  r.WEAPONS.icesword.aim = { zoom: 2, spreadMul: 0.3, moveMul: 0.6 };
  r.WEAPONS.dmgun.aim = 'yes';
  assert.deepEqual(validateRules(r), [
    'weapon shootbm: aim.zoom must be a number >= 1',
    'weapon shootbm: aim.spreadMul must be a number from 0 to 1',
    'weapon shootbm: aim.moveMul must be a number above 0, at most 1',
    'weapon icesword: only a gun can have aim',
    'weapon dmgun: aim must be { zoom, spreadMul, moveMul }',
  ]);
});

test('the extras bar spaces (#50): one shield, the potions, one space per bomb', () => {
  assert.deepEqual(rules.extrasSpaces(), [
    { space: 'shield', kind: 'weapon', id: null, max: 1 },
    { space: 'potion', kind: 'potion', id: 'potion', max: 3 },
    { space: 'bomb', kind: 'bomb', id: 'bomb', max: 5 },
    { space: 'legendarybomb', kind: 'bomb', id: 'legendarybomb', max: 3 },
  ]);
  assert.deepEqual(rules.extrasSpaces(rules.RULES), rules.extrasSpaces());
  assert.equal(rules.extrasSpaceOf('weapon', 'megashield'), 'shield');
  assert.equal(rules.extrasSpaceOf('weapon', 'gun'), null);
  assert.equal(rules.extrasSpaceOf('potion', 'potion'), 'potion');
  assert.equal(rules.extrasSpaceOf('bomb', 'legendarybomb'), 'legendarybomb');
  assert.equal(rules.extrasSpaceOf('bomb', 'rocket'), null);
  assert.equal(rules.extrasSpaceOf('weapon', undefined), null);
  assert.deepEqual(rules.extrasSpaces({ WEAPONS: {}, BOMBS: {} }), [], 'rules without extras: no spaces');
});
