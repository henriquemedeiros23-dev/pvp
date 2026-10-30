// Every game sound as data: a "recipe" of parts. Nothing here makes noise; planSound() (planner.js) turns a
// recipe into a list of scheduled voices and the browser player (player.js) plays them with Web Audio.
//
// A recipe:   { gain, priority, minGapMs, jitter: { pitch, gain }, parts: [...] }
//   gain       loudness of the whole sound (0..1)
//   priority   0 (footsteps) .. 3 (headshot, knockout): when too many sounds play, lower ones give way
//   minGapMs   the same sound again sooner than this is skipped (two messages for one hit, fast footsteps)
//   jitter     each play is a little different: pitch +-jitter.pitch, gain down to 1 - jitter.gain (seeded)
// A part (one oscillator or one noise burst):
//   osc: 'sine' | 'square' | 'sawtooth' | 'triangle'   or   noise: 'white' | 'pink' | 'brown'
//   freq       oscillator pitch in Hz, or [from, to] for a slide
//   notes      instead of freq: several notes, each its own voice, `every` seconds apart (0 = a chord);
//              `slide` bends each note to note * slide
//   filter     { type: 'lowpass' | 'highpass' | 'bandpass', freq: Hz or [from, to], q }
//   at, dur    start (s, from the sound's start) and length (s)
//   attack     seconds to reach full loudness; `hold` seconds it stays there before fading out
//   gain       loudness of this part

const f = (o) => Object.freeze(o);
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

// Note frequencies (Hz) used below.
const N = f({ C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760, C7: 2093, E7: 2637.02, F7: 2793.83, G7: 3135.96, A7: 3520, C8: 4186.01 });

