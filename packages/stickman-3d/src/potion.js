// The Healing Potion model (#28), like the boss's drawing: a narrow neck with a small cork on top,
// a wide cone-shaped bottom of glass, filled with red liquid.
import * as THREE from 'three';
import { std } from './materials.js';

// Flask outline (radius, height) from the bottom up, in meters (about 0.36 m tall: easy to see on a phone).
const GLASS = [[0, 0], [0.14, 0], [0.155, 0.012], [0.15, 0.03], [0.05, 0.2], [0.042, 0.215], [0.042, 0.3], [0.05, 0.31]];
const LIQUID_TOP = 0.12; // the red liquid fills the cone up to here

/**
 * Build the potion as a THREE.Group standing on its bottom at the origin (y up).
 * options: { castShadow = true }. The caller owns it: dispose with disposeObject when done.
 */
export function buildPotion({ castShadow = true } = {}) {
  const g = new THREE.Group();
  const add = (geo, mat, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = castShadow; g.add(m); return m; };
  const lathe = pts => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 28);

  // red liquid: the cone part, a bit inside the glass
  const inner = r => r * 0.9;
  const coneR = h => 0.15 - (0.1 * (h - 0.03)) / 0.17; // glass radius along the cone (0.03 .. 0.2)
  const liquid = std('#c4101b', { roughness: 0.3, emissive: '#4a0004', emissiveIntensity: 0.5 });
  add(lathe([[0, 0.008], [inner(0.14), 0.008], [inner(0.15), 0.03], [inner(coneR(LIQUID_TOP)), LIQUID_TOP], [0, LIQUID_TOP]]), liquid);
  // glass: see-through, drawn after the liquid
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#e6f4ff', roughness: 0.1, metalness: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
  });
  const body = add(lathe(GLASS), glass);
  body.renderOrder = 1;
  // a dark rim at the bottom and the neck so the shape reads like the drawing's outline
  const rim = std('#2a3140', { roughness: 0.5 });
  const bottomRing = add(new THREE.TorusGeometry(0.158, 0.007, 8, 32), rim, 0.012);
  bottomRing.rotation.x = Math.PI / 2;
  const neckRing = add(new THREE.TorusGeometry(0.048, 0.006, 8, 24), rim, 0.305);
  neckRing.rotation.x = Math.PI / 2;
  // small cork on top
  add(new THREE.CylinderGeometry(0.036, 0.032, 0.06, 16), std('#b07a43', { roughness: 0.9 }), 0.33);

  g.userData.model = 'potion';
  return g;
}

/**
 * Show a stickman drinking: the potion in the right hand instead of the weapon (on = true),
 * or the weapon back (on = false). Works with any Stickman from this package.
 */
export function holdPotion(sm, on) {
  const hand = sm.armR?.hand;
  if (!hand) return;
  if (on && !sm.potion) {
    sm.potion = buildPotion({ castShadow: sm.castShadow ?? true });
    sm.potion.scale.setScalar(0.75);
    sm.potion.rotation.x = Math.PI; // hanging hand: bottom up, cork toward the fingers
    sm.potion.position.y = 0.05;
    hand.add(sm.potion);
  } else if (!on && sm.potion) {
    hand.remove(sm.potion);
    sm.potion.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    sm.potion = null;
  }
  if (sm.weapon) sm.weapon.visible = !on;
}
