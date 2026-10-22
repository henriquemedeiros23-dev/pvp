// The arena's inner state and the small helpers every part uses.

import { RULES as defaultRules, weaponDurability, weaponWear, RARITIES } from '@pvp/game-rules';
import { ARENA_DEFAULTS } from './tuning.js';

// Accept a @pvp/seeded-random generator (or anything with next(), or a plain function).
function asRandom(random, label) {
  if (typeof random === 'function') return { next: random };
  if (!random || typeof random.next !== 'function') {
    throw new TypeError('createArena needs a seeded random: a @pvp/seeded-random generator or a () => number');
  }
  // Own stream per system, so e.g. a gun's spread never changes the next chest's loot.
  return typeof random.fork === 'function' ? random.fork(label) : random;
}

export function createState({ island, rules = defaultRules, random, now = 0, tuning = {}, snapshots = true } = {}) {
  if (!island || !island.grid || !Array.isArray(island.chests)) {
    throw new TypeError('createArena needs an island from @pvp/world-gen generateIsland()');
  }
  if (!Number.isFinite(now)) throw new TypeError('createArena needs a start time `now` in ms');
  const tune = { ...ARENA_DEFAULTS, ...tuning };
  let nextId = 1;
  const A = {
    island, rules, tune, snapshots,
    rnd: {
      spawn: asRandom(random, 'spawn'),
      loot: asRandom(random, 'loot'),
      golden: asRandom(random, 'golden'),
      combat: asRandom(random, 'combat'),
    },
    now,                    // latest time seen (ms); never goes back
    lastTick: now,
    players: new Map(),     // id -> player
    byKey: new Map(),       // playerKey -> id
    chests: island.chests.map(c => ({ id: c.id, x: c.x, z: c.z, openUntil: 0 })),
    golden: null,           // { x, z } while a golden chest is waiting
    nextGolden: now + tune.firstGoldenMs,
    items: new Map(),       // id -> { id, kind, weapon, x, y, z, expires, dur? (weapons: uses left or null), n? (bombs: how many) }
    bombs: new Map(),       // id -> live bomb { id, b, by, byName, from, to, throwAt, landAt, explodeAt } (#32)
    out: [],
    newId: () => nextId++,
  };
  return A;
}

/** Move the clock forward to `now` (if given and later) and return the arena time. */
export function at(A, now) {
  if (typeof now === 'number' && Number.isFinite(now) && now > A.now) A.now = now;
  return A.now;
}

/** Queue a message for everyone (to: 'all', optional except) or one player id. */
export function send(A, to, msg, except) {
  const ev = { to, msg };
  if (except !== undefined) ev.except = except;
  A.out.push(ev);
}

/** Queue an event for the server itself (accounts and so on). */
export function tellServer(A, kind, data) {
  A.out.push({ to: 'server', kind, ...data });
}

/** Integer in [min, max], both included. */
export const randInt = (r, min, max) => min + Math.floor(r.next() * (max - min + 1));
/** One element of a non-empty list. */
export const randPick = (r, list) => list[Math.floor(r.next() * list.length)];

export const weaponDef = (A, id) => (Object.hasOwn(A.rules.WEAPONS, id) ? A.rules.WEAPONS[id] : undefined);
/** Full durability of a weapon (uses before it breaks), or null = never breaks. */
export const maxDurability = (A, id) => weaponDurability(id, A.rules.WEAPONS);
/** Durability one use of the weapon costs (wearPerUse, default 1). */
export const wearOf = (A, id) => weaponWear(id, A.rules.WEAPONS);
/** Is this weapon id a shield (worn on the left arm, never in a slot)? */
export const isShieldId = (A, id) => weaponDef(A, id)?.type === 'shield';
/** Rarity rank of a weapon (higher = rarer), -1 if unknown. */
export const rankOf = (A, id) => (A.rules.RARITIES ?? RARITIES).indexOf(weaponDef(A, id)?.rarity);
export const heightOf = (A, p) => ((p.flags & 1) ? A.rules.CROUCH_HEIGHT : A.rules.PLAYER_HEIGHT);

/** The rules' bomb table (#32), {} when the rules have no bombs. */
export const bombTable = A => (A.rules.BOMBS && typeof A.rules.BOMBS === 'object' ? A.rules.BOMBS : {});
/** One bomb's rules, or undefined for an unknown id. */
export const bombDef = (A, id) => (typeof id === 'string' && Object.hasOwn(bombTable(A), id) ? bombTable(A)[id] : undefined);
