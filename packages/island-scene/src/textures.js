// Seeded noise textures made from plain numbers (no canvas, so they also work in Node).
import * as THREE from 'three';
import { fbm } from './noise.js';

/**
 * Grey values (0..255) for a square noise texture, optionally with stone-block lines and cracks.
 * Pure: same random state, same pixels.
 * @param {{ next(): number }} random seeded random (see @pvp/seeded-random)
 * @param {{ size?: number, base?: number, spread?: number, blocks?: boolean, cracks?: number }} [opts]
 * @returns {Uint8Array} size*size grey values
 */
export function noisePixels(random, { size = 128, base = 235, spread = 30, blocks = false, cracks = 0 } = {}) {
  const px = new Uint8Array(size * size);
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  for (let i = 0; i < px.length; i++) px[i] = clamp(base + (random.next() - 0.5) * spread);
  // darken one pixel (wrapping around the edges, so the texture tiles)
  const dark = (x, y, f) => {
    const i = (((y % size) + size) % size) * size + (((x % size) + size) % size);
    px[i] = clamp(px[i] * f);
  };
  if (blocks) {
    // stone blocks: 4 rows, joints shifted every other row
    const rows = 4, rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const y = Math.round(r * rowH);
      for (let x = 0; x < size; x++) { dark(x, y, 0.62); dark(x, y + 1, 0.8); }
      const off = r % 2 ? size / 4 : 0;
      for (let x = off; x < size; x += size / 2) {
        for (let k = 0; k < rowH; k++) { dark(Math.round(x), y + k, 0.62); dark(Math.round(x) + 1, y + k, 0.8); }
      }
    }
  }
  for (let c = 0; c < cracks; c++) {
    let x = random.next() * size, y = random.next() * size;
    for (let s = 0; s < 5; s++) {
      const nx = x + (random.next() - 0.5) * 30, ny = y + random.next() * 20;
      const steps = Math.ceil(Math.hypot(nx - x, ny - y));
      for (let k = 0; k <= steps; k++) dark(Math.round(x + (nx - x) * k / steps), Math.round(y + (ny - y) * k / steps), 0.75);
      x = nx; y = ny;
    }
  }
  return px;
}

/**
 * A repeating, seeded grey noise texture (THREE.DataTexture). Values are close to white by default,
 * so the material/vertex color decides how bright a surface is.
 * @param {{ next(): number }} random
 * @param {Parameters<typeof noisePixels>[1]} [opts]
 */
export function noiseTexture(random, opts = {}) {
  const size = opts.size ?? 128;
  const grey = noisePixels(random, opts);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < grey.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = grey[i];
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const SRGB_TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });

/**
 * Close-up grass for the ground (#43): lots of short blade strokes in light and dark greens and a few
 * yellowish ones, on a soft noise. It tiles (strokes wrap around the edges). Pure: same random, same pixels.
 * The colors are near white-green: the big ground texture (see ground-field.js) gives the real color,
 * this only adds the small detail.
 * @param {{ next(): number }} random
 * @param {{ size?: number, strokes?: number }} [opts] strokes per pixel (default 0.5)
 * @returns {{ size: number, rgb: Uint8Array, height: Float32Array, gain: number }}
 *   rgb: size*size*3 sRGB bytes; height: 0..1 bumps (for a normal map); gain: [r, g, b] = 1 / average linear value
 */
