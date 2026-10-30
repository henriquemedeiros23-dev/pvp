import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '@pvp/seeded-random';
import { volumeToGain, masterGain, attenuation, spatialize, createVoiceLimiter, createFootsteps, noiseSamples } from '../src/index.js';

test('volume math: squared slider, muted is 0, bad values are safe', () => {
  assert.equal(volumeToGain(0), 0);
  assert.equal(volumeToGain(1), 1);
  assert.equal(volumeToGain(0.5), 0.25);
  assert.equal(volumeToGain(2), 1);
  assert.equal(volumeToGain(-1), 0);
  assert.equal(volumeToGain(NaN), 0);
  assert.equal(masterGain({ muted: true, volume: 1 }), 0);
  assert.equal(masterGain({ muted: false, volume: 0.5 }), 0.25);
  assert.equal(masterGain(null), 0);
});

test('attenuation: full up close, falls off, silent far away, never goes up', () => {
  assert.equal(attenuation(0), 1);
  assert.equal(attenuation(4), 1);
  assert.equal(attenuation(50), 0);
  assert.equal(attenuation(500), 0);
  assert.equal(attenuation(NaN), 0);
  let last = 1;
  for (let d = 0; d <= 60; d += 0.5) {
    const g = attenuation(d);
    assert.ok(g <= last + 1e-12 && g >= 0, `d=${d}`);
    last = g;
  }
  assert.ok(attenuation(8) > 0.4 && attenuation(8) < 0.5);
  assert.equal(attenuation(10, { ref: 10, max: 20 }), 1);
});

test('spatialize: my own sounds in the middle; left and right from the camera', () => {
  assert.deepEqual(spatialize({ x: 0, z: 0, yaw: 0 }, null), { gain: 1, pan: 0, distance: 0 });
  // yaw 0 looks along +z; right on the screen is (-1, 0)
  const L = { x: 0, z: 0, yaw: 0 };
  assert.ok(spatialize(L, [-10, 0, 0]).pan > 0.8, 'right');
  assert.ok(spatialize(L, [10, 0, 0]).pan < -0.8, 'left');
  assert.equal(spatialize(L, [0, 0, 10]).pan, 0, 'in front');
  assert.equal(spatialize(L, [0, 0, -10]).pan, 0, 'behind');
  // turned around (yaw PI): left and right swap
  assert.ok(spatialize({ x: 0, z: 0, yaw: Math.PI }, [-10, 0, 0]).pan < -0.8);
  // very close: almost in the middle
  assert.ok(Math.abs(spatialize(L, [-0.5, 0, 0]).pan) < 0.15);
  const far = spatialize(L, { x: 0, z: 30 });
  assert.equal(far.distance, 30);
  assert.equal(far.gain, attenuation(30));
});

test('voice cap: at most max sounds; the least important oldest gives way', () => {
  const lim = createVoiceLimiter({ max: 3 });
  const a = lim.request({ now: 0, dur: 1000, priority: 0, name: 'footstep' });
  const b = lim.request({ now: 10, dur: 1000, priority: 1, name: 'swing' });
  const c = lim.request({ now: 20, dur: 1000, priority: 2, name: 'gun' });
  assert.ok(a.ok && b.ok && c.ok);
  assert.equal(lim.count(30), 3);
  const d = lim.request({ now: 30, dur: 1000, priority: 2, name: 'boom' });
  assert.ok(d.ok);
  assert.deepEqual(d.steal, [a.id]); // the footstep stops
  const e = lim.request({ now: 40, dur: 1000, priority: 0, name: 'footstep' });
  assert.deepEqual(e, { ok: false, reason: 'full' }); // a footstep does not stop a gun
  assert.equal(lim.count(40), 3);
  assert.equal(lim.count(5000), 0); // all finished
});

test('voice cap: same sound again too soon is skipped (minGapMs)', () => {
  const lim = createVoiceLimiter({ max: 10 });
  assert.ok(lim.request({ now: 0, dur: 100, name: 'headshot', minGapMs: 150 }).ok);
  assert.equal(lim.request({ now: 100, dur: 100, name: 'headshot', minGapMs: 150 }).reason, 'gap');
  assert.ok(lim.request({ now: 100, dur: 100, name: 'ding', minGapMs: 150 }).ok);
  assert.ok(lim.request({ now: 160, dur: 100, name: 'headshot', minGapMs: 150 }).ok);
  lim.clear();
  assert.equal(lim.count(160), 0);
});

test('footsteps: faster when running, none when standing or in the air, a step on landing', () => {
  const count = (speed, seconds, onGround = true) => {
    const f = createFootsteps();
    let n = 0;
    for (let t = 0; t < seconds; t += 1 / 60) if (f.step(1 / 60, { speed, onGround })) n++;
    return n;
  };
  assert.equal(count(0, 3), 0);
  assert.equal(count(6, 3, false), 0);
  const walk = count(3, 3), run = count(6, 3);
  assert.ok(walk >= 5 && walk <= 9, `walk ${walk}`);
  assert.ok(run > walk, `run ${run}`);
  const f = createFootsteps();
  f.step(0.016, { speed: 0, onGround: false });
  const land = f.step(0.016, { speed: 0, onGround: true });
  assert.ok(land && land.gain === 1);
  // feet take turns
  const g = createFootsteps();
  const feet = [];
  for (let i = 0; i < 400 && feet.length < 4; i++) { const s = g.step(1 / 60, { speed: 5 }); if (s) feet.push(s.foot); }
  assert.deepEqual(feet, [1, 0, 1, 0]);
});

test('noise samples: in range, seeded, three colors', () => {
  for (const c of ['white', 'pink', 'brown']) {
    const a = noiseSamples(c, 4000, createRandom(3));
    const b = noiseSamples(c, 4000, createRandom(3));
    assert.deepEqual(a, b, c);
    assert.ok(a.every(x => x >= -1 && x <= 1), c);
    assert.ok(a.some(x => Math.abs(x) > 0.05), `${c} not silent`);
  }
});
