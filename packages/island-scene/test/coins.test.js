import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { generateIsland } from '@pvp/world-gen';
import { buildCoin, createCoinPops, createIslandScene, COIN_SIZE, COIN_POP, CHEST_SIZE } from '../src/index.js';

const sizeOf = obj => { obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()); };
const run = (pops, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) pops.update(dt); };

test('buildCoin: an almost square gold coin, thin, with a "P" on both sides and darker edges', () => {
  const coin = buildCoin();
  const s = sizeOf(coin);
  assert.ok(Math.abs(s.x - COIN_SIZE.width) < 0.03, `width ${s.x}`);
  assert.ok(Math.abs(s.y - COIN_SIZE.height) < 0.03, `height ${s.y}`);
  assert.ok(s.y / s.x > 1 && s.y / s.x < 1.25, 'almost square');
  assert.ok(s.z < 0.1, 'thin');
  const [body, front, back] = coin.children;
  assert.equal(body.material.length, 2, 'flat sides + edges');
  assert.ok(body.material[1].color.getHSL({}).l < body.material[0].color.getHSL({}).l, 'edges darker than the sides');
  assert.ok(front.position.z > 0 && back.position.z < 0, 'a P on each side');
  assert.equal(coin.userData.materials.length, 3);
  // the corners are cut: no vertex sits at the exact corner of the bounding box
  const pos = body.geometry.attributes.position;
  const hx = COIN_SIZE.width / 2, hy = COIN_SIZE.height / 2;
  for (let i = 0; i < pos.count; i++) {
    assert.ok(!(Math.abs(Math.abs(pos.getX(i)) - hx) < 1e-6 && Math.abs(Math.abs(pos.getY(i)) - hy) < 1e-6), 'corner is cut');
  }
});

test('coin pop: coins jump up and out, bounce on the ground, fade and hide', () => {
  const pops = createCoinPops({ max: 8, random: 1 });
  assert.equal(pops.active, 0);
  assert.equal(pops.burst(10, 0.7, -4, { count: 5 }), 5);
  assert.equal(pops.active, 5);
  const live = pops.coins.filter(c => c.live);
  run(pops, 0.25);
  for (const c of live) {
    assert.ok(c.mesh.position.y > 0.7, 'goes up first');
    assert.ok(Math.hypot(c.mesh.position.x - 10, c.mesh.position.z + 4) > 0.1, 'and out');
    assert.equal(c.mesh.userData.materials[0].opacity, 1);
  }
  run(pops, 0.7);
  for (const c of live) {
    assert.ok(c.mesh.position.y >= COIN_POP.floor - 1e-9, 'never under the ground');
    assert.ok(c.mesh.userData.materials[0].opacity < 1, 'fading');
  }
  run(pops, COIN_POP.life);
  assert.equal(pops.active, 0);
  assert.ok(pops.coins.every(c => !c.mesh.visible));
});

test('coin pop: same seed and same steps give the same coins; the pool never grows', () => {
  const path = seed => {
    const p = createCoinPops({ max: 4, random: seed });
    p.burst(0, 1, 0, { count: 3 });
    run(p, 0.5);
    return p.coins.map(c => c.mesh.position.toArray().map(v => +v.toFixed(6)));
  };
  assert.deepEqual(path(5), path(5));
  assert.notDeepEqual(path(5), path(6));
  const p = createCoinPops({ max: 4, random: 1 });
  assert.equal(p.burst(0, 1, 0, { count: 10 }), 4, 'at most max coins');
  p.burst(0, 1, 0, { count: 2 }); // reuses the oldest
  assert.equal(p.group.children.length, 4);
  p.update(Infinity);
  assert.equal(p.active, 0);
});

test('island scene: coins pop out of an opened chest (fewer on phones)', () => {
  const island = generateIsland();
  const s = createIslandScene({ island });
  assert.ok(s.group.children.includes(s.coinPops.group));
  assert.equal(s.popChestCoins(0), 6);
  assert.equal(s.popChestCoins(9999), 0, 'unknown chest');
  const c = s.coinPops.coins.find(x => x.live);
  assert.ok(Math.abs(c.mesh.position.y - (CHEST_SIZE.height + 0.15)) < 1e-9);
  assert.equal(c.mesh.position.x, s.chests.meshes[0].position.x);
  s.update(0.1, 0.1);
  assert.ok(c.mesh.position.y > CHEST_SIZE.height + 0.15, 'update() moves them');
  s.golden.show(3, 4);
  assert.equal(s.popGoldenCoins(), 8);
  const phone = createIslandScene({ island, mobile: true });
  assert.equal(phone.popChestCoins(0), 4);
  assert.equal(phone.coinPops.coins.length, 8);
});
