// Things that grow and lie on the island (#43): grass tufts, flowers, bushes, rocks and the ring of palms.
// All decoration only (no collision). Each kind is ONE instanced mesh, so it is cheap to draw;
// phones get fewer of each.
import * as THREE from 'three';
import { createGroundField } from './ground-field.js';

/** How many of each (desktop / phone). */
export const PLANT_COUNTS = Object.freeze({
  desktop: Object.freeze({ tufts: 14000, flowers: 1800, bushes: 260, rocks: 320, palms: 40 }),
  mobile: Object.freeze({ tufts: 4200, flowers: 600, bushes: 110, rocks: 120, palms: 40 }),
});

const FLOWER_COLORS = ['#f6f3ea', '#ffd43b', '#f28ab2', '#a57be0', '#e5484d', '#86b9f2', '#ffffff', '#ffb347'];
const ROCK_COLORS = ['#9b968b', '#8a8476', '#a9a294', '#7d8a62', '#8f8a80'];

// a tuft: 6 thin blades leaning outwards, dark at the base and light at the tip (normals point up, so the
// tufts are lit like the ground and never turn black from behind)
function tuftGeometry() {
  const p = [], c = [], nrm = [];
  const blades = 6;
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * Math.PI * 2 + (k % 2) * 0.4, h = 0.36 + (k % 3) * 0.08, lean = 0.1 + (k % 2) * 0.1, w = 0.035;
    const ox = Math.cos(a) * 0.04, oz = Math.sin(a) * 0.04, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    p.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + Math.cos(a) * lean, h, oz + Math.sin(a) * lean);
    c.push(0.58, 0.64, 0.5, 0.58, 0.64, 0.5, 1.1, 1.1, 0.98);
    for (let i = 0; i < 3; i++) nrm.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}

