import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { COLORS, OUTFITS, WEAPONS, WEAPON_TYPES, DEFAULT_SKIN } from '@pvp/game-rules';
import {
  Stickman, buildWeapon, weaponModelKind, computePose, restPose, rainbowHue,
  MODEL_TYPES, OUTFIT_MODELS, eyeColor,
} from '../src/index.js';

const meshCount = obj => { let n = 0; obj.traverse(o => { if (o.isMesh) n++; }); return n; };

test('no DOM is needed: importing and building works in Node', () => {
  assert.equal(typeof document, 'undefined');
  const sm = new Stickman({ ...DEFAULT_SKIN, color: 'zebra' });
  assert.ok(sm.mat.isMaterial);
  assert.equal(sm.mat.map, null); // no canvas in Node: plain material
});

test('builds a stickman for every color', () => {
  for (const color of Object.keys(COLORS)) {
    const sm = new Stickman({ ...DEFAULT_SKIN, color });
    assert.ok(sm.root.isObject3D, color);
    assert.ok(meshCount(sm.root) > 5, color);
    sm.dispose();
  }
});

test('builds a stickman for every outfit, and outfits add meshes', () => {
  const base = meshCount(new Stickman(DEFAULT_SKIN).root);
  for (const [slot, items] of Object.entries(OUTFITS)) {
    for (const id of Object.keys(items)) {
      const sm = new Stickman({ ...DEFAULT_SKIN, [slot]: id });
      const n = meshCount(sm.root);
      if (id === 'none') assert.equal(n, base, `${slot}:${id}`);
      else assert.ok(n > base, `${slot}:${id} should add a model`);
      sm.dispose();
    }
  }
  // every outfit with a model is in the rules
  for (const [slot, ids] of Object.entries(OUTFIT_MODELS)) for (const id of ids) assert.ok(Object.hasOwn(OUTFITS[slot], id));
});

test('unknown skin values do not throw', () => {
  const sm = new Stickman({ color: 'nope', hat: 'nope' });
  assert.ok(sm.root);
  assert.ok(new Stickman().root);
});

test('setWeapon works for every weapon id, keeping the special models', () => {
  const sm = new Stickman(DEFAULT_SKIN);
  for (const id of Object.keys(WEAPONS)) {
    sm.setWeapon(id);
    assert.equal(sm.weaponId, id);
    assert.equal(weaponModelKind(id), 'special:' + id);
    assert.ok(meshCount(sm.weapon) > 0, id);
    assert.equal(sm.armR.hand.children.length, 1);
  }
  sm.setWeapon(null);
  assert.equal(sm.weapon, null);
  assert.equal(sm.armR.hand.children.length, 0);
});

test('unknown weapon ids get a generic model by type', () => {
  const weapons = { ...WEAPONS };
  for (const type of WEAPON_TYPES) weapons['new_' + type] = { name: 'New', type, dmg: 1, range: 10 };
  weapons.blaster = { name: 'Odd', type: 'laser' };
  weapons.sword = { ...WEAPONS.sword, type: 'gun' }; // id kept but type changed: generic gun
  const sm = new Stickman(DEFAULT_SKIN, { weapons });
  for (const type of WEAPON_TYPES) {
    assert.ok(MODEL_TYPES.includes(type));
    sm.setWeapon('new_' + type);
    assert.equal(sm.weapon.userData.model, 'generic:' + type);
    assert.ok(meshCount(sm.weapon) > 0, type);
    assert.equal(sm.weaponType, type);
  }
  assert.equal(weaponModelKind('blaster', weapons), 'generic:melee');
  assert.equal(weaponModelKind('sword', weapons), 'generic:gun');
  assert.equal(weaponModelKind('missing', weapons), null);
  assert.equal(meshCount(buildWeapon('missing', { weapons })), 0);
});

test('buildWeapon honours castShadow', () => {
  const g = buildWeapon('rifle', { castShadow: false });
  g.traverse(o => { if (o.isMesh) assert.equal(o.castShadow, false); });
});

test('computePose is deterministic and does not change prev', () => {
  const state = { speed: 5, crouch: false, time: 1.25, weaponType: 'gun', pitch: 0.2 };
  const prev = restPose();
  const copy = structuredClone(prev);
  const a = computePose(state, prev, 1 / 60);
  const b = computePose(state, prev, 1 / 60);
  assert.deepEqual(a, b);
  assert.deepEqual(prev, copy);
});

const settle = (state, steps = 60) => {
  let p = null;
  for (let i = 0; i < steps; i++) p = computePose({ ...state, time: i / 60 }, p, 1 / 60);
  return p;
};

