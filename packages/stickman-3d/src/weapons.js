// 3D weapon models (the boss's cards). A weapon gets a special model when its id is known and its type still
// matches; otherwise a generic model is picked by its type (melee/gun/shield).
import * as THREE from 'three';
import { WEAPONS } from '@pvp/game-rules';
import { std } from './materials.js';

/** The weapon types that have a generic model. Unknown types use the melee model. */
export const MODEL_TYPES = Object.freeze(['melee', 'gun', 'shield']);

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

// ---------------------------------------------------------------- shapes shared by the boss's weapons

// A glowing material that ignores light (lightning, snowflakes, magic dots).
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });

// A lightning bolt: a zigzag of thin boxes in the x-z plane, about `len` long along z.
function bolt(mat, len = 0.22, w = 0.018) {
  const g = new THREE.Group();
  const pts = [[0, 0], [0.05, 0.3], [-0.03, 0.45], [0.04, 0.75], [-0.02, 1]].map(([x, z]) => [x * len * 2.2, z * len]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const l = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.6, l + w * 0.6), mat);
    m.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    g.add(m);
  }
  return g;
}

// A snowflake: three crossing bars with little side twigs, in the x-z plane.
function snowflake(mat, r = 0.06) {
  const g = new THREE.Group();
  const w = r * 0.18;
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI) / 3;
    arm.add(new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.5, r * 2), mat));
    for (const s of [-1, 1]) for (const k of [-1, 1]) {
      const twig = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, w * 0.5, r * 0.45), mat);
      twig.position.set(s * r * 0.12, 0, k * r * 0.6);
      twig.rotation.y = s * k * 0.75;
      arm.add(twig);
    }
    g.add(arm);
  }
  g.add(new THREE.Mesh(new THREE.OctahedronGeometry(w * 1.3), mat));
  return g;
}

// Block letters made of boxes (no fonts, works in Node): 'P', 'V' and '.'. Returns the letter width.
function letter(g, ch, mat, x, h, depth) {
  const t = h * 0.2; // stroke
  const bar = (w, hh, px, py, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, depth), mat);
    m.position.set(px, py, 0); m.rotation.z = rz; g.add(m);
  };
  if (ch === 'P') {
    const w = h * 0.55;
    bar(t, h, x + t / 2, 0);                                   // stem
    bar(w - t / 2, t, x + w / 2, h / 2 - t / 2);                // top
    bar(w - t / 2, t, x + w / 2, 0.02 * h);                     // middle
    bar(t, h / 2 + t * 0.1, x + w - t / 2, h / 4 - t * 0.05 + 0.01 * h); // bowl side
    return w;
  }
  if (ch === 'V') {
    const w = h * 0.7, a = Math.atan2(w / 2 - t / 2, h);
    const len = Math.hypot(w / 2, h) * 1.02;
    bar(t, len, x + w / 4 + t / 4, 0, a);
    bar(t, len, x + (3 * w) / 4 - t / 4, 0, -a);
    return w;
  }
  bar(t, t, x + t / 2, -h / 2 + t / 2); // '.'
  return t;
}

function lettering(text, mat, h, depth) {
  const g = new THREE.Group();
  const gap = h * 0.22;
  let x = 0;
  for (const ch of text) x += letter(g, ch, mat, x, h, depth) + gap;
  const width = x - gap;
  for (const c of g.children) c.position.x -= width / 2;
  return g;
}

// ---------------------------------------------------------------- the boss's weapons

// Shootbm: a long gun like the drawing: a stepped stock at the back, a long straight barrel and
// a round sight on top near the front. Gun frame: forward is -y, up is +z; the hand is at the grip.
function buildShootbm({ g, mesh, box }) {
  const body = std('#3b4250', { metalness: 0.55, roughness: 0.4 });
  const dark = std('#191b20', { roughness: 0.7 });
  const steel = std('#c3c9d1', { metalness: 0.85, roughness: 0.2 });
  const wood = std('#8a5a2b', { roughness: 0.8 });
  g.scale.setScalar(1.2);
  // one long straight body, front to back (the long rectangle of the drawing)
  box(0.065, 0.86, 0.085, body, 0, -0.39, 0.09);
  box(0.067, 0.7, 0.012, dark, 0, -0.45, 0.138);                                     // top strip
  mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.06, 16), steel, 0, -0.85, 0.09);  // muzzle
  mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.062, 10), dark, 0, -0.852, 0.09); // muzzle hole
  for (let i = 0; i < 4; i++) box(0.068, 0.012, 0.05, dark, 0, -0.55 - i * 0.04, 0.09); // cooling slots
  // round sight on top near the front: a post and a ring you look through
  box(0.014, 0.018, 0.07, steel, 0, -0.68, 0.17);
  const ring = mesh(new THREE.TorusGeometry(0.045, 0.01, 10, 28), steel, 0, -0.68, 0.24);
  ring.rotation.x = Math.PI / 2; // you look through it along the barrel
  // stepped stock at the back: three steps going down, like the drawing
  const steps = [[0.04, 0.14, 0.08, 0.1], [0.18, 0.14, 0.035, 0.1], [0.32, 0.14, -0.01, 0.1]];
  for (const [y0, len, z, h] of steps) box(0.062, len, h, wood, 0, y0 + len / 2, z);
  box(0.064, 0.02, 0.1, dark, 0, 0.47, -0.01); // butt plate
  // grip and trigger (the little curve under the body in the drawing)
  box(0.05, 0.07, 0.15, wood, 0, 0.0, -0.03).rotation.x = 0.25;
  const guard = mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 20), dark, 0, -0.09, 0.04);
  guard.rotation.y = Math.PI / 2;
  box(0.012, 0.012, 0.035, steel, 0, -0.085, 0.035).rotation.x = -0.3;
}