// a flower: a small flat 5-petal star with a yellow middle, just above the ground (in the grass)
function flowerGeometry() {
  const y = 0.13, p = [0, y, 0], c = [1, 0.85, 0.3], idx = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2, r = k % 2 ? 0.03 : 0.075;
    p.push(Math.cos(a) * r, y + (k % 2 ? 0 : 0.012), Math.sin(a) * r);
    c.push(1, 1, 1);
  }
  for (let k = 0; k < 10; k++) idx.push(0, 1 + ((k + 1) % 10), 1 + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(p.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setIndex(idx);
  return g;
}

// a bush: three lumpy balls, darker at the bottom
function bushGeometry(random) {
  const parts = [[0, 0.42, 0, 0.55], [0.36, 0.3, 0.12, 0.4], [-0.32, 0.27, -0.14, 0.38]];
  const p = [], c = [], idx = [];
  for (const [cx, cy, cz, r] of parts) {
    const ball = new THREE.IcosahedronGeometry(r, 1);
    const merged = ball.index ? ball.toNonIndexed() : ball;
    const bp = merged.attributes.position;
    const base = p.length / 3;
    // bumps: move each corner in or out a little (same corner, same bump: keyed by its rounded position)
    const bump = new Map();
    for (let i = 0; i < bp.count; i++) {
      const key = `${bp.getX(i).toFixed(3)},${bp.getY(i).toFixed(3)},${bp.getZ(i).toFixed(3)}`;
      if (!bump.has(key)) bump.set(key, 0.85 + random.next() * 0.3);
      const k = bump.get(key);
      const x = bp.getX(i) * k + cx, y = bp.getY(i) * k * 0.85 + cy, z = bp.getZ(i) * k + cz;
      p.push(x, y, z);
      const t = Math.max(0, Math.min(1, y / 0.85));
      c.push(0.5 + t * 0.55, 0.55 + t * 0.5, 0.45 + t * 0.4);
      idx.push(base + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}

// a rock: a dented, flattened dodecahedron, partly in the ground
function rockGeometry(random) {
  const g = new THREE.DodecahedronGeometry(0.5, 0);
  const pos = g.attributes.position, dent = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!dent.has(key)) dent.set(key, 0.75 + random.next() * 0.4);
    const k = dent.get(key);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k - 0.12, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;

/**
 * Grass tufts, flowers, bushes and rocks (instanced, placed with the ground field: no grass on paths,
 * bushes and rocks like to be near the ruins) and a ring of palms on the beach. Decoration only.
 * @param {object} opts
 * @param {number} opts.islandRadius
 * @param {{ next(): number }} opts.random
 * @param {boolean} [opts.mobile] fewer of everything, no shadows
 * @param {any[]} [opts.boxes] the ruins (nothing grows inside them)
 * @param {Array<{x:number,z:number}>} [opts.chests] nothing big grows on a chest
 * @param {ReturnType<typeof createGroundField>} [opts.field] the ground field (else one is made here)
 * @param {Partial<typeof PLANT_COUNTS.desktop>} [opts.counts] change how many of each
 */
export function buildPlants({ islandRadius, random, mobile = false, boxes = [], chests = [], field = null, counts = {} }) {
  const R = islandRadius;
  const N = { ...(mobile ? PLANT_COUNTS.mobile : PLANT_COUNTS.desktop), ...counts };
  field = field || createGroundField({ islandRadius: R, boxes, random, size: mobile ? 256 : 512 });
  const group = new THREE.Group();
  group.name = 'plants';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  const disc = (maxR) => { const a = random.next() * Math.PI * 2, d = Math.sqrt(random.next()) * maxR; return [Math.cos(a) * d, Math.sin(a) * d]; };
  const nearChest = (x, z, r) => chests.some(c => dist2(x, z, c.x, c.z) < r * r);
  // place `count` things in clumps: find a good clump center, then scatter around it
  function scatter(count, perClump, spread, good, put) {
    let n = 0, guard = count * 40;
    while (n < count && guard-- > 0) {
      const [cx, cz] = disc(R - 4);
      if (!good(cx, cz, true)) continue;
      const k = Math.min(perClump, count - n);
      for (let t = 0; t < k * 3 && n < count; t++) {
        const x = cx + (random.next() - 0.5) * spread * 2, z = cz + (random.next() - 0.5) * spread * 2;
        if (!good(x, z, false)) continue;
        put(n++, x, z);
        if (t >= k) break;
      }
    }
    return n;
  }
  const lambert = (opts) => new THREE.MeshLambertMaterial(opts);

  // grass tufts: thick in lush places, never on paths, dirt, sand or inside ruins
  const tufts = new THREE.InstancedMesh(tuftGeometry(), lambert({ vertexColors: true, side: THREE.DoubleSide }), N.tufts);
  const tuftLight = new THREE.Color('#8fb84a'), tuftLush = new THREE.Color('#3f8f2b');
  tufts.count = scatter(N.tufts, 7, 1.1, (x, z, center) => {
    const f = field.sample(x, z);
    if (f.dirt > 0.35 || f.sand > 0.3 || f.ruinDist < 0.25) return false;
    return center ? random.next() < 0.3 + 0.7 * f.lush : true;
  }, (i, x, z) => {
    const f = field.sample(x, z);
    q.setFromAxisAngle(up, random.next() * Math.PI * 2);
    const k = 0.75 + random.next() * 0.7; s.set(k, k * (0.8 + random.next() * 0.5), k);
    tufts.setMatrixAt(i, m.compose(v.set(x, 0, z), q, s));
    tufts.setColorAt(i, col.copy(tuftLight).lerp(tuftLush, f.lush).multiplyScalar(0.85 + random.next() * 0.3));
  });
  tufts.name = 'tufts';
  group.add(tufts);

  // flowers: small patches of one color in the grass
  const flowers = new THREE.InstancedMesh(flowerGeometry(), lambert({ vertexColors: true, side: THREE.DoubleSide }), N.flowers);
  let patchColor = 0;
  flowers.count = scatter(N.flowers, 10, 1.6, (x, z, center) => {
    const f = field.sample(x, z);
    if (f.dirt > 0.25 || f.sand > 0.15 || f.ruinDist < 0.4) return false;
    if (center) { patchColor = Math.floor(random.next() * FLOWER_COLORS.length); return random.next() < 0.25 + 0.75 * f.lush; }
    return true;
  }, (i, x, z) => {
    q.setFromAxisAngle(up, random.next() * Math.PI * 2);
    const k = 0.8 + random.next() * 0.5; s.set(k, k * (0.7 + random.next() * 0.7), k);
    flowers.setMatrixAt(i, m.compose(v.set(x, 0, z), q, s));
    const c = random.next() < 0.85 ? patchColor : Math.floor(random.next() * FLOWER_COLORS.length);
    flowers.setColorAt(i, col.set(FLOWER_COLORS[c]));
  });
  flowers.name = 'flowers';
  group.add(flowers);

  // bushes: mostly along the ruins' walls, some in the open grass; never on a chest; low (under 1.1 m)
  const bushes = new THREE.InstancedMesh(bushGeometry(random), lambert({ vertexColors: true }), N.bushes);
  const bushColors = [new THREE.Color('#3d7a2a'), new THREE.Color('#4f8a2f'), new THREE.Color('#356b2c')];
  bushes.count = scatter(N.bushes, 2, 1.6, (x, z, center) => {
    const f = field.sample(x, z);
    if (f.sand > 0.2 || f.ruinDist < 0.7 || nearChest(x, z, 3)) return false;
    if (center) return f.ruinDist < 4 ? random.next() < 0.8 : random.next() < 0.12;
    return f.dirt < 0.6;
  }, (i, x, z) => {
    q.setFromAxisAngle(up, random.next() * Math.PI * 2);
    const k = 0.6 + random.next() * 0.5; s.set(k * (0.9 + random.next() * 0.3), k * (0.8 + random.next() * 0.3), k);
    bushes.setMatrixAt(i, m.compose(v.set(x, 0, z), q, s));
    bushes.setColorAt(i, col.copy(bushColors[Math.floor(random.next() * bushColors.length)]).multiplyScalar(0.9 + random.next() * 0.25));
  });
  bushes.castShadow = !mobile;
  bushes.name = 'bushes';
  group.add(bushes);

  // rocks: small stones, many near the ruins (fallen pieces), a few in the grass and at the beach's top
  const rocks = new THREE.InstancedMesh(rockGeometry(random), new THREE.MeshLambertMaterial({ flatShading: true }), N.rocks);
  const e = new THREE.Euler();
  rocks.count = scatter(N.rocks, 3, 1.5, (x, z, center) => {
    const f = field.sample(x, z);
    if (f.ruinDist < 0.35 || nearChest(x, z, 2)) return false;
    if (center) return f.ruinDist < 5 ? random.next() < 0.7 : random.next() < 0.2;
    return true;
  }, (i, x, z) => {
    e.set((random.next() - 0.5) * 0.4, random.next() * Math.PI * 2, (random.next() - 0.5) * 0.4);
    const k = 0.3 + random.next() * 0.6; s.set(k * (0.8 + random.next() * 0.5), k * (0.45 + random.next() * 0.35), k * (0.8 + random.next() * 0.5));
    rocks.setMatrixAt(i, m.compose(v.set(x, 0, z), q.setFromEuler(e), s));
    const c = col.set(ROCK_COLORS[Math.floor(random.next() * ROCK_COLORS.length)]);
    if (field.sample(x, z).lush > 0.6 && random.next() < 0.5) c.lerp(new THREE.Color('#6f8f45'), 0.35); // a bit of moss
    rocks.setColorAt(i, c.multiplyScalar(0.9 + random.next() * 0.2));
  });
  rocks.castShadow = !mobile;
  rocks.name = 'rocks';
  group.add(rocks);

  // palms on the beach
  const palms = new THREE.Group();
  palms.name = 'palms';
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#8f6a45' });
  const leafMats = ['#4c9a3f', '#3f8a35', '#5aa544'].map(c => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
  // a leaf: long, pointed, bending down at the tip (no flat planes facing the camera edge-on)
  const leafGeo = new THREE.BufferGeometry();
  {
    const p = [], idx = [], segs = 6, len = 3.4;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, w = 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.02;
      const y = Math.sin(t * 1.2) * 0.9 - t * t * 1.4, z = t * len;
      p.push(-w, y - 0.08, z, 0, y, z, w, y - 0.08, z);
      if (k < segs) { const b = k * 3; idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
    }
    leafGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    leafGeo.setIndex(idx);
    leafGeo.computeVertexNormals();
  }
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  for (let i = 0; i < N.palms; i++) {
    const a = (i / N.palms) * Math.PI * 2 + random.next() * 0.1, d = R + 2 + random.next() * 7;
    const palm = new THREE.Group();
    const h = 6 + random.next() * 4;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.scale.y = h; trunk.castShadow = !mobile;
    palm.add(trunk);
    const turn = random.next() * Math.PI, leafMat = leafMats[i % leafMats.length];
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = h;
      leaf.rotation.set(-0.15, (k / 7) * Math.PI * 2 + turn, 0, 'YXZ');
      leaf.castShadow = !mobile;
      palm.add(leaf);
    }
    palm.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    palm.rotation.z = (random.next() - 0.5) * 0.3;
    palms.add(palm);
  }
  group.add(palms);
  return { group, tufts, flowers, bushes, rocks, palms, field };
}
