import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { COLORS, OUTFITS, WEAPONS, WEAPON_TYPES, DEFAULT_SKIN } from '@pvp/game-rules';
import {
  Stickman, buildWeapon, weaponModelKind, computePose, restPose, rainbowHue,
  MODEL_TYPES, OUTFIT_MODELS, eyeColor, SHIELD_ARM, buildPotion, holdPotion,
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

test('every weapon from the boss\'s cards has its own model', () => {
  for (const id of Object.keys(WEAPONS)) {
    assert.equal(weaponModelKind(id), 'special:' + id);
    assert.ok(meshCount(buildWeapon(id)) >= 5, `${id} is detailed`);
  }
});

test('setWeapon works for every weapon id, keeping the special models', () => {
  const sm = new Stickman(DEFAULT_SKIN);
  for (const id of Object.keys(WEAPONS).filter(id => WEAPONS[id].type !== 'shield')) {
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

test('the Gun is a detailed pistol: slide, barrel, trigger guard and a tilted grip below the slide', () => {
  const gun = buildWeapon('gun');
  assert.equal(gun.userData.model, 'special:gun');
  assert.ok(meshCount(gun) >= 15, `only ${meshCount(gun)} parts`);
  const meshes = [];
  gun.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.ok(meshes.some(m => m.geometry.type === 'TorusGeometry'), 'trigger guard');
  assert.ok(meshes.some(m => m.geometry.type === 'CylinderGeometry'), 'barrel');
  // L shape: forward is -y and up is +z in the hand; the grip goes down (-z), the barrel forward (-y)
  gun.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gun);
  assert.ok(box.min.y < -0.3 && box.max.y < 0.2, 'long forward, short back');
  assert.ok(box.min.z < -0.15 && box.max.z > 0.15, 'grip below, slide above');
  const sm = new Stickman(DEFAULT_SKIN);
  sm.setWeapon('gun');
  assert.equal(sm.weaponType, 'gun');
  sm.dispose();
});

const sizeOf = obj => { obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()); };

test('Shootbm is a long gun with a round sight; the swords are long and straight, the Supersword longest', () => {
  const s = sizeOf(buildWeapon('shootbm'));
  assert.ok(s.y > 1.1 && s.y > 3 * s.z, `long along the barrel (${s.y.toFixed(2)})`);
  const meshes = [];
  buildWeapon('shootbm').traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.ok(meshes.some(m => m.geometry.type === 'TorusGeometry' && m.position.z > 0.18), 'round sight on top');
  const len = id => sizeOf(buildWeapon(id)).z;
  assert.ok(len('electricsword') > 1 && len('icesword') > 1);
  assert.ok(len('supersword') > len('electricsword') + 0.3, 'Supersword is very long');
});

test('animated parts: lightning flickers, snowflakes turn, Mega Shield dots glow (time passed in)', () => {
  for (const id of ['electricsword', 'icesword', 'megashield']) {
    const g = buildWeapon(id);
    assert.equal(typeof g.userData.update, 'function', id);
    const snap = () => { const out = []; g.traverse(o => { out.push(o.visible, ...o.position.toArray(), ...o.rotation.toArray().slice(0, 3), o.scale.x); }); return JSON.stringify(out); };
    g.userData.update(0.1);
    const a = snap();
    g.userData.update(0.1);
    assert.equal(snap(), a, `${id}: same time, same look`);
    g.userData.update(0.73);
    assert.notEqual(snap(), a, `${id}: it moves`);
  }
  assert.equal(buildWeapon('shield').userData.update, undefined, 'the plain Shield does not glow');
});

test('shields: square plate with P.V.P letters; the Mega Shield is golden with glowing dots', () => {
  const shield = buildWeapon('shield'), mega = buildWeapon('megashield');
  const s = sizeOf(shield);
  assert.ok(Math.abs(s.x - s.y) < 0.01 && s.x > 0.6, 'square');
  assert.ok(meshCount(mega) > meshCount(shield) + 20, 'dots all around');
  let gold = false;
  mega.traverse(o => { if (o.isMesh && o.material.color?.getHexString() === 'ffc531') gold = true; });
  assert.ok(gold);
});

test('Stickman wears a shield on the left arm and raises it in front', () => {
  const sm = new Stickman(DEFAULT_SKIN);
  sm.setWeapon('icesword');
  sm.setShield('megashield');
  assert.equal(sm.shieldId, 'megashield');
  assert.equal(sm.armR.hand.children.length, 1, 'the sword is still in the right hand');
  assert.ok(sm.armL.hand.children.includes(sm.shieldMount));
  for (let i = 0; i < 20; i++) sm.animate(1 / 30, {}, i / 30);
  sm.root.updateMatrixWorld(true);
  const down = new THREE.Box3().setFromObject(sm.shield).getCenter(new THREE.Vector3());
  sm.shieldUp = true;
  for (let i = 0; i < 20; i++) sm.animate(1 / 30, {}, i / 30);
  assert.equal(sm.shieldAmt, 1);
  assert.ok(Math.abs(sm.armL.pivot.rotation.x - SHIELD_ARM.x) < 1e-6);
  sm.root.updateMatrixWorld(true);
  const up = new THREE.Box3().setFromObject(sm.shield).getCenter(new THREE.Vector3());
  assert.ok(up.z > down.z + 0.4, 'in front of the body');
  assert.ok(up.y > 0.95 && up.y < 1.4 && Math.abs(up.x) < 0.2, `chest high, in the middle (${up.y.toFixed(2)})`);
  const top = new THREE.Vector3(0, 1, 0).applyQuaternion(sm.shield.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(top.y > 0.95, 'upright');
  // the shield faces forward: its front (+z of the model) points along world +z
  const front = new THREE.Vector3(0, 0, 1).applyQuaternion(sm.shield.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(front.z > 0.9, `faces forward (${front.toArray().map(v => v.toFixed(2))})`);
  let n = 0;
  sm.shield.traverse(o => { if (o.isMesh) o.geometry.addEventListener('dispose', () => n++); });
  sm.setShield(null);
  assert.ok(n > 0, 'old shield disposed');
  assert.equal(sm.shieldUp, false);
  assert.equal(sm.shieldMount.children.length, 0);
});

test('status effects: frozen = ice block and no moving, shocked = lightning', () => {
  const sm = new Stickman(DEFAULT_SKIN);
  sm.setStatus({ frozen: true });
  assert.ok(sm.fx && sm.root.children.includes(sm.fx.group));
  assert.equal(sm.mat.emissive.getHexString(), '3d9be0', 'ice-blue glow');
  assert.ok(sm.mat.color.b > sm.mat.color.r, 'ice-blue body');
  const before = JSON.stringify(sm.pose);
  sm.animate(0.5, { speed: 8 }, 3);
  assert.equal(JSON.stringify(sm.pose), before, 'stuck');
  sm.setStatus({ frozen: false, shocked: true });
  assert.equal(sm.fx.bolts.length, 6);
  assert.equal(sm.mat.emissive.getHexString(), '000000');
  assert.equal(sm.mat.color.getHexString(), new THREE.Color(COLORS.black.color).getHexString(), 'own color back');
  sm.animate(0.1, { speed: 8 }, 3.1);
  assert.notEqual(JSON.stringify(sm.pose), before, 'moving again');
  sm.setStatus({ shocked: false });
  assert.equal(sm.fx, null);
  sm.setStatus({ frozen: true, shocked: true });
  sm.dispose();
});

test('unknown weapon ids get a generic model by type', () => {
  const weapons = { ...WEAPONS };
  for (const type of WEAPON_TYPES) weapons['new_' + type] = { name: 'New', type, dmg: 1, range: 10 };
  weapons.blaster = { name: 'Odd', type: 'laser' };
  weapons.icesword = { ...WEAPONS.icesword, type: 'gun' }; // id kept but type changed: generic gun
  const sm = new Stickman(DEFAULT_SKIN, { weapons });
  for (const type of WEAPON_TYPES) {
    assert.ok(MODEL_TYPES.includes(type));
    sm.setWeapon('new_' + type);
    assert.equal(sm.weapon.userData.model, 'generic:' + type);
    assert.ok(meshCount(sm.weapon) > 0, type);
    assert.equal(sm.weaponType, type);
  }
  assert.equal(weaponModelKind('blaster', weapons), 'generic:melee');
  assert.equal(weaponModelKind('icesword', weapons), 'generic:gun');
  assert.equal(weaponModelKind('missing', weapons), null);
  assert.equal(meshCount(buildWeapon('missing', { weapons })), 0);
});

test('buildWeapon honours castShadow', () => {
  const g = buildWeapon('shootbm', { castShadow: false });
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
  for (const weaponType of ['gun']) {
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
  sm.setWeapon('shootbm');
  sm.recoil = 1;
  for (let i = 0; i < 30; i++) sm.animate(1 / 60, { crouch: true }, i / 60);
  assert.ok(sm.hips.position.y < 0.75);
  assert.ok(sm.recoil < 1);
  assert.ok(Math.abs(sm.armR.pivot.rotation.x + Math.PI / 2) < 0.01);
  sm.setWeapon('electricsword');
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
  sm.setWeapon('electricsword');
  sm.setShield('megashield');
  sm.setStatus({ frozen: true, shocked: true });
  const disposed = new Set();
  const spy = obj => obj.addEventListener('dispose', () => disposed.add(obj));
  const own = { geos: new Set(), mats: new Set() };
  sm.root.traverse(o => { if (o.isMesh || o.isLine) { own.geos.add(o.geometry); own.mats.add(o.material); } });
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
  sm.setWeapon('supersword');
  let n = 0;
  sm.weapon.traverse(o => { if (o.isMesh) o.geometry.addEventListener('dispose', () => n++); });
  sm.setWeapon('shootbm');
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

test('the Healing Potion model: red liquid in a cone flask with a neck and a cork; a stickman can hold it', () => {
  const p = buildPotion();
  assert.equal(p.userData.model, 'potion');
  assert.ok(meshCount(p) >= 5);
  const box = new THREE.Box3().setFromObject(p);
  const size = box.getSize(new THREE.Vector3());
  assert.ok(size.y > 0.3 && size.y < 0.45, `height ${size.y}`);
  assert.ok(size.x > 0.25, 'wide cone bottom');
  const reds = [];
  p.traverse(o => { if (o.isMesh && o.material.color && o.material.color.r > 0.4 && o.material.color.g < 0.1) reds.push(o); });
  assert.ok(reds.length >= 1, 'red liquid');
  const sm = new Stickman(DEFAULT_SKIN);
  sm.setWeapon('gun');
  holdPotion(sm, true);
  assert.ok(sm.potion && sm.potion.parent === sm.armR.hand);
  assert.equal(sm.weapon.visible, false);
  holdPotion(sm, false);
  assert.equal(sm.potion, null);
  assert.equal(sm.weapon.visible, true);
  sm.dispose();
});
