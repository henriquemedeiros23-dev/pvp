// The Stickman: builds the three.js body with a skin (color + outfits) and a weapon,
// and applies the pure pose from computePose() every frame.
import * as THREE from 'three';
import { COLORS, WEAPONS } from '@pvp/game-rules';
import { bodyMaterial, colorDef, eyeColor } from './materials.js';
import { buildOutfit } from './outfits.js';
import { buildWeapon, bolt } from './weapons.js';
import { computePose, restPose, rainbowHue, SHIELD_ARM } from './pose.js';

export const DEFAULT_LIMB_RADIUS = 0.075;
const OUTFIT_SLOTS = ['hat', 'face', 'back', 'shirt'];

// Where the shield sits in the left hand: lowered (flat on the outside of the forearm) and raised
// (in front of the hand, upright and facing forward: the raised arm's turn is undone). The shield model faces +z, up +y.
const SHIELD_DOWN = { pos: new THREE.Vector3(-0.07, 0.22, 0), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)) };
const SHIELD_UP = { pos: new THREE.Vector3(0, -0.06, 0.06), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(-SHIELD_ARM.x, 0, -SHIELD_ARM.z, 'ZYX')) };
const ICE = new THREE.Color('#a8dcff');

/** The geometries and materials of every mesh under an object. */
export function collectResources(obj) {
  const geometries = new Set(), materials = new Set();
  obj.traverse(o => {
    if (!o.isMesh && !o.isLine) return;
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) for (const m of [].concat(o.material)) materials.add(m);
  });
  return { geometries, materials };
}

/** Dispose the geometries and materials of every mesh under an object (e.g. a buildWeapon() group). */
export function disposeObject(obj) {
  const { geometries, materials } = collectResources(obj);
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}

