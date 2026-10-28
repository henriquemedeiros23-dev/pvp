// What the ground is like at each place of the island (#43): how lush the grass is, where the dirt is
// (worn soil around the ruins and a few winding paths) and where the sand starts.
// One seeded grid of numbers, used for the big ground texture and to place the plants
// (grass and flowers do not grow on paths). Pure: same island and seed, same field. Visual only.
import { fbm, contrast, clamp01, smoothstep } from './noise.js';

/** Ground colors (sRGB). */
export const GROUND_COLORS = Object.freeze({
  lush: '#3c5e29',   // deep green grass
  grass: '#557935',  // normal grass
  light: '#748f48',  // lighter, sunnier patches (still green, not dry)
  dirt: '#735c41',   // soil on paths and around the ruins
  darkDirt: '#5a4733',
  sand: '#e6d29e',   // dry sand at the island's edge (the beach starts with the same color)
});

const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

/**
 * @param {object} opts
 * @param {number} opts.islandRadius
 * @param {Array<{x:number,z:number,w:number,d:number,y?:number}>} [opts.boxes] the ruins (only their footprint is used)
 * @param {{ next(): number }} opts.random seeded random
 * @param {number} [opts.size] grid cells per side (also the ground texture size): 512 desktop, 256 phones
 * @returns {{ size: number, half: number, cell: number, lush: Float32Array, dirt: Float32Array, sand: Float32Array,
 *   ruinDist: Float32Array, sample(x: number, z: number): { lush: number, dirt: number, sand: number, ruinDist: number },
 *   colorPixels(): Uint8Array }}
 *   Cell (i, j) is at x = -half + (i + 0.5) * cell, z = half - (j + 0.5) * cell (row 0 is the far +z side,
 *   so the arrays can be used as a texture on the ground disc as they are).
 */
