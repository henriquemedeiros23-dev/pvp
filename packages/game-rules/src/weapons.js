// Weapons, heals and loot.
import { deepFreeze } from './freeze.js';
import { BANDAGE_HEAL, MEDKIT_HEAL } from './player.js';

// The weapon everyone gets when they join the arena (slot 1). It is a normal weapon:
// it wears out, can be dropped on knockout, found in chests and bought in the shop.
export const STARTING_WEAPON = 'gun';

export const WEAPON_TYPES = deepFreeze(['melee', 'gun', 'throw', 'rocket', 'mine']);
// Weakest to strongest.
export const RARITIES = deepFreeze(['common', 'epic', 'legendary', 'megalegend']);

// The color of each rarity, used wherever a rarity is shown (shop cards, ground rings, HUD slots).
// color: the main color; color2: a second color (a darker shade). twoColors: show both colors together
// (Megalegend is blue + black).
export const RARITY_COLORS = deepFreeze({
  common:     { name: 'Common',     color: '#3cc24a', color2: '#1f7a2b' },
  epic:       { name: 'Epic',       color: '#a24ff0', color2: '#5e1fa0' },
  legendary:  { name: 'Legendary',  color: '#ffc531', color2: '#b8860b' },
  megalegend: { name: 'Megalegend', color: '#2f6fff', color2: '#0b0b12', twoColors: true },
});

/**
 * How to show a rarity: { id, name, color, color2, background } where background is a CSS value
 * (two-color rarities like Megalegend: a blue and black split, the others their color). Unknown rarity: null.
 */
export function rarityStyle(rarity, colors = RARITY_COLORS) {
  const c = colors && typeof rarity === 'string' && Object.hasOwn(colors, rarity) ? colors[rarity] : null;
  if (!c) return null;
  const background = c.twoColors
    ? `linear-gradient(135deg, ${c.color} 0 45%, ${c.color2} 55% 100%)`
    : c.color;
  return { id: rarity, name: c.name, color: c.color, color2: c.color2, background };
}

// type: melee | gun | throw | rocket | mine
// rate: seconds between uses.
// durability: how many uses (swings, shots, throws, rockets, mines) before the weapon breaks
//   and disappears; null = never breaks. Optional wearPerUse: durability one use costs (default 1).
// chestChance: percent chance that a normal chest gives this weapon. All weapons together add up to 100.
export const WEAPONS = deepFreeze({
  gun:       { name: 'Gun',          type: 'gun', dmg: 2, range: 60, rate: 2, spread: 0.01, pellets: 1, rarity: 'common', price: 3, durability: 15, chestChance: 15 },
  sword:     { name: 'Sword',        type: 'melee', dmg: 30, range: 2.9, rate: 0.55, rarity: 'common', price: 30, durability: 50, chestChance: 18 },
  bat:       { name: 'Bat',          type: 'melee', dmg: 24, range: 2.7, rate: 0.45, rarity: 'common', price: 25, knock: 6, durability: 60, chestChance: 18 },
  spear:     { name: 'Spear',        type: 'melee', dmg: 28, range: 3.9, rate: 0.7, rarity: 'epic', price: 40, durability: 50, chestChance: 5 },
  axe:       { name: 'Axe',          type: 'melee', dmg: 42, range: 2.7, rate: 0.85, rarity: 'epic', price: 50, durability: 40, chestChance: 5 },
  pistol:    { name: 'Pistol',       type: 'gun', dmg: 18, range: 70, rate: 0.35, spread: 0.012, pellets: 1, rarity: 'common', price: 40, durability: 60, chestChance: 17 },
  shotgun:   { name: 'Shotgun',      type: 'gun', dmg: 10, range: 22, rate: 0.95, spread: 0.09, pellets: 8, rarity: 'epic', price: 80, durability: 25, chestChance: 6 },
  rifle:     { name: 'Rifle',        type: 'gun', dmg: 13, range: 90, rate: 0.12, spread: 0.02, pellets: 1, rarity: 'epic', price: 120, durability: 150, chestChance: 5 },
  sniper:    { name: 'Sniper',       type: 'gun', dmg: 75, range: 220, rate: 1.6, spread: 0, pellets: 1, rarity: 'legendary', price: 200, durability: 12, chestChance: 2 },
  grenade:   { name: 'Grenades',     type: 'throw', dmg: 60, radius: 6, rate: 1.4, speed: 18, fuse: 2.2, rarity: 'epic', price: 100, durability: 5, chestChance: 6 },
  rocket:    { name: 'Rocket Launcher', type: 'rocket', dmg: 75, radius: 5.5, rate: 1.9, speed: 38, rarity: 'legendary', price: 250, durability: 6, chestChance: 1 },
  mine:      { name: 'Mines',        type: 'mine', dmg: 65, radius: 4.5, rate: 1.0, maxActive: 3, rarity: 'legendary', price: 150, durability: 5, chestChance: 2 },
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

/**
 * Uses left when a knocked-out player's weapon is picked up from the ground:
 * more than half left keeps what it had; half or less is set to half of the max (rounded up).
 * Never-breaking weapons stay null. Chest loot does not use this (it is always full).
 */
export function droppedDurability(id, usesLeft, weapons = WEAPONS) {
  const max = weaponDurability(id, weapons);
  if (max === null) return null;
  const left = Number.isFinite(usesLeft) ? usesLeft : max;
  return left > max / 2 ? Math.min(left, max) : Math.ceil(max / 2);
}

// The golden chest multiplies the chestChance of these rarities (Common stays the same), then picks as usual.
export const GOLDEN_CHEST_BOOST = deepFreeze({ epic: 2, legendary: 2, megalegend: 2 });

/** A weapon's chest chance in percent (0 if it has none). */
export function chestChance(id, weapons = WEAPONS) {
  const c = own(weapons, id)?.chestChance;
  return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : 0;
}

export const HEALS = deepFreeze({
  bandage: { name: 'Bandage', heal: BANDAGE_HEAL },
  medkit:  { name: 'Medkit',  heal: MEDKIT_HEAL },
});

/** Weapon ids of one rarity, in table order. Returns a new (unfrozen) array. */
export function weaponsByRarity(rarity, weapons = WEAPONS) {
  return Object.keys(weapons).filter(id => weapons[id].rarity === rarity);
}

// Weapon ids by rarity (the golden chest picks from LOOT_TABLE.legendary).
export const LOOT_TABLE = deepFreeze(Object.fromEntries(RARITIES.map(r => [r, weaponsByRarity(r)])));

/** Shop price of a weapon; undefined for an unknown id. */
export function weaponPrice(id) {
  return own(WEAPONS, id)?.price;
}