export function grassDetailPixels(random, { size = 256, strokes = 0.5 } = {}) {
  const n = size * size;
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n), h = new Float32Array(n);
  const soft = fbm(random, { cells: 4, octaves: 3 });
  for (let y = 0, i = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++) {
      const s = 0.72 + (soft(x / size, y / size) - 0.5) * 0.5;
      r[i] = s * 0.86; g[i] = s; b[i] = s * 0.7; h[i] = 0.2;
    }
  }
  const scale = size / 256;
  const count = Math.round(n * strokes);
  for (let k = 0; k < count; k++) {
    let x = random.next() * size, y = random.next() * size;
    const a = random.next() * Math.PI * 2, len = (2 + random.next() * 5) * scale;
    const lum = 0.6 + random.next() * 0.5, kind = random.next();
    // most blades green, some yellow-green, a few dark blue-green
    const cr = kind < 0.15 ? lum * 1.0 : kind > 0.9 ? lum * 0.62 : lum * 0.8;
    const cg = lum;
    const cb = kind < 0.15 ? lum * 0.5 : kind > 0.9 ? lum * 0.72 : lum * 0.62;
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let t = 0; t <= len; t++) {
      const px = ((Math.round(x) % size) + size) % size, py = ((Math.round(y) % size) + size) % size;
      const i = py * size + px, f = 1 - t / (len + 1); // the tip is thinner: blend less
      r[i] += (cr - r[i]) * 0.75 * f; g[i] += (cg - g[i]) * 0.75 * f; b[i] += (cb - b[i]) * 0.75 * f;
      h[i] = Math.max(h[i], 0.35 + 0.65 * f * lum);
      x += dx; y += dy;
    }
  }
  const rgb = new Uint8Array(n * 3);
  let lr = 0, lg = 0, lb = 0;
  const byte = v => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = byte(r[i]); rgb[i * 3 + 1] = byte(g[i]); rgb[i * 3 + 2] = byte(b[i]);
    lr += SRGB_TO_LINEAR[rgb[i * 3]]; lg += SRGB_TO_LINEAR[rgb[i * 3 + 1]]; lb += SRGB_TO_LINEAR[rgb[i * 3 + 2]];
  }
  // per color channel, so on average the detail changes neither brightness nor color (only small variations)
  return { size, rgb, height: h, gain: [n / lr, n / lg, n / lb] };
}

/**
 * Normal map bytes (RGBA) from a tiling height field (0..1). `strength` makes the bumps steeper.
 * @param {Float32Array} height size*size values
 * @param {number} size
 * @param {number} [strength]
 */
export function heightToNormalPixels(height, size, strength = 2) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0, i = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      data[i * 4] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      data[i * 4 + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      data[i * 4 + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      data[i * 4 + 3] = 255;
    }
  }
  return data;
}

/**
 * A repeating DataTexture from RGB or RGBA bytes.
 * @param {Uint8Array} bytes
 * @param {number} size
 * @param {{ channels?: 3|4, srgb?: boolean, repeat?: number }} [opts]
 */
export function dataTexture(bytes, size, { channels = 4, srgb = true, repeat = 1 } = {}) {
  let data = bytes;
  if (channels === 3) {
    data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = bytes[i * 3]; data[i * 4 + 1] = bytes[i * 3 + 1]; data[i * 4 + 2] = bytes[i * 3 + 2]; data[i * 4 + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return t;
}

/** The grass detail as a texture, plus (if `normals`) its normal map. */
export function grassDetailTextures(random, { size = 256, normals = true, repeat = 1 } = {}) {
  const px = grassDetailPixels(random, { size });
  const map = dataTexture(px.rgb, size, { channels: 3, repeat });
  const normalMap = normals ? dataTexture(heightToNormalPixels(px.height, size, 2.2 * size / 256), size, { srgb: false, repeat }) : null;
  return { map, normalMap, gain: px.gain };
}

/** Gentle waves for the water's normal map: tiling fractal noise turned into normals. */
export function waterNormalTexture(random, { size = 128, repeat = 1 } = {}) {
  const f = fbm(random, { cells: 6, octaves: 4, gain: 0.55 });
  const h = new Float32Array(size * size);
  for (let y = 0, i = 0; y < size; y++) for (let x = 0; x < size; x++, i++) h[i] = f(x / size, y / size);
  return dataTexture(heightToNormalPixels(h, size, 6 * size / 128), size, { srgb: false, repeat });
}
