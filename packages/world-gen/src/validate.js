// Sanity checks for a generated island.

import { createBoxGrid, circleHitsBox } from '@pvp/collision';
import { CHEST_RADIUS, GOLDEN_SPOT_RADIUS, GRID_CELL_SIZE } from './generate.js';

/**
 * Looks for problems in an island. An empty array means the map is fine.
 * Chests need CHEST_RADIUS (0.8 m) of free room; for golden spots only the
 * center is checked (GOLDEN_SPOT_RADIUS).
 * Each problem is { type, message, ...details } with type one of:
 * 'chest-inside-box', 'box-outside-island', 'golden-spot-inside-box',
 * 'duplicate-box-id', 'duplicate-chest-id'.
 *
 * @param {{ islandRadius: number, boxes: any[], chests: any[], goldenSpots: any[], grid?: any }} island
 * @returns {Array<{ type: string, message: string }>}
 */
export function validateIsland(island) {
  const problems = [];
  const { boxes = [], chests = [], goldenSpots = [], islandRadius } = island;
  const grid = island.grid ?? createBoxGrid(boxes, { cellSize: GRID_CELL_SIZE });
  const hits = (x, z, r) => grid.near(x, z, r).filter(b => circleHitsBox(x, z, r, b));

  for (const c of chests) {
    for (const b of hits(c.x, c.z, CHEST_RADIUS)) {
      problems.push({ type: 'chest-inside-box', chestId: c.id, boxId: b.id,
        message: `chest ${c.id} at (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) is inside box ${b.id} (${b.kind})` });
    }
  }

  for (const g of goldenSpots) {
    for (const b of hits(g.x, g.z, GOLDEN_SPOT_RADIUS)) {
      problems.push({ type: 'golden-spot-inside-box', spot: { x: g.x, z: g.z }, boxId: b.id,
        message: `golden spot at (${g.x.toFixed(1)}, ${g.z.toFixed(1)}) is inside box ${b.id} (${b.kind})` });
    }
  }

  if (Number.isFinite(islandRadius)) {
    for (const b of boxes) {
      // farthest footprint corner from the center
      const far = Math.hypot(Math.abs(b.x) + b.w / 2, Math.abs(b.z) + b.d / 2);
      if (far > islandRadius) {
        problems.push({ type: 'box-outside-island', boxId: b.id,
          message: `box ${b.id} (${b.kind}) reaches ${far.toFixed(1)} m, island radius is ${islandRadius}` });
      }
    }
  }

  const dupes = (list, type, what) => {
    const seen = new Set();
    for (const item of list) {
      if (seen.has(item.id)) problems.push({ type, id: item.id, message: `duplicate ${what} id ${item.id}` });
      seen.add(item.id);
    }
  };
  dupes(boxes, 'duplicate-box-id', 'box');
  dupes(chests, 'duplicate-chest-id', 'chest');

  return problems;
}