export const SOUNDS = deepFreeze({
  // ---- guns: one per gun type
  gun: { // Gun: a small pop
    gain: 0.55, priority: 2, minGapMs: 30, jitter: { pitch: 0.06, gain: 0.1 },
    parts: [
      { noise: 'white', filter: { type: 'bandpass', freq: [2600, 900], q: 0.8 }, dur: 0.12, attack: 0.001, gain: 0.9 },
      { osc: 'square', freq: [420, 90], dur: 0.07, attack: 0.001, gain: 0.3 },
    ],
  },
  shootbm: { // Shootbm: a sharp crack with a short tail
    gain: 0.6, priority: 2, minGapMs: 30, jitter: { pitch: 0.05, gain: 0.1 },
    parts: [
      { noise: 'white', filter: { type: 'highpass', freq: 1800, q: 0.7 }, dur: 0.09, attack: 0.001, gain: 1 },
      { noise: 'white', filter: { type: 'bandpass', freq: [4000, 1200], q: 1 }, at: 0.02, dur: 0.28, attack: 0.005, gain: 0.3 },
      { osc: 'sawtooth', freq: [900, 120], dur: 0.05, attack: 0.001, gain: 0.25 },
    ],
  },
  dmgun: { // DM Gun: heavier and lower
    gain: 0.7, priority: 2, minGapMs: 30, jitter: { pitch: 0.05, gain: 0.1 },
    parts: [
      { noise: 'white', filter: { type: 'lowpass', freq: [3200, 450], q: 0.7 }, dur: 0.24, attack: 0.001, gain: 1 },
      { osc: 'square', freq: [160, 45], dur: 0.18, attack: 0.002, gain: 0.45, filter: { type: 'lowpass', freq: 900, q: 0.7 } },
      { noise: 'white', filter: { type: 'highpass', freq: 2500, q: 0.7 }, dur: 0.05, attack: 0.001, gain: 0.5 },
    ],
  },
  supergun: { // Supergun: a big blast with a deep boom
    gain: 0.8, priority: 3, minGapMs: 30, jitter: { pitch: 0.04, gain: 0.08 },
    parts: [
      { noise: 'brown', filter: { type: 'lowpass', freq: [2400, 200], q: 0.7 }, dur: 0.6, attack: 0.002, gain: 1 },
      { osc: 'sawtooth', freq: [120, 35], dur: 0.45, attack: 0.002, gain: 0.45, filter: { type: 'lowpass', freq: 600, q: 0.8 } },
      { osc: 'sine', freq: [75, 30], dur: 0.5, attack: 0.003, gain: 0.8 },
      { noise: 'white', filter: { type: 'bandpass', freq: 5000, q: 0.8 }, dur: 0.08, attack: 0.001, gain: 0.5 },
    ],
  },

  // ---- swords and shields
  swing: { // sword swing: a whoosh
    gain: 0.5, priority: 1, minGapMs: 60, jitter: { pitch: 0.12, gain: 0.15 },
    parts: [
      { noise: 'pink', filter: { type: 'bandpass', freq: [500, 2400], q: 2 }, dur: 0.24, attack: 0.08, gain: 0.9 },
    ],
  },
  swordHit: { // a sword hits: a thud and a short metal ring
    gain: 0.55, priority: 2, minGapMs: 50, jitter: { pitch: 0.06, gain: 0.1 },
    parts: [
      { noise: 'pink', filter: { type: 'bandpass', freq: 1400, q: 1 }, dur: 0.07, attack: 0.001, gain: 0.8 },
      { osc: 'triangle', freq: [1300, 1150], dur: 0.25, attack: 0.002, gain: 0.25 },
      { osc: 'square', freq: 2600, dur: 0.08, attack: 0.001, gain: 0.06 },
    ],
  },
  iceHit: { // Ice Sword hit: icy crystal tinkle and crackle
    gain: 0.55, priority: 2, minGapMs: 50, jitter: { pitch: 0.04, gain: 0.1 },
    parts: [
      { noise: 'white', filter: { type: 'highpass', freq: 5000, q: 0.7 }, dur: 0.3, attack: 0.002, gain: 0.35 },
      { osc: 'sine', notes: [N.C7, N.E7, N.G7], every: 0.04, dur: 0.4, attack: 0.002, gain: 0.18 },
      { osc: 'triangle', freq: [N.G6, N.A6], dur: 0.3, attack: 0.002, gain: 0.12 },
      { noise: 'pink', filter: { type: 'bandpass', freq: 1400, q: 1 }, dur: 0.06, attack: 0.001, gain: 0.5 },
    ],
  },
  zapHit: { // Electric Sword hit: a zap
    gain: 0.5, priority: 2, minGapMs: 50, jitter: { pitch: 0.08, gain: 0.1 },
    parts: [
      { osc: 'sawtooth', freq: [220, 1800], dur: 0.12, attack: 0.001, gain: 0.22 },
      { osc: 'square', freq: [1200, 300], at: 0.04, dur: 0.16, attack: 0.001, gain: 0.18 },
      { noise: 'white', filter: { type: 'bandpass', freq: 3000, q: 3 }, dur: 0.2, attack: 0.001, gain: 0.5 },
    ],
  },
  zap: { // an Electric Sword shock tick (smaller zap)
    gain: 0.35, priority: 1, minGapMs: 80, jitter: { pitch: 0.1, gain: 0.1 },
    parts: [
      { osc: 'square', freq: [900, 200], dur: 0.1, attack: 0.001, gain: 0.18 },
      { noise: 'white', filter: { type: 'bandpass', freq: 3500, q: 4 }, dur: 0.1, attack: 0.001, gain: 0.35 },
    ],
  },
  shieldUp: { // raising your shield: a short swoosh up
    gain: 0.35, priority: 1, minGapMs: 120, jitter: { pitch: 0.05, gain: 0.1 },
    parts: [
      { noise: 'pink', filter: { type: 'bandpass', freq: [800, 1600], q: 1.5 }, dur: 0.12, attack: 0.02, gain: 0.6 },
      { osc: 'triangle', freq: [330, 440], dur: 0.12, attack: 0.01, gain: 0.12 },
    ],
  },
  shieldBlock: { // a shield blocks a hit: clang!
    gain: 0.6, priority: 2, minGapMs: 80, jitter: { pitch: 0.04, gain: 0.1 },
    parts: [
      { noise: 'white', filter: { type: 'bandpass', freq: 2500, q: 1 }, dur: 0.05, attack: 0.001, gain: 0.6 },
      { osc: 'square', freq: 820, dur: 0.4, attack: 0.001, gain: 0.12, filter: { type: 'bandpass', freq: 1600, q: 4 } },
      { osc: 'triangle', freq: 1230, dur: 0.5, attack: 0.001, gain: 0.18 },
      { osc: 'sine', freq: 1847, dur: 0.35, attack: 0.001, gain: 0.1 },
    ],
  },

  // ---- hits
  headshot: { // a gun headshot: ding!
    gain: 0.55, priority: 3, minGapMs: 150, jitter: { pitch: 0, gain: 0 },
    parts: [
      { osc: 'sine', freq: N.A6, dur: 0.6, attack: 0.002, gain: 0.5 },
      { osc: 'sine', freq: N.A7, dur: 0.3, attack: 0.002, gain: 0.15 },
    ],
  },
  hitmark: { // you hit someone with a gun: tick
    gain: 0.4, priority: 2, minGapMs: 40, jitter: { pitch: 0.03, gain: 0.05 },
    parts: [
      { osc: 'square', freq: 2400, dur: 0.03, attack: 0.001, gain: 0.15 },
      { noise: 'white', filter: { type: 'highpass', freq: 4000, q: 0.7 }, dur: 0.02, attack: 0.001, gain: 0.3 },
    ],
  },
  hit: { // someone else got hit: a soft thud
    gain: 0.4, priority: 1, minGapMs: 40, jitter: { pitch: 0.1, gain: 0.1 },
    parts: [
      { noise: 'pink', filter: { type: 'lowpass', freq: 900, q: 0.7 }, dur: 0.1, attack: 0.001, gain: 0.6 },
      { osc: 'sine', freq: [160, 80], dur: 0.12, attack: 0.002, gain: 0.4 },
    ],
  },
  hurt: { // you got hurt: an "oof" thump
    gain: 0.5, priority: 3, minGapMs: 60, jitter: { pitch: 0.06, gain: 0.05 },
    parts: [
      { osc: 'sine', freq: [220, 90], dur: 0.18, attack: 0.003, gain: 0.5 },
      { noise: 'brown', filter: { type: 'lowpass', freq: 1200, q: 0.7 }, dur: 0.12, attack: 0.001, gain: 0.5 },
    ],
  },
  knockout: { // someone was knocked out: falling "bwoo" and a poof
    gain: 0.55, priority: 3, minGapMs: 150, jitter: { pitch: 0.03, gain: 0.05 },
    parts: [
      { osc: 'triangle', freq: [660, 110], dur: 0.6, attack: 0.005, gain: 0.3 },
      { noise: 'pink', filter: { type: 'lowpass', freq: 800, q: 0.7 }, at: 0.05, dur: 0.45, attack: 0.02, gain: 0.5 },
      { osc: 'sine', notes: [N.E6, N.C6, N.G5], every: 0.09, at: 0.15, dur: 0.2, attack: 0.002, gain: 0.12 },
    ],
  },
  weaponBreak: { // your weapon or shield broke
    gain: 0.55, priority: 3, minGapMs: 120, jitter: { pitch: 0.04, gain: 0.05 },
    parts: [
      { noise: 'white', filter: { type: 'bandpass', freq: [3000, 800], q: 1 }, dur: 0.3, attack: 0.001, gain: 0.7 },
      { osc: 'square', notes: [700, 520, 380], every: 0.06, dur: 0.1, attack: 0.001, gain: 0.12 },
      { osc: 'triangle', freq: [1500, 1450], dur: 0.4, attack: 0.001, gain: 0.1 },
    ],
  },

  // ---- bombs
  bombThrow: { // a bomb is thrown: whoosh
    gain: 0.4, priority: 1, minGapMs: 60, jitter: { pitch: 0.1, gain: 0.1 },
    parts: [
      { noise: 'pink', filter: { type: 'bandpass', freq: [400, 1200], q: 1.5 }, dur: 0.3, attack: 0.05, gain: 0.8 },
    ],
  },
  fuse: { // a bomb's fuse sizzles on the ground
    gain: 0.25, priority: 1, minGapMs: 60, jitter: { pitch: 0.1, gain: 0.1 },
    parts: [
      { noise: 'white', filter: { type: 'highpass', freq: 3000, q: 0.7 }, dur: 1.6, attack: 0.05, hold: 1.2, gain: 0.5 },
      { noise: 'white', filter: { type: 'bandpass', freq: 6000, q: 2 }, dur: 1.6, attack: 0.05, hold: 1.2, gain: 0.3 },
    ],
  },
  boom: { // a Bomb explodes
    gain: 0.85, priority: 3, minGapMs: 40, jitter: { pitch: 0.05, gain: 0.05 },
    parts: [
      { noise: 'brown', filter: { type: 'lowpass', freq: [1200, 120], q: 0.7 }, dur: 1, attack: 0.002, gain: 1 },
      { osc: 'sine', freq: [90, 30], dur: 0.8, attack: 0.003, gain: 0.9 },
      { noise: 'white', filter: { type: 'bandpass', freq: 400, q: 0.8 }, dur: 0.3, attack: 0.001, gain: 0.5 },
    ],
  },
  bigBoom: { // a Legendary Bomb explodes: bigger and longer
    gain: 1, priority: 3, minGapMs: 40, jitter: { pitch: 0.04, gain: 0.05 },
    parts: [
      { noise: 'brown', filter: { type: 'lowpass', freq: [1600, 80], q: 0.7 }, dur: 1.8, attack: 0.002, gain: 1 },
      { osc: 'sine', freq: [70, 22], dur: 1.4, attack: 0.003, gain: 1 },
      { osc: 'sawtooth', freq: [110, 30], dur: 0.6, attack: 0.002, gain: 0.35, filter: { type: 'lowpass', freq: 400, q: 0.7 } },
      { noise: 'white', filter: { type: 'bandpass', freq: 300, q: 0.8 }, dur: 0.8, attack: 0.001, gain: 0.6 },
    ],
  },

  // ---- chests, coins, potions, items
  chestOpen: { // a chest lid creaks open and thumps
    gain: 0.45, priority: 2, minGapMs: 100, jitter: { pitch: 0.06, gain: 0.05 },
    parts: [
      { osc: 'sawtooth', freq: [180, 260], dur: 0.4, attack: 0.05, hold: 0.25, gain: 0.15, filter: { type: 'bandpass', freq: 900, q: 6 } },
      { osc: 'sawtooth', freq: [240, 190], at: 0.18, dur: 0.3, attack: 0.04, gain: 0.1, filter: { type: 'bandpass', freq: 1100, q: 6 } },
      { noise: 'brown', filter: { type: 'lowpass', freq: 500, q: 0.7 }, at: 0.42, dur: 0.12, attack: 0.002, gain: 0.6 },
    ],
  },
  coins: { // coins jingle
    gain: 0.4, priority: 2, minGapMs: 80, jitter: { pitch: 0.03, gain: 0.05 },
    parts: [
      { osc: 'triangle', notes: [N.E7, N.G7, N.F7, N.A7, N.G7], every: 0.055, dur: 0.18, attack: 0.001, gain: 0.16 },
      { noise: 'white', filter: { type: 'highpass', freq: 7000, q: 0.7 }, dur: 0.3, attack: 0.005, gain: 0.1 },
    ],
  },
  goldenChest: { // the golden chest is opened: a little fanfare
    gain: 0.5, priority: 3, minGapMs: 500, jitter: { pitch: 0, gain: 0 },
    parts: [
      { osc: 'square', notes: [N.C5, N.E5, N.G5, N.C6], every: 0.12, dur: 0.2, attack: 0.005, gain: 0.12, filter: { type: 'lowpass', freq: 2500, q: 0.7 } },
      { osc: 'triangle', notes: [N.C5, N.E5, N.G5, N.C6], every: 0, at: 0.5, dur: 1, attack: 0.01, hold: 0.4, gain: 0.12 },
      { osc: 'sine', notes: [N.C7, N.E7, N.G7, N.C8], every: 0.06, at: 0.5, dur: 0.3, attack: 0.002, gain: 0.06 },
    ],
  },
  goldenAppear: { // a golden chest appears: shimmer
    gain: 0.35, priority: 2, minGapMs: 500, jitter: { pitch: 0, gain: 0 },
    parts: [
      { osc: 'sine', notes: [N.C6, N.E6, N.G6, N.C7], every: 0.09, dur: 0.5, attack: 0.005, gain: 0.12 },
    ],
  },
  drink: { // drinking a potion: three gulps
    gain: 0.45, priority: 2, minGapMs: 300, jitter: { pitch: 0.05, gain: 0.05 },
    parts: [
      { osc: 'sine', notes: [330, 300, 320], every: 0.32, slide: 0.55, dur: 0.12, attack: 0.01, gain: 0.45, filter: { type: 'lowpass', freq: 900, q: 1 } },
    ],
  },
  heal: { // full health again: a bright chime
    gain: 0.45, priority: 3, minGapMs: 300, jitter: { pitch: 0, gain: 0 },
    parts: [
      { osc: 'sine', notes: [N.G5, N.B5, N.D6, N.G6], every: 0.08, dur: 0.6, attack: 0.003, gain: 0.18 },
      { osc: 'triangle', notes: [N.G6], every: 0, at: 0.24, dur: 0.8, attack: 0.003, gain: 0.08 },
    ],
  },
  pickup: { // you picked something up
    gain: 0.4, priority: 2, minGapMs: 80, jitter: { pitch: 0.02, gain: 0.05 },
    parts: [
      { osc: 'sine', notes: [N.A5, N.E6], every: 0.07, dur: 0.15, attack: 0.002, gain: 0.22 },
    ],
  },
  footstep: { // your own soft footstep
    gain: 0.25, priority: 0, minGapMs: 120, jitter: { pitch: 0.15, gain: 0.25 },
    parts: [
      { noise: 'brown', filter: { type: 'lowpass', freq: 450, q: 0.7 }, dur: 0.07, attack: 0.003, gain: 0.6 },
      { osc: 'sine', freq: [110, 70], dur: 0.05, attack: 0.002, gain: 0.2 },
    ],
  },

  // ---- menus
  click: { // a button in a menu
    gain: 0.3, priority: 1, minGapMs: 40, jitter: { pitch: 0.02, gain: 0 },
    parts: [
      { osc: 'sine', freq: [1200, 900], dur: 0.035, attack: 0.001, gain: 0.3 },
      { noise: 'white', filter: { type: 'highpass', freq: 3000, q: 0.7 }, dur: 0.015, attack: 0.001, gain: 0.12 },
    ],
  },
  buy: { // you bought something: ka-ching
    gain: 0.45, priority: 2, minGapMs: 100, jitter: { pitch: 0, gain: 0 },
    parts: [
      { osc: 'square', notes: [N.E6, N.A6, N.E7], every: 0.06, dur: 0.14, attack: 0.002, gain: 0.08, filter: { type: 'lowpass', freq: 4000, q: 0.7 } },
      { noise: 'white', filter: { type: 'highpass', freq: 7000, q: 0.7 }, at: 0.1, dur: 0.25, attack: 0.005, gain: 0.1 },
    ],
  },
});

/** The names of all sounds. */
export const SOUND_NAMES = Object.freeze(Object.keys(SOUNDS));
