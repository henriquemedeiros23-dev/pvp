// 3D outfit models (hats, face items, back items, shirts). Unknown or 'none' ids add nothing.
import * as THREE from 'three';
import { std } from './materials.js';

/** Outfit ids that have a model, per slot. */
export const OUTFIT_MODELS = Object.freeze({
  hat: Object.freeze(['horns', 'cap', 'tophat', 'wizard', 'crown']),
  face: Object.freeze(['shades', 'ninja', 'hero']),
  back: Object.freeze(['redcape', 'bluecape', 'backpack']),
  shirt: Object.freeze(['tshirt', 'vest', 'armor']),
});

/**
 * Add the model for one outfit slot to the body parts.
 * parts: { head, torso, back } groups. Capes get userData.cape = true so they can flutter.
 */
export function buildOutfit(slot, id, { head, torso, back }, castShadow = true) {
  const add = (parent, mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = castShadow; parent.add(mesh); return mesh; };
  if (slot === 'hat') {
    if (id === 'horns') {
      // Two curved red horns: a cone base plus a thinner, darker tip bent inwards. 3 cheap meshes each.
      const red = std('#e01b1b', { roughness: 0.4 });
      const tip = std('#7a0a0a', { roughness: 0.4 });
      for (const side of [-1, 1]) {
        const base = add(head, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.12, 8), red), side * 0.13, 0.19, 0.03);
        base.rotation.z = -side * 0.55;
        const mid = add(head, new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.031, 0.09, 8), red), side * 0.18, 0.27, 0.03);
        mid.rotation.z = -side * 0.15;
        const end = add(head, new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.08, 8), tip), side * 0.175, 0.345, 0.03);
        end.rotation.z = side * 0.35;
      }
    }
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
      const m = std('#ffcb2e', { metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide });
      add(head, new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16, 1, true), m), 0, 0.2, 0);
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
      const m = std(id === 'ninja' ? '#d42020' : '#1f3fbf');
      const band = add(head, new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.04, 8, 24), m), 0, id === 'ninja' ? 0.1 : 0.03, 0);
      band.rotation.x = Math.PI / 2;
      if (id === 'ninja') {
        const t1 = add(head, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.25, 0.02), m), 0.04, -0.02, -0.25); t1.rotation.z = 0.3;
        const t2 = add(head, new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.02), m), -0.04, -0.02, -0.25); t2.rotation.z = -0.3;
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
    const m = std(color, id === 'armor' ? { metalness: 0.8, roughness: 0.3 } : {});
    add(torso, new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.42, 14), m), 0, 0.22, 0);
    if (id === 'armor' || id === 'tshirt') {
      for (const s of [-1, 1]) add(torso, new THREE.Mesh(new THREE.SphereGeometry(id === 'armor' ? 0.11 : 0.09, 10, 8), m), s * 0.17, 0.4, 0);
    }
    if (id === 'vest') add(torso, new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), std('#222')), 0, 0.22, 0.16);
  }
}