export class Stickman {
  /**
   * skin: { color, hat, face, back, shirt } (missing slots = nothing).
   * options: { colors, weapons, limbRadius, castShadow }
   *   colors/weapons default to the @pvp/game-rules tables; another game can pass its own.
   */
  constructor(skin = {}, { colors = COLORS, weapons = WEAPONS, limbRadius = DEFAULT_LIMB_RADIUS, castShadow = true } = {}) {
    this.skin = skin;
    this.colors = colors;
    this.weapons = weapons;
    this.castShadow = castShadow;
    this.root = new THREE.Group();

    const cdef = colorDef(skin.color, colors);
    this.mat = bodyMaterial(skin.color, colors);
    this.rainbow = cdef.pattern === 'rainbow';

    const shadow = m => { m.castShadow = castShadow; return m; };
    const limb = len => {
      const m = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(limbRadius, len, 4, 10), this.mat));
      m.position.y = -len / 2;
      return m;
    };

    this.hips = new THREE.Group();
    this.hips.position.y = restPose().hipY;
    this.root.add(this.hips);

    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const spine = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(limbRadius * 1.2, 0.42, 4, 10), this.mat));
    spine.position.y = 0.22;
    this.torso.add(spine);

    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    this.torso.add(this.head);
    this.head.add(shadow(new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), this.mat)));
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor(cdef) });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
      eye.position.set(s * 0.08, 0.04, 0.195);
      this.head.add(eye);
    }

    this.back = new THREE.Group();
    this.back.position.y = 0.45;
    this.torso.add(this.back);

    const mkArm = side => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.13, 0.44, 0);
      pivot.add(limb(0.6));
      const hand = new THREE.Group();
      hand.position.y = -0.66;
      pivot.add(hand);
      this.torso.add(pivot);
      return { pivot, hand };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    const mkLeg = side => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.1, 0, 0);
      pivot.add(limb(0.85));
      this.hips.add(pivot);
      return pivot;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    const parts = { head: this.head, torso: this.torso, back: this.back };
    for (const slot of OUTFIT_SLOTS) buildOutfit(slot, skin[slot], parts, castShadow);

    // everything made so far belongs to the stickman; things the game adds later
    // (name tags, chat bubbles) are left alone by dispose()
    this.owned = collectResources(this.root);
    this.weaponId = null;
    this.weapon = null;
    this.shieldId = null;
    this.shield = null;     // the shield model on the left arm
    this.shieldUp = false;  // set to true to raise it (it moves up smoothly in animate)
    this.shieldAmt = 0;     // 0 = down, 1 = up
    this.shieldMount = new THREE.Group();
    this.armL.hand.add(this.shieldMount);
    this.frozen = false;    // ice-blue and stuck in an ice block (see setStatus)
    this.shocked = false;   // yellow lightning crackles around the body
    this.fx = null;
    this.pose = restPose();
    this.walk = 0;
    this.swing = 0;   // set to 1 to start a melee swing
    this.recoil = 0;  // set to 1 when a gun fires
  }

  /** Hold a weapon (id from the weapons table) or nothing (null). */
  setWeapon(id) {
    if (id === this.weaponId) return;
    if (this.weapon) { this.armR.hand.remove(this.weapon); disposeObject(this.weapon); }
    this.weaponId = id ?? null;
    this.weapon = id != null ? buildWeapon(id, { weapons: this.weapons, castShadow: this.castShadow }) : null;
    if (this.weapon) this.armR.hand.add(this.weapon);
  }

  /** Wear a shield (a weapons-table id with type 'shield') on the left arm, or nothing (null). */
  setShield(id) {
    if (id === this.shieldId) return;
    if (this.shield) { this.shieldMount.remove(this.shield); disposeObject(this.shield); }
    this.shieldId = id ?? null;
    this.shield = id != null ? buildWeapon(id, { weapons: this.weapons, castShadow: this.castShadow }) : null;
    if (this.shield) { this.shield.scale.setScalar(0.85); this.shieldMount.add(this.shield); }
    if (!this.shield) this.shieldUp = false;
    this.placeShield();
  }

  // Move the shield between its lowered and raised spots (shieldAmt 0..1).
  placeShield() {
    const t = this.shieldAmt;
    this.shieldMount.position.lerpVectors(SHIELD_DOWN.pos, SHIELD_UP.pos, t);
    this.shieldMount.quaternion.slerpQuaternions(SHIELD_DOWN.rot, SHIELD_UP.rot, t);
  }

  /**
   * Show status effects: { frozen, shocked } (booleans; missing = unchanged).
   * Frozen: the body turns ice-blue inside a see-through ice block and stops moving.
   * Shocked: yellow lightning bolts crackle around the body.
   */
  setStatus({ frozen = this.frozen, shocked = this.shocked } = {}) {
    if (!!frozen === this.frozen && !!shocked === this.shocked) return;
    this.frozen = !!frozen;
    this.shocked = !!shocked;
    if (this.fx) { this.root.remove(this.fx.group); disposeObject(this.fx.group); this.fx = null; }
    // ice-blue body while frozen (the real color comes back after)
    if (this.frozen && !this.baseColor) { this.baseColor = this.mat.color.clone(); this.mat.color.lerp(ICE, 0.75); }
    if (!this.frozen && this.baseColor) { this.mat.color.copy(this.baseColor); this.baseColor = null; }
    if (this.mat.emissive) {
      this.mat.emissive.set(this.frozen ? '#3d9be0' : '#000000');
      this.mat.emissiveIntensity = this.frozen ? 0.35 : 1;
    }
    if (!this.frozen && !this.shocked) return;
    const group = new THREE.Group();
    const bolts = [];
    if (this.frozen) {
      const ice = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.15, 1.0), new THREE.MeshStandardMaterial({
        color: '#bfe8ff', transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.1, emissive: '#3fa9ff', emissiveIntensity: 0.25, depthWrite: false,
      }));
      ice.position.y = 1.05;
      ice.renderOrder = 2;
      group.add(ice);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(ice.geometry), new THREE.LineBasicMaterial({ color: '#e8f8ff', transparent: true, opacity: 0.8 }));
      edges.position.copy(ice.position);
      group.add(edges);
    }
    if (this.shocked) {
      const yellow = new THREE.MeshBasicMaterial({ color: '#ffe23a', toneMapped: false });
      for (let i = 0; i < 6; i++) {
        const b = bolt(yellow, 0.32, 0.03);
        const a = (i / 6) * Math.PI * 2;
        b.position.set(Math.sin(a) * 0.38, 0.5 + (i % 3) * 0.45, Math.cos(a) * 0.38);
        b.rotation.set(Math.PI / 2 + (i % 2 ? 0.4 : -0.4), a, 0);
        group.add(b);
        bolts.push(b);
      }
    }
    this.fx = { group, bolts };
    this.root.add(group);
  }

  /** Type of the held weapon ('melee', 'gun', ...) or null. */
  get weaponType() {
    const w = this.weaponId != null && Object.hasOwn(this.weapons, this.weaponId) ? this.weapons[this.weaponId] : null;
    return w ? w.type : null;
  }

  /**
   * Move one frame. dt and time are in seconds (time passed in).
   * state: { speed, crouch, slide, air, pitch }
   */
  animate(dt, state = {}, time = 0) {
    this.weapon?.userData.update?.(time);
    this.shield?.userData.update?.(time);
    if (this.fx) {
      this.fx.bolts.forEach((b, i) => { b.visible = Math.sin(time * 29 + i * 1.9) + Math.sin(time * 41 + i) > -0.6; });
    }
    if (this.frozen) return this.pose; // stuck in the ice: no moving at all
    if (this.rainbow) this.mat.color.setHSL(rainbowHue(time), 0.85, 0.55);
    this.swing = Math.max(0, this.swing - dt * 4);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    const want = this.shield && this.shieldUp ? 1 : 0;
    this.shieldAmt += Math.sign(want - this.shieldAmt) * Math.min(Math.abs(want - this.shieldAmt), dt * 7);
    this.placeShield();
    const pose = computePose({
      ...state, time, weaponType: this.weaponType, swing: this.swing, recoil: this.recoil, shield: this.shieldAmt,
    }, this.pose, dt);
    this.applyPose(pose);
    return pose;
  }

  /** Put the body in a pose from computePose(). */
  applyPose(pose) {
    this.pose = pose;
    this.walk = pose.walk;
    this.hips.position.y = pose.hipY;
    this.torso.rotation.x = pose.lean;
    this.legL.rotation.x = pose.legL;
    this.legR.rotation.x = pose.legR;
    this.head.rotation.x = pose.headX;
    this.armL.pivot.rotation.x = pose.armL.x;
    this.armL.pivot.rotation.z = pose.armL.z;
    this.armR.pivot.rotation.x = pose.armR.x;
    this.armR.pivot.rotation.z = pose.armR.z;
    for (const c of this.back.children) if (c.userData.cape) c.rotation.x = pose.cape;
  }

  /** Free every geometry and material this stickman made (body, outfits, weapon, shield, effects). */
  dispose() {
    if (this.weapon) disposeObject(this.weapon);
    if (this.shield) disposeObject(this.shield);
    if (this.fx) disposeObject(this.fx.group);
    for (const g of this.owned.geometries) g.dispose();
    for (const m of this.owned.materials) m.dispose();
  }
}
