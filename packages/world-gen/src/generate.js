// The island of ruins, built step by step from a seed.

import { createRandom } from '@pvp/seeded-random';
import { createBoxGrid, circleHitsBox } from '@pvp/collision';
import { createContext } from './context.js';
import { buildPlaza } from './builders/plaza.js';
import { buildHouse } from './builders/house.js';
import { buildTower } from './builders/tower.js';
import { buildColonnade } from './builders/colonnade.js';
import { buildBrokenWall } from './builders/wall.js';
import { buildRock } from './builders/rocks.js';
import { buildOpenChest } from './builders/openChests.js';

export const DEFAULT_SEED = 20261020;
export const ISLAND_RADIUS = 210;
export const PLAY_RADIUS = 195;
/** A chest needs this much free room (radius) around it, or it is dropped. */
export const CHEST_RADIUS = 0.8;
/**
 * A golden spot is dropped (and reported by validateIsland) when its center is
 * inside a box. Only the center is checked, so today's map stays unchanged.
 */
export const GOLDEN_SPOT_RADIUS = 0.01;
/** Grid cell size used for `island.grid`. */
export const GRID_CELL_SIZE = 10;

export const DEFAULT_OPTIONS = Object.freeze({
  islandRadius: ISLAND_RADIUS,
  playRadius: PLAY_RADIUS,
  plaza: true,
  houses: 38,
  towers: 16,
  colonnades: 14,
  brokenWalls: 18,
  rocks: 90,
  openChests: 16,
});

// Runs a builder up to `count` times; stops early when there is no room left.
function repeat(count, build) {
  for (let i = 0; i < count; i++) if (!build(i)) break;
}

/** True if a circle of radius r at (x, z) touches no box. */
export function isFree(grid, x, z, r) {
  return !grid.near(x, z, r).some(b => circleHitsBox(x, z, r, b));
}

/**
 * Generates the island. Same seed + same options = exactly the same island.
 *
 * @param {object} [options]
 * @param {number|string} [options.seed=20261020]
 * @param {number} [options.islandRadius=210]  size of the island (ground)
 * @param {number} [options.playRadius=195]    players stay inside this circle
 * @param {boolean} [options.plaza=true]       central plaza with a golden spot
 * @param {number} [options.houses=38]
 * @param {number} [options.towers=16]         every 3rd tower adds a golden spot
 * @param {number} [options.colonnades=14]
 * @param {number} [options.brokenWalls=18]
 * @param {number} [options.rocks=90]
 * @param {number} [options.openChests=16]
 * @returns {{ seed: number|string, islandRadius: number, playRadius: number,
 *   boxes: Array<{id:number,x:number,z:number,w:number,d:number,h:number,y:number,kind:string}>,
 *   chests: Array<{id:number,x:number,z:number}>,
 *   goldenSpots: Array<{x:number,z:number}>,
 *   grid: ReturnType<typeof createBoxGrid> }}
 */
export function generateIsland({ seed = DEFAULT_SEED, ...options } = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const { playRadius } = o;
  const ctx = createContext(createRandom(seed).next, { plazaClearRadius: o.plaza ? 18 : 0 });

  if (o.plaza) buildPlaza(ctx);
  repeat(o.houses, () => buildHouse(ctx, playRadius));
  repeat(o.towers, i => buildTower(ctx, playRadius, i));
  repeat(o.colonnades, () => buildColonnade(ctx, playRadius));
  repeat(o.brokenWalls, () => buildBrokenWall(ctx, playRadius));
  repeat(o.rocks, () => buildRock(ctx, playRadius));
  repeat(o.openChests, () => buildOpenChest(ctx, playRadius));

  const { boxes } = ctx;
  boxes.forEach((b, i) => (b.id = i));
  const grid = createBoxGrid(boxes, { cellSize: GRID_CELL_SIZE });

  // Drop any chest or golden spot that ended up inside a wall; number the chests.
  const chests = ctx.chests.filter(c => isFree(grid, c.x, c.z, CHEST_RADIUS));
  chests.forEach((c, i) => (c.id = i));
  const goldenSpots = ctx.goldenSpots.filter(g => isFree(grid, g.x, g.z, GOLDEN_SPOT_RADIUS));

  return { seed, islandRadius: o.islandRadius, playRadius, boxes, chests, goldenSpots, grid };
}
