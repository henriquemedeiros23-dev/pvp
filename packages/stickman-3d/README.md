# @pvp/stickman-3d

## What it does

A three.js stickman character: body in a skin color or pattern (gold, zebra stripes, rainbow), outfits (hats, face items, capes, shirts), a weapon in the right hand, and walk / crouch / slide / jump / aim / swing animation. The animation math is a pure function, `computePose()`, that can be tested without three.js.

## How to use

```js
import * as THREE from 'three';
import { Stickman, buildWeapon, computePose } from '@pvp/stickman-3d';

const sm = new Stickman({ color: 'rainbow', hat: 'crown', face: 'none', back: 'redcape', shirt: 'none' });
scene.add(sm.root);
sm.setWeapon('rifle');      // or null for empty hands

// every frame (dt and time in seconds, time is passed in)
sm.animate(dt, { speed, crouch, slide, air, pitch }, time);
sm.recoil = 1;              // when a gun fires
sm.swing = 1;               // when a melee weapon swings

sm.dispose();               // frees the geometries and materials it made (and its weapon)

const loot = buildWeapon('rocket');   // a loose weapon model (THREE.Group); you dispose it
```

Options for another game: `new Stickman(skin, { colors, weapons, limbRadius = 0.075, castShadow = true })`.
`colors` is `{ id: { color, pattern?, eyes? } }` and `weapons` is `{ id: { type } }`; both default to `COLORS` / `WEAPONS` from `@pvp/game-rules`.
`buildWeapon(id, { weapons, castShadow })` takes the same table.

Weapon models: the current weapon ids keep their own special models. Any other id (or a known id whose `type` changed) gets a generic model for its `type`: `melee`, `gun`, `throw`, `rocket` or `mine` (an unknown type looks like melee). Generic melee and gun models get longer with `range`, and use the weapon's `color` if it has one. An id missing from the table gives an empty group. `weaponModelKind(id, weapons)` tells which model is used.

Pure pose: `computePose(state, prev, dt)` with `state = { speed, crouch, slide, air, pitch, time, weaponType, swing, recoil }` returns `{ walk, hipY, lean, legL, legR, headX, armL: {x, z}, armR: {x, z}, cape }`. Pass the last pose as `prev` (or `null` to start from `restPose()`). `stickman.applyPose(pose)` puts a body in a pose.

**Importing `three`:** `three` is a peer dependency (the game uses `three@0.170.0`). In Node the bare import `three` comes from `node_modules`. In the browser without a bundler, add an import map so `three` and `@pvp/game-rules` resolve, for example:

```html
<script type="importmap">
{ "imports": {
  "three": "/vendor/three/build/three.module.js",
  "@pvp/game-rules": "/packages/game-rules/src/index.js",
  "@pvp/stickman-3d": "/packages/stickman-3d/src/index.js"
} }
</script>
```

Nothing touches `document` at import time. The zebra stripes canvas texture is made the first time a zebra skin is built, and only if a DOM canvas exists; in Node zebra falls back to a plain material.

## Determinism

Partly deterministic. `computePose()`, `rainbowHue()` and `weaponModelKind()` are pure: same input, same output, no randomness, time is passed in. The three.js objects built from them are deterministic too, but how they look on screen depends on the renderer (graphics).
