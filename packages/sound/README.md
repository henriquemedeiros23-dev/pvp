# @pvp/sound

## What it does

All the game's sounds, made in code with the Web Audio API (oscillators, noise, envelopes, filters): no audio
files and no downloads (#55). One sound per gun (Gun pop, Shootbm crack, heavier DM Gun, big Supergun blast),
sword swing and hit, icy Ice Sword hit, Electric Sword zap, shield raise and clang, headshot ding, hit marker tick,
bomb throw, fuse and boom (bigger for the Legendary Bomb), chest creak, coins, golden chest fanfare, potion gulps
and heal chime, weapon break, knockout, pick up, soft footsteps, UI click and buy. Other players' sounds are 3D:
quieter far away and panned left / right from the camera, with a cap on how many play at once (phones).
A 🔊 mute button and a Sounds volume slider, saved per browser. (No music: the boss asked for none.)

It has two layers:

- **Pure** (Node and browser, unit tested): `SOUNDS` (every sound as a recipe: data), `planSound` (recipe + seeded
  random -> a list of voices with exact times, pitches, filters and envelopes), mixer math (`volumeToGain`,
  `masterGain`, `attenuation`, `spatialize`, `createVoiceLimiter`, `createFootsteps`, `noiseSamples`), settings
  (`loadSettings` / `saveSettings`, never throw) and `soundEventsFor` (which sounds a PvP Island server message makes).
- **Browser** (thin): `createSoundPlayer` plays plans with Web Audio; `attachSoundControls` wires 🔊 buttons and the
  slider; `unlockOnFirstGesture` starts audio on the first tap (browsers need one). No AudioContext = silent, no errors.

## How to use

```js
import { createSoundPlayer, unlockOnFirstGesture, attachSoundControls, soundEventsFor } from '@pvp/sound';

const sound = createSoundPlayer({ storage: localStorage, mobile: true }); // mobile: 8 sounds at once, else 16
unlockOnFirstGesture(sound);                                // audio starts on the first tap / click / key
attachSoundControls(sound, { muteButtons: [btnMenu, btnHud], settingsButton, panel, slider, sliderText, closeButton });

sound.play('click');                                        // my own sound: middle, full loudness
sound.setListener({ x: cam.x, z: cam.z, yaw });             // every frame (forward = (sin yaw, cos yaw))
sound.play('supergun', { pos: [x, y, z] });                 // someone else's: quieter far away, panned
sound.footsteps(dt, { speed: me.speed, onGround: me.onGround }); // every frame while playing
for (const e of soundEventsFor(msg, { myId, weaponOf, chestPos, chestOpen, golden })) sound.play(e.sound, { pos: e.pos ?? posOf(e.id), delayMs: e.delayMs });
sound.toggleMute(); sound.setSettings({ volume: 0.5 }); sound.stats(); // { state, played, dropped, counts, ... }

// pure parts, e.g. in a test:
planSound(SOUNDS.gun, { rng: createRandom(1) });            // { gain, dur, voices: [{ type, wave|color, start, end, freq, filter, env }] }
spatialize({ x: 0, z: 0, yaw: 0 }, [10, 0, 0]);             // { gain, pan, distance }
```

## Determinism

Partly deterministic. The recipes, the planner, the mixer math, footsteps, noise samples and the message mapping
are pure: the only randomness (the small pitch and loudness differences between plays, the noise) comes from a
seed (`@pvp/seeded-random`) and time is passed in, so the same seed and calls give exactly the same plans.
The browser player is only partly deterministic: when a sound really starts depends on the audio clock, the
browser and the user's first tap.
