// Weapons, heals and loot.
import { deepFreeze } from './freeze.js';
import { BANDAGE_HEAL, MEDKIT_HEAL } from './player.js';

// The weapon everyone gets when they join the arena (slot 1). It is a normal weapon:
// it wears out, can be dropped on knockout, found in chests and bought in the shop.
export const STARTING_WEAPON = 'gun';

// melee and gun go in the weapon slots; a shield is worn on the other (left) arm, never in a slot.
export const WEAPON_TYPES = deepFreeze(['melee', 'gun', 'shield']);
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

// The boss's weapon cards (docs/design/). Every number comes from a card.
// type: melee | gun | shield
// rate: seconds between uses.
// durability: how many uses (swings or shots; for a shield: blocked hits) before it breaks
//   and disappears; null = never breaks. Optional wearPerUse: durability one use costs (default 1).
// chestChance: the weapon's number for chests, from its card ("15%"). The numbers do NOT have to add
//   up to 100: a chest always gives exactly one weapon, picked with these numbers as weights
//   (chance = number / sum of all numbers). 0 = never in chests.
// Specials (all optional, data only, the arena reads them):
//   shock: { dmg, everyMs, forMs }  a hit target loses dmg HP every everyMs for forMs (Electric Sword)
//   freezeMs: n                    a hit target is completely stuck for n ms (Ice Sword)
//   knockout: true                 any hit knocks the target out at once (Supersword)
//   shieldWear: n                  durability a raised shield loses when it blocks this weapon (default 1)
//   reflect: 0..1                  shields only: part of a blocked hit's damage sent back to the attacker
export const WEAPONS = deepFreeze({
  gun:          { name: 'Gun',            type: 'gun', dmg: 2, range: 60, rate: 2, spread: 0.01, pellets: 1, rarity: 'common', price: 3, durability: 15, chestChance: 15 },
  shootbm:      { name: 'Shootbm',        type: 'gun', dmg: 5, range: 90, rate: 3, spread: 0.004, pellets: 1, rarity: 'common', price: 7, durability: 20, chestChance: 15 },
  electricsword: { name: 'Electric Sword', type: 'melee', dmg: 15, range: 3, rate: 2, rarity: 'epic', price: 30, durability: 50, chestChance: 5,
    shock: { dmg: 1, everyMs: 5000, forMs: 15000 } },
  icesword:     { name: 'Ice Sword',      type: 'melee', dmg: 10, range: 3, rate: 3, rarity: 'epic', price: 35, durability: 50, chestChance: 4, freezeMs: 2000 },
  shield:       { name: 'Shield',         type: 'shield', rarity: 'epic', price: 25, durability: 60, chestChance: 6 },
  megashield:   { name: 'Mega Shield',    type: 'shield', rarity: 'legendary', price: 75, durability: 70, chestChance: 1, reflect: 0.25 },
  supersword:   { name: 'Supersword',     type: 'melee', dmg: 100, range: 3.6, rate: 1.5, rarity: 'megalegend', price: 150, durability: 40, chestChance: 0.3,
    knockout: true, shieldWear: 5 },
});

const own = (weapons, id) => (weapons && Object.hasOwn(weapons, id) ? weapons[id] : undefined);
const isPosInt = v => Number.isInteger(v) && v > 0;

/** True if this id is a shield (worn on the other arm, never in a weapon slot). */
export function isShield(id, weapons = WEAPONS) {
  return own(weapons, id)?.type === 'shield';
}

/** Position of a rarity from weakest (0) to strongest; -1 if unknown. */
export function rarityRank(rarity) {
  return RARITIES.indexOf(rarity);
}

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

/** A weapon's chest number from its card (a weight, see WEAPONS), 0 if it has none. */
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

// Weapon ids by rarity.
export const LOOT_TABLE = deepFreeze(Object.fromEntries(RARITIES.map(r => [r, weaponsByRarity(r)])));

/** Shop price of a weapon; undefined for an unknown id. */
export function weaponPrice(id) {
  return own(WEAPONS, id)?.price;
}
