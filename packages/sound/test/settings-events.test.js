import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTINGS_KEY, DEFAULT_SETTINGS, cleanSettings, loadSettings, saveSettings, soundButtonView, volumeSliderView,
  soundEventsFor, gunSound, hitSound, SOUNDS,
} from '../src/index.js';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test('settings: defaults, clean values, saved and loaded', () => {
  assert.deepEqual(loadSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(cleanSettings({ muted: 'yes', volume: 7 }), { muted: false, volume: 1 });
  const s = memory();
  assert.ok(saveSettings(s, { muted: true, volume: 0.3 }));
  assert.equal(s.m.get(SETTINGS_KEY), '{"muted":true,"volume":0.3}');
  assert.deepEqual(loadSettings(s), { muted: true, volume: 0.3 });
  s.setItem(SETTINGS_KEY, '{not json');
  assert.deepEqual(loadSettings(s), DEFAULT_SETTINGS);
});

test('settings: blocked storage never throws', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSettings(broken), DEFAULT_SETTINGS);
  assert.equal(saveSettings(broken, DEFAULT_SETTINGS), false);
  assert.equal(saveSettings(null, DEFAULT_SETTINGS), false);
});

test('the 🔊 button and the slider', () => {
  assert.deepEqual(soundButtonView({ muted: false, volume: 0.8 }), { icon: '🔊', pressed: false, label: 'Sound is on. Tap to turn it off' });
  assert.equal(soundButtonView({ muted: true, volume: 0.8 }).icon, '🔇');
  assert.equal(soundButtonView({ muted: false, volume: 0 }).icon, '🔇');
  assert.deepEqual(volumeSliderView({ volume: 0.456 }), { value: 46, text: '46%' });
});

test('gun and hit sounds by weapon', () => {
  assert.equal(gunSound('gun'), 'gun');
  assert.equal(gunSound('shootbm'), 'shootbm');
  assert.equal(gunSound('dmgun'), 'dmgun');
  assert.equal(gunSound('supergun'), 'supergun');
  assert.equal(gunSound('toString'), 'gun');
  assert.equal(hitSound('icesword'), 'iceHit');
  assert.equal(hitSound('electricsword'), 'zapHit');
  assert.equal(hitSound('supersword'), 'swordHit');
  assert.equal(hitSound('gun'), 'hitmark');
  assert.equal(hitSound(null), 'hitmark');
});

