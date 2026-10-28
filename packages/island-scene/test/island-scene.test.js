import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { generateIsland } from '@pvp/world-gen';
import { createRandom } from '@pvp/seeded-random';
import {
  createIslandScene, buildChest, createChests, createGoldenChest, noisePixels, noiseTexture,
  CHEST_SIZE, LID_OPEN_ANGLE, SKY, WATER, PLANT_COUNTS, GROUND_COLORS,
  createGroundField, grassDetailPixels, heightToNormalPixels, fbm, valueNoise,
} from '../src/index.js';

const island = generateIsland();

// world-space box of an object
const boxOf = obj => { let top = obj; while (top.parent) top = top.parent; top.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj); };
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test('no DOM is needed: the whole scene builds in Node', () => {
  assert.equal(typeof document, 'undefined');
  const s = createIslandScene({ island });
  assert.ok(s.group.isGroup);
  assert.ok(s.sun.isDirectionalLight && s.sun.castShadow);
  assert.ok(s.fog.isFog);
  assert.equal(s.chests.meshes.length, island.chests.length);
  assert.equal(s.golden.visible, false);
  const scene = new THREE.Scene();
  s.addTo(scene);
  assert.equal(scene.fog, s.fog);
  assert.ok(scene.background.isColor); // never the black clear color
});

test('same seed, same scenery; another seed differs', () => {
  const positions = s => { const out = []; s.group.traverse(o => { if (o.isInstancedMesh) out.push(...o.instanceMatrix.array.slice(0, 64)); }); return out; };
  const colors = s => Array.from(s.ruins.stone.geometry.attributes.color.array.slice(0, 300));
  const a = createIslandScene({ island, random: 7 }), b = createIslandScene({ island, random: 7 });
  const c = createIslandScene({ island, random: 8 });
  assert.deepEqual(positions(a), positions(b));
  assert.deepEqual(colors(a), colors(b));
  assert.notDeepEqual(positions(a), positions(c));
  // a seeded random object works too
  const d = createIslandScene({ island, random: createRandom(7) });
  assert.deepEqual(positions(a), positions(d));
});

test('noise textures are seeded and light (they must not darken the stone)', () => {
  const p1 = noisePixels(createRandom(1), { size: 128, blocks: true, cracks: 3 });
  const p2 = noisePixels(createRandom(1), { size: 128, blocks: true, cracks: 3 });
  assert.deepEqual(p1, p2);
  const avg = p1.reduce((s, v) => s + v, 0) / p1.length;
  assert.ok(avg > 200, `average ${avg}`);
  const t = noiseTexture(createRandom(1), { size: 16 });
  assert.ok(t.isDataTexture);
  assert.equal(t.image.data.length, 16 * 16 * 4);
});

test('ruins: one merged stone mesh with normals, uvs and light vertex colors', () => {
  const s = createIslandScene({ island });
  const geo = s.ruins.stone.geometry;
  for (const name of ['position', 'normal', 'uv', 'color']) assert.ok(geo.attributes[name], name);
  assert.equal(geo.attributes.position.count, island.boxes.length * 24);
  const col = geo.attributes.color.array;
  let min = Infinity;
  for (let i = 0; i < col.length; i += 3) min = Math.min(min, 0.2126 * col[i] + 0.7152 * col[i + 1] + 0.0722 * col[i + 2]);
  assert.ok(min > 0.45, `darkest stone (linear luminance) ${min.toFixed(2)}`);
});

test('sky dome, water and sun follow the focus point and stay inside the camera far plane', () => {
  const s = createIslandScene({ island });
  s.update(0.016, 1, { x: 150, z: -120 });
  assert.equal(s.sky.group.position.x, 150);
  assert.equal(s.sky.group.position.z, -120);
  assert.equal(s.water.position.x, 150);
  assert.equal(s.sun.target.position.x, 150);
  assert.ok(SKY.radius < 900 - 50, 'the game camera far plane is 900');
  assert.ok(SKY.fogFar < SKY.radius);
});

