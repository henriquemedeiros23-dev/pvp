// The thin browser layer: plays planned sounds with the Web Audio API. Everything it decides comes from the pure
// parts (planner.js, mixer.js, settings.js). Works without audio too: no AudioContext = every play is skipped.
import { createRandom } from '@pvp/seeded-random';
import { SOUNDS } from './recipes.js';
import { planSound, SILENT } from './planner.js';
import { masterGain, spatialize, createVoiceLimiter, createFootsteps, noiseSamples } from './mixer.js';
import { loadSettings, saveSettings, cleanSettings } from './settings.js';

const NOISE_SECONDS = 2;

/**
 * @param opts.storage   where settings are saved (localStorage), optional
 * @param opts.seed      seed for the little differences between plays
 * @param opts.maxVoices sounds at once (default 8 on phones, 16 elsewhere: pass `mobile`)
 * @param opts.AudioContext the AudioContext class (default: the browser's); null = silent
 * @param opts.document  for pausing audio while the page is hidden (default: the global document)
 */
export function createSoundPlayer({
  storage, seed = 'pvp-sound', mobile = false, maxVoices = mobile ? 8 : 16,
  AudioContext: AC = globalThis.AudioContext || globalThis.webkitAudioContext || null,
  document: doc = globalThis.document, now = () => (globalThis.performance ? performance.now() : Date.now()),
} = {}) {
  let settings = loadSettings(storage);
  const rng = createRandom(seed);
  const limiter = createVoiceLimiter({ max: maxVoices });
  const steps = createFootsteps();
  const listeners = new Set();
  const voices = new Map(); // limiter id -> { out, sources }
  const stats = { played: 0, skipped: 0, dropped: 0, errors: 0, last: null, counts: {} };
  let ctx = null, master = null, noise = {}, listener = null;

  function applyGain() {
    if (!ctx) return;
    const g = masterGain(settings);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(g, ctx.currentTime, 0.02);
    if (settings.muted && ctx.state === 'running') ctx.suspend?.().catch(() => {}); // save the phone's battery
    if (!settings.muted && ctx.state === 'suspended' && !doc?.hidden) ctx.resume?.().catch(() => {});
  }

  /** Start audio. Browsers allow it only inside a tap, click or key press: call it from one. Safe to call often. */
  function unlock() {
    try {
      if (!ctx) {
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = masterGain(settings);
        const comp = ctx.createDynamicsCompressor?.(); // many sounds at once stay clean
        if (comp) { master.connect(comp); comp.connect(ctx.destination); } else master.connect(ctx.destination);
        const nrng = rng.fork('noise');
        for (const color of ['white', 'pink', 'brown']) {
          const len = Math.round(ctx.sampleRate * NOISE_SECONDS);
          const buf = ctx.createBuffer(1, len, ctx.sampleRate);
          buf.getChannelData(0).set(noiseSamples(color, len, nrng));
          noise[color] = buf;
        }
      }
      if (ctx.state === 'suspended' && !settings.muted) ctx.resume?.().catch(() => {});
      return true;
    } catch (e) {
      stats.errors++;
      console.warn('Sound could not start:', e?.message || e);
      AC = null; ctx = null;
      return false;
    }
  }

  function setParam(param, points, t0, kind) {
    const [first, ...rest] = points;
    param.setValueAtTime(first[1], t0 + first[0]);
    rest.forEach(([t, v], i) => {
      // envelopes: straight up to the peak, then a natural (exponential) fade; slides are exponential
      if (kind === 'env' && i === 0) param.linearRampToValueAtTime(v, t0 + t);
      else param.exponentialRampToValueAtTime(Math.max(v, SILENT), t0 + t);
    });
  }

  function render(plan, t0, out) {
    const sources = [];
    for (const v of plan.voices) {
      let src;
      if (v.type === 'osc') {
        src = ctx.createOscillator();
        src.type = v.wave;
        setParam(src.frequency, [[v.start, v.freq[0]], [v.end, v.freq[1]]], t0);
      } else {
        src = ctx.createBufferSource();
        src.buffer = noise[v.color] || noise.white;
        src.loop = true;
      }
      let node = src;
      if (v.filter) {
        const f = ctx.createBiquadFilter();
        f.type = v.filter.type;
        f.Q.value = v.filter.q;
        setParam(f.frequency, [[v.start, v.filter.freq[0]], [v.end, v.filter.freq[1]]], t0);
        node.connect(f);
        node = f;
      }
      const env = ctx.createGain();
      env.gain.value = 0;
      setParam(env.gain, v.env, t0, 'env');
      node.connect(env);
      env.connect(out);
      if (v.type === 'noise') src.start(t0 + v.start, (v.offset || 0) * NOISE_SECONDS);
      else src.start(t0 + v.start);
      src.stop(t0 + v.end + 0.02);
      sources.push(src);
    }
    return sources;
  }

  /**
   * Play a sound by name.
   * @param opts.pos     [x, y, z] in the world (heard from the listener, see setListener); none = my own sound
   * @param opts.delayMs start later
   * @param opts.gain    extra loudness 0..1
   * @returns true if it plays
   */
  function play(name, { pos = null, delayMs = 0, gain = 1, priority } = {}) {
    const recipe = SOUNDS[name];
    if (!recipe) { stats.skipped++; return false; }
    if (!ctx || settings.muted || masterGain(settings) === 0 || ctx.state === 'closed') { stats.skipped++; return false; }
    try {
      const sp = spatialize(listener, pos);
      const loud = sp.gain * gain;
      if (loud < 0.02) { stats.skipped++; return false; }
      const plan = planSound(recipe, { rng, gain: loud });
      const pr = priority ?? Math.min(3, recipe.priority + (pos ? 0 : 1)); // my own sounds matter more
      const ok = limiter.request({ now: now() + delayMs, dur: plan.dur * 1000 + 50, priority: pr, name, minGapMs: recipe.minGapMs });
      if (!ok.ok) { stats.dropped++; return false; }
      for (const id of ok.steal) stop(id);
      const t0 = ctx.currentTime + 0.005 + Math.max(0, delayMs) / 1000;
      const out = ctx.createGain();
      out.gain.value = plan.gain;
      let last = out;
      if (sp.pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = sp.pan;
        out.connect(p);
        last = p;
      }
      last.connect(master);
      const sources = render(plan, t0, out);
      const v = { out, last, sources };
      voices.set(ok.id, v);
      const lastSrc = sources[sources.length - 1];
      if (lastSrc) lastSrc.onended = () => { if (voices.get(ok.id) === v) { voices.delete(ok.id); try { last.disconnect(); } catch { /* gone */ } } };
      stats.played++;
      stats.last = name;
      stats.counts[name] = (stats.counts[name] || 0) + 1;
      return true;
    } catch (e) {
      stats.errors++;
      console.warn(`Sound "${name}" could not play:`, e?.message || e);
      return false;
    }
  }

  function stop(id) {
    const v = voices.get(id);
    voices.delete(id);
    limiter.release(id);
    if (!v) return;
    try {
      const t = ctx.currentTime;
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setTargetAtTime(0, t, 0.01);
      for (const s of v.sources) s.stop(t + 0.06);
    } catch { /* already stopped */ }
  }

  function setSettings(patch) {
    settings = cleanSettings({ ...settings, ...patch });
    saveSettings(storage, settings);
    applyGain();
    for (const fn of listeners) fn(settings);
    return settings;
  }

  // Pause audio while the page is hidden (phone locked, other tab).
  doc?.addEventListener?.('visibilitychange', () => {
    if (!ctx) return;
    if (doc.hidden) ctx.suspend?.().catch(() => {});
    else if (!settings.muted) ctx.resume?.().catch(() => {});
  });

  return {
    unlock,
    play,
    /** Where the camera is: { x, z, yaw } (forward = (sin yaw, cos yaw)). */
    setListener(l) { listener = l ? { x: l.x, z: l.z, yaw: l.yaw } : null; },
    /** Call every frame while playing: soft footsteps for your own player, faster when running. */
    footsteps(dt, state) {
      const s = steps.step(dt, state);
      if (s) play('footstep', { gain: s.gain });
      return s;
    },
    resetFootsteps() { steps.reset(); },
    get settings() { return settings; },
    setSettings,
    toggleMute() { return setSettings({ muted: !settings.muted }); },
    /** fn(settings) after every change (to update every 🔊 button). Returns an unsubscribe function. */
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    stats() {
      return { ...stats, counts: { ...stats.counts }, state: ctx ? ctx.state : AC ? 'locked' : 'none', playing: limiter.count(now()), maxVoices, muted: settings.muted, volume: settings.volume };
    },
  };
}
