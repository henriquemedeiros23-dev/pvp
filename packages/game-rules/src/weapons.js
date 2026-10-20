// Weapons, heals and loot.
import { deepFreeze } from './freeze.js';
import { BANDAGE_HEAL, MEDKIT_HEAL } from './player.js';

export const BASIC_WEAPON = 'woodsword';

export const WEAPON_TYPES = deepFreeze(['melee', 'gun', 'throw', 'rocket', 'mine']);
export const RARITIES = deepFreeze(['basic', 'common', 'rare', 'legendary']);

// type: melee | gun | throw | rocket | mine
// durability: how many uses (swings, shots, throws, rockets, mines) before the weapon breaks
//   and disappears; null = never breaks. Optional wearPerUse: durability one use costs (default 1).
export const WEAPONS = deepFreeze({
  woodsword: { name: 'Wooden Sword', type: 'melee', dmg: 14, range: 2.6, rate: 0.5, rarity: 'basic', price: 0, durability: null },
  sword:     { name: 'Sword',        type: 'melee', dmg: 30, range: 2.9, rate: 0.55, rarity: 'common', price: 30, durability: 50 },
  bat:       { name: 'Bat',          type: 'melee', dmg: 24, range: 2.7, rate: 0.45, rarity: 'common', price: 25, knock: 6, durability: 60 },
  spear:     { name: 'Spear',        type: 'melee', dmg: 28, range: 3.9, rate: 0.7, rarity: 'rare', price: 40, durability: 50 },
  axe:       { name: 'Axe',          type: 'melee', dmg: 42, range: 2.7, rate: 0.85, rarity: 'rare', price: 50, durability: 40 },
  pistol:    { name: 'Pistol',       type: 'gun', dmg: 18, range: 70, rate: 0.35, spread: 0.012, pellets: 1, rarity: 'common', price: 40, durability: 60 },
  shotgun:   { name: 'Shotgun',      type: 'gun', dmg: 10, range: 22, rate: 0.95, spread: 0.09, pellets: 8, rarity: 'rare', price: 80, durability: 25 },
  rifle:     { name: 'Rifle',        type: 'gun', dmg: 13, range: 90, rate: 0.12, spread: 0.02, pellets: 1, rarity: 'rare', price: 120, durability: 150 },
  sniper:    { name: 'Sniper',       type: 'gun', dmg: 75, range: 220, rate: 1.6, spread: 0, pellets: 1, rarity: 'legendary', price: 200, durability: 12 },
  grenade:   { name: 'Grenades',     type: 'throw', dmg: 60, radius: 6, rate: 1.4, speed: 18, fuse: 2.2, rarity: 'rare', price: 100, durability: 5 },
  rocket:    { name: 'Rocket Launcher', type: 'rocket', dmg: 75, radius: 5.5, rate: 1.9, speed: 38, rarity: 'legendary', price: 250, durability: 6 },
  mine:      { name: 'Mines',        type: 'mine', dmg: 65, radius: 4.5, rate: 1.0, maxActive: 3, rarity: 'legendary', price: 150, durability: 5 },
});

const own = (weapons, id) => (weapons && Object.hasOwn(weapons, id) ? weapons[id] : undefined);
const isPosInt = v => Number.isInteger(v) && v > 0;

/** Max durability of a weapon (uses before it breaks); null = never breaks (or unknown id). */
export function weaponDurability(id, weapons = WEAPONS) {
  const d = own(weapons, id)?.durability;
  return isPosInt(d) ? d : null;
}

/** Durability one use costs: the weapon's wearPerUse, default 1. */
export function weaponWear(id, weapons = WEAPONS) {
  const n = own(weapons, id)?.wearPerUse;
  return isPosInt(n) ? n : 1;
}

export const HEALS = deepFreeze({
  bandage: { name: 'Bandage', heal: BANDAGE_HEAL },
  medkit:  { name: 'Medkit',  heal: MEDKIT_HEAL },
});

/** Weapon ids of one rarity, in table order. Returns a new (unfrozen) array. */
export function weaponsByRarity(rarity, weapons = WEAPONS) {
  return Object.keys(weapons).filter(id => weapons[id].rarity === rarity);
}

export const LOOT_TABLE = deepFreeze({
  common: weaponsByRarity('common'),
  rare: weaponsByRarity('rare'),
  legendary: weaponsByRarity('legendary'),
});

/** Shop price of a weapon; undefined for the basic weapon or an unknown id. */
export function weaponPrice(id) {
  const w = Object.hasOwn(WEAPONS, id) ? WEAPONS[id] : undefined;
  return w && w.rarity !== 'basic' ? w.price : undefined;
}
