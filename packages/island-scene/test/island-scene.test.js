import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { generateIsland } from '@pvp/world-gen';
import { createRandom } from '@pvp/seeded-random';
import {
  createIslandScene, buildChest, createChests, createGoldenChest, noisePixels, noiseTexture,
  CHEST_SIZE, LID_OPEN_ANGLE, SKY,
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