test('server messages -> sounds (mine in the middle, others at their place)', () => {
  const ctx = { myId: 1, weaponOf: id => (id === 1 ? 'icesword' : 'gun'), chestPos: i => ({ x: i, z: 2 }), chestOpen: () => false, golden: { x: 5, z: 6 } };
  const ev = m => soundEventsFor(m, ctx);
  assert.deepEqual(ev({ t: 'shot', id: 1, w: 'dmgun', from: [0, 1, 0], to: [] }), [{ sound: 'dmgun' }]);
  assert.deepEqual(ev({ t: 'shot', id: 2, w: 'supergun', from: [3, 1, 4], to: [] }), [{ sound: 'supergun', id: 2, pos: [3, 1, 4] }]);
  assert.deepEqual(ev({ t: 'swing', id: 2 }), [{ sound: 'swing', id: 2 }]);
  assert.deepEqual(ev({ t: 'swing', id: 1 }), [{ sound: 'swing' }]);
  assert.deepEqual(ev({ t: 'hitmark', dead: false }), [{ sound: 'iceHit' }]);
  assert.deepEqual(ev({ t: 'hitmark', dead: false, head: true }), [{ sound: 'headshot' }]);
  assert.deepEqual(ev({ t: 'hitmark', dead: false, blocked: true }), [{ sound: 'shieldBlock' }]);
  assert.deepEqual(ev({ t: 'hitmark', dead: true }).map(e => e.sound), ['iceHit', 'knockout']);
  assert.deepEqual(ev({ t: 'dmg', id: 1, amount: 5 }), [{ sound: 'hurt' }]);
  assert.deepEqual(ev({ t: 'dmg', id: 2, amount: 5 }), [{ sound: 'hit', id: 2 }]);
  assert.deepEqual(ev({ t: 'dmg', id: 2, amount: 8, head: true }), [{ sound: 'headshot', id: 2 }]);
  assert.deepEqual(ev({ t: 'dmg', id: 2, amount: 1, shock: true }), [{ sound: 'zap', id: 2 }]);
  assert.deepEqual(ev({ t: 'dmg', id: 2, amount: 0, blocked: true }), [{ sound: 'shieldBlock', id: 2 }]);
  assert.deepEqual(ev({ t: 'dmg', id: 2, amount: 9, ko: true }), [{ sound: 'knockout', id: 2 }]);
  assert.deepEqual(ev({ t: 'ko', id: 2, x: 1, y: 0, z: 2 }), [{ sound: 'knockout', pos: [1, 0, 2] }]);
  assert.deepEqual(ev({ t: 'broke', slot: 0, weapon: 'gun' }), [{ sound: 'weaponBreak' }]);
  assert.deepEqual(ev({ t: 'shieldbroke', weapon: 'shield' }), [{ sound: 'weaponBreak' }]);
  assert.deepEqual(ev({ t: 'bomb', id: 4, by: 2, b: 'bomb', from: [0, 1, 0], to: [5, 0, 5], fly: 600, ms: 3000, area: 2 }),
    [{ sound: 'bombThrow', pos: [0, 1, 0] }, { sound: 'fuse', pos: [5, 0, 5], delayMs: 600 }]);
  assert.deepEqual(ev({ t: 'bomb', id: 4, by: 1, b: 'bomb', from: [0, 1, 0], to: [5, 0, 5], fly: 0, ms: 0, area: 2 }), [{ sound: 'bombThrow' }]);
  assert.deepEqual(ev({ t: 'boom', id: 4, b: 'bomb', x: 1, y: 0, z: 2, area: 2 }), [{ sound: 'boom', pos: [1, 0, 2] }]);
  assert.equal(ev({ t: 'boom', id: 4, b: 'legendarybomb', x: 1, y: 0, z: 2, area: 5 })[0].sound, 'bigBoom');
  assert.deepEqual(ev({ t: 'chest', id: 3, open: true }), [{ sound: 'chestOpen', pos: [3, 0.5, 2] }]);
  assert.deepEqual(ev({ t: 'chest', id: 3, open: false }), []);
  assert.deepEqual(soundEventsFor({ t: 'chest', id: 3, open: true }, { ...ctx, chestOpen: () => true }), []); // already open
  assert.deepEqual(ev({ t: 'golden', golden: { x: 1, z: 1 } }), [{ sound: 'goldenAppear' }]);
  assert.deepEqual(ev({ t: 'golden', golden: { x: 1, z: 1 }, quiet: true }), []);
  assert.deepEqual(ev({ t: 'golden', golden: null, by: 'Ana' }), [{ sound: 'goldenChest', pos: [5, 0.5, 6] }]);
  assert.deepEqual(ev({ t: 'coins', amount: 3, total: 9 }), [{ sound: 'coins' }]);
  assert.deepEqual(ev({ t: 'drink', state: 'start', ms: 3000, hp: 50 }), [{ sound: 'drink' }]);
  assert.deepEqual(ev({ t: 'drink', state: 'done', ms: 0, hp: 100 }), [{ sound: 'heal' }]);
  assert.deepEqual(ev({ t: 'drink', state: 'cancel', ms: 0, hp: 50 }), []);
  assert.deepEqual(ev({ t: 'inv', picked: 'Gun' }), [{ sound: 'pickup' }]);
  assert.deepEqual(ev({ t: 'inv' }), []);
  assert.deepEqual(ev({ t: 'snap', p: [], n: 1 }), []);
  assert.deepEqual(soundEventsFor(null), []);
});

test('every sound an event can name exists', () => {
  const names = new Set();
  const msgs = [
    { t: 'shot', w: 'x' }, { t: 'swing' }, { t: 'hitmark' }, { t: 'hitmark', dead: true }, { t: 'dmg' }, { t: 'dmg', id: 1 },
    { t: 'bomb', ms: 2, fly: 1 }, { t: 'boom' }, { t: 'chest', open: true }, { t: 'golden', golden: {} }, { t: 'golden', golden: null, by: 'a' },
  ];
  for (const m of msgs) for (const e of soundEventsFor(m, { myId: 1, golden: { x: 0, z: 0 } })) names.add(e.sound);
  for (const n of names) assert.ok(SOUNDS[n], n);
});
