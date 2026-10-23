// Coins from the boss's drawing (#29) in 3D: an almost square gold coin with slightly cut corners,
// darker edges and a "P" on both sides. And the little "coin pop" when a chest opens: a few coins
// jump out, spin, bounce once and fade. A small fixed pool, no shadows: cheap on phones.
import * as THREE from 'three';
import { createRandom } from '@pvp/seeded-random';

/** Same colors as the coin icon in @pvp/hud-model (COIN_COLORS). */
export const COIN_COLORS = Object.freeze({ face: '#ffcc1f', edge: '#c98400', label: '#8a5200' });
/** Size of a coin (meters): almost square, a bit taller than wide, corners cut by `cut`. */
export const COIN_SIZE = Object.freeze({ width: 0.3, height: 0.34, thick: 0.05, cut: 0.045 });
/** How a coin pop moves (meters, seconds). */
export const COIN_POP = Object.freeze({
  life: 1.2, fade: 0.4, gravity: 11, up: [3.4, 4.6], out: [0.7, 1.5], spin: [5, 9], floor: 0.17, bounce: 0.35,
});

// The coin's outline: a rectangle with its 4 corners cut, centered on 0,0.
function coinShape(w, h, c) {
  const x = w / 2, y = h / 2, s = new THREE.Shape();
  s.moveTo(-x + c, -y);
  s.lineTo(x - c, -y); s.lineTo(x, -y + c); s.lineTo(x, y - c); s.lineTo(x - c, y);
  s.lineTo(-x + c, y); s.lineTo(-x, y - c); s.lineTo(-x, -y + c); s.closePath();
  return s;
}

// A bold "P" (same shape as the icon's), `size` meters tall, centered on 0,0.
function letterP(size) {
  const k = size / 24; // the icon's P is 24 units tall (y 24..48), 16.5 wide (x 18..34.5)
  const X = v => (v - 26.25) * k, Y = v => (36 - v) * k; // flip y: SVG goes down, three.js goes up
  const p = new THREE.Shape();
  p.moveTo(X(18), Y(24)); p.lineTo(X(27.5), Y(24));
  p.absarc(X(27.5), Y(31.5), 7.5 * k, Math.PI / 2, -Math.PI / 2, true);
  p.lineTo(X(24.5), Y(39)); p.lineTo(X(24.5), Y(48)); p.lineTo(X(18), Y(48)); p.closePath();
  const hole = new THREE.Path();
  hole.moveTo(X(24.5), Y(29.5)); hole.lineTo(X(27), Y(29.5));
  hole.absarc(X(27), Y(31.5), 2 * k, Math.PI / 2, -Math.PI / 2, true);
  hole.lineTo(X(24.5), Y(33.5)); hole.closePath();
  p.holes.push(hole);
  return p;
}

let shared = null; // geometries are the same for every coin
function coinGeometries() {
  if (shared) return shared;
  const { width, height, thick, cut } = COIN_SIZE;
  const body = new THREE.ExtrudeGeometry(coinShape(width, height, cut), {
    depth: thick, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 1,
  });
  body.translate(0, 0, -thick / 2);
  const label = new THREE.ShapeGeometry(letterP(height * 0.5), 4);
  shared = { body, label };
  return shared;
}

/**
 * One gold coin (a THREE.Group, about 0.3 x 0.34 m, standing up, facing +z).
 * Group 0 of the body is its two flat sides (gold), group 1 its edges (darker: the outline).
 * userData.materials lists its materials (each coin has its own, so it can fade alone).
 */