test('chest lid lies along the width, hinged at the back, lock on the front', () => {
  const { width: W, depth: D, height: H } = CHEST_SIZE;
  const chest = buildChest();
  const lid = chest.userData.lid;
  assert.ok(near(lid.position.z, -D / 2) && near(lid.position.y, H), 'hinge on the back top edge');
  const shell = lid.children[0];
  const b = boxOf(shell);
  assert.ok(near(b.max.x - b.min.x, W, 0.01), `lid width ${b.max.x - b.min.x}`);
  assert.ok(near(b.max.z - b.min.z, D, 0.01), `lid depth ${b.max.z - b.min.z}`);
  assert.ok(near(b.min.y, H, 0.01) && near(b.max.y, H + D / 2, 0.01), 'a half cylinder on top of the box');
  const lock = lid.getObjectByName('lock');
  const lb = boxOf(lock);
  assert.ok(lb.min.z >= D / 2 - 1e-3, 'lock sits in front of the box');
  assert.ok(lb.min.y < H && lb.max.y > H - 0.02, 'lock touches the top of the front');

  // open: the lid swings up and back over the hinge
  lid.rotation.x = LID_OPEN_ANGLE;
  const ob = boxOf(shell);
  assert.ok(ob.max.y > H + D * 0.8, 'open lid stands up');
  assert.ok(ob.max.z < D / 2 - 0.2, 'open lid leans backwards');
  assert.ok(near(ob.max.x - ob.min.x, W, 0.01), 'still as wide as the chest');
});

test('chests open and close smoothly; unknown ids are ignored', () => {
  const chests = createChests({ chests: [{ x: 10, z: 0 }, { x: 0, z: 10 }] });
  // the front (+z) faces the island center
  const m = chests.meshes[0];
  const front = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
  assert.ok(front.x < -0.99);
  chests.setOpen(0, true);
  chests.setOpen(99, true);
  assert.equal(chests.isOpen(0), true);
  assert.equal(chests.isOpen(1), false);
  chests.update(0.05);
  const a = m.userData.lid.rotation.x;
  assert.ok(a < 0 && a > LID_OPEN_ANGLE);
  chests.update(Infinity);
  assert.ok(near(m.userData.lid.rotation.x, LID_OPEN_ANGLE));
  chests.closeAll();
  chests.update(Infinity);
  assert.equal(m.userData.lid.rotation.x, 0);
});

test('golden chest shows, spins and hides', () => {
  const g = createGoldenChest();
  assert.equal(g.visible, false);
  g.show(5, -3);
  assert.equal(g.visible, true);
  assert.equal(g.mesh.position.x, 5);
  g.update(2);
  assert.ok(near(g.mesh.rotation.y, 1.2));
  assert.ok(g.mesh.getObjectByName('beam'));
  g.hide();
  assert.equal(g.visible, false);
});

// ---- #43: a green, alive, more realistic island ----

const desktop = createIslandScene({ island, random: 3 });
const phone = createIslandScene({ island, random: 3, mobile: true });

test('ground is green: the big ground texture is mostly grass, not dry yellow-brown', () => {
  const px = desktop.ground.material.map.image.data, n = desktop.field.size;
  let r = 0, g = 0, b = 0, c = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (Math.hypot((i + 0.5) / n * 2 - 1, (j + 0.5) / n * 2 - 1) > 0.85) continue; // inside the island, away from the sand
    const k = (j * n + i) * 4; r += px[k]; g += px[k + 1]; b += px[k + 2]; c++;
  }
  r /= c; g /= c; b /= c;
  assert.ok(g > r * 1.25 && g > b * 1.6, `average ground color rgb(${r.toFixed(0)}, ${g.toFixed(0)}, ${b.toFixed(0)})`);
  // the grass colors themselves are green
  for (const key of ['lush', 'grass', 'light']) {
    const c3 = new THREE.Color(GROUND_COLORS[key]);
    assert.ok(c3.g > c3.r && c3.g > c3.b, key);
  }
});

