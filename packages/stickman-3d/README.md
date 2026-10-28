# @pvp/stickman-3d

## What it does

A three.js stickman character: body in a skin color or pattern (gold, zebra stripes, rainbow), outfits (hats like the Demon Horns, face items, capes, shirts), a weapon in the right hand, a shield on the left arm (raised in front or lowered), frozen and shocked looks, and walk / crouch / slide / jump / aim / swing animation. Weapon models follow the boss's cards. The animation math is a pure function, `computePose()`, that can be tested without three.js.

## How to use

```js
import * as THREE from 'three';
import { Stickman, buildWeapon, buildPotion, holdPotion, computePose } from '@pvp/stickman-3d';

const sm = new Stickman({ color: 'rainbow', hat: 'crown', face: 'none', back: 'redcape', shirt: 'none' });
scene.add(sm.root);
sm.setWeapon('icesword');   // or null for empty hands
sm.setShield('megashield'); // on the left arm, or null
sm.shieldUp = true;         // raise it (it moves up smoothly in animate)
sm.setStatus({ frozen: true, shocked: false }); // ice-blue in an ice block (and stuck) / yellow lightning

// every frame (dt and time in seconds, time is passed in)
sm.animate(dt, { speed, crouch, slide, air, pitch }, time);
sm.recoil = 1;              // when a gun fires
sm.swing = 1;               // when a melee weapon swings

sm.dispose();               // frees the geometries and materials it made (and its weapon)

const loot = buildWeapon('supersword'); // a loose weapon model (THREE.Group); you dispose it
loot.userData.update?.(time);          // animated parts (lightning, snowflakes, glowing dots), time in seconds

const flask = buildPotion();          // the Healing Potion (#28): cork, narrow neck, glass cone with red liquid
holdPotion(sm, true);                 // drinking: the potion in the right hand (weapon hidden); false = back to the weapon

const bomb = buildBomb('legendarybomb'); // a round bomb with a curly fuse (#32): black Bomb, gold Legendary Bomb
bomb.userData.update(time);           // the spark on the fuse blinks
const area = buildBombArea(5);        // the RED 5x5 m square on the ground where a bomb will explode (pulses with update(time))
```

Options for another game: `new Stickman(skin, { colors, weapons, limbRadius = 0.075, castShadow = true })`.
`colors` is `{ id: { color, pattern?, eyes? } }` and `weapons` is `{ id: { type } }`; both default to `COLORS` / `WEAPONS` from `@pvp/game-rules`.
`buildWeapon(id, { weapons, castShadow })` takes the same table.

Weapon models (close to the boss's drawings, see `docs/screenshots/weapons.png`): the **Gun** (starting weapon) is a detailed L-shaped pistol. The **DM Gun** is a long gun with an angled stock, a long
straight barrel, a big round trigger guard and a purple strip. The **Supergun** looks like a revolver: a stepped grip at the
back, a gold drum and a long straight barrel. **Shootbm** is a long gun: one long straight body, a stepped wooden stock at the back and a round ring sight on top near the front. The **Electric Sword** has a long thin straight blade, a small guard and handle, and flickering yellow lightning bolts around it. The **Ice Sword** is a thin tapered icy blade with turning blue snowflakes. The **Supersword** (Megalegend) has a very long thin black blade with glowing blue edges, a small blue diamond guard and a long handle. The **Shield** is a square plate with "P.V.P" in block letters (made of boxes, no font), the **Mega Shield** the same in gold with pulsing glowing dots around it and a sparkle. Shields face +z with up +y in their own frame (`buildShieldModel`); `Stickman.setShield` puts them on the left arm. Any other id (or a known id whose `type` changed) gets a generic model for its `type`: `melee`, `gun` or `shield` (an unknown type looks like melee). Generic melee and gun models get longer with `range`, and use the weapon's `color` if it has one. An id missing from the table gives an empty group. `weaponModelKind(id, weapons)` tells which model is used.

Pure pose: `computePose(state, prev, dt)` with `state = { speed, crouch, slide, air, pitch, time, weaponType, swing, recoil, shield }` (`shield` 0..1 = how far the shield is raised; the left arm goes to `SHIELD_ARM`) returns `{ walk, hipY, lean, legL, legR, headX, armL: {x, z}, armR: {x, z}, cape }`. Pass the last pose as `prev` (or `null` to start from `restPose()`). `stickman.applyPose(pose)` puts a body in a pose.

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

Partly deterministic. `computePose()`, `rainbowHue()` and `weaponModelKind()` are pure: same input, same output, no randomness, time is passed in (also to the weapons' `userData.update(time)`, so the lightning and glow look the same for the same time). The three.js objects built from them are deterministic too, but how they look on screen depends on the renderer (graphics).
