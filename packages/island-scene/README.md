# @pvp/island-scene

## What it does

The three.js scenery of an island made by `@pvp/world-gen`: sky dome with a sun glow and clouds, a warm sun
with soft sky light (and shadows on desktop), a green grass ground with lighter and darker patches, worn
dirt around the ruins and a few winding paths, grass tufts, flowers, bushes and rocks, a beach going from
dry light sand to darker wet sand with a foam line, water with drifting waves, palms, the ruins
(light sandy stone with moss on top and damp, greener feet) and the treasure chests, including the golden chest with its beam.
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

Returned object: `{ group, fog, background, sun, hemi, water, sky, ground, beach, foam, field, plants, mobile, ruins, chests, golden, coinPops, popChestCoins, popGoldenCoins, update, addTo }`.

**The ground (#43)** (`src/ground-field.js`, `src/environment.js`): `createGroundField({ islandRadius, boxes, random, size })`
works out, on a grid, how lush the grass is, where the dirt is (0.5 to 2.5 m around every ruin, plus a few
1.6 m wide winding paths) and where the sand starts; `field.sample(x, z)` reads it. `field.colorPixels()` turns it
into the big ground texture (`GROUND_COLORS`). The ground's shader multiplies in a small tiling grass detail
texture (`grassDetailPixels`: short blade strokes, 3.2 m per repeat; desktop mixes in a second, 3.7x bigger copy so
no repeats show, plus a normal map for small bumps). There is less detail on dirt and sand (the color texture's alpha).
Everything is made from numbers in code: no image files, no network.

**Plants** (`src/plants.js`): `buildPlants({ islandRadius, random, mobile, boxes, chests, field, counts })` makes one
instanced mesh each for `tufts`, `flowers`, `bushes` and `rocks` (counts in `PLANT_COUNTS`), placed in clumps with the
field: no grass on paths or dirt, flowers in small patches of one color, bushes and rocks mostly near the ruins,
nothing inside a ruin, no bush or rock on a chest. Bushes are lower than 1.2 m. All decoration only: no collision.

**Water and beach**: `WATER` has the water's level, bob, color and wave size. `updateWater(ground, time, focus)` (called by
`update()`) moves the water with the focus point, lets the wave normal map drift with time but stay put in the world,
and moves the foam line in and out with the water.

**Phones** (`mobile: true`): about 30% of the plants, fewer clouds, 256 px ground texture (512 desktop), 128 px detail
(256), one detail layer, no normal map on the ground, Lambert materials (cheaper than Standard) and **no shadows**
(`sun.castShadow` is false, so the shadow pass is skipped). Building the scene takes about 0.15 s in Node on phones' settings
(0.25 s desktop settings); drawing is one instanced draw call per plant kind.
`coinPops` is the coin pool: `burst(x, y, z, { count })`, `update(dt)`, `active`, `clear()`.

- `sky`, `water` and the `sun`'s shadow box follow the `focus` point in `update()`. Keep the camera close to it.
- `chests.meshes[i]` is the model of `island.chests[i]`; each chest faces the island's center.
- Smaller pieces are exported too: `buildChest({ golden })`, `createChests({ chests })`,
  `createGoldenChest()`, `buildRuins({ boxes, random })`, `buildSky()`, `buildLights()`,
  `buildGround()`, `buildPlants()`, `updateWater()`, `createGroundField()`, `noiseTexture(random, opts)`, `noisePixels(random, opts)`,
  `grassDetailPixels()`, `grassDetailTextures()`, `heightToNormalPixels()`, `waterNormalTexture()`, `dataTexture()`, `fbm()`, `valueNoise()`,
  and the constants `SKY`, `SUN_OFFSET`, `WATER`, `GROUND_COLORS`, `PLANT_COUNTS`, `STONE_COLORS`, `CHEST_SIZE`, `LID_OPEN_ANGLE`, plus `buildCoin()`, `createCoinPops()`, `COIN_COLORS`, `COIN_SIZE`, `COIN_POP`.

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

Lessons from issue #43:
- The grass detail texture is greenish, so its brightness is normalized **per color channel** (`gain`).
  With one gain for all channels it pushed the green channel over 1 and the grass turned neon.
- Real grass is darker than it looks: with the sun and sky light the ground colors in `GROUND_COLORS` already end up bright.

## Determinism

Partly deterministic. Everything that is placed or colored at random (the ground field and its textures,
grass tufts, flowers, bushes, rocks, palms, clouds, stone shades, moss, texture noise and cracks) comes from a seeded random
(`@pvp/seeded-random`, one fork per part), so the same seed and island always give the same
scenery, in Node and the browser. No `Math.random`. Time is passed in to `update()` (the water's bob, waves and foam are pure functions of time and focus).
`mobile: true` gives a different (lighter) but just as seeded scenery.
Coin pops use their own seeded stream too: the same seed and the same `dt` steps give the same coin paths.
How it finally looks on screen depends on the renderer and the GPU.
