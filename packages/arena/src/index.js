// @pvp/arena: the fight itself as a deterministic simulation.
// No sockets, no clock, no Math.random: the server calls the methods and tick(now),
// then sends what drain() returns.

import { createState, at, send } from './state.js';
import * as players from './players.js';
import { openChest, tickChests } from './chests.js';
import { tickItems } from './loot.js';
import { fire } from './combat.js';
import { tickProjectiles } from './projectiles.js';
import { tickMines } from './mines.js';
import { snapshotFor, welcomeFor } from './snapshot.js';

export { ARENA_DEFAULTS } from './tuning.js';

const copyPlayer = p => p && {
  id: p.id, key: p.key, name: p.name, skin: { ...p.skin }, coins: p.coins,
  x: p.x, y: p.y, z: p.z, ry: p.ry, pitch: p.pitch, flags: p.flags,
  hp: p.hp, weapons: [...p.weapons], dur: [...p.dur], free: [...p.free], slot: p.slot, bandages: p.bandages, medkits: p.medkits,
  protectUntil: p.protectUntil,
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
    selectSlot: (id, i) => players.selectSlot(A, id, i),
    openChest: (id, chest, now) => openChest(A, id, chest, now),
    heal: (id, kind, now) => players.heal(A, id, kind, now),
    teleport: (id, pos) => players.teleport(A, id, pos),
    /** Set a player's coins from the account (the real total). Queues an 'inv'. False if unknown id. */
    setCoins: (id, total) => players.setCoins(A, id, total),

    /** Advance the world to nowMs: chests, golden chest, items, projectiles, mines, snapshots. */
    tick(nowMs) {
      const prev = A.lastTick;
      const now = at(A, nowMs);
      const dt = Math.min(A.tune.maxStepS, Math.max(0, (now - prev) / 1000));
      A.lastTick = now;
      tickChests(A, now);
      tickItems(A, now);
      tickProjectiles(A, now, dt);
      tickMines(A, now);
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
    items: () => [...A.items.values()].map(it => ({ ...it })),
    projectiles: () => [...A.projectiles.values()].map(({ owner, ...pr }) => ({ ...pr, ownerId: owner.id })),
    mines: () => [...A.mines.values()].map(({ owner, ...m }) => ({ ...m })),
  };
}
