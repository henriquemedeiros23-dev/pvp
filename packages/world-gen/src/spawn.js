// Picking a free place to drop a player on the island.

import { circleHitsBox } from '@pvp/collision';

/**
 * Finds a spawn point that is not inside a box and (if possible) at least
 * `minDistanceFromOthers` away from every occupied spot.
 * In the last 20% of tries the distance rule is dropped, so a crowded island
 * still gives a free spot. If nothing is found, returns `fallback`.
 *
 * @param {{ grid: { near: Function }, playRadius: number }} island
 * @param {Array<{x:number,z:number}>} occupied  e.g. other players
 * @param {(() => number) | { next: () => number }} random  seeded random (required)
 * @param {object} [opts]
 * @param {number} [opts.minDistanceFromOthers=25]
 * @param {number} [opts.tries=100]
 * @param {number} [opts.clearance=1.5]   free radius needed around the spot
 * @param {number} [opts.minRadius=20]    not closer to the center than this
 * @param {number} [opts.edgeMargin=10]   not closer to the play edge than this
 * @param {{x:number,z:number}} [opts.fallback={x:30,z:30}]
 * @returns {{ x: number, z: number }}
 */
export function findSpawn(island, occupied = [], random, {
  minDistanceFromOthers = 25,
  tries = 100,
  clearance = 1.5,
  minRadius = 20,
  edgeMargin = 10,
  fallback = { x: 30, z: 30 },
} = {}) {
  const next = typeof random === 'function' ? random : random?.next;
  if (typeof next !== 'function') {
    throw new TypeError('findSpawn needs a seeded random: a function or an object with next()');
  }
  const span = Math.max(0, island.playRadius - edgeMargin - minRadius);
  const strictTries = Math.floor(tries * 0.8);
  for (let t = 0; t < tries; t++) {
    const a = next() * Math.PI * 2, d = minRadius + Math.sqrt(next()) * span;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (island.grid.near(x, z, clearance + 0.5).some(b => circleHitsBox(x, z, clearance, b))) continue;
    if (t < strictTries && occupied.some(p => Math.hypot(p.x - x, p.z - z) < minDistanceFromOthers)) continue;
    return { x, z };
  }
  return { x: fallback.x, z: fallback.z };
}