// DM Gun (#32, Epic): a long gun like the drawing: an angled stock at the back, a body, a long straight
// barrel and a round trigger guard. Gun frame: forward is -y, up is +z; the hand is at the grip.
function buildDmGun({ g, mesh, box }) {
  const body = std('#2f3340', { metalness: 0.55, roughness: 0.4 });
  const dark = std('#15171c', { roughness: 0.7 });
  const steel = std('#c3c9d1', { metalness: 0.85, roughness: 0.2 });
  const purple = std('#a24ff0', { metalness: 0.3, roughness: 0.35, emissive: '#5e1fa0', emissiveIntensity: 0.35 });
  g.scale.setScalar(1.2);
  box(0.07, 0.36, 0.1, body, 0, -0.1, 0.09);                                   // body over the hand
  box(0.072, 0.3, 0.014, purple, 0, -0.1, 0.146);                              // purple strip on top
  mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 16), steel, 0, -0.58, 0.105); // long straight barrel (along -y)
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16), dark, 0, -0.9, 0.105);  // muzzle
  mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.052, 10), std('#050507'), 0, -0.903, 0.105);
  box(0.05, 0.22, 0.03, dark, 0, -0.36, 0.06);                                // rail under the barrel
  // angled stock: goes back and down from the body, like the slanted rectangle of the drawing
  const stock = new THREE.Group();
  stock.position.set(0, 0.08, 0.08);
  stock.rotation.x = -0.45;
  g.add(stock);
  const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.09), body);
  sp.position.set(0, 0.18, 0);
  stock.add(sp);
  const butt = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.025, 0.11), dark);
  butt.position.set(0, 0.36, 0);
  stock.add(butt);
  // grip and the big round trigger guard
  box(0.05, 0.07, 0.15, dark, 0, 0.02, -0.03).rotation.x = 0.25;
  const guard = mesh(new THREE.TorusGeometry(0.05, 0.009, 8, 24), dark, 0, -0.1, 0.02);
  guard.rotation.y = Math.PI / 2;
  box(0.012, 0.012, 0.04, steel, 0, -0.095, 0.03).rotation.x = -0.3;
}

// Supergun (#32, Legendary): like a revolver in the drawing: a stepped grip at the back, a round drum and a
// long straight barrel, with gold parts. Gun frame: forward is -y, up is +z; the hand is at the grip.
function buildSupergun({ g, mesh, box }) {
  const body = std('#3a3e47', { metalness: 0.6, roughness: 0.35 });
  const dark = std('#15171c', { roughness: 0.7 });
  const gold = std('#ffc531', { metalness: 0.8, roughness: 0.25, emissive: '#b8860b', emissiveIntensity: 0.25 });
  g.scale.setScalar(1.25);
  box(0.06, 0.2, 0.09, body, 0, -0.08, 0.1);                                  // frame
  mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.1, 18), gold, 0, -0.1, 0.1); // the round drum
  for (let i = 0; i < 6; i++) {                                               // chambers on the drum's front
    const a = (i / 6) * Math.PI * 2;
    mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.102, 8), dark, Math.cos(a) * 0.028, -0.1, 0.1 + Math.sin(a) * 0.028);
  }
  box(0.045, 0.62, 0.05, body, 0, -0.48, 0.125);                              // long straight barrel
  box(0.047, 0.5, 0.012, gold, 0, -0.52, 0.153);                               // gold line on top
  box(0.012, 0.02, 0.03, gold, 0, -0.77, 0.165);                               // front sight
  mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10), std('#050507'), 0, -0.79, 0.125); // muzzle hole
  box(0.03, 0.03, 0.03, body, 0, 0.03, 0.14);                                  // hammer
  // stepped grip at the back: three steps going down and back, like the stairs in the drawing
  for (const [y, z] of [[0.04, 0.05], [0.08, -0.005], [0.12, -0.06]]) box(0.058, 0.07, 0.07, dark, 0, y, z);
  box(0.06, 0.03, 0.03, gold, 0, 0.14, -0.1);                                  // gold butt
  const guard = mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 20), dark, 0, -0.03, 0.03);
  guard.rotation.y = Math.PI / 2;
}