export function buildCoin() {
  const { body, label } = coinGeometries();
  const { thick } = COIN_SIZE;
  const face = new THREE.MeshStandardMaterial({ color: COIN_COLORS.face, metalness: 0.55, roughness: 0.32, emissive: '#5a3a00' });
  const edge = new THREE.MeshStandardMaterial({ color: COIN_COLORS.edge, metalness: 0.5, roughness: 0.4, emissive: '#3a2400' });
  const ink = new THREE.MeshStandardMaterial({ color: COIN_COLORS.label, metalness: 0.3, roughness: 0.6 });
  const g = new THREE.Group();
  g.name = 'coin';
  g.add(new THREE.Mesh(body, [face, edge]));
  const front = new THREE.Mesh(label, ink);
  front.position.z = thick / 2 + 0.0095;
  const back = new THREE.Mesh(label, ink);
  back.position.z = -(thick / 2 + 0.0095);
  back.rotation.y = Math.PI; // reads the right way round from behind too
  g.add(front, back);
  g.userData.materials = [face, edge, ink];
  return g;
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * A pool of coins that pop out of chests.
 * @param {{ max?: number, random?: number|string|{ next(): number } }} [opts] how many coins can fly at once
 *   (the oldest is reused when all are busy), and a seed or seeded random for their directions and spin.
 */
export function createCoinPops({ max = 12, random = 'coin-pops' } = {}) {
  const rand = typeof random === 'object' && random && typeof random.next === 'function' ? random : createRandom(random);
  const group = new THREE.Group();
  group.name = 'coinPops';
  const coins = Array.from({ length: Math.max(1, max | 0) }, () => {
    const mesh = buildCoin();
    mesh.visible = false;
    group.add(mesh);
    for (const m of mesh.userData.materials) m.transparent = true;
    return { mesh, t: 0, live: false, vx: 0, vy: 0, vz: 0, spin: 0, born: 0 };
  });
  let born = 0;

  function free() {
    return coins.find(c => !c.live) ?? coins.reduce((a, b) => (b.born < a.born ? b : a));
  }

  return {
    group,
    coins,
    /** Coins in the air right now. */
    get active() { return coins.filter(c => c.live).length; },
    /**
     * Pop `count` coins from the point x, y, z (e.g. a chest's open top). Returns how many started.
     */
    burst(x, y, z, { count = 5 } = {}) {
      const n = Math.max(0, Math.min(coins.length, count | 0));
      const turn = rand.next() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const c = free();
        const a = turn + (i / n) * Math.PI * 2 + (rand.next() - 0.5) * 0.8; // spread all around
        const out = lerp(COIN_POP.out[0], COIN_POP.out[1], rand.next());
        c.vx = Math.cos(a) * out; c.vz = Math.sin(a) * out;
        c.vy = lerp(COIN_POP.up[0], COIN_POP.up[1], rand.next());
        c.spin = lerp(COIN_POP.spin[0], COIN_POP.spin[1], rand.next()) * (rand.next() < 0.5 ? -1 : 1);
        c.t = 0; c.live = true; c.born = ++born;
        c.mesh.position.set(x, y, z);
        c.mesh.rotation.set(0, a, 0);
        c.mesh.scale.setScalar(1);
        for (const m of c.mesh.userData.materials) m.opacity = 1;
        c.mesh.visible = true;
      }
      return n;
    },
    /** Move the coins; dt in seconds (passed in). A non-finite dt ends every pop. */
    update(dt) {
      for (const c of coins) {
        if (!c.live) continue;
        if (!Number.isFinite(dt)) { c.live = false; c.mesh.visible = false; continue; }
        c.t += dt;
        if (c.t >= COIN_POP.life) { c.live = false; c.mesh.visible = false; continue; }
        const p = c.mesh.position;
        c.vy -= COIN_POP.gravity * dt;
        p.x += c.vx * dt; p.y += c.vy * dt; p.z += c.vz * dt;
        if (p.y < COIN_POP.floor && c.vy < 0) { // one small bounce on the ground
          p.y = COIN_POP.floor; c.vy *= -COIN_POP.bounce; c.vx *= 0.5; c.vz *= 0.5;
        }
        c.mesh.rotation.y += c.spin * dt;
        const left = COIN_POP.life - c.t; // fade out (and shrink a bit) at the end
        const k = left < COIN_POP.fade ? left / COIN_POP.fade : 1;
        c.mesh.scale.setScalar(0.6 + 0.4 * k);
        for (const m of c.mesh.userData.materials) m.opacity = k;
      }
    },
    /** Stop every pop. */
    clear() { for (const c of coins) { c.live = false; c.mesh.visible = false; } },
  };
}