test('ground field: dirt around the ruins and on a few paths, sand at the edge, the same for the same seed', () => {
  const R = island.islandRadius;
  const f1 = createGroundField({ islandRadius: R, boxes: island.boxes, random: createRandom(5), size: 512 });
  const f2 = createGroundField({ islandRadius: R, boxes: island.boxes, random: createRandom(5), size: 512 });
  assert.deepEqual(f1.colorPixels(), f2.colorPixels());
  assert.deepEqual(f1.colorPixels(), f1.colorPixels(), 'colorPixels() gives the same bytes every call');
  // right next to a ruin wall there is (some) dirt; in the open, mostly grass
  let nearDirt = 0, nearN = 0, farDirt = 0, farN = 0, inSand = 0;
  for (let k = 0; k < f1.dirt.length; k++) {
    if (f1.ruinDist[k] > 0 && f1.ruinDist[k] < 1) { nearDirt += f1.dirt[k]; nearN++; }
    if (f1.ruinDist[k] > 10) { farDirt += f1.dirt[k]; farN++; }
  }
  assert.ok(nearDirt / nearN > 0.4, `dirt next to the ruins ${(nearDirt / nearN).toFixed(2)}`);
  assert.ok(farDirt / farN < 0.1, `dirt in the open ${(farDirt / farN).toFixed(2)}`);
  assert.ok(farDirt > 0, 'there are some paths');
  assert.ok(f1.sample(0, R + 10).sand > 0.9 && f1.sample(0, 0).sand === 0, 'sand only at the edge');
  inSand = f1.sample(R + 10, 0).sand;
  assert.ok(inSand > 0.9);
  // sampling between cells is smooth and stays in range
  const s = f1.sample(12.3, -45.6);
  for (const k of ['lush', 'dirt', 'sand']) assert.ok(s[k] >= 0 && s[k] <= 1, k);
});

test('grass detail texture tiles, is seeded, and does not change the average color (gain)', () => {
  const a = grassDetailPixels(createRandom(2), { size: 64 }), b = grassDetailPixels(createRandom(2), { size: 64 });
  assert.deepEqual(a.rgb, b.rgb);
  assert.equal(a.rgb.length, 64 * 64 * 3);
  assert.equal(a.gain.length, 3);
  for (const g of a.gain) assert.ok(g > 1 && g < 6, `gain ${g}`);
  // a flat height gives a flat normal map (pointing straight up: 128, 128, 255)
  const flat = heightToNormalPixels(new Float32Array(16).fill(0.5), 4);
  assert.deepEqual(Array.from(flat.slice(0, 4)), [128, 128, 255, 255]);
  // noise wraps around (tiles)
  const f = fbm(createRandom(4), { cells: 4, octaves: 3 });
  assert.ok(Math.abs(f(0.1, 0.2) - f(1.1, 2.2)) < 1e-6);
  const v = valueNoise(createRandom(4), 5);
  assert.ok(Math.abs(v(0.3, 0.7) - v(5.3, -4.3)) < 1e-6);
});

test('plants: grass tufts, flowers, bushes and rocks, never inside the ruins, nothing big on a chest', () => {
  const p = desktop.plants;
  for (const name of ['tufts', 'flowers', 'bushes', 'rocks']) {
    const m = desktop.group.getObjectByName(name);
    assert.ok(m && m.isInstancedMesh, name);
    assert.equal(m.count, PLANT_COUNTS.desktop[name], `${name}: all of them found a place`);
    assert.ok(m.instanceColor, `${name} have their own colors`);
  }
  assert.equal(p.palms.children.length, PLANT_COUNTS.desktop.palms);
  const v = new THREE.Vector3(), m4 = new THREE.Matrix4();
  for (const mesh of [p.tufts, p.bushes, p.rocks, p.flowers]) {
    for (let i = 0; i < mesh.count; i += 7) {
      mesh.getMatrixAt(i, m4); v.setFromMatrixPosition(m4);
      assert.ok(desktop.field.sample(v.x, v.z).ruinDist > 0.2, `${mesh.name} ${i} is inside a ruin at ${v.x.toFixed(1)}, ${v.z.toFixed(1)}`);
      if (mesh === p.bushes) for (const c of island.chests) assert.ok(Math.hypot(v.x - c.x, v.z - c.z) > 2.9, 'bush on a chest');
      if (mesh === p.tufts) assert.ok(desktop.field.sample(v.x, v.z).dirt < 0.4, 'no grass on the paths');
    }
  }
  // bushes stay low, so they never hide a player (1.8 m)
  p.bushes.geometry.computeBoundingBox();
  let maxY = 0;
  for (let i = 0; i < p.bushes.count; i++) { p.bushes.getMatrixAt(i, m4); maxY = Math.max(maxY, p.bushes.geometry.boundingBox.max.y * new THREE.Vector3().setFromMatrixScale(m4).y); }
  assert.ok(maxY < 1.2, `tallest bush ${maxY.toFixed(2)} m`);
});

