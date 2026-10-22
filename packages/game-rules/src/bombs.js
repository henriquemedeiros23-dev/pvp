// Bombs (#32, the boss's bomb cards): thrown, not held. Like Healing Potions they are a COUNTER
// (how many of each you carry), never a weapon slot: a bomb button / key throws one.
import { deepFreeze } from './freeze.js';

// id: the shop item id, the ground item's `weapon` field and the id in messages.
// dmg: damage to everyone inside the square area when it explodes (the normal damage path; a raised
//   shield does NOT block it, it hits an area).
// area: side of the square on the ground, in meters (2 = a 2x2 m square centred where it lands).
// maxThrow: the farthest it can land from the thrower (meters, measured flat). Aim decides where it lands.
// fuseMs: it explodes this long after the throw. As soon as it lands everyone sees a red outline of the area.
// hurtsThrower: false = the thrower is never hurt by their own bomb.
// maxCarry: how many you can carry in the arena. pack: how many one shop buy (and one chest drop) gives.
// price: coins for one pack. chestChance: percent chance that a chest (normal and golden) also drops
//   one pack next to its weapon, like the extra Healing Potion. rarity: like weapons.
export const BOMBS = deepFreeze({
  bomb: {
    name: 'Bomb', dmg: 3, area: 2, maxThrow: 7, fuseMs: 3000, hurtsThrower: true,
    maxCarry: 5, pack: 1, price: 3, chestChance: 10, rarity: 'common', color: '#1b1b1f',
  },
  legendarybomb: {
    name: 'Legendary Bomb', dmg: 10, area: 5, maxThrow: 15, fuseMs: 3000, hurtsThrower: false,
    maxCarry: 3, pack: 3, price: 60, chestChance: 2, rarity: 'legendary', color: '#ffc531',
  },
});

const own = (bombs, id) => (bombs && typeof id === 'string' && Object.hasOwn(bombs, id) ? bombs[id] : undefined);

/** True if this id is a bomb. */
export function isBomb(id, bombs = BOMBS) {
  return own(bombs, id) !== undefined;
}

/** Shop price of one pack of a bomb; undefined for anything else. */
export function bombPrice(id, bombs = BOMBS) {
  return own(bombs, id)?.price;
}

/** How many of this bomb you can carry in the arena (0 for an unknown id). */
export function bombMaxCarry(id, bombs = BOMBS) {
  const n = own(bombs, id)?.maxCarry;
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * A clean bomb counter { bombId: count } with every bomb id of the rules (0 when missing), from any
 * value (bad counts are 0). With cap = true every count is cut to its maxCarry.
 */
export function bombCounts(value, { cap = false } = {}, bombs = BOMBS) {
  const out = {};
  for (const id of Object.keys(bombs)) {
    const n = value && Object.hasOwn(value, id) ? value[id] : 0;
    const count = Number.isInteger(n) && n > 0 ? n : 0;
    out[id] = cap ? Math.min(count, bombMaxCarry(id, bombs)) : count;
  }
  return out;
}

/**
 * Is a spot (x, z) inside a bomb's square area centred on (cx, cz)? The edge counts as inside.
 * Pure, used by the arena (damage) and handy for the client (who is in danger).
 */
export function inBombArea(id, cx, cz, x, z, bombs = BOMBS) {
  const def = own(bombs, id);
  if (!def) return false;
  const half = def.area / 2;
  return Math.abs(x - cx) <= half + 1e-9 && Math.abs(z - cz) <= half + 1e-9;
}
