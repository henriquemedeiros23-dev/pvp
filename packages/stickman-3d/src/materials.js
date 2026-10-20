// Materials for the stickman body and its gear.
import * as THREE from 'three';

/** A plain standard material. */
export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

// The zebra stripes texture is shared by every stickman and made only once, the first time
// it is needed, and only when a DOM canvas exists (never at import time, never in Node).
let stripes;
function stripesTexture() {
  if (stripes !== undefined) return stripes;
  stripes = null;
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return stripes;
  const c = document.createElement('canvas');
  const g = c.getContext && c.getContext('2d');
  if (!g) return stripes;
  c.width = 64; c.height = 64;
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#111';
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  stripes = t;
  return stripes;
}

/**
 * The body material for a color id, looked up in a colors table ({ id: { color, pattern? } }).
 * pattern 'gold' is shiny metal, 'stripes' uses the stripes texture (plain color without a DOM),
 * anything else (including 'rainbow', which Stickman recolors over time) is a plain color.
 * An unknown id uses 'black', or else the first color in the table.
 */
export function bodyMaterial(colorId, colors) {
  const def = colorDef(colorId, colors);
  if (def.pattern === 'gold') return new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.85, roughness: 0.25 });
  if (def.pattern === 'stripes') {
    const map = stripesTexture();
    if (map) return new THREE.MeshStandardMaterial({ map, roughness: 0.6 });
  }
  return new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.55 });
}

/** The color entry for an id, with the same fallback as bodyMaterial. */
export function colorDef(colorId, colors) {
  if (colors && Object.hasOwn(colors, colorId)) return colors[colorId];
  if (colors && Object.hasOwn(colors, 'black')) return colors.black;
  const first = colors && Object.values(colors)[0];
  return first || { color: '#1b1b1f' };
}

/** Dark eyes on very light bodies (white, stripes), white eyes otherwise. A color entry may set `eyes` itself. */
export function eyeColor(def) {
  if (def.eyes) return def.eyes;
  if (def.pattern === 'stripes') return '#111';
  const hex = /^#([0-9a-f]{6})$/i.exec(def.color || '');
  if (!hex) return '#fff';
  const n = parseInt(hex[1], 16);
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.85 ? '#111' : '#fff';
}
