// Sky, sun, lights, ground, beach, water, grass tufts and palms.
import * as THREE from 'three';
import { noiseTexture } from './textures.js';

export const SKY = Object.freeze({
  horizon: '#f6d7b0',
  top: '#4f86d6',
  radius: 600,        // keep it inside the camera's far plane (the game uses 900)
  fogNear: 90,
  fogFar: 420,
});

export const SUN_OFFSET = Object.freeze({ x: -40, y: 70, z: -50 }); // light position, relative to the focus point

/**
 * The sky dome with the sun disc. It must move with the camera (see scene.update):
 * a fixed dome lets the far side poke out of the camera's far plane, and that hole
 * showed the black clear color (the "black triangle" of issue #17).
 */
export function buildSky() {
  const horizon = new THREE.Color(SKY.horizon), top = new THREE.Color(SKY.top);
  const group = new THREE.Group();
  group.name = 'sky';
  const geo = new THREE.SphereGeometry(SKY.radius, 32, 16);
  const pos = geo.attributes.position, cols = [];
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / SKY.radius);
    const c = horizon.clone().lerp(top, Math.pow(t, 0.6));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  dome.renderOrder = -10; // drawn first, everything else on top
  dome.frustumCulled = false;
  group.add(dome);
  // the sun disc, inside the dome, in the same direction as the light
  const sun = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff6dc', fog: false, depthWrite: false, toneMapped: false }));
  sun.position.set(SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z).normalize().multiplyScalar(SKY.radius * 0.85);
  sun.renderOrder = -9;
  group.add(sun);
  return { group, dome, sunDisc: sun, horizon, top };
}

/** Hemisphere light plus the sun (a shadow-casting directional light). */
export function buildLights({ mobile = false } = {}) {
  const hemi = new THREE.HemisphereLight('#d6e6ff', '#b39a78', 1.9);
  const sun = new THREE.DirectionalLight('#fff3e0', 2.6);
  sun.position.set(SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z);
  sun.castShadow = true;
  const size = mobile ? 1024 : 2048;
  sun.shadow.mapSize.set(size, size);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  return { hemi, sun };
}

/** Grassy ground disc with sandy edges, a beach sloping into the sea, and the water. */
export function buildGround({ islandRadius, random }) {
  const R = islandRadius;
  const group = new THREE.Group();
  group.name = 'ground';
  const ground = new THREE.CircleGeometry(R + 12, 96);
  ground.rotateX(-Math.PI / 2);
  const gp = ground.attributes.position, gc = [];
  const grass = new THREE.Color('#86ad52'), dry = new THREE.Color('#bba96c'), sand = new THREE.Color('#ecd7a2');
  for (let i = 0; i < gp.count; i++) {
    const d = Math.hypot(gp.getX(i), gp.getZ(i));
    const c = d > R - 8 ? sand : grass.clone().lerp(dry, Math.min(1, d / R) * 0.8);
    gc.push(c.r, c.g, c.b);
  }
  ground.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
  const tex = noiseTexture(random, { size: 128, base: 228, spread: 50 });
  tex.repeat.set(80, 80);
  const groundMesh = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.95 }));
  groundMesh.receiveShadow = true;
  groundMesh.name = 'groundDisc';
  group.add(groundMesh);

  // beach: a ring from the ground's edge (y = 0) sloping down under the water (y = -1.6)
  const beachGeo = new THREE.RingGeometry(R + 11, R + 45, 96, 4);
  beachGeo.rotateX(-Math.PI / 2);
  const bp = beachGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const f = (Math.hypot(bp.getX(i), bp.getZ(i)) - (R + 11)) / 34;
    bp.setY(i, -0.02 - f * 1.6);
  }
  beachGeo.computeVertexNormals();
  const sandTex = noiseTexture(random, { size: 64, base: 232, spread: 30 });
  sandTex.repeat.set(60, 4);
  const beach = new THREE.Mesh(beachGeo, new THREE.MeshStandardMaterial({ color: '#e3c992', map: sandTex, roughness: 1 }));
  beach.receiveShadow = true;
  beach.name = 'beach';
  group.add(beach);

  // water: follows the focus point (see scene.update) so its edge is never seen
  const water = new THREE.Mesh(new THREE.CircleGeometry(800, 64), new THREE.MeshStandardMaterial({ color: '#2f9cc4', roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.88 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.35;
  water.name = 'water';
  return { group, ground: groundMesh, beach, water };
}

/** Grass tufts (one instanced mesh) and a ring of palms on the beach. Decoration only. */
export function buildPlants({ islandRadius, random, mobile = false }) {
  const R = islandRadius;
  const group = new THREE.Group();
  group.name = 'plants';
  const tuftGeo = new THREE.ConeGeometry(0.12, 0.5, 4);
  tuftGeo.translate(0, 0.25, 0);
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ color: '#6c9a42', roughness: 1 }), mobile ? 1500 : 4000);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < tufts.count; i++) {
    const a = random.next() * Math.PI * 2, d = Math.sqrt(random.next()) * (R - 12);
    v.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    q.setFromAxisAngle(up, random.next() * 3);
    const k = 0.6 + random.next() * 0.9; s.set(k, k, k);
    tufts.setMatrixAt(i, m.compose(v, q, s));
  }
  tufts.name = 'tufts';
  group.add(tufts);

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#8f6a45', roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#4c9a3f', roughness: 0.8, side: THREE.DoubleSide });
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
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + random.next() * 0.1, d = R + 2 + random.next() * 7;
    const palm = new THREE.Group();
    const h = 6 + random.next() * 4;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.scale.y = h; trunk.castShadow = true;
    palm.add(trunk);
    const turn = random.next() * Math.PI;
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = h;
      leaf.rotation.set(-0.15, (k / 7) * Math.PI * 2 + turn, 0, 'YXZ');
      leaf.castShadow = true;
      palm.add(leaf);
    }
    palm.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    palm.rotation.z = (random.next() - 0.5) * 0.3;
    group.add(palm);
  }
  return { group, tufts };
}
