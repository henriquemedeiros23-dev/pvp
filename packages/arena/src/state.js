// The arena's inner state and the small helpers every part uses.

import { RULES as defaultRules, weaponDurability, weaponWear, RARITIES, CHARGING_DAMAGE, MIN_FIRE_GAP_MS, HEADSHOT_BONUS, HEAD_ZONE } from '@pvp/game-rules';
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

/** Ids of every player within snapshotRadius of player p (p included): who can see p. */
export function nearIds(A, p) {
  const ids = [];
  for (const o of A.players.values()) {
    if (o === p || Math.hypot(o.x - p.x, o.z - p.z) <= A.tune.snapshotRadius) ids.push(o.id);
  }
  return ids;
}

/** Queue a message for every player near p (see nearIds): the event's `to` is a list of player ids. */
export function sendNear(A, p, msg) {
  const ids = nearIds(A, p);
  if (ids.length) A.out.push({ to: ids, msg });
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

// ---------------------------------------------------------------- charging (#38)
// Every carried weapon charges on its own: p.useAt[slot] (parallel to p.weapons) is when that weapon's
// charge last started (-Infinity = never used: ready). A weapon picked up from the ground starts ready.

/** How long (ms) a weapon charges after a use: its rate * 1000 * tuning fireRateSlack (0 for no rate). */
export function chargeMs(A, id) {
  const rate = weaponDef(A, id)?.rate;
  return typeof rate === 'number' && rate > 0 ? rate * 1000 * A.tune.fireRateSlack : 0;
}
/** Ms left until the weapon in `slot` is fully charged (0 = ready), rounded up to whole ms. */
export function chargeLeft(A, p, slot) {
  const since = A.now - (p.useAt?.[slot] ?? -Infinity);
  return Math.max(0, Math.ceil(chargeMs(A, p.weapons[slot]) - since));
}
/** The rules' charging factor (CHARGING_DAMAGE, default 0.25) and anti-spam gap (MIN_FIRE_GAP_MS, default 150). */
export const chargingFactor = A => (typeof A.rules.CHARGING_DAMAGE === 'number' ? A.rules.CHARGING_DAMAGE : CHARGING_DAMAGE);
export const minFireGap = A => (Number.isFinite(A.rules.MIN_FIRE_GAP_MS) ? A.rules.MIN_FIRE_GAP_MS : MIN_FIRE_GAP_MS);

// ---------------------------------------------------------------- headshots (#45)
/** The rules' headshot bonus (HEADSHOT_BONUS, default 3) and head zone (HEAD_ZONE, default 0.35 m from the top). */
export const headshotBonus = A => (Number.isFinite(A.rules.HEADSHOT_BONUS) ? A.rules.HEADSHOT_BONUS : HEADSHOT_BONUS);
export const headZone = A => (Number.isFinite(A.rules.HEAD_ZONE) ? A.rules.HEAD_ZONE : HEAD_ZONE);
