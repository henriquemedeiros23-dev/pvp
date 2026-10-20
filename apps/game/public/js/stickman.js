// Builds and animates a stickman with a skin (color/pattern + outfits) and a weapon.
import * as THREE from 'three';
import { COLORS, WEAPONS } from '/shared/config.js';

const LIMB = 0.075;

function stripesTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#111';
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let stripes = null;

function bodyMaterial(colorId) {
  const def = COLORS[colorId] || COLORS.black;
  if (def.pattern === 'gold') return new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.85, roughness: 0.25 });
  if (def.pattern === 'stripes') return new THREE.MeshStandardMaterial({ map: stripes || (stripes = stripesTexture()), roughness: 0.6 });
  return new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.55 });
}

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

function limb(len, mat, radius = LIMB) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 4, 10), mat);
  m.position.y = -len / 2;
  m.castShadow = true;
  return m;
}

// Weapons are modelled pointing along -y (the direction the arm points).
export function buildWeapon(id) {
  const g = new THREE.Group();
  const wood = std('#8a5a2b'), steel = std('#c8ccd4', { metalness: 0.7, roughness: 0.3 }), dark = std('#2a2d33', { metalness: 0.4 });
  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  const def = WEAPONS[id];
  if (!def) return g;
  if (def.type === 'melee') {
    // held like a sword: handle in hand, blade forward (+z)
    if (id === 'woodsword') { box(0.06, 0.06, 0.2, wood, 0, 0, 0); box(0.22, 0.05, 0.05, wood, 0, 0, 0.1); box(0.07, 0.03, 0.75, std('#b98a50'), 0, 0, 0.5); }
    if (id === 'sword') { box(0.06, 0.06, 0.2, dark); box(0.28, 0.05, 0.05, std('#d4a531', { metalness: 0.8 }), 0, 0, 0.1); box(0.08, 0.02, 0.9, steel, 0, 0, 0.58); }
    if (id === 'bat') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.035, 0.95, 10), wood); m.rotation.x = Math.PI / 2; m.position.z = 0.4; g.add(m); }
    if (id === 'spear') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 8), wood); m.rotation.x = Math.PI / 2; m.position.z = 0.5; g.add(m); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 8), steel); tip.rotation.x = Math.PI / 2; tip.position.z = 1.5; g.add(tip); }
    if (id === 'axe') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), wood); m.rotation.x = Math.PI / 2; m.position.z = 0.35; g.add(m); box(0.04, 0.32, 0.22, steel, 0, 0.12, 0.72); }
    return g;
  }
  // ranged: barrel along -y
  if (id === 'pistol') { box(0.07, 0.3, 0.1, dark, 0, -0.12, 0); box(0.06, 0.08, 0.16, dark, 0, 0, -0.06); }
  if (id === 'shotgun') { box(0.09, 0.85, 0.1, wood, 0, -0.2, 0); box(0.06, 0.6, 0.06, dark, 0, -0.45, 0.05); }
  if (id === 'rifle') { box(0.08, 0.95, 0.12, dark, 0, -0.25, 0); box(0.05, 0.15, 0.18, dark, 0, -0.1, -0.1); box(0.04, 0.22, 0.06, std('#555'), 0, -0.25, 0.09); }
  if (id === 'sniper') { box(0.07, 1.35, 0.1, std('#3a4a2a'), 0, -0.45, 0); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 10), dark); s.position.set(0, -0.3, 0.1); g.add(s); }
  if (id === 'rocket') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 12), std('#3f5f3a')); m.position.y = -0.3; g.add(m); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 10), std('#d33')); tip.rotation.x = Math.PI; tip.position.y = -0.98; g.add(tip); }
  if (id === 'grenade') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), std('#4b6b2f')); m.position.y = -0.08; g.add(m); box(0.04, 0.06, 0.04, dark, 0, 0.04, 0); }
  if (id === 'mine') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 14), std('#555')); m.position.y = -0.08; g.add(m); const l = new THREE.Mesh(new THREE.SphereGeometry(0.03), new THREE.MeshBasicMaterial({ color: '#f22' })); l.position.set(0, -0.08, 0.04); g.add(l); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function buildOutfit(slot, id, head, torso, back) {
  const add = (parent, mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh; };
  if (slot === 'hat') {
    if (id === 'cap') {
      const m = std('#d8322d');
      add(head, new THREE.Mesh(new THREE.SphereGeometry(0.235, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m), 0, 0.03, 0);
      add(head, new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.22), m), 0, 0.05, 0.2);
    }
    if (id === 'tophat') {
      const m = std('#151515');
      add(head, new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 20), m), 0, 0.16, 0);
      add(head, new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.36, 20), m), 0, 0.35, 0);
      add(head, new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.06, 20), std('#c62828')), 0, 0.21, 0);
    }
    if (id === 'wizard') {
      const m = std('#4b2fa8');
      add(head, new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 20), m), 0, 0.15, 0);
      const cone = add(head, new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 20), m), 0, 0.45, -0.03);
      cone.rotation.x = -0.2;
      add(head, new THREE.Mesh(new THREE.OctahedronGeometry(0.05), std('#ffd84a', { emissive: '#aa8800' })), 0.12, 0.35, 0.12);
    }
    if (id === 'crown') {
      const m = std('#ffcb2e', { metalness: 0.9, roughness: 0.2 });
      add(head, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16, 1, true), m), 0, 0.2, 0).material.side = THREE.DoubleSide;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(head, new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 6), m), Math.sin(a) * 0.19, 0.3, Math.cos(a) * 0.19);
      }
      add(head, new THREE.Mesh(new THREE.OctahedronGeometry(0.04), std('#e0245e', { emissive: '#600' })), 0, 0.21, 0.2);
    }
  }
  if (slot === 'face') {
    if (id === 'shades') {
      const m = std('#0d0d0d', { metalness: 0.5, roughness: 0.1 });
      add(head, new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.03), m), -0.08, 0.03, 0.21);
      add(head, new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.03), m), 0.08, 0.03, 0.21);
      add(head, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), m), 0, 0.05, 0.215);
    }
    if (id === 'ninja' || id === 'hero') {
      const color = id === 'ninja' ? '#d42020' : '#1f3fbf';
      const band = add(head, new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.04, 8, 24), std(color)), 0, id === 'ninja' ? 0.1 : 0.03, 0);
      band.rotation.x = Math.PI / 2;
      if (id === 'ninja') {
        const t1 = add(head, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.25, 0.02), std(color)), 0.04, -0.02, -0.25); t1.rotation.z = 0.3;
        const t2 = add(head, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.02), std(color)), -0.04, -0.02, -0.25); t2.rotation.z = -0.3;
      }
    }
  }
  if (slot === 'back') {
    if (id === 'redcape' || id === 'bluecape') {
      const geo = new THREE.PlaneGeometry(0.5, 0.85, 1, 4);
      geo.translate(0, -0.42, 0);
      const cape = add(back, new THREE.Mesh(geo, std(id === 'redcape' ? '#c41f1f' : '#2246c4', { side: THREE.DoubleSide })), 0, 0, -0.1);
      cape.rotation.x = 0.15;
      cape.userData.cape = true;
    }
    if (id === 'backpack') {
      add(back, new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.18), std('#7a4f22')), 0, -0.22, -0.16);
      add(back, new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.05), std('#946231')), 0, -0.3, -0.27);
    }
  }
  if (slot === 'shirt') {
    const color = { tshirt: '#1fa3a3', vest: '#a08550', armor: '#b9bec8' }[id];
    if (!color) return;
    const extra = id === 'armor' ? { metalness: 0.8, roughness: 0.3 } : {};
    add(torso, new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.42, 14), std(color, extra)), 0, 0.22, 0);
    if (id === 'armor' || id === 'tshirt') {
      for (const s of [-1, 1]) add(torso, new THREE.Mesh(new THREE.SphereGeometry(id === 'armor' ? 0.11 : 0.09, 10, 8), std(color, extra)), s * 0.17, 0.4, 0);
    }
    if (id === 'vest') add(torso, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), std('#222')), 0, 0.22, 0.16);
  }
}

