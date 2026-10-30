// Mixer math: volume slider -> gain, 3D sound (distance and stereo pan from the camera), a cap on how many
// sounds play at once (phones), footstep timing and noise samples. Pure functions, no Web Audio.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** A volume slider (0..1) to a gain: squared, so the slider feels even to the ear. */
export function volumeToGain(volume) {
  const v = Number.isFinite(volume) ? clamp(volume, 0, 1) : 0;
  return v * v;
}

/** The gain all sound effects get: 0 when muted, else from the volume slider. */
export function masterGain(settings) {
  if (!settings || settings.muted) return 0;
  return volumeToGain(settings.volume);
}

export const SPATIAL = Object.freeze({ ref: 4, max: 50, maxPan: 0.85 });

/**
 * Loudness by distance: full up to `ref` meters, then falls off (ref / d), and is 0 from `max` meters.
 * Never goes up as the distance grows.
 */
export function attenuation(distance, { ref = SPATIAL.ref, max = SPATIAL.max } = {}) {
  const d = Number.isFinite(distance) ? Math.max(0, distance) : Infinity;
  if (d <= ref) return 1;
  if (d >= max) return 0;
  const edge = (d - ref) / (max - ref); // 0..1 between ref and max
  return (ref / d) * (1 - edge * edge);
}

/**
 * Where a sound is, heard from the camera.
 * @param listener { x, z, yaw }  camera spot and the way it looks: forward is (sin yaw, cos yaw),
 *                 right on the screen is (-cos yaw, sin yaw) (as in apps/game)
 * @param pos      [x, y, z] or { x, z } of the sound, or null for "my own sound" (centre, full loudness)
 * @returns { gain (0..1), pan (-1 left .. 1 right), distance }
 */
export function spatialize(listener, pos, opts = {}) {
  if (!pos || !listener) return { gain: 1, pan: 0, distance: 0 };
  const px = Array.isArray(pos) ? pos[0] : pos.x, pz = Array.isArray(pos) ? pos[2] : pos.z;
  const dx = px - listener.x, dz = pz - listener.z;
  const distance = Math.hypot(dx, dz);
  const ref = opts.ref ?? SPATIAL.ref, maxPan = opts.maxPan ?? SPATIAL.maxPan;
  let pan = 0;
  if (distance > 1e-6) {
    const yaw = listener.yaw || 0;
    const side = (dx * -Math.cos(yaw) + dz * Math.sin(yaw)) / distance; // -1..1
    pan = clamp(side * maxPan * Math.min(1, distance / ref), -1, 1); // very close sounds stay near the middle
  }
  return { gain: attenuation(distance, opts), pan: Math.round(pan * 1e4) / 1e4 || 0, distance };
}

/**
 * A cap on sounds playing at the same time. Ask before playing; the answer says yes (maybe stopping an older,
 * less important sound first) or no.
 * @param max  how many sounds may play at once (phones: fewer)
 */
export function createVoiceLimiter({ max = 12 } = {}) {
  let active = []; // { id, name, start, end, priority }
  const lastStart = new Map(); // name -> ms
  let nextId = 1;
  const prune = now => { active = active.filter(v => v.end > now); };
  return {
    max,
    /**
     * @param r { now (ms), dur (ms), priority (0..3), name, minGapMs }
     * @returns { ok: true, id, steal: [ids to stop now] } or { ok: false, reason: 'gap' | 'full' }
     */
    request({ now, dur, priority = 1, name = '', minGapMs = 0 }) {
      prune(now);
      if (name && minGapMs > 0 && lastStart.has(name) && now - lastStart.get(name) < minGapMs) return { ok: false, reason: 'gap' };
      const steal = [];
      if (active.length >= max) {
        // the least important, oldest sound gives way, but only to a sound at least as important
        let victim = null;
        for (const v of active) if (!victim || v.priority < victim.priority || (v.priority === victim.priority && v.start < victim.start)) victim = v;
        if (!victim || victim.priority > priority) return { ok: false, reason: 'full' };
        active = active.filter(v => v !== victim);
        steal.push(victim.id);
      }
      const id = nextId++;
      active.push({ id, name, start: now, end: now + Math.max(0, dur), priority });
      if (name) lastStart.set(name, now);
      return { ok: true, id, steal };
    },
    /** How many sounds play at `now` (ms). */
    count(now) { prune(now); return active.length; },
    /** Forget a sound (it was stopped early). */
    release(id) { active = active.filter(v => v.id !== id); },
    clear() { active = []; lastStart.clear(); },
  };
}

/**
 * Footsteps that follow how fast you go: one step every `stride` meters walked on the ground, faster steps when
 * running. Landing after a jump is a step too.
 * step(dt seconds, { speed m/s, onGround }) -> null or { foot: 0 | 1, gain }.
 */
export function createFootsteps({ minSpeed = 0.6, baseStride = 1.1, stridePerSpeed = 0.07, maxStride = 1.7 } = {}) {
  let walked = 0, foot = 0, wasOnGround = true;
  return {
    step(dt, { speed = 0, onGround = true } = {}) {
      const landed = onGround && !wasOnGround;
      wasOnGround = onGround;
      if (!onGround) return null;
      if (landed) { walked = 0; foot ^= 1; return { foot, gain: 1 }; }
      if (!(speed > minSpeed) || !(dt > 0)) { walked = Math.min(walked, 0.5); return null; }
      const stride = Math.min(maxStride, baseStride + speed * stridePerSpeed);
      walked += speed * dt;
      if (walked < stride) return null;
      walked -= stride;
      if (walked > stride) walked = 0; // a long frame: one step, not many
      foot ^= 1;
      return { foot, gain: Math.min(1, 0.55 + speed * 0.06) };
    },
    reset() { walked = 0; wasOnGround = true; },
  };
}

/**
 * Noise samples (-1..1) for a noise buffer. 'white' is even, 'pink' softer, 'brown' deep (like waves or a boom).
 * @param rng  a @pvp/seeded-random generator (same seed, same samples)
 */
export function noiseSamples(color, length, rng) {
  const out = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < length; i++) {
    const w = rng.next() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
    } else if (color === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      out[i] = last * 3.5;
    } else out[i] = w;
  }
  for (let i = 0; i < length; i++) out[i] = clamp(out[i], -1, 1);
  return out;
}
