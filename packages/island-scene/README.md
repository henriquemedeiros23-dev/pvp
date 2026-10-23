# @pvp/island-scene

## What it does

The three.js scenery of an island made by `@pvp/world-gen`: sky dome with a sun, lights and
shadows, grassy ground, a beach sloping into the sea, water, grass tufts, palms, the ruins
(light sandy stone with moss) and the treasure chests, including the golden chest with its beam.
When a chest opens, a few square gold coins (the boss's coin drawing, #29) jump out, spin and fade.

## How to use

```js
import * as THREE from 'three';
import { generateIsland } from '@pvp/world-gen';
import { createIslandScene } from '@pvp/island-scene';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 900); // far plane must be > the sky radius (600)
const island = createIslandScene({ island: generateIsland(), mobile: false, random: 'island-scene' });
island.addTo(scene);                 // adds island.group, sets scene.fog and scene.background

// every frame (dt and time in seconds, passed in); focus = the point the camera looks at
island.update(dt, time, { x: player.x, z: player.z });

island.chests.setOpen(3, true);      // the lid swings open in update(); isOpen(i), closeAll()
island.golden.show(x, z);            // golden chest with light beam; hide(), visible
island.popChestCoins(3);             // coins jump out of chest 3 (6, or 4 with mobile: true); update() moves them
island.popGoldenCoins(x, z);         // 2 more from the golden chest
```

**Coins** (`src/coins.js`): `buildCoin()` is one gold coin, 0.30 x 0.34 m and 5 cm thick, corners cut,
darker edges (the outline) and a "P" on both sides. `createCoinPops({ max = 12, random })` is a fixed pool of
coins (no shadows, nothing new is made while playing, so it is cheap on phones; when all are busy the oldest is
reused). Each coin jumps up and out, spins, bounces once on the ground and fades out in `COIN_POP.life` (1.2 s).
Colors are `COIN_COLORS` (the same yellow as the HUD coin icon in `@pvp/hud-model`), sizes `COIN_SIZE`.

Returned object: `{ group, fog, background, sun, hemi, water, sky, ground, beach, ruins, chests, golden, coinPops, popChestCoins, popGoldenCoins, update, addTo }`.
`coinPops` is the coin pool: `burst(x, y, z, { count })`, `update(dt)`, `active`, `clear()`.

- `sky`, `water` and the `sun`'s shadow box follow the `focus` point in `update()`. Keep the camera close to it.
- `chests.meshes[i]` is the model of `island.chests[i]`; each chest faces the island's center.
- Smaller pieces are exported too: `buildChest({ golden })`, `createChests({ chests })`,
  `createGoldenChest()`, `buildRuins({ boxes, random })`, `buildSky()`, `buildLights()`,
  `buildGround()`, `buildPlants()`, `noiseTexture(random, opts)`, `noisePixels(random, opts)`,
  and the constants `SKY`, `SUN_OFFSET`, `STONE_COLORS`, `CHEST_SIZE`, `LID_OPEN_ANGLE`, plus `buildCoin()`, `createCoinPops()`, `COIN_COLORS`, `COIN_SIZE`, `COIN_POP`.

A chest is 1.1 m wide (x), 0.75 m deep (z, front is +z) and 0.55 m high. The lid is a half
cylinder along the width, hinged at the back top edge, with the lock on its front.
`chest.userData.lid.rotation.x` goes from 0 (closed) to `LID_OPEN_ANGLE` (open, leaning back).

Works in Node too (no canvas needed: textures are `DataTexture`s), so tests can build the
whole scene. In the browser, add `@pvp/island-scene`, `@pvp/seeded-random`, `three` and
`three/addons/` to the import map.

Lessons from issue #17 (kept so they do not come back):
- The sky dome follows the camera and is smaller than the camera's far plane. A fixed dome
  poked out of the far plane when you stood near the island's edge, and the hole showed the
  black clear color. `scene.background` is the horizon color as a second safety net.
- Textures are almost white; the vertex/material color decides the brightness. A dark noise
  texture times a dark tint (in linear color) made the ruins nearly black.

## Determinism

Partly deterministic. Everything that is placed or colored at random (grass tufts, palms,
stone shades, moss, texture noise and cracks) comes from a seeded random
(`@pvp/seeded-random`, one fork per part), so the same seed and island always give the same
scenery, in Node and the browser. No `Math.random`. Time is passed in to `update()`.
Coin pops use their own seeded stream too: the same seed and the same `dt` steps give the same coin paths.
How it finally looks on screen depends on the renderer and the GPU.
