// Shared test helpers (no tests in here).
import { createBoxGrid } from '@pvp/collision';
import { createRandom } from '@pvp/seeded-random';
import { RULES } from '@pvp/game-rules';
import { serverMessage } from '@pvp/net-protocol';
import { createArena } from '../src/index.js';

// A tiny flat test island: one tall wall at x = 50 (from z = -5 to 5), two chests, one golden spot.
export const WALL = { id: 0, x: 50, z: 0, w: 1, d: 10, h: 4, y: 0, kind: 'wall' };
export function testIsland() {
  return {
    seed: 'test', islandRadius: 210, playRadius: 195,
    boxes: [WALL],
    chests: [{ id: 0, x: 10, z: 30 }, { id: 1, x: -30, z: -30 }],
    goldenSpots: [{ x: 30, z: -60 }],
    grid: createBoxGrid([WALL]),
  };
}

/** Rules where a normal chest always gives `weapon` (its chestChance is 100, every other weapon 0). */
export function chestAlways(weapon, rules = RULES) {
  const WEAPONS = Object.fromEntries(Object.entries(rules.WEAPONS)
    .map(([id, w]) => [id, { ...w, chestChance: id === weapon ? 100 : 0 }]));
  return { ...rules, WEAPONS };
}

export function makeArena({ seed = 42, rules = RULES, tuning, island = testIsland(), now = 0 } = {}) {
  return createArena({ island, rules, random: createRandom(seed), now, tuning, snapshots: false });
}

/** Drain and check every message against @pvp/net-protocol (throws on a bad one). */
export function drain(arena) {
  const out = arena.drain();
  for (const ev of out) {
    if (ev.to === 'server') continue;
    const { t, ...fields } = ev.msg;
    serverMessage(t, fields);
  }
  return out;
}

// `to` matches an event for that player id, 'all', or a list of player ids that includes it (sendNear).
const sentTo = (e, to) => to === undefined || e.to === to || (Array.isArray(e.to) && e.to.includes(to));
export const msgs = (out, t, to) => out.filter(e => e.msg && e.msg.t === t && sentTo(e, to)).map(e => e.msg);
export const serverEvents = (out, kind) => out.filter(e => e.to === 'server' && e.kind === kind);

/** Aim from a player's muzzle (standing) to a point at height 1 on another player. */
export function aimAt(arena, fromId, toId) {
  const a = arena.getPlayer(fromId), b = arena.getPlayer(toId);
  return [b.x - a.x, b.y + 1 - (a.y + RULES.PLAYER_HEIGHT - 0.3), b.z - a.z];
}

export { RULES };