// A long straight blade along +z with a pointed tip. Returns the blade group.
function blade(g, { len, width, thick = 0.016, mat, from = 0.14 }) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(width, thick, len), mat);
  b.position.z = from + len / 2;
  g.add(b);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0, width / 2, width * 1.6, 4), mat);
  tip.rotation.x = Math.PI / 2;
  tip.rotation.y = Math.PI / 4;
  tip.scale.set(1, 1, thick / width * 1.4);
  tip.position.z = from + len + width * 0.8;
  g.add(tip);
}

// Electric Sword: long thin straight blade, small crossguard and handle, yellow lightning bolts around it.
function buildElectricSword({ g, mesh, box }) {
  blade(g, { len: 0.95, width: 0.06, mat: std('#e9eef5', { metalness: 0.35, roughness: 0.25, emissive: '#fff6c0', emissiveIntensity: 0.12 }) });
  box(0.2, 0.035, 0.035, std('#d4a531', { metalness: 0.8, roughness: 0.3 }), 0, 0, 0.12); // small guard
  mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 10), std('#2a2d33'), 0, 0, 0.02).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.03, 10, 8), std('#d4a531', { metalness: 0.8 }), 0, 0, -0.09);
  const yellow = glow('#ffe23a');
  const bolts = [];
  for (const [x, z, flip] of [[0.11, 0.3, 1], [-0.12, 0.55, -1], [0.12, 0.8, 1], [-0.11, 0.98, -1]]) {
    const b = bolt(yellow, 0.2);
    b.position.set(x, 0, z);
    b.rotation.y = flip * 0.35;
    b.scale.x = flip;
    g.add(b);
    bolts.push(b);
  }
  // the bolts flicker and jump a little (time in seconds is passed in)
  g.userData.update = time => {
    bolts.forEach((b, i) => {
      const f = Math.sin(time * 23 + i * 2.1) + Math.sin(time * 37 + i);
      b.visible = f > -1.2;
      b.position.y = Math.sin(time * 17 + i) * 0.015;
    });
  };
}

// Ice Sword: a thin tapered sword with blue snowflakes around it.
function buildIceSword({ g, mesh, box }) {
  const ice = std('#cdefff', { metalness: 0.3, roughness: 0.15, emissive: '#5ab8ff', emissiveIntensity: 0.25 });
  const b = mesh(new THREE.CylinderGeometry(0.004, 0.035, 0.95, 4), ice, 0, 0, 0.14 + 0.475);
  b.rotation.x = Math.PI / 2;
  b.scale.set(1, 1, 0.3);
  b.rotation.y = Math.PI / 4;
  box(0.16, 0.03, 0.03, std('#7fc8ff', { metalness: 0.6 }), 0, 0, 0.12); // small guard
  for (const s of [-1, 1]) box(0.025, 0.03, 0.06, std('#7fc8ff', { metalness: 0.6 }), s * 0.08, 0, 0.145); // little horns, like the drawing
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 10), std('#1e3a66'), 0, 0, 0.02).rotation.x = Math.PI / 2;
  const blue = glow('#3fb6ff');
  const flakes = [];
  for (const [x, z, r] of [[0.13, 0.32, 0.06], [-0.13, 0.48, 0.05], [0.12, 0.78, 0.055], [-0.12, 0.95, 0.06]]) {
    const f = snowflake(blue, r);
    f.position.set(x, 0, z); // flat like the blade, so you see the star shape from the side
    g.add(f);
    flakes.push(f);
  }
  g.userData.update = time => {
    flakes.forEach((f, i) => {
      f.rotation.y = time * 0.8 + i;
      f.position.y = Math.sin(time * 2 + i * 1.7) * 0.02;
    });
  };
}

// Supersword (Megalegend, blue + black): a very long thin straight blade, a small diamond guard and a long handle.
function buildSupersword({ g, mesh, box }) {
  const black = std('#101218', { metalness: 0.6, roughness: 0.3 });
  const blue = std('#2f6fff', { metalness: 0.5, roughness: 0.25, emissive: '#2f6fff', emissiveIntensity: 0.6 });
  const from = 0.2, len = 1.45;
  blade(g, { len, width: 0.05, thick: 0.014, mat: black, from });
  for (const s of [-1, 1]) box(0.008, 0.016, len, blue, s * 0.027, 0, from + len / 2); // glowing blue edges
  box(0.012, 0.018, len * 0.85, blue, 0, 0, from + len * 0.45);                       // and a blue line in the middle
  const diamond = mesh(new THREE.OctahedronGeometry(0.075), blue, 0, 0, 0.17);
  diamond.scale.set(1.3, 0.35, 0.8);
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 10), black, 0, 0, 0.0).rotation.x = Math.PI / 2; // long handle
  for (const z of [-0.12, -0.04, 0.04, 0.12]) mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 14), blue, 0, 0, z);
  mesh(new THREE.OctahedronGeometry(0.035), blue, 0, 0, -0.2);
}

