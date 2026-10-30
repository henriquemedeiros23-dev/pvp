// The browser player with a tiny fake AudioContext: checks the wiring without a browser or speakers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSoundPlayer, SOUND_NAMES, SETTINGS_KEY } from '../src/index.js';

function fakeAudio() {
  const log = { created: [], started: 0, stopped: 0, contexts: [] };
  const param = v => ({ value: v, calls: [], setValueAtTime(x, t) { this.calls.push(['set', x, t]); }, linearRampToValueAtTime(x, t) { this.calls.push(['lin', x, t]); },
    exponentialRampToValueAtTime(x, t) { if (!(x > 0)) throw new RangeError('exp ramp to 0'); this.calls.push(['exp', x, t]); },
    setTargetAtTime(x) { this.value = x; }, cancelScheduledValues() {} });
  const node = kind => ({ kind, connect(n) { (this.to ||= []).push(n); return n; }, disconnect() {} });
  class Ctx {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = node('dest'); log.contexts.push(this); }
    createGain() { const n = node('gain'); n.gain = param(1); log.created.push(n); return n; }
    createDynamicsCompressor() { return node('comp'); }
    createStereoPanner() { const n = node('pan'); n.pan = param(0); log.created.push(n); return n; }
    createBiquadFilter() { const n = node('filter'); n.frequency = param(350); n.Q = param(1); return n; }
    createOscillator() { const n = node('osc'); n.frequency = param(440); n.start = () => log.started++; n.stop = () => log.stopped++; return n; }
    createBufferSource() { const n = node('noise'); n.start = () => log.started++; n.stop = () => log.stopped++; return n; }
    createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d }; }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
  }
  return { Ctx, log };
}

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test('nothing plays before the first tap (unlock), then every sound plays', () => {
  const { Ctx, log } = fakeAudio();
  let t = 0;
  const p = createSoundPlayer({ AudioContext: Ctx, now: () => (t += 1000), document: null });
  assert.equal(p.stats().state, 'locked');
  assert.equal(p.play('gun'), false);
  assert.ok(p.unlock());
  assert.equal(p.stats().state, 'running');
  for (const n of SOUND_NAMES) assert.ok(p.play(n), n);
  assert.equal(p.stats().played, SOUND_NAMES.length);
  assert.equal(p.stats().errors, 0);
  assert.ok(log.started > SOUND_NAMES.length);
  assert.equal(p.play('nope'), false);
  assert.equal(log.contexts.length, 1);
  p.unlock(); // again: same context
  assert.equal(log.contexts.length, 1);
});

test('no AudioContext at all: everything is quietly skipped', () => {
  const p = createSoundPlayer({ AudioContext: null, document: null });
  assert.equal(p.unlock(), false);
  assert.equal(p.play('gun'), false);
  assert.equal(p.stats().state, 'none');
  assert.equal(p.footsteps(0.1, { speed: 5, onGround: true }), null);
});

test('mute is saved, silences sounds and pauses the audio; the next player remembers it', () => {
  const { Ctx, log } = fakeAudio();
  const storage = memory();
  let t = 0;
  const p = createSoundPlayer({ AudioContext: Ctx, storage, now: () => (t += 1000), document: null });
  p.unlock();
  const seen = [];
  p.onChange(s => seen.push(s.muted));
  p.toggleMute();
  assert.deepEqual(seen, [true]);
  assert.equal(JSON.parse(storage.m.get(SETTINGS_KEY)).muted, true);
  assert.equal(p.play('gun'), false);
  assert.equal(log.contexts[0].state, 'suspended');
  const again = createSoundPlayer({ AudioContext: Ctx, storage, document: null });
  assert.equal(again.settings.muted, true);
  p.toggleMute();
  assert.equal(log.contexts[0].state, 'running');
  assert.ok(p.play('gun'));
  p.setSettings({ volume: 0 });
  assert.equal(p.play('gun'), false);
});

test('far away sounds are skipped; near ones are panned', () => {
  const { Ctx, log } = fakeAudio();
  let t = 0;
  const p = createSoundPlayer({ AudioContext: Ctx, now: () => (t += 1000), document: null });
  p.unlock();
  p.setListener({ x: 0, z: 0, yaw: 0 });
  assert.equal(p.play('gun', { pos: [0, 0, 80] }), false);
  assert.ok(p.play('gun', { pos: [-10, 0, 0] }));
  const pan = log.created.filter(n => n.kind === 'pan').at(-1);
  assert.ok(pan.pan.value > 0.5);
});

test('the voice cap holds: no more than maxVoices at once', () => {
  const { Ctx } = fakeAudio();
  const p = createSoundPlayer({ AudioContext: Ctx, maxVoices: 4, now: () => 0, document: null });
  p.unlock();
  let ok = 0;
  for (const n of ['gun', 'shootbm', 'dmgun', 'supergun', 'boom', 'bigBoom', 'coins', 'hit']) if (p.play(n, { pos: [1, 0, 1] })) ok++;
  assert.ok(p.stats().playing <= 4);
  assert.ok(p.stats().dropped + ok === 8 && ok >= 4);
  // minGapMs: the same headshot twice at the same moment plays once
  assert.ok(p.play('headshot'));
  assert.equal(p.play('headshot'), false);
});

test('footsteps play while walking', () => {
  const { Ctx } = fakeAudio();
  let t = 0;
  const p = createSoundPlayer({ AudioContext: Ctx, now: () => t, document: null });
  p.unlock();
  for (let i = 0; i < 180; i++) { t += 1000 / 60; p.footsteps(1 / 60, { speed: 5, onGround: true }); }
  assert.ok(p.stats().counts.footstep >= 5);
});