export function createGroundField({ islandRadius, boxes = [], random, size = 256 }) {
  const R = islandRadius, half = R + 12, cell = (2 * half) / size, n = size * size;
  const xOf = i => -half + (i + 0.5) * cell, zOf = j => half - (j + 0.5) * cell;

  // distance (m) to the nearest ruin footprint: mark the cells under the ruins, then a two-pass chamfer
  const ruinDist = new Float32Array(n).fill(1e6);
  for (const b of boxes) {
    if ((b.y ?? 0) > 0.5) continue; // only boxes standing on the ground wear the grass away
    const i0 = Math.max(0, Math.floor((b.x - b.w / 2 + half) / cell)), i1 = Math.min(size - 1, Math.floor((b.x + b.w / 2 + half) / cell));
    const j0 = Math.max(0, Math.floor((half - (b.z + b.d / 2)) / cell)), j1 = Math.min(size - 1, Math.floor((half - (b.z - b.d / 2)) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) ruinDist[j * size + i] = 0;
  }
  const a = cell, d = cell * Math.SQRT2;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const k = j * size + i; let v = ruinDist[k];
    if (i > 0) v = Math.min(v, ruinDist[k - 1] + a);
    if (j > 0) { v = Math.min(v, ruinDist[k - size] + a); if (i > 0) v = Math.min(v, ruinDist[k - size - 1] + d); if (i < size - 1) v = Math.min(v, ruinDist[k - size + 1] + d); }
    ruinDist[k] = v;
  }
  for (let j = size - 1; j >= 0; j--) for (let i = size - 1; i >= 0; i--) {
    const k = j * size + i; let v = ruinDist[k];
    if (i < size - 1) v = Math.min(v, ruinDist[k + 1] + a);
    if (j < size - 1) { v = Math.min(v, ruinDist[k + size] + a); if (i < size - 1) v = Math.min(v, ruinDist[k + size + 1] + d); if (i > 0) v = Math.min(v, ruinDist[k + size - 1] + d); }
    ruinDist[k] = v;
  }

  const patches = fbm(random, { cells: 9, octaves: 4 });   // big lush / lighter patches (~50 m)
  const clumps = fbm(random, { cells: 40, octaves: 2 });   // small clumps (~10 m)
  const ragged = fbm(random, { cells: 70, octaves: 2 });   // ragged edges of the dirt and the sand
  const pathNoise = fbm(random, { cells: 4, octaves: 2 }); // the paths follow one line of this noise
  const pathArea = fbm(random, { cells: 3, octaves: 1 });  // and only show in some parts of the island

  // paths: the places where pathNoise is 0.5. Its distance in meters is |value - 0.5| / slope.
  // (worked out only where a path can be: most of the island has none, and noise is the slow part)
  const pn = new Float32Array(n).fill(NaN);
  const pathAt = (i, j) => {
    i = Math.max(0, Math.min(size - 1, i)); j = Math.max(0, Math.min(size - 1, j));
    const k = j * size + i;
    if (Number.isNaN(pn[k])) pn[k] = pathNoise((i + 0.5) / size, (j + 0.5) / size);
    return pn[k];
  };

  const lush = new Float32Array(n), dirt = new Float32Array(n), sand = new Float32Array(n);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i, u = (i + 0.5) / size, v = (j + 0.5) / size;
      const x = xOf(i), z = zOf(j), r = Math.hypot(x, z);
      const rag = ragged(u, v) - 0.5;
      lush[k] = clamp01(contrast(patches(u, v), 2.6) * 0.8 + (clumps(u, v) - 0.5) * 0.9 + 0.1);
      // worn soil right around the ruins (0.5..2.5 m, ragged)
      const reach = 1.4 + rag * 3.2;
      const nearRuin = 1 - smoothstep(reach * 0.4, reach + 0.7, ruinDist[k]);
      // winding paths, about 1.6 m wide, only in some areas and not at the beach
      let onPath = 0;
      const area = r < R - 14 ? smoothstep(0.48, 0.56, pathArea(u, v)) * (1 - smoothstep(R - 30, R - 14, r)) : 0;
      if (area > 0) {
        const gx = (pathAt(i + 1, j) - pathAt(i - 1, j)) / (2 * cell), gz = (pathAt(i, j + 1) - pathAt(i, j - 1)) / (2 * cell);
        const meters = Math.abs(pathAt(i, j) - 0.5) / Math.max(1e-5, Math.hypot(gx, gz));
        onPath = (1 - smoothstep(0.5, 1.3 + rag, meters)) * area;
      }
      dirt[k] = clamp01(Math.max(nearRuin * 0.95, onPath * 0.9));
      sand[k] = smoothstep(R - 5, R + 7, r + rag * 9);
    }
  }

  function sample(x, z) {
    const fi = Math.max(0, Math.min(size - 1.001, (x + half) / cell - 0.5)), fj = Math.max(0, Math.min(size - 1.001, (half - z) / cell - 0.5));
    const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, tz = fj - j, k = j * size + i;
    const bl = arr => {
      const t = arr[k] + (arr[k + 1] - arr[k]) * tx, b = arr[k + size] + (arr[k + size + 1] - arr[k + size]) * tx;
      return t + (b - t) * tz;
    };
    return { lush: bl(lush), dirt: bl(dirt), sand: bl(sand), ruinDist: bl(ruinDist) };
  }

  // a fixed pseudo-random number per cell (a hash, so colorPixels() gives the same bytes every call)
  const salt = Math.floor(random.next() * 0x7fffffff);
  const grain = k => { let h = Math.imul((k ^ salt) >>> 0, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca77); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

  /** RGBA bytes of the ground's colors (sRGB). Alpha = how much grass detail shows (less on dirt and sand). */
  function colorPixels() {
    const C = Object.fromEntries(Object.entries(GROUND_COLORS).map(([key, h]) => [key, hex(h)]));
    const out = new Uint8Array(n * 4);
    const mix = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    for (let k = 0; k < n; k++) {
      const l = lush[k];
      let c = l < 0.5 ? mix(C.light, C.grass, l * 2) : mix(C.grass, C.lush, (l - 0.5) * 2);
      const dc = mix(C.dirt, C.darkDirt, clamp01(1 - ruinDist[k] / 2.5) * 0.7);
      c = mix(c, dc, smoothstep(0.15, 0.85, dirt[k]));
      c = mix(c, C.sand, sand[k]);
      const jitter = 1 + (grain(k) - 0.5) * 0.05; // a little per-pixel grain
      for (let ch = 0; ch < 3; ch++) out[k * 4 + ch] = Math.max(0, Math.min(255, Math.round(c[ch] * jitter * 255)));
      out[k * 4 + 3] = Math.round(255 * (1 - sand[k]) * (1 - 0.75 * smoothstep(0.15, 0.85, dirt[k])));
    }
    return out;
  }

  return { size, half, cell, lush, dirt, sand, ruinDist, sample, colorPixels };
}
