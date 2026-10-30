// Turns a recipe (recipes.js) into a plan: a flat list of voices with exact times and values, ready to be played
// by Web Audio (player.js) or checked in a test. Pure: the only randomness comes from the `rng` passed in.

/** The quietest level an envelope fades to (exponential ramps cannot reach 0). */
export const SILENT = 0.0001;

const pair = v => (Array.isArray(v) ? [v[0], v[1]] : [v, v]);
const r4 = x => Math.round(x * 1e4) / 1e4; // keep plans readable and stable

function envelope(start, end, attack, hold, peak) {
  const a = Math.min(Math.max(attack, 0.001), (end - start) / 2);
  const h = Math.min(Math.max(hold || 0, 0), end - start - a);
  const pts = [[r4(start), 0], [r4(start + a), r4(peak)]];
  if (h > 0) pts.push([r4(start + a + h), r4(peak)]);
  pts.push([r4(end), SILENT]);
  return pts;
}

function filterOf(filter, pitch) {
  if (!filter) return null;
  const [a, b] = pair(filter.freq);
  return { type: filter.type, q: filter.q ?? 1, freq: [r4(a * pitch), r4(b * pitch)] };
}

/**
 * Plan one play of a recipe.
 * @param recipe  a recipe from SOUNDS (or your own)
 * @param opts.rng   a @pvp/seeded-random generator for the jitter (no rng = no jitter, always the same)
 * @param opts.gain  extra loudness (e.g. from distance), multiplied in
 * @returns { gain, dur, voices: [{ type: 'osc'|'noise', wave|color, start, end, freq?, offset?, filter, env }] }
 *   times in seconds from the start of the sound; freq and filter.freq are [from, to] (exponential slide);
 *   env is [[time, level], ...] (linear up to the peak, then exponential down to SILENT).
 */
export function planSound(recipe, { rng = null, gain = 1 } = {}) {
  if (!recipe || !Array.isArray(recipe.parts)) throw new Error('planSound: not a recipe');
  const jp = recipe.jitter?.pitch ?? 0, jg = recipe.jitter?.gain ?? 0;
  const pitch = rng && jp ? 1 + rng.range(-jp, jp) : 1;
  const level = rng && jg ? 1 - rng.next() * jg : 1;
  const voices = [];
  for (const part of recipe.parts) {
    const at = part.at ?? 0;
    const notes = part.notes ?? [null];
    notes.forEach((note, i) => {
      const start = at + i * (part.every ?? 0);
      const end = start + part.dur;
      const v = { start: r4(start), end: r4(end), filter: filterOf(part.filter, pitch), env: envelope(start, end, part.attack ?? 0.005, part.hold, part.gain ?? 1) };
      if (part.osc) {
        const [a, b] = note != null ? [note, note * (part.slide ?? 1)] : pair(part.freq);
        voices.push({ type: 'osc', wave: part.osc, freq: [r4(a * pitch), r4(b * pitch)], ...v });
      } else {
        // where in the shared noise buffer to start (0..1), so two bursts never sound exactly alike
        voices.push({ type: 'noise', color: part.noise || 'white', offset: rng ? r4(rng.next()) : 0, ...v });
      }
    });
  }
  const dur = voices.reduce((m, v) => Math.max(m, v.end), 0);
  return { gain: r4((recipe.gain ?? 1) * level * gain), dur: r4(dur), voices };
}
