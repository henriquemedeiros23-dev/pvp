# @pvp/seeded-random

## What it does

Deterministic random numbers from a seed (mulberry32): same seed, same numbers,
in Node and in the browser. Helpers for ranges, integers, chance, pick,
shuffle, separate streams (`fork`) and save/restore. No dependencies.

## How to use

```js
import { createRandom } from '@pvp/seeded-random';
// In the browser without a bundler, import the file directly:
// import { createRandom } from './packages/seeded-random/src/index.js';

const r = createRandom(20261020);    // or a string: createRandom('island-1')
r.next();             // float in [0, 1)
r.range(-5, 5);       // float in [min, max)
r.int(1, 6);          // integer, both ends included
r.chance(0.25);       // true about 25% of the time
r.pick(['a', 'b']);   // one element
r.shuffle([1, 2, 3]); // new shuffled array (input untouched)

const loot = r.fork('loot');                  // own stream for one system
const saved = r.state();                      // plain number, JSON-safe
const again = createRandom.fromState(saved);  // continues the same sequence
```

## Determinism

Fully deterministic. No `Math.random`, no time, no globals: the output depends
only on the seed and the calls made. A numeric seed gives exactly the same
sequence as the `rng` in `apps/game/shared/world.js`, so the island map does
not change. String seeds are hashed with FNV-1a (32-bit).

`fork(label)` derives a new generator from the current state and the label
without advancing the parent. The order of calls matters: one extra draw
changes everything after it, so separate systems should use their own `fork`.
