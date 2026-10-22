// Bombs (#32), like the boss's card: a round bomb with a short fuse and a spark on top (the Bomb is
// black, the Legendary Bomb gold), and the RED square that shows on the ground where a bomb will explode.
import * as THREE from 'three';
import { BOMBS } from '@pvp/game-rules';
import { std } from './materials.js';

const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });

/**
 * Build a bomb as a THREE.Group sitting on its bottom at the origin (y up), about 0.4 m across.
 * id: a bomb id of the rules (its `color`), or options { color }. options: { bombs = BOMBS, castShadow = true }.
 * The spark on the fuse blinks: call group.userData.update(timeInSeconds) every frame.
 * The caller owns it: dispose with disposeObject when done.
 */
export function buildBomb(id = 'bomb', { bombs = BOMBS, castShadow = true, color } = {}) {
  const def = bombs && typeof id === 'string' && Object.hasOwn(bombs, id) ? bombs[id] : {};
  const bodyColor = color || def.color || '#1b1b1f';
  const gold = def.rarity === 'legendary';
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = castShadow && !mat.isMeshBasicMaterial;
    g.add(m);
    return m;
  };
  const r = 0.2;
  const body = gold
    ? std(bodyColor, { metalness: 0.75, roughness: 0.25, emissive: '#b8860b', emissiveIntensity: 0.3 })
    : std(bodyColor, { metalness: 0.3, roughness: 0.45 });
  add(new THREE.SphereGeometry(r, 24, 18), body, 0, r, 0);
  // the metal cap the fuse comes out of, tilted a little like the drawing
  const cap = add(new THREE.CylinderGeometry(0.055, 0.065, 0.07, 16), std('#5a606c', { metalness: 0.7, roughness: 0.35 }), 0.05, 2 * r - 0.005, 0);
  cap.rotation.z = -0.35;
  // a curly fuse (a thin tube) and the spark at its end
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.07, 2 * r + 0.02, 0), new THREE.Vector3(0.11, 2 * r + 0.1, 0.01),
    new THREE.Vector3(0.09, 2 * r + 0.17, 0.03), new THREE.Vector3(0.14, 2 * r + 0.21, 0.02),
  ]);
  add(new THREE.TubeGeometry(curve, 12, 0.012, 6), std('#8a6a3c', { roughness: 0.9 }));
  const tip = curve.getPoint(1);
  const spark = add(new THREE.SphereGeometry(0.035, 10, 8), glow('#ffcf3a'), tip.x, tip.y, tip.z);
  const flame = add(new THREE.SphereGeometry(0.06, 10, 8), glow('#ff6a1a', 0.55), tip.x, tip.y, tip.z);
  g.userData.model = 'bomb';
  g.userData.bombId = typeof id === 'string' ? id : null;
  g.userData.update = time => {
    const blink = Math.sin(time * 18) > -0.2;
    spark.visible = blink;
    flame.scale.setScalar(0.7 + 0.5 * Math.abs(Math.sin(time * 11)));
  };
  return g;
}

/**
 * The RED outline on the ground of a bomb's square area (side in meters), centred at the origin, flat on y = 0:
 * a bright red border and a see-through red fill. userData.update(timeInSeconds) makes it pulse.
 */
export function buildBombArea(side = 2) {
  const s = Number.isFinite(side) && side > 0 ? side : 2;
  const g = new THREE.Group();
  const line = Math.max(0.08, s * 0.035);
  const red = new THREE.MeshBasicMaterial({ color: '#ff1a1a', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const fill = new THREE.MeshBasicMaterial({ color: '#ff2020', transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const flat = (w, d, mat, x, z, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.renderOrder = 3;
    g.add(m);
    return m;
  };
  flat(s, s, fill, 0, 0, 0.03);
  for (const [w, d, x, z] of [[s, line, 0, (s - line) / 2], [s, line, 0, -(s - line) / 2], [line, s - 2 * line, (s - line) / 2, 0], [line, s - 2 * line, -(s - line) / 2, 0]]) {
    flat(w, d, red, x, z, 0.04);
  }
  g.userData.model = 'bombArea';
  g.userData.side = s;
  g.userData.update = time => {
    const p = 0.5 + 0.5 * Math.sin(time * 9);
    red.opacity = 0.65 + 0.35 * p;
    fill.opacity = 0.1 + 0.18 * p;
  };
  return g;
}