test('crouch is lower than standing, slide lower than crouch', () => {
  const stand = settle({});
  const crouch = settle({ crouch: true });
  const slide = settle({ slide: true, speed: 8 });
  assert.ok(crouch.hipY < stand.hipY - 0.2);
  assert.ok(slide.hipY < crouch.hipY - 0.1);
  assert.ok(slide.lean < 0 && crouch.lean > 0);
});

test('walking swings the legs, air poses them', () => {
  const walk = settle({ speed: 6 }, 20);
  assert.ok(walk.walk > 0);
  assert.notEqual(walk.legL, 0);
  const air = settle({ air: true });
  assert.ok(Math.abs(air.legL - 0.5) < 1e-3);
});

test('aiming: gun arms point forward, melee arms do not', () => {
  for (const weaponType of ['gun', 'throw', 'rocket']) {
    const p = computePose({ weaponType, pitch: 0 }, null, 1 / 60);
    assert.ok(Math.abs(p.armR.x + Math.PI / 2) < 1e-9, weaponType);
    assert.ok(Math.abs(p.armL.x + Math.PI / 2) < 0.2, weaponType);
  }
  const up = computePose({ weaponType: 'gun', pitch: 0.5 }, null, 0);
  assert.ok(up.armR.x < -Math.PI / 2); // looking up raises the arms
  const melee = computePose({ weaponType: 'melee' }, null, 0);
  assert.ok(melee.armR.x > -1);
  const swinging = computePose({ weaponType: 'melee', swing: 0.5 }, null, 0);
  assert.ok(swinging.armR.x < melee.armR.x - 1);
});

test('Stickman.animate applies the pose and decays swing/recoil', () => {
  const sm = new Stickman(DEFAULT_SKIN);
  sm.setWeapon('pistol');
  sm.recoil = 1;
  for (let i = 0; i < 30; i++) sm.animate(1 / 60, { crouch: true }, i / 60);
  assert.ok(sm.hips.position.y < 0.75);
  assert.ok(sm.recoil < 1);
  assert.ok(Math.abs(sm.armR.pivot.rotation.x + Math.PI / 2) < 0.01);
  sm.setWeapon('sword');
  sm.swing = 1;
  sm.animate(0.1, {}, 1);
  assert.ok(sm.swing < 1 && sm.swing > 0);
});

test('rainbow skin changes color over time', () => {
  const sm = new Stickman({ ...DEFAULT_SKIN, color: 'rainbow' });
  sm.animate(1 / 60, {}, 0);
  const c1 = sm.mat.color.getHex();
  sm.animate(1 / 60, {}, 2);
  const c2 = sm.mat.color.getHex();
  assert.notEqual(c1, c2);
  assert.equal(rainbowHue(0), 0);
  assert.ok(rainbowHue(-1) >= 0 && rainbowHue(-1) < 1);
});

test('dispose frees geometries and materials it made, but not things added later', () => {
  const sm = new Stickman({ color: 'gold', hat: 'crown', face: 'ninja', back: 'redcape', shirt: 'armor' });
  sm.setWeapon('sniper');
  const disposed = new Set();
  const spy = obj => obj.addEventListener('dispose', () => disposed.add(obj));
  const own = { geos: new Set(), mats: new Set() };
  sm.root.traverse(o => { if (o.isMesh) { own.geos.add(o.geometry); own.mats.add(o.material); } });
  for (const x of [...own.geos, ...own.mats]) spy(x);
  const tagMat = new THREE.SpriteMaterial();
  spy(tagMat);
  sm.root.add(new THREE.Sprite(tagMat)); // e.g. a name tag added by the game
  sm.dispose();
  for (const x of [...own.geos, ...own.mats]) assert.ok(disposed.has(x));
  assert.ok(!disposed.has(tagMat));
});

test('setWeapon disposes the old weapon', () => {
  const sm = new Stickman(DEFAULT_SKIN);
  sm.setWeapon('rocket');
  let n = 0;
  sm.weapon.traverse(o => { if (o.isMesh) o.geometry.addEventListener('dispose', () => n++); });
  sm.setWeapon('pistol');
  assert.ok(n > 0);
});

test('custom colors and options', () => {
  const colors = { pink: { color: '#ff66cc' }, ghost: { color: '#ffffff' } };
  const sm = new Stickman({ color: 'pink' }, { colors, limbRadius: 0.1, castShadow: false });
  assert.equal(sm.mat.color.getHexString(), new THREE.Color('#ff66cc').getHexString());
  sm.root.traverse(o => { if (o.isMesh) assert.equal(o.castShadow, false); });
  assert.equal(eyeColor(colors.ghost), '#111');
  assert.equal(eyeColor(COLORS.white), '#111');
  assert.equal(eyeColor(COLORS.zebra), '#111');
  for (const id of ['black', 'red', 'gold', 'orange', 'rainbow']) assert.equal(eyeColor(COLORS[id]), '#fff', id);
});