test('phones get a lighter island: fewer plants and clouds, smaller textures, no normal maps, no shadows', () => {
  for (const name of ['tufts', 'flowers', 'bushes', 'rocks']) {
    assert.ok(phone.plants[name].count < desktop.plants[name].count * 0.5, name);
  }
  assert.ok(phone.sky.clouds.count < desktop.sky.clouds.count);
  assert.ok(phone.ground.material.map.image.width < desktop.ground.material.map.image.width);
  assert.ok(phone.ground.userData.detail.map.image.width < desktop.ground.userData.detail.map.image.width);
  assert.equal(phone.ground.userData.detail.normalMap, null);
  assert.ok(desktop.ground.material.normalMap, 'desktop has the grass bumps');
  assert.equal(phone.sun.castShadow, false);
  assert.equal(desktop.sun.castShadow, true);
  assert.equal(phone.plants.bushes.castShadow, false);
  assert.ok(phone.ground.material.isMeshLambertMaterial, 'cheaper material on phones');
  // same seed, same phone scenery
  const again = createIslandScene({ island, random: 3, mobile: true });
  assert.deepEqual(Array.from(again.plants.flowers.instanceMatrix.array.slice(0, 160)), Array.from(phone.plants.flowers.instanceMatrix.array.slice(0, 160)));
  assert.deepEqual(Array.from(again.ground.material.map.image.data.slice(0, 4000)), Array.from(phone.ground.material.map.image.data.slice(0, 4000)));
});

test('beach: light dry sand at the top, darker wet sand at the water line; water waves move with time only', () => {
  const g = phone.beach.geometry, pos = g.attributes.position, col = g.attributes.color;
  const lum = i => 0.2126 * col.getX(i) + 0.7152 * col.getY(i) + 0.0722 * col.getZ(i);
  let top = -1, wet = -1;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (top < 0 && y > -0.03) top = i;
    if (wet < 0 && Math.abs(y - (WATER.level + 0.03)) < 0.06) wet = i;
  }
  assert.ok(top >= 0 && wet >= 0);
  assert.ok(lum(wet) < lum(top) * 0.85, `wet ${lum(wet).toFixed(2)} vs dry ${lum(top).toFixed(2)}`);

  const s = createIslandScene({ island, random: 3, mobile: true });
  s.update(0.016, 2, { x: 10, z: 20 });
  const o1 = s.water.userData.waves.offset.clone(), y1 = s.water.position.y, f1 = s.foam.material.opacity;
  s.update(0.016, 2, { x: 10, z: 20 });
  assert.deepEqual(s.water.userData.waves.offset.toArray(), o1.toArray(), 'same time and place, same waves');
  assert.equal(s.water.position.y, y1);
  assert.equal(s.foam.material.opacity, f1);
  s.update(0.016, 3, { x: 10, z: 20 });
  assert.notDeepEqual(s.water.userData.waves.offset.toArray(), o1.toArray(), 'the waves drift with time');
  // walking does not drag the waves along: moving the focus by one wave tile gives the same offset
  const t = createIslandScene({ island, random: 3, mobile: true });
  t.update(0, 5, { x: 0, z: 0 });
  const a = t.water.userData.waves.offset.clone();
  t.update(0, 5, { x: WATER.tile * 3, z: -WATER.tile * 2 });
  assert.ok(Math.abs(t.water.userData.waves.offset.x - a.x) < 1e-6 || Math.abs(Math.abs(t.water.userData.waves.offset.x - a.x) - 1) < 1e-6);
  assert.ok(Math.abs(t.water.userData.waves.offset.y - a.y) < 1e-6 || Math.abs(Math.abs(t.water.userData.waves.offset.y - a.y) - 1) < 1e-6);
});

test('ruins: the foot of each block is a bit darker and greener (moss), the top is the plain stone', () => {
  const geo = desktop.ruins.stone.geometry, pos = geo.attributes.position, col = geo.attributes.color;
  // box 0: its first face's corners (some at the bottom, some at the top)
  let bottom = null, topC = null;
  for (let i = 0; i < 24; i++) {
    const c = [col.getX(i), col.getY(i), col.getZ(i)];
    if (pos.getY(i) < island.boxes[0].y + 0.01) bottom = c; else topC = c;
  }
  assert.ok(bottom[0] < topC[0] && bottom[2] < topC[2], 'darker at the foot');
  assert.ok(bottom[1] / bottom[0] > topC[1] / topC[0], 'greener at the foot');
});
