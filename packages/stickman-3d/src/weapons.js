// 3D weapon models. A weapon gets a special model when its id is known and its type still
// matches; otherwise a generic model is picked by its type (melee/gun/throw/rocket/mine).
import * as THREE from 'three';
import { WEAPONS } from '@pvp/game-rules';
import { std } from './materials.js';

/** The weapon types that have a generic model. Unknown types use the melee model. */
export const MODEL_TYPES = Object.freeze(['melee', 'gun', 'throw', 'rocket', 'mine']);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A small toolkit for building one weapon. Materials are made only when used.
function kit(g, def) {
  const cache = {};
  const once = (name, make) => () => cache[name] || (cache[name] = make());
  const m = {
    wood: once('wood', () => std('#8a5a2b')),
    steel: once('steel', () => std('#c8ccd4', { metalness: 0.7, roughness: 0.3 })),
    dark: once('dark', () => std('#2a2d33', { metalness: 0.4 })),
    // the weapon's own `color` (if its data has one), else the given default
    main: fallback => once('main:' + fallback, () => std(def.color || fallback))(),
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z); g.add(o); return o;
  };
  const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  return { g, m, mesh, box };
}

// The Gun (starting weapon): a realistic pistol, L-shaped like the boss's drawing
// (straight slide on top, grip straight down at the back, a small trigger area).
// Gun frame: forward is -y, up is +z (when aiming), x is the side. The hand holds the grip at the origin.
function buildGun({ g, mesh, box }) {
  const slideMat = std('#8b939e', { metalness: 0.7, roughness: 0.3 });
  const frameMat = std('#3a3e45', { metalness: 0.3, roughness: 0.55 });
  const gripMat = std('#6b4428', { roughness: 0.85 });
  const darkMat = std('#16181c', { roughness: 0.8 });
  const steelMat = std('#c3c9d1', { metalness: 0.85, roughness: 0.2 });
  g.scale.setScalar(1.3); // a bit bigger than real, so it reads well on a phone

  // slide on top, with the barrel sticking out a little at the front
  box(0.062, 0.3, 0.066, slideMat, 0, -0.095, 0.098);
  mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.03, 14), steelMat, 0, -0.255, 0.1);
  mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.032, 10), darkMat, 0, -0.257, 0.1); // muzzle hole
  // grip lines at the back of the slide, ejection port on the right
  for (let i = 0; i < 5; i++) box(0.064, 0.006, 0.05, darkMat, 0, 0.012 + i * 0.01, 0.098);
  box(0.004, 0.06, 0.026, darkMat, 0.032, -0.04, 0.11);
  // sights and hammer
  box(0.01, 0.014, 0.018, darkMat, 0, -0.232, 0.138);
  box(0.044, 0.012, 0.016, darkMat, 0, 0.044, 0.137);
  box(0.022, 0.02, 0.03, frameMat, 0, 0.066, 0.085);

  // frame under the slide (front part with the rail)
  box(0.056, 0.28, 0.034, frameMat, 0, -0.075, 0.05); // runs back over the grip: one clean L
  box(0.044, 0.07, 0.012, darkMat, 0, -0.165, 0.028); // rail

  // trigger guard (a ring whose top half is hidden in the frame) and the trigger
  const guard = mesh(new THREE.TorusGeometry(0.034, 0.0075, 8, 24), frameMat, 0, -0.062, 0.036);
  guard.rotation.y = Math.PI / 2;
  box(0.012, 0.012, 0.036, steelMat, 0, -0.05, 0.026).rotation.x = -0.25;

  // grip: tilted back like a real pistol, with side panels and a magazine plate at the bottom
  const grip = new THREE.Group();
  grip.position.set(0, 0.012, 0.045);
  grip.rotation.x = 0.1; // almost straight down, like the drawing
  g.add(grip);
  const part = (w, h, d, mat, z) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    o.position.set(0, 0.004, z);
    grip.add(o);
  };
  part(0.056, 0.088, 0.17, frameMat, -0.085);
  part(0.064, 0.07, 0.13, gripMat, -0.09);    // side panels
  part(0.062, 0.098, 0.016, darkMat, -0.175); // magazine plate
}

