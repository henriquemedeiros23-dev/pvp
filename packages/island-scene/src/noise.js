// Seeded value noise that wraps around (tiles), made of plain numbers. Pure: same random, same noise.

const smooth = t => t * t * (3 - 2 * t);

/**
 * Tileable value noise on a `cells` x `cells` lattice.
 * Returns f(u, v) for any real u, v in lattice units; it repeats every `cells` units. Values are 0..1.
 * @param {{ next(): number }} random
 * @param {number} cells
 */
export function valueNoise(random, cells) {
  const n = Math.max(1, Math.floor(cells));
  const lat = new Float32Array(n * n);
  for (let i = 0; i < lat.length; i++) lat[i] = random.next();
  const wrap = i => ((i % n) + n) % n;
  return (u, v) => {
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = smooth(u - x0), fy = smooth(v - y0);
    const xa = wrap(x0), xb = wrap(x0 + 1), ya = wrap(y0) * n, yb = wrap(y0 + 1) * n;
    const top = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * fx;
    const bot = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * fx;
    return top + (bot - top) * fy;
  };
}

/**
 * Fractal noise (several octaves of value noise). f(u, v) with u, v in 0..1 repeats every 1 (it tiles).
 * The values stay near 0.5 (about 0.2..0.8); use `contrast` to spread them.
 * @param {{ next(): number }} random
 * @param {{ cells?: number, octaves?: number, gain?: number }} [opts]
 */
export function fbm(random, { cells = 8, octaves = 4, gain = 0.5 } = {}) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push({ f: valueNoise(random, cells << o), k: cells << o });
  let norm = 0;
  for (let o = 0, a = 1; o < octaves; o++, a *= gain) norm += a;
  return (u, v) => {
    let s = 0, a = 1;
    for (const l of layers) { s += a * l.f(u * l.k, v * l.k); a *= gain; }
    return s / norm;
  };
}

/** Spread a value around 0.5 and clamp to 0..1. */
export const contrast = (v, k) => clamp01((v - 0.5) * k + 0.5);
export const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