// Shields: a square plate with "P.V.P" on the front. Shield frame: the plate is in the x-y plane,
// the front faces +z, up is +y. Stickman turns it onto the left arm.
export function buildShieldModel({ g, mesh, box }, def = {}, { mega = false } = {}) {
  const size = 0.6, thick = 0.04;
  const face = mega ? std('#ffc531', { metalness: 0.25, roughness: 0.3, emissive: '#ffb000', emissiveIntensity: 0.3 })
    : std(def.color || '#e6e9ee', { metalness: 0.15, roughness: 0.45 });
  const rim = mega ? std('#d99a00', { metalness: 0.3, roughness: 0.3 }) : std('#8a93a3', { metalness: 0.3, roughness: 0.35 });
  const ink = mega ? std('#3a2600', { roughness: 0.5 }) : std('#1e2a4a', { roughness: 0.5 });
  box(size, size, thick, face, 0, 0, 0);
  for (const [w, h, x, y] of [[size + 0.04, 0.04, 0, size / 2], [size + 0.04, 0.04, 0, -size / 2], [0.04, size, size / 2, 0], [0.04, size, -size / 2, 0]]) {
    box(w, h, thick + 0.02, rim, x, y, 0);
  }
  box(0.08, 0.3, 0.05, std('#3a3e45'), 0, 0, -thick / 2 - 0.025); // handle at the back
  const word = lettering('P.V.P', ink, 0.15, 0.012);
  word.position.z = thick / 2 + 0.006;
  g.add(word);
  if (!mega) return;
  // Mega Shield: glowing dots all around it and a sparkle, like the card
  const dotMat = glow('#fff07a');
  const dots = [];
  const n = 7, d = size / 2 + 0.08;
  for (let i = 0; i < n; i++) {
    const t = -d + (2 * d * (i + 0.5)) / n;
    for (const [x, y] of [[t, d], [t, -d], [d, t], [-d, t]]) dots.push(mesh(new THREE.SphereGeometry(0.018, 8, 6), dotMat, x, y, 0));
  }
  const star = new THREE.Group(); // a sparkle: a long + and a small x
  const starMat = glow('#ffe95c');
  for (const [r, l] of [[0, 0.16], [Math.PI / 2, 0.16], [Math.PI / 4, 0.08], [-Math.PI / 4, 0.08]]) {
    const ray = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), starMat);
    ray.scale.set(0.035, l, 0.02);
    ray.rotation.z = r;
    star.add(ray);
  }
  star.position.set(d + 0.02, d + 0.02, 0);
  g.add(star);
  g.userData.update = time => {
    dots.forEach((m, i) => m.scale.setScalar(0.75 + 0.45 * (0.5 + 0.5 * Math.sin(time * 4 + i * 0.7))));
    star.rotation.z = Math.sin(time * 1.5) * 0.3;
    star.scale.setScalar(0.85 + 0.25 * Math.sin(time * 3));
  };
}

// Melee weapons are held like a sword: handle in hand, blade forward (+z).
// Guns point along -y (the direction the arm points when aiming). Shields: see buildShieldModel.
const SPECIAL = {
  gun: { type: 'gun', build: buildGun },
  shootbm: { type: 'gun', build: buildShootbm },
  dmgun: { type: 'gun', build: buildDmGun },
  supergun: { type: 'gun', build: buildSupergun },
  electricsword: { type: 'melee', build: buildElectricSword },
  icesword: { type: 'melee', build: buildIceSword },
  supersword: { type: 'melee', build: buildSupersword },
  shield: { type: 'shield', build: (k, def) => buildShieldModel(k, def) },
  megashield: { type: 'shield', build: (k, def) => buildShieldModel(k, def, { mega: true }) },
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
  shield: (k, def) => buildShieldModel(k, def),
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
 * Build the 3D model of a weapon (or shield) as a THREE.Group.
 * options: { weapons = game-rules WEAPONS, castShadow = true }
 * An id missing from the weapons table gives an empty group.
 * Some models move (lightning, snowflakes, glowing dots): call group.userData.update(timeInSeconds)
 * every frame if it is there (Stickman does this for the weapon and the shield it carries).
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
  g.traverse(o => { if (o.isMesh) o.castShadow = castShadow && !o.material.isMeshBasicMaterial; });
  return g;
}

export { bolt, snowflake };
