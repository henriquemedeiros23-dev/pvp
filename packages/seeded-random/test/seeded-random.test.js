import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, hashString } from '../src/index.js';

const take = (r, n) => Array.from({ length: n }, () => r.next());

test('same seed gives identical sequences', () => {
  assert.deepEqual(take(createRandom(42), 100), take(createRandom(42), 100));
});

test('different seeds give different sequences', () => {
  assert.notDeepEqual(take(createRandom(1), 10), take(createRandom(2), 10));
});

test('matches the game world rng for seed 20261020', () => {
  // Values produced by rng(20261020) in the old apps/game/shared/world.js (the island map seed).
  assert.deepEqual(take(createRandom(20261020), 5), [
    0.264247833751142,
    0.23858783044852316,
    0.8627477055415511,
    0.5152081535197794,
    0.44330049329437315,
  ]);
});

test('next() is in [0, 1) and range() stays in bounds', () => {
  const r = createRandom(7);
  for (let i = 0; i < 10000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1);
    const x = r.range(-5, 3);
    assert.ok(x >= -5 && x < 3);
  }
});

test('int() bounds are inclusive and never exceeded', () => {
  const r = createRandom(123);
  const seen = new Set();
  for (let i = 0; i < 20000; i++) {
    const v = r.int(1, 6);
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 6, `out of bounds: ${v}`);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6]);
  for (let i = 0; i < 5000; i++) {
    const v = r.int(-3, 3);
    assert.ok(v >= -3 && v <= 3);
  }
  assert.equal(r.int(4, 4), 4);
  assert.throws(() => r.int(5, 1), RangeError);
  assert.throws(() => r.int(1.5, 3), TypeError);
});

test('chance() respects 0 and 1 and is roughly fair', () => {
  const r = createRandom(9);
  let hits = 0;
  for (let i = 0; i < 10000; i++) {
    assert.equal(r.chance(0), false);
    assert.equal(r.chance(1), true);
    if (r.chance(0.3)) hits++;
  }
  assert.ok(hits > 2700 && hits < 3300, `hits=${hits}`);
});

test('pick() returns an element of the array', () => {
  const r = createRandom('pick');
  const arr = ['a', 'b', 'c'];
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const v = r.pick(arr);
    assert.ok(arr.includes(v));
    seen.add(v);
  }
  assert.equal(seen.size, 3);
  assert.throws(() => r.pick([]), RangeError);
});

test('shuffle() keeps the same elements and does not modify the input', () => {
  const r = createRandom(5);
  const input = Array.from({ length: 50 }, (_, i) => i);
  const copy = input.slice();
  const out = r.shuffle(input);
  assert.deepEqual(input, copy);
  assert.notEqual(out, input);
  assert.deepEqual(out.slice().sort((a, b) => a - b), copy);
  assert.notDeepEqual(out, copy);
  assert.deepEqual(createRandom(5).shuffle(input), out);
});

test('fork() is deterministic and independent', () => {
  const a = createRandom(99);
  const b = createRandom(99);
  assert.deepEqual(take(a.fork('loot'), 20), take(b.fork('loot'), 20));

  // Forking and using the fork does not advance or affect the parent.
  const parent = createRandom(99);
  const child = parent.fork('loot');
  take(child, 30);
  assert.deepEqual(take(parent, 20), take(createRandom(99), 20));

  // Different labels give different streams, and differ from the parent.
  const p = createRandom(99);
  const loot = take(p.fork('loot'), 10);
  const world = take(p.fork('world'), 10);
  assert.notDeepEqual(loot, world);
  assert.notDeepEqual(loot, take(createRandom(99), 10));

  // Same label at a different parent state gives a different stream.
  const q = createRandom(99);
  q.next();
  assert.notDeepEqual(take(q.fork('loot'), 10), loot);
});

test('state() and fromState() continue the same sequence', () => {
  const r = createRandom('save me');
  take(r, 17);
  const saved = r.state();
  const expected = take(r, 50);
  const restored = createRandom.fromState(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(take(restored, 50), expected);
  assert.throws(() => createRandom.fromState('nope'), TypeError);
});

test('string seeds work and are deterministic', () => {
  assert.deepEqual(take(createRandom('island'), 20), take(createRandom('island'), 20));
  assert.notDeepEqual(take(createRandom('island'), 20), take(createRandom('arena'), 20));
  assert.equal(hashString(''), 0x811c9dc5);
  assert.equal(hashString('a'), 0xe40c292c); // FNV-1a 32-bit reference value
  assert.throws(() => createRandom(NaN), TypeError);
  assert.throws(() => createRandom({}), TypeError);
});