export class Stickman {
  constructor(skin) {
    this.root = new THREE.Group();
    this.skin = skin;
    this.mat = bodyMaterial(skin.color);
    this.rainbow = COLORS[skin.color]?.pattern === 'rainbow';

    this.hips = new THREE.Group();
    this.hips.position.y = 0.95;
    this.root.add(this.hips);

    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const spine = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 10), this.mat);
    spine.position.y = 0.22; spine.castShadow = true;
    this.torso.add(spine);

    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    this.torso.add(this.head);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), this.mat);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    const eyeMat = new THREE.MeshBasicMaterial({ color: COLORS[skin.color]?.color === '#f2f2f2' || skin.color === 'zebra' ? '#111' : '#fff' });
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
      pivot.add(limb(0.6, this.mat));
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
      pivot.add(limb(0.85, this.mat));
      this.hips.add(pivot);
      return pivot;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    for (const slot of ['hat', 'face', 'back', 'shirt']) buildOutfit(slot, skin[slot], this.head, this.torso, this.back);

    this.weaponId = null;
    this.weapon = null;
    this.walk = 0;
    this.swing = 0;
    this.recoil = 0;
  }

  setWeapon(id) {
    if (id === this.weaponId) return;
    if (this.weapon) this.armR.hand.remove(this.weapon);
    this.weaponId = id;
    this.weapon = id ? buildWeapon(id) : null;
    if (this.weapon) this.armR.hand.add(this.weapon);
  }

  // state: { speed, crouch, slide, air, pitch }
  animate(dt, state, time) {
    const { speed = 0, crouch = false, slide = false, air = false, pitch = 0 } = state;
    if (this.rainbow) this.mat.color.setHSL((time * 0.15) % 1, 0.85, 0.55);
    const moving = speed > 0.3;
    this.walk += dt * (moving ? 2.2 + speed * 0.9 : 0);
    const swingAmt = moving && !air ? Math.min(1, speed / 6) * 0.8 : 0;
    const s = Math.sin(this.walk);

    let hipY = 0.95, lean = 0;
    let legL = s * swingAmt, legR = -s * swingAmt;
    if (crouch) { hipY = 0.62; legL = legL * 0.5 + 0.9; legR = legR * 0.5 - 0.3; lean = 0.25; }
    if (slide) { hipY = 0.45; legL = -1.3; legR = -1.1; lean = -0.5; }
    if (air && !slide) { legL = 0.5; legR = -0.3; }
    if (!moving && !crouch && !slide && !air) hipY += Math.sin(time * 2) * 0.01;

    const k = Math.min(1, dt * 14);
    this.hips.position.y += (hipY - this.hips.position.y) * k;
    this.torso.rotation.x += (lean - this.torso.rotation.x) * k;
    this.legL.rotation.x += (legL - this.legL.rotation.x) * k;
    this.legR.rotation.x += (legR - this.legR.rotation.x) * k;
    this.head.rotation.x = -pitch * 0.4;

    const def = WEAPONS[this.weaponId];
    const ranged = def && def.type !== 'melee';
    this.swing = Math.max(0, this.swing - dt * 4);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    if (ranged && def.type !== 'mine') {
      // aim: arms point forward along the look direction
      const aim = -Math.PI / 2 - pitch + this.recoil * 0.3;
      this.armR.pivot.rotation.x = aim;
      this.armL.pivot.rotation.x = aim + 0.1;
      this.armL.pivot.rotation.z = -0.35;
      this.armR.pivot.rotation.z = 0;
    } else {
      const sw = this.swing > 0 ? Math.sin((1 - this.swing) * Math.PI) : 0;
      this.armR.pivot.rotation.x = -s * swingAmt * 0.8 - 0.3 - sw * 2.2;
      this.armR.pivot.rotation.z = 0.12;
      this.armL.pivot.rotation.x = s * swingAmt * 0.8;
      this.armL.pivot.rotation.z = -0.12;
    }
    this.back.children.forEach(c => { if (c.userData.cape) c.rotation.x = 0.15 + Math.min(1, speed / 8) * 0.9 + Math.sin(time * 6) * 0.05; });
  }

  dispose() {
    this.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
  }
}
