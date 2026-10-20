// The Stickman: builds the three.js body with a skin (color + outfits) and a weapon,
// and applies the pure pose from computePose() every frame.
import * as THREE from 'three';
import { COLORS, WEAPONS } from '@pvp/game-rules';
import { bodyMaterial, colorDef, eyeColor } from './materials.js';
import { buildOutfit } from './outfits.js';
import { buildWeapon } from './weapons.js';
import { computePose, restPose, rainbowHue } from './pose.js';

export const DEFAULT_LIMB_RADIUS = 0.075;
const OUTFIT_SLOTS = ['hat', 'face', 'back', 'shirt'];

/** The geometries and materials of every mesh under an object. */
export function collectResources(obj) {
  const geometries = new Set(), materials = new Set();
  obj.traverse(o => {
    if (!o.isMesh) return;
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
    if (this.rainbow) this.mat.color.setHSL(rainbowHue(time), 0.85, 0.55);
    this.swing = Math.max(0, this.swing - dt * 4);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    const pose = computePose({ ...state, time, weaponType: this.weaponType, swing: this.swing, recoil: this.recoil }, this.pose, dt);
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

  /** Free every geometry and material this stickman made (body, outfits and weapon). */
  dispose() {
    if (this.weapon) disposeObject(this.weapon);
    for (const g of this.owned.geometries) g.dispose();
    for (const m of this.owned.materials) m.dispose();
  }
}
