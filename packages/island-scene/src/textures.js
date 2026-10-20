// Seeded noise textures made from plain numbers (no canvas, so they also work in Node).
import * as THREE from 'three';

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
