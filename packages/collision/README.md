# @pvp/collision

## What it does

Collision and movement math for a world made of boxes: a spatial grid, circle
vs box, player movement (walls, step up, jump, landing, gravity), rays vs boxes
and the ground, and rays vs a standing player (a cylinder). Pure functions, no
dependencies, works in Node and directly in the browser.

## How to use

```js
import {
  createBoxGrid, circleHitsBox, movePlayer, rayBoxes, rayBox, rayCylinder,
} from '@pvp/collision';
// In the browser without a bundler, import the file directly:
// import { createBoxGrid } from './packages/collision/src/index.js';

// A box is { x, z, w, d, h, y }: centered on x/z, from y up to y + h.
// Extra fields (id, kind, ...) are kept and ignored.
const grid = createBoxGrid(boxes, { cellSize: 10 });

grid.near(x, z, 2);                 // boxes near (x, z): each once, in input order
circleHitsBox(x, z, 0.45, box);     // true if the circle overlaps the box footprint

// The game passes its own numbers in (nothing is hard-coded here).
const body = { x: 0, y: 0, z: 0, vy: 0, onGround: true };
movePlayer(grid, body, dx, dz, dt, {
  radius: 0.45, height: 1.85, stepHeight: 0.55, gravity: 24,
  boundsRadius: 195,                // optional: stay inside this circle around 0,0
});                                 // mutates and returns body

// Points and directions are { x, y, z } objects. Use a unit dir to get meters.
const origin = { x: 0, y: 1.5, z: 0 }, dir = { x: 1, y: 0, z: 0 };
rayBoxes(grid, origin, dir, 120);   // nearest box or ground (y = 0), else Infinity
rayBox(origin, dir, box);           // one box: distance, 0 if inside, or Infinity
rayCylinder(origin, dir, { x, y, z, height: 1.85, radius: 0.55 }); // a player
```

Notes:
- `movePlayer` cuts the move into sub-steps of 0.3 m so fast moves cannot pass
  through thin walls, pushes out of boxes along the shortest axis, steps onto
  boxes whose top is within `stepHeight`, and lands on box tops or the ground.
- `rayBoxes` walks the grid cells along the ray in order and stops as soon as no
  later cell can hold a nearer hit, so it never misses a box (also boxes larger
  than a cell) and stays fast. It returns `Infinity` (not `maxDist`) when nothing
  is hit within `maxDist`.
- `rayCylinder` only tests the side of the cylinder: a ray over the head misses,
  and a perfectly vertical ray never hits.
- The grid keeps a reference to the boxes; build a new grid if boxes move.

## Determinism

Fully deterministic. No randomness, no time, no globals: same inputs give the
same outputs. `near()` returns boxes in the order they were given, so movement
resolves walls in a fixed order. With the same numbers, `movePlayer` behaves
exactly like the old code in `apps/game/shared/world.js`.
