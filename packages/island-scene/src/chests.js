// Treasure chests: a wooden box with a round lid hinged at the back, and the golden chest.
import * as THREE from 'three';

// Size of a normal chest (meters). Front is +z, width along x.
export const CHEST_SIZE = Object.freeze({ width: 1.1, depth: 0.75, height: 0.55 });
export const LID_OPEN_ANGLE = -1.9; // radians around the back hinge (negative = front goes up and back)

/**
 * One chest model. The lid is a half cylinder lying along the chest's width (x), hinged at the
 * back top edge, with the lock on its front. Turn it with `chest.userData.lid.rotation.x`
 * (0 = closed, LID_OPEN_ANGLE = open), or use createChests() which animates it for you.
 * @param {{ golden?: boolean }} [opts]
 * @returns {THREE.Group} with userData.lid (the hinge group)
 */
export function buildChest({ golden = false } = {}) {
  const { width: W, depth: D, height: H } = CHEST_SIZE;
  const r = D / 2;
  const g = new THREE.Group();
  g.name = golden ? 'goldenChest' : 'chest';
  const wood = new THREE.MeshStandardMaterial(golden
    ? { color: '#ffc531', metalness: 0.45, roughness: 0.3, emissive: '#6a4600' }
    : { color: '#a5693a', roughness: 0.8 });
  const band = new THREE.MeshStandardMaterial(golden
    ? { color: '#fff1a8', metalness: 0.4, roughness: 0.25, emissive: '#5a4a10' }
    : { color: '#45454f', metalness: 0.6, roughness: 0.4 });
  const inside = new THREE.MeshStandardMaterial(golden
    ? { color: '#ffe066', emissive: '#a07000', roughness: 0.4, metalness: 0.6 }
    : { color: '#3b2414', roughness: 1 });
  const shadow = mesh => { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; };

  // the box
  const base = shadow(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wood));
  base.position.y = H / 2;
  g.add(base);
  const hollow = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.01, D - 0.12), inside); // seen when open
  hollow.position.y = H + 0.004;
  g.add(hollow);
  for (const x of [-0.4, 0.4]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, H + 0.02, D + 0.02), band);
    b.position.set(x, H / 2, 0);
    g.add(b);
  }

  // the lid: hinge at the back top edge
  const lid = new THREE.Group();
  lid.name = 'lid';
  lid.position.set(0, H, -r);
  // CylinderGeometry stands along y; after rotateZ(PI/2) it lies along x, and theta 0..PI is the top half.
  const shell = new THREE.CylinderGeometry(r, r, W, 18, 1, false, 0, Math.PI);
  shell.rotateZ(Math.PI / 2);
  shell.translate(0, 0, r);
  lid.add(shadow(new THREE.Mesh(shell, wood)));
  const under = new THREE.Mesh(new THREE.BoxGeometry(W, 0.03, D), inside); // flat underside of the lid
  under.position.set(0, 0.015, r);
  lid.add(under);
  for (const x of [-0.4, 0.4]) {
    const strap = new THREE.CylinderGeometry(r + 0.015, r + 0.015, 0.08, 18, 1, false, 0, Math.PI);
    strap.rotateZ(Math.PI / 2);
    strap.translate(x, 0, r);
    lid.add(new THREE.Mesh(strap, band));
  }
  // lock: on the front of the lid, hanging over the top of the box's front
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.05), band);
  lock.position.set(0, -0.04, D + 0.025);
  lock.name = 'lock';
  lid.add(lock);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.07, 0.01), new THREE.MeshBasicMaterial({ color: '#111' }));
  hole.position.set(0, -0.06, D + 0.052);
  lid.add(hole);
  g.add(lid);
  g.userData.lid = lid;
  return g;
}

/**
 * All the normal chests of an island, each turned to face the island's center.
 * @param {{ chests: Array<{x:number, z:number}> }} opts
 */
export function createChests({ chests }) {
  const group = new THREE.Group();
  group.name = 'chests';
  const meshes = chests.map(c => {
    const m = buildChest();
    m.position.set(c.x, 0, c.z);
    m.rotation.y = Math.atan2(-c.x, -c.z); // local +z (the front) points at the center
    m.userData.open = false;
    group.add(m);
    return m;
  });
  return {
    group,
    meshes,
    /** Open or close chest i (the lid moves in update). Unknown ids are ignored. */
    setOpen(i, open) { const m = meshes[i]; if (m) m.userData.open = !!open; },
    isOpen(i) { return !!meshes[i]?.userData.open; },
    closeAll() { for (const m of meshes) m.userData.open = false; },
    /** Move the lids toward open/closed. Pass dt in seconds; dt = Infinity snaps them. */
    update(dt) {
      const k = Math.min(1, dt * 8);
      for (const m of meshes) {
        const lid = m.userData.lid, target = m.userData.open ? LID_OPEN_ANGLE : 0;
        lid.rotation.x += (target - lid.rotation.x) * k;
      }
    },
  };
}

/** The golden chest: bigger, shiny, with a light beam and a glowing light. Hidden at first. */
export function createGoldenChest({ scale = 1.35 } = {}) {
  const mesh = buildChest({ golden: true });
  mesh.scale.setScalar(scale);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 140, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 70;
  beam.name = 'beam';
  mesh.add(beam);
  const light = new THREE.PointLight('#ffcc44', 25, 14);
  light.position.y = 1.5;
  mesh.add(light);
  mesh.visible = false;
  return {
    mesh,
    light,
    get visible() { return mesh.visible; },
    show(x, z) { mesh.position.set(x, 0, z); mesh.visible = true; },
    hide() { mesh.visible = false; },
    /** Spin and pulse; time in seconds. */
    update(time) {
      if (!mesh.visible) return;
      mesh.rotation.y = time * 0.6;
      light.intensity = 20 + Math.sin(time * 4) * 8;
    },
  };
}