// Melee weapons are held like a sword: handle in hand, blade forward (+z).
// Ranged weapons point along -y (the direction the arm points when aiming).
const SPECIAL = {
  gun: { type: 'gun', build: buildGun },
  sword: { type: 'melee', build: ({ m, box }) => { box(0.06, 0.06, 0.2, m.dark()); box(0.28, 0.05, 0.05, std('#d4a531', { metalness: 0.8 }), 0, 0, 0.1); box(0.08, 0.02, 0.9, m.steel(), 0, 0, 0.58); } },
  bat: { type: 'melee', build: ({ m, mesh }) => { mesh(new THREE.CylinderGeometry(0.07, 0.035, 0.95, 10), m.wood(), 0, 0, 0.4).rotation.x = Math.PI / 2; } },
  spear: { type: 'melee', build: ({ m, mesh }) => {
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 8), m.wood(), 0, 0, 0.5).rotation.x = Math.PI / 2;
    mesh(new THREE.ConeGeometry(0.06, 0.25, 8), m.steel(), 0, 0, 1.5).rotation.x = Math.PI / 2;
  } },
  axe: { type: 'melee', build: ({ m, mesh, box }) => {
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), m.wood(), 0, 0, 0.35).rotation.x = Math.PI / 2;
    box(0.04, 0.32, 0.22, m.steel(), 0, 0.12, 0.72);
  } },
  pistol: { type: 'gun', build: ({ m, box }) => { box(0.07, 0.3, 0.1, m.dark(), 0, -0.12, 0); box(0.06, 0.08, 0.16, m.dark(), 0, 0, -0.06); } },
  shotgun: { type: 'gun', build: ({ m, box }) => { box(0.09, 0.85, 0.1, m.wood(), 0, -0.2, 0); box(0.06, 0.6, 0.06, m.dark(), 0, -0.45, 0.05); } },
  rifle: { type: 'gun', build: ({ m, box }) => { box(0.08, 0.95, 0.12, m.dark(), 0, -0.25, 0); box(0.05, 0.15, 0.18, m.dark(), 0, -0.1, -0.1); box(0.04, 0.22, 0.06, std('#555'), 0, -0.25, 0.09); } },
  sniper: { type: 'gun', build: ({ m, mesh, box }) => { box(0.07, 1.35, 0.1, std('#3a4a2a'), 0, -0.45, 0); mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 10), m.dark(), 0, -0.3, 0.1); } },
  rocket: { type: 'rocket', build: ({ mesh }) => {
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 12), std('#3f5f3a'), 0, -0.3, 0);
    mesh(new THREE.ConeGeometry(0.09, 0.2, 10), std('#d33'), 0, -0.98, 0).rotation.x = Math.PI;
  } },
  grenade: { type: 'throw', build: ({ m, mesh, box }) => { mesh(new THREE.SphereGeometry(0.1, 12, 10), std('#4b6b2f'), 0, -0.08, 0); box(0.04, 0.06, 0.04, m.dark(), 0, 0.04, 0); } },
  mine: { type: 'mine', build: ({ mesh }) => {
    mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 14), std('#555'), 0, -0.08, 0);
    mesh(new THREE.SphereGeometry(0.03), new THREE.MeshBasicMaterial({ color: '#f22' }), 0, -0.08, 0.04);
  } },
};

// Generic models, one per type. Sizes follow the weapon's data a little (longer reach, longer weapon).
const GENERIC = {
  melee: ({ m, box }, def) => {
    const len = clamp(0.35 + (def.range || 2.7) * 0.18, 0.5, 1.4);
    box(0.06, 0.06, 0.2, m.dark());
    box(0.24, 0.05, 0.05, m.dark(), 0, 0, 0.1);
    box(0.08, 0.025, len, m.main('#c8ccd4'), 0, 0, 0.12 + len / 2);
  },
  gun: ({ m, box }, def) => {
    const len = clamp(0.3 + (def.range || 60) / 150, 0.35, 1.4);
    box(0.08, len, 0.11, m.main('#2a2d33'), 0, -len / 2 + 0.08, 0);
    box(0.06, 0.08, 0.16, m.dark(), 0, 0, -0.06);
    box(0.03, len * 0.5, 0.03, m.steel(), 0, -len + 0.08 - len * 0.2, 0.04);
  },
  throw: ({ m, mesh, box }) => {
    mesh(new THREE.SphereGeometry(0.1, 12, 10), m.main('#4b6b2f'), 0, -0.08, 0);
    box(0.04, 0.06, 0.04, m.dark(), 0, 0.04, 0);
  },
  rocket: ({ m, mesh }) => {
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 12), m.main('#3f5f3a'), 0, -0.3, 0);
    mesh(new THREE.ConeGeometry(0.09, 0.2, 10), std('#d33'), 0, -0.95, 0).rotation.x = Math.PI;
  },
  mine: ({ m, mesh }) => {
    mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 14), m.main('#555'), 0, -0.08, 0);
    mesh(new THREE.SphereGeometry(0.03), new THREE.MeshBasicMaterial({ color: '#f22' }), 0, -0.08, 0.04);
  },
};

/**
 * Which model a weapon id gets: 'special:<id>', 'generic:<type>', or null when the id is not
 * in the weapons table (no model). Pure, handy for tests and tools.
 */
export function weaponModelKind(id, weapons = WEAPONS) {
  if (id == null || !weapons || !Object.hasOwn(weapons, id)) return null;
  const def = weapons[id];
  if (Object.hasOwn(SPECIAL, id) && SPECIAL[id].type === def.type) return 'special:' + id;
  return 'generic:' + (MODEL_TYPES.includes(def.type) ? def.type : 'melee');
}

/**
 * Build the 3D model of a weapon as a THREE.Group.
 * options: { weapons = game-rules WEAPONS, castShadow = true }
 * An id missing from the weapons table gives an empty group.
 * The caller owns the group: dispose its geometries and materials when done.
 */
export function buildWeapon(id, { weapons = WEAPONS, castShadow = true } = {}) {
  const g = new THREE.Group();
  const kind = weaponModelKind(id, weapons);
  if (!kind) return g;
  const def = weapons[id];
  const k = kit(g, def);
  const [how, name] = kind.split(':');
  if (how === 'special') SPECIAL[name].build(k, def);
  else GENERIC[name](k, def);
  g.userData.weaponId = id;
  g.userData.model = kind;
  g.traverse(o => { if (o.isMesh) o.castShadow = castShadow; });
  return g;
}
