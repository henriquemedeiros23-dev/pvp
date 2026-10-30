import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '@pvp/seeded-random';
import { SOUNDS, SOUND_NAMES, planSound, SILENT } from '../src/index.js';

const NEEDED = ['gun', 'shootbm', 'dmgun', 'supergun', 'swing', 'swordHit', 'iceHit', 'zapHit', 'zap', 'shieldUp', 'shieldBlock',
  'headshot', 'hitmark', 'hit', 'hurt', 'knockout', 'weaponBreak', 'bombThrow', 'fuse', 'boom', 'bigBoom', 'chestOpen', 'coins',
  'goldenChest', 'goldenAppear', 'drink', 'heal', 'pickup', 'footstep', 'click', 'buy'];

test('every sound the game needs has a recipe', () => {
  for (const n of NEEDED) assert.ok(SOUND_NAMES.includes(n), n);
});

test('recipes are frozen data with sane numbers', () => {
  assert.ok(Object.isFrozen(SOUNDS) && Object.isFrozen(SOUNDS.gun.parts[0]));
  for (const [name, r] of Object.entries(SOUNDS)) {
    assert.ok(r.gain > 0 && r.gain <= 1, name);
    assert.ok(r.priority >= 0 && r.priority <= 3, name);
    for (const p of r.parts) {
      assert.ok(!!p.osc !== !!p.noise, `${name}: osc or noise`);
      assert.ok(p.dur > 0 && p.dur <= 2, `${name}: dur`);
      if (p.osc) assert.ok(p.freq || p.notes, `${name}: pitch`);
    }
  }
});

test('plans are valid: times in order, envelopes end silent, frequencies positive', () => {
  const rng = createRandom(1);
  for (const [name, r] of Object.entries(SOUNDS)) {
    const plan = planSound(r, { rng });
    assert.ok(plan.voices.length >= r.parts.length, name);
    for (const v of plan.voices) {
      assert.ok(v.end > v.start && v.start >= 0, name);
      assert.equal(v.env[0][1], 0);
      assert.equal(v.env.at(-1)[1], SILENT);
      assert.equal(v.env.at(-1)[0], v.end);
      for (let i = 1; i < v.env.length; i++) assert.ok(v.env[i][0] >= v.env[i - 1][0], `${name}: env times`);
      if (v.freq) assert.ok(v.freq.every(x => x > 0), name);
      if (v.filter) assert.ok(v.filter.freq.every(x => x > 0), name);
    }
    assert.ok(plan.dur >= Math.max(...plan.voices.map(v => v.end)));
  }
});

test('same seed, same plan; another seed, a little different', () => {
  const a = planSound(SOUNDS.gun, { rng: createRandom('s') });
  const b = planSound(SOUNDS.gun, { rng: createRandom('s') });
  const c = planSound(SOUNDS.gun, { rng: createRandom('t') });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  // without an rng there is no jitter at all
  assert.deepEqual(planSound(SOUNDS.gun), planSound(SOUNDS.gun));
  assert.equal(planSound(SOUNDS.gun).voices[1].freq[0], 420);
});

test('jitter stays inside the recipe limits', () => {
  const rng = createRandom(9);
  for (let i = 0; i < 200; i++) {
    const p = planSound(SOUNDS.footstep, { rng });
    const f = p.voices[1].freq[0];
    assert.ok(f >= 110 * 0.85 - 1e-6 && f <= 110 * 1.15 + 1e-6, String(f));
    assert.ok(p.gain <= SOUNDS.footstep.gain && p.gain >= SOUNDS.footstep.gain * 0.75 - 1e-4);
  }
});

test('notes become one voice each, `every` seconds apart; slide bends them', () => {
  const p = planSound(SOUNDS.drink);
  assert.equal(p.voices.length, 3);
  assert.deepEqual(p.voices.map(v => v.start), [0, 0.32, 0.64]);
  assert.deepEqual(p.voices[0].freq, [330, 181.5]);
  const chord = planSound(SOUNDS.goldenChest).voices.filter(v => v.wave === 'triangle');
  assert.ok(chord.every(v => v.start === 0.5)); // every: 0 = a chord
});

test('hold keeps the peak; the extra gain multiplies in', () => {
  const v = planSound(SOUNDS.fuse).voices[0];
  assert.equal(v.env.length, 4);
  assert.equal(v.env[1][1], v.env[2][1]);
  assert.equal(planSound(SOUNDS.boom, { gain: 0.5 }).gain, SOUNDS.boom.gain * 0.5);
  assert.throws(() => planSound(null));
});
