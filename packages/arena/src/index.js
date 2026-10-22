// @pvp/arena: the fight itself as a deterministic simulation.
// No sockets, no clock, no Math.random: the server calls the methods and tick(now),
// then sends what drain() returns.

import { createState, at, send } from './state.js';
import * as players from './players.js';
import { openChest, tickChests } from './chests.js';
import { tickItems } from './loot.js';
import { fire, dropWeapon } from './combat.js';
import { setShield, tickEffects, isFrozen, isShocked } from './effects.js';
import { snapshotFor, welcomeFor } from './snapshot.js';

export { ARENA_DEFAULTS } from './tuning.js';

const copyPlayer = p => p && {
  id: p.id, key: p.key, name: p.name, skin: { ...p.skin }, coins: p.coins,
  x: p.x, y: p.y, z: p.z, ry: p.ry, pitch: p.pitch, flags: p.flags,
  hp: p.hp, weapons: [...p.weapons], dur: [...p.dur], free: [...p.free], slot: p.slot, bandages: p.bandages, medkits: p.medkits,
  protectUntil: p.protectUntil,
  shield: p.shield ? { ...p.shield } : null, shieldUp: p.shieldUp,
  frozenUntil: p.frozenUntil, shock: p.shock ? { next: p.shock.next, left: p.shock.left, dmg: p.shock.dmg, everyMs: p.shock.everyMs, weapon: p.shock.weapon } : null,
};

/**
 * Create an arena.
 * @param {object} o
 * @param {object} o.island   from @pvp/world-gen generateIsland()
 * @param {object} [o.rules]  @pvp/game-rules RULES (or your own rules with the same shape)
 * @param {object|Function} o.random  a @pvp/seeded-random generator (or () => number)
 * @param {number} [o.now=0]  start time in ms
 * @param {object} [o.tuning] overrides for ARENA_DEFAULTS
 * @param {boolean} [o.snapshots=true] tick() queues a 'snap' for every player
 */
export function createArena(o = {}) {
  const A = createState(o);

  return {
    /** Join. Returns { ok: true, id, weapons, replaced } or { ok: false, reason: 'full' }. */
    join: (playerKey, info, now) => players.join(A, playerKey, info, now),
    /** Leave. alive (default true): returns the weapons for the backpack (not the free starting weapon); else []. */
    leave: (id, opts) => players.leave(A, id, opts),
    setState: (id, state, now) => players.setState(A, id, state, now),
    fire: (id, dir, now) => fire(A, id, dir, now),
    /** Raise (true) or lower (false) the shield on the left arm. False if no shield, frozen or no change. */
    setShield: (id, up, now) => setShield(A, id, up, now),
    /** Is this player frozen (stuck) / shocked (losing HP over time) right now? */
    isFrozen: id => isFrozen(A, A.players.get(id)),
    isShocked: id => isShocked(A, A.players.get(id)),
    selectSlot: (id, i) => players.selectSlot(A, id, i),
    /** Drop the weapon in hand on the ground with its exact durability (#34). Returns the item id or null. */
    dropWeapon: (id, now) => dropWeapon(A, id, now),
    openChest: (id, chest, now) => openChest(A, id, chest, now),
    heal: (id, kind, now) => players.heal(A, id, kind, now),
    teleport: (id, pos) => players.teleport(A, id, pos),
    /** Set a player's coins from the account (the real total). Queues an 'inv'. False if unknown id. */
    setCoins: (id, total) => players.setCoins(A, id, total),

    /** Advance the world to nowMs: chests, golden chest, items, shock damage, snapshots. */
    tick(nowMs) {
      const now = at(A, nowMs);
      A.lastTick = now;
      tickChests(A, now);
      tickItems(A, now);
      tickEffects(A, now);
      if (A.snapshots) for (const id of A.players.keys()) send(A, id, snapshotFor(A, id));
    },

    snapshotFor: id => snapshotFor(A, id),
    welcomeFor: id => welcomeFor(A, id),
    playerCount: () => A.players.size,
    playerIds: () => [...A.players.keys()],
    hasPlayer: id => A.players.has(id),
    idOf: playerKey => A.byKey.get(playerKey),

    /** Everything queued since the last drain, oldest first. */
    drain() {
      const out = A.out;
      A.out = [];
      return out;
    },

    // Read-only views (copies), handy for the server and tests.
    now: () => A.now,
    getPlayer: id => copyPlayer(A.players.get(id)),
    chests: () => A.chests.map(c => ({ id: c.id, x: c.x, z: c.z, open: c.openUntil > A.now, openUntil: c.openUntil })),
    golden: () => (A.golden ? { ...A.golden } : null),
    nextGoldenAt: () => A.nextGolden,
    items: () => [...A.items.values()].map(({ ignore, ...it }) => ({ ...it })),
  };
}
