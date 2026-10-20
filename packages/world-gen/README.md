# @pvp/world-gen

## What it does

Builds the island of ruins (plaza, houses, towers, colonnades, broken walls,
rocks, chests, golden chest spots) from a seed, picks free spawn points and
checks a map for problems. With the default seed and options it builds exactly
the map the game uses today. Depends on `@pvp/seeded-random` and `@pvp/collision`.

## How to use

```js
import { generateIsland, findSpawn, validateIsland } from '@pvp/world-gen';
import { createRandom } from '@pvp/seeded-random';

const island = generateIsland();               // seed 20261020: today's map
// { seed, islandRadius, playRadius, boxes, chests, goldenSpots, grid }
// boxes:  { id, x, z, w, d, h, y, kind }  kind: 'pillar' | 'wall' | 'tower' | 'rubble'
// chests: { id, x, z }   goldenSpots: { x, z }   grid: createBoxGrid(boxes) from @pvp/collision

// Tune it for another game (any option left out keeps its default):
const small = generateIsland({
  seed: 'my-map',
  islandRadius: 100, playRadius: 90,
  plaza: true,
  houses: 10, towers: 4, colonnades: 3, brokenWalls: 5, rocks: 30, openChests: 6,
});

// Spawn point: free of boxes, >= 25 m from occupied spots when possible.
const random = createRandom(1234);             // or a () => number
const spot = findSpawn(island, players, random, { minDistanceFromOthers: 25, tries: 100 });

validateIsland(island);  // [] when fine, else [{ type, message, ... }]
// types: chest-inside-box, golden-spot-inside-box, box-outside-island,
//        duplicate-box-id, duplicate-chest-id
```

Notes:
- Defaults: radius 210 / play radius 195, plaza on, 38 houses, 16 towers,
  14 colonnades, 18 broken walls, 90 rocks, 16 open-field chests. Counts are
  maximums: a builder stops early when it cannot find a free place.
- Every third tower (1st, 4th, 7th, ...) adds a golden spot; the plaza adds one at (0, 0).
- Chests with less than 0.8 m of free room are dropped, and golden spots whose
  center is inside a box are dropped, so `validateIsland` finds nothing on a fresh island.
- Each builder lives in `src/builders/` (plaza, house, tower, colonnade, wall, rocks, openChests).

## Determinism

Fully deterministic. All randomness comes from `createRandom(seed)`; no
`Math.random`, no time, no globals. Same seed and options give the same island
in Node and the browser. `findSpawn` needs a seeded random passed in, so the same
random state gives the same spot. Changing any option (or the order of builders)
changes the rest of the map, because the builders share one random stream.
