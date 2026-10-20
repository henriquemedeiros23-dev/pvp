// The ruins: every box of the island merged into one mesh of light sandy stone, plus moss on top.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture } from './textures.js';

// Light sandy stone per box kind (sRGB). The texture is almost white, so these colors are what you see.
export const STONE_COLORS = Object.freeze({
  wall: '#e8d9b8', tower: '#dccaa6', pillar: '#f1e6cf', rubble: '#cfc1a2', stone: '#e2d4b4',
});

const TILE = 2.5; // meters per texture repeat

/**
 * @param {{ boxes: Array<{x:number,y:number,z:number,w:number,h:number,d:number,kind?:string}>, random: { next(): number }, colors?: object }} opts
 * @returns {{ group: THREE.Group, stone: THREE.Mesh, moss: THREE.Mesh|null }}
 */
export function buildRuins({ boxes, random, colors = STONE_COLORS }) {
  const group = new THREE.Group();
  group.name = 'ruins';
  const tex = noiseTexture(random, { size: 128, base: 238, spread: 26, blocks: true, cracks: 6 });
  const geos = [];
  for (const b of boxes) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    const uv = g.attributes.uv;
    const dims = [[b.d, b.h], [b.d, b.h], [b.w, b.d], [b.w, b.d], [b.w, b.h], [b.w, b.h]]; // +x -x +y -y +z -z
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / TILE, uv.getY(i) * dims[f][1] / TILE);
    }
    g.translate(b.x, b.y + b.h / 2, b.z);
    const c = new THREE.Color(colors[b.kind] || colors.stone).offsetHSL(0, 0, (random.next() - 0.5) * 0.06);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < cols.length; i += 3) { cols[i] = c.r; cols[i + 1] = c.g; cols[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geos.push(g);
  }
  let stone = null;
  if (geos.length) {
    stone = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.92 }));
    for (const g of geos) g.dispose();
    stone.castShadow = stone.receiveShadow = true;
    stone.name = 'stone';
    group.add(stone);
  }
  // moss on the tops of about half of the tall walls
  const mossGeos = [];
  for (const b of boxes) {
    if (b.h < 2.5 || random.next() < 0.5) continue;
    const g = new THREE.BoxGeometry(b.w + 0.06, 0.12, b.d + 0.06);
    g.translate(b.x, b.y + b.h + 0.02, b.z);
    mossGeos.push(g);
  }
  let moss = null;
  if (mossGeos.length) {
    moss = new THREE.Mesh(mergeGeometries(mossGeos), new THREE.MeshStandardMaterial({ color: '#6e9c48', roughness: 1 }));
    for (const g of mossGeos) g.dispose();
    moss.receiveShadow = true;
    moss.name = 'moss';
    group.add(moss);
  }
  return { group, stone, moss };
}
