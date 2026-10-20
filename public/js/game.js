// The 3D game: draws the island, runs your stickman, talks to the server.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as C from '/shared/config.js';
import { generateWorld, movePlayer, rayWorld, rayPlayer, ISLAND_RADIUS } from '/shared/world.js';
import { Stickman, buildWeapon } from './stickman.js';
import { Controls } from './controls.js';

const $ = id => document.getElementById(id);
export const WEAPON_ICONS = {
  woodsword: '🗡️', sword: '⚔️', bat: '🏏', spear: '🔱', axe: '🪓', pistol: '🔫', shotgun: '💥',
  rifle: '🎯', sniper: '🔭', grenade: '💣', rocket: '🚀', mine: '🧨',
};

function noiseTexture(size, base, spread, cracks = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = base + (Math.random() - 0.5) * spread;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (cracks) {
    // stone blocks
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y = (r / rows) * size;
      g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke();
      const off = r % 2 ? size / 4 : 0;
      for (let x = off; x < size + 1; x += size / 2) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + size / rows); g.stroke(); }
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      g.beginPath(); let x = Math.random() * size, y = Math.random() * size; g.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 20; g.lineTo(x, y); }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function nameTag(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 72;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.8, 0.5, 1);
  sprite.position.y = 2.35;
  sprite.renderOrder = 5;
  sprite.userData.draw = hp => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 72);
    g.font = 'bold 28px system-ui, sans-serif';
    g.textAlign = 'center';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(name, 128, 30);
    g.fillStyle = '#fff'; g.fillText(name, 128, 30);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(48, 44, 160, 16);
    g.fillStyle = hp > 35 ? '#45e070' : '#ff5a4a'; g.fillRect(50, 46, 156 * Math.max(0, hp) / 100, 12);
    tex.needsUpdate = true;
  };
  sprite.userData.draw(100);
  return sprite;
}

export class Game {
  constructor(canvas, ui) {
    this.ui = ui; // callbacks: onDead(by), onLeft(), onFull()
    this.canvas = canvas;
    this.world = generateWorld();
    this.mobile = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.controls = new Controls(canvas);
    this.mode = 'menu';
    this.time = 0;

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.6 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
    this.buildEnvironment();
    this.buildRuins();
    this.buildChests();

    this.remotes = new Map();   // id -> remote player
    this.infos = new Map();     // id -> { name, skin }
    this.items = new Map();
    this.projectiles = new Map();
    this.mines = new Map();
    this.effects = [];
    this.me = null;
    this.ws = null;
    this.yaw = 0; this.pitch = 0;
    this.shake = 0;

    // menu preview
    this.preview = null;
    this.previewSpot = new THREE.Vector3(0, 0, -6);

    addEventListener('resize', () => this.resize());
    this.resize();
    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.frame());

    if (!this.controls.touch) $('btnOpen').addEventListener('click', () => this.controls.events.push('open'));
    $('btnBandage').addEventListener('pointerdown', e => { e.preventDefault(); this.controls.events.push('bandage'); });
    $('btnMedkit').addEventListener('pointerdown', e => { e.preventDefault(); this.controls.events.push('medkit'); });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 85 : 70;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ scenery
  buildEnvironment() {
    const s = this.scene;
    const horizon = new THREE.Color('#f3c9a0'), top = new THREE.Color('#4a78c9');
    s.fog = new THREE.Fog(horizon, 90, 420);
    // sky dome
    const skyGeo = new THREE.SphereGeometry(800, 32, 16);
    const cols = [];
    const pos = skyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, pos.getY(i) / 800);
      const col = horizon.clone().lerp(top, Math.pow(t, 0.6));
      cols.push(col.r, col.g, col.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    s.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    const sun = new THREE.Mesh(new THREE.SphereGeometry(22, 16, 16), new THREE.MeshBasicMaterial({ color: '#fff4d6', fog: false }));
    sun.position.set(-400, 260, -500);
    s.add(sun);

    s.add(new THREE.HemisphereLight('#bfd8ff', '#8a6a4a', 1.1));
    const dir = this.sun = new THREE.DirectionalLight('#fff1dc', 2.4);
    dir.position.set(-40, 70, -50);
    dir.castShadow = true;
    const sz = this.mobile ? 1024 : 2048;
    dir.shadow.mapSize.set(sz, sz);
    const sc = dir.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
    dir.shadow.bias = -0.0005;
    dir.shadow.normalBias = 0.03;
    s.add(dir, dir.target);

    // island
    const ground = new THREE.CircleGeometry(ISLAND_RADIUS + 12, 96, 0, Math.PI * 2);
    ground.rotateX(-Math.PI / 2);
    const gp = ground.attributes.position, gc = [];
    const grass = new THREE.Color('#87a85e'), dry = new THREE.Color('#b3a36d'), sand = new THREE.Color('#e6cf98');
    for (let i = 0; i < gp.count; i++) {
      const d = Math.hypot(gp.getX(i), gp.getZ(i));
      const c = d > ISLAND_RADIUS - 8 ? sand : grass.clone().lerp(dry, Math.min(1, d / ISLAND_RADIUS) * 0.8);
      gc.push(c.r, c.g, c.b);
    }
    ground.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    const gtex = noiseTexture(128, 200, 70);
    gtex.repeat.set(80, 80);
    const groundMesh = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ vertexColors: true, map: gtex, roughness: 0.95 }));
    groundMesh.receiveShadow = true;
    s.add(groundMesh);
    // beach ring that slopes into the water
    const beach = new THREE.Mesh(new THREE.RingGeometry(ISLAND_RADIUS + 11, ISLAND_RADIUS + 40, 96, 1), new THREE.MeshStandardMaterial({ color: '#d9bd84', roughness: 1 }));
    beach.rotation.x = -Math.PI / 2; beach.position.y = -0.8;
    s.add(beach);
    this.water = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ color: '#2a8fb8', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.y = -0.35;
    s.add(this.water);

    // grass tufts and beach palms (decoration only)
    const tuftGeo = new THREE.ConeGeometry(0.12, 0.5, 4);
    tuftGeo.translate(0, 0.25, 0);
    const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ color: '#5f8a3a', roughness: 1 }), this.mobile ? 1500 : 4000);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc3 = new THREE.Vector3();
    for (let i = 0; i < tufts.count; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * (ISLAND_RADIUS - 12);
      v.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 3);
      const k = 0.6 + Math.random() * 0.9; sc3.set(k, k, k);
      tufts.setMatrixAt(i, m.compose(v, q, sc3));
    }
    s.add(tufts);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#8a6440', roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#3f8f3a', roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + Math.random() * 0.1, d = ISLAND_RADIUS + 2 + Math.random() * 7;
      const palm = new THREE.Group();
      const h = 6 + Math.random() * 4;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 7), trunkMat);
      trunk.position.y = h / 2; trunk.castShadow = true;
      palm.add(trunk);
      for (let k = 0; k < 6; k++) {
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.4), leafMat);
        leaf.geometry.translate(0, 1.7, 0);
        leaf.position.y = h;
        leaf.rotation.set(1.1, (k / 6) * Math.PI * 2, 0, 'YXZ');
        palm.add(leaf);
      }
      palm.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      palm.rotation.z = (Math.random() - 0.5) * 0.3;
      s.add(palm);
    }
  }

  buildRuins() {
    const tex = noiseTexture(128, 175, 50, true);
    const tint = { wall: '#c9b9a0', tower: '#b8a68c', pillar: '#ddd2bd', rubble: '#a59a8a', stone: '#c0b4a0' };
    const geos = [];
    for (const b of this.world.boxes) {
      const g = new THREE.BoxGeometry(b.w, b.h, b.d);
      const uv = g.attributes.uv;
      const dims = [[b.d, b.h], [b.d, b.h], [b.w, b.d], [b.w, b.d], [b.w, b.h], [b.w, b.h]];
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, uv.getX(i) * dims[f][0] / 2.5, uv.getY(i) * dims[f][1] / 2.5);
      }
      g.translate(b.x, b.y + b.h / 2, b.z);
      const c = new THREE.Color(tint[b.kind] || tint.stone).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
      const cols = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < cols.length; i += 3) { cols[i] = c.r; cols[i + 1] = c.g; cols[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geos.push(g);
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.9 }));
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    // moss on the tops of tall walls
    const mossGeos = [];
    for (const b of this.world.boxes) {
      if (b.h < 2.5 || Math.random() < 0.5) continue;
      const g = new THREE.BoxGeometry(b.w + 0.06, 0.12, b.d + 0.06);
      g.translate(b.x, b.y + b.h + 0.02, b.z);
      mossGeos.push(g);
    }
    if (mossGeos.length) this.scene.add(new THREE.Mesh(mergeGeometries(mossGeos), new THREE.MeshStandardMaterial({ color: '#5e8c3c', roughness: 1 })));
  }

  makeChestMesh(golden) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial(golden ? { color: '#ffc531', metalness: 0.9, roughness: 0.25, emissive: '#5a3c00' } : { color: '#9b6331', roughness: 0.8 });
    const band = new THREE.MeshStandardMaterial(golden ? { color: '#fff1a8', metalness: 1, roughness: 0.2 } : { color: '#3a3a42', metalness: 0.6, roughness: 0.4 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.75), wood);
    base.position.y = 0.275; base.castShadow = true;
    g.add(base);
    for (const x of [-0.4, 0.4]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.57, 0.77), band);
      b.position.set(x, 0.275, 0); g.add(b);
    }
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.55, -0.375);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.375, 0.375, 1.1, 14, 1, false, 0, Math.PI), wood);
    lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2;
    lid.position.z = 0.375; lid.castShadow = true;
    lidPivot.add(lid);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.06), band);
    lock.position.set(0, 0, 0.76);
    lidPivot.add(lock);
    g.add(lidPivot);
    g.userData.lid = lidPivot;
    return g;
  }

  buildChests() {
    this.chestMeshes = this.world.chests.map(c => {
      const m = this.makeChestMesh(false);
      m.position.set(c.x, 0, c.z);
      m.rotation.y = Math.atan2(-c.x, -c.z); // face the island center
      m.userData.open = false;
      this.scene.add(m);
      return m;
    });
    this.goldenMesh = this.makeChestMesh(true);
    this.goldenMesh.scale.setScalar(1.35);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 140, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 70;
    this.goldenMesh.add(beam);
    this.goldenLight = new THREE.PointLight('#ffcc44', 25, 14);
    this.goldenLight.position.y = 1.5;
    this.goldenMesh.add(this.goldenLight);
    this.goldenMesh.visible = false;
    this.scene.add(this.goldenMesh);
    this.golden = null;
  }

  setChestOpen(id, open) {
    const m = this.chestMeshes[id];
    if (m) m.userData.open = open;
  }

  // ------------------------------------------------------------ menu preview
  showPreview(skin) {
    if (this.preview) { this.scene.remove(this.preview.root); this.preview.dispose(); }
    this.preview = new Stickman(skin);
    this.preview.setWeapon('sword');
    this.preview.root.position.copy(this.previewSpot);
    this.scene.add(this.preview.root);
  }

  // ------------------------------------------------------------ network
  connect(token) {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === 1) return resolve();
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/?token=${encodeURIComponent(token)}`);
      ws.onopen = () => { this.ws = ws; resolve(); };
      ws.onerror = () => reject(new Error('Could not connect to the server'));
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        if (this.mode === 'play') { this.endPlay(); this.ui.onLeft('Lost connection to the server'); }
      };
      ws.onmessage = e => this.onMessage(JSON.parse(e.data));
    });
  }

  send(msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }

  join() { this.send({ t: 'join' }); }

  leave() { this.send({ t: 'leave' }); this.endPlay(); }

  onMessage(m) {
    switch (m.t) {
      case 'welcome': return this.startPlay(m);
      case 'full': return this.ui.onFull();
      case 'snap': return this.onSnap(m);
      case 'inv': return this.onInventory(m);
      case 'pjoin': this.infos.set(m.id, { name: m.name, skin: m.skin }); return;
      case 'pleave': this.removeRemote(m.id); this.infos.delete(m.id); return;
      case 'pos': if (this.me) { this.me.x = m.x; this.me.y = m.y; this.me.z = m.z; } return;
      case 'coins': this.coins = m.total; $('hudCoins').textContent = m.total; this.toast(`+${m.amount} coins`); return;
      case 'chest': return this.setChestOpen(m.id, m.open);
      case 'golden': return this.onGolden(m);
      case 'item+': return this.addItem(m);
      case 'item-': return this.removeItem(m.id);
      case 'shot': return this.onShot(m);
      case 'swing': { const r = this.remotes.get(m.id); if (r) r.sm.swing = 1; return; }
      case 'proj': return this.addProjectile(m);
      case 'proj-': { const p = this.projectiles.get(m.id); if (p) { this.scene.remove(p.mesh); this.projectiles.delete(m.id); } return; }
      case 'boom': return this.explosion(m.x, m.y, m.z, m.r);
      case 'mine+': return this.addMine(m);
      case 'mine-': { const x = this.mines.get(m.id); if (x) { this.scene.remove(x); this.mines.delete(m.id); } return; }
      case 'hitmark': return this.hitmark(m.dead);
      case 'hurt': return this.onHurt(m);
      case 'ko': return this.onKO(m);
      case 'dead': this.endPlay(); return this.ui.onDead(m.by, m.weapon);
      case 'left': return;
    }
  }

  startPlay(m) {
    this.clearArena();
    this.myId = m.id;
    for (const p of m.players) this.infos.set(p.id, { name: p.name, skin: p.skin });
    const info = this.infos.get(m.id);
    const sm = new Stickman(info.skin);
    this.scene.add(sm.root);
    this.me = { x: m.x, y: 0, z: m.z, vy: 0, onGround: true, crouch: false, slide: 0, slideDir: [0, 0], kx: 0, kz: 0, sm, speed: 0, hp: C.MAX_HP };
    this.yaw = Math.atan2(-m.x, -m.z); this.pitch = -0.1;
    this.chestMeshes.forEach(c => (c.userData.open = false));
    for (const id of m.chests) this.setChestOpen(id, true);
    this.onGolden({ golden: m.golden, quiet: true });
    for (const it of m.items) this.addItem(it);
    for (const mi of m.mines) this.addMine(mi);
    if (this.preview) this.preview.root.visible = false;
    this.mode = 'play';
    this.lastSend = 0; this.lastFire = 0;
    this.controls.enabled = true;
    $('hud').classList.remove('hidden');
    this.ui.onPlaying();
  }

  endPlay() {
    if (this.mode !== 'play') return;
    this.mode = 'menu';
    this.controls.enabled = false;
    this.controls.reset();
    if (this.me) { this.scene.remove(this.me.sm.root); this.me.sm.dispose(); this.me = null; }
    this.clearArena();
    $('hud').classList.add('hidden');
    $('btnOpen').classList.add('hidden');
    if (this.preview) this.preview.root.visible = true;
  }

  clearArena() {
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    for (const it of this.items.values()) this.scene.remove(it.mesh);
    for (const p of this.projectiles.values()) this.scene.remove(p.mesh);
    for (const x of this.mines.values()) this.scene.remove(x);
    this.items.clear(); this.projectiles.clear(); this.mines.clear();
    this.goldenMesh.visible = false; this.golden = null;
    $('compass').classList.add('hidden');
  }

  onSnap(m) {
    $('hudPlayers').textContent = m.n;
    const seen = new Set();
    for (const [id, x, y, z, ry, pitch, flags, weapon, hp, prot] of m.p) {
      if (id === this.myId) { if (this.me) this.setHp(hp); continue; }
      seen.add(id);
      let r = this.remotes.get(id);
      if (!r) {
        const info = this.infos.get(id);
        if (!info) continue;
        const sm = new Stickman(info.skin);
        const tag = nameTag(info.name);
        sm.root.add(tag);
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), new THREE.MeshBasicMaterial({ color: '#7fd7ff', transparent: true, opacity: 0.18, depthWrite: false }));
        bubble.position.y = 0.95;
        sm.root.add(bubble);
        sm.root.position.set(x, y, z);
        this.scene.add(sm.root);
        r = { sm, tag, bubble, hp: -1, tx: x, ty: y, tz: z, try: ry, pitch, flags, lastX: x, lastZ: z, speed: 0 };
        this.remotes.set(id, r);
      }
      r.tx = x; r.ty = y; r.tz = z; r.try = ry; r.pitch = pitch; r.flags = flags;
      r.bubble.visible = !!prot;
      r.sm.setWeapon(weapon);
      if (hp !== r.hp) { r.hp = hp; r.tag.userData.draw(hp); }
    }
    for (const id of [...this.remotes.keys()]) if (!seen.has(id)) this.removeRemote(id);
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.sm.root);
    r.sm.dispose();
    this.remotes.delete(id);
  }

  onInventory(m) {
    this.inv = m;
    this.coins = m.coins;
    $('hudCoins').textContent = m.coins;
    $('bandageCount').textContent = m.bandages;
    $('medkitCount').textContent = m.medkits;
    this.setHp(m.hp);
    if (this.me) this.me.sm.setWeapon(m.weapons[m.slot]);
    const slots = $('slots');
    slots.innerHTML = '';
    m.weapons.forEach((w, i) => {
      const b = document.createElement('button');
      b.className = `slot ${i === m.slot ? 'active' : ''} ${C.WEAPONS[w].rarity}`;
      b.innerHTML = `${WEAPON_ICONS[w]}<small>${C.WEAPONS[w].name}</small>`;
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.send({ t: 'slot', i }); });
      slots.appendChild(b);
    });
    if (m.picked) this.toast(`Picked up ${m.picked}`);
  }

  setHp(hp) {
    if (this.me) this.me.hp = hp;
    $('hpFill').style.width = hp + '%';
    $('hpFill').classList.toggle('low', hp <= 35);
    $('hpText').textContent = hp;
  }

  onHurt(m) {
    this.setHp(m.hp);
    if (this.me) { this.me.kx += m.kx || 0; this.me.kz += m.kz || 0; }
    this.shake = Math.max(this.shake, 0.25);
  }

  onKO(m) {
    this.removeRemote(m.id);
    this.puff(m.x, m.y + 1, m.z);
    const feed = $('feed');
    const d = document.createElement('div');
    const w = C.WEAPONS[m.weapon];
    d.innerHTML = m.by ? `<b>${esc(m.by)}</b> ${WEAPON_ICONS[m.weapon] || ''} knocked out <b>${esc(m.victim)}</b>` : `<b>${esc(m.victim)}</b> was knocked out`;
    d.title = w ? w.name : '';
    feed.prepend(d);
    while (feed.children.length > 5) feed.lastChild.remove();
  }

  onGolden(m) {
    this.golden = m.golden;
    this.goldenMesh.visible = !!m.golden;
    if (m.golden) {
      this.goldenMesh.position.set(m.golden.x, 0, m.golden.z);
      if (!m.quiet) this.banner('★ A GOLDEN CHEST appeared! Follow the light! ★');
    } else if (m.by) {
      this.banner(`${m.by} opened the golden chest!`);
    }
    $('compass').classList.toggle('hidden', !m.golden);
  }

  addItem(it) {
    const g = new THREE.Group();
    let color = '#ffffff';
    if (it.kind === 'weapon') {
      const w = buildWeapon(it.weapon);
      const def = C.WEAPONS[it.weapon];
      if (def.type !== 'melee') w.rotation.x = Math.PI / 2; // lay guns flat-ish
      w.scale.setScalar(1.3);
      g.add(w);
      color = { common: '#d6dde8', rare: '#3c8cff', legendary: '#ffc531' }[def.rarity];
    } else {
      const med = it.kind === 'medkit';
      const box = new THREE.Mesh(new THREE.BoxGeometry(med ? 0.5 : 0.4, med ? 0.35 : 0.15, med ? 0.35 : 0.25), new THREE.MeshStandardMaterial({ color: med ? '#e23b3b' : '#f4efe6' }));
      g.add(box);
      const crossMat = new THREE.MeshBasicMaterial({ color: med ? '#fff' : '#ff7aa0' });
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.05), crossMat); c1.position.y = (med ? 0.175 : 0.075) + 0.01;
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.16), crossMat); c2.position.y = c1.position.y;
      g.add(c1, c2);
      color = '#66f08c';
    }
    const holder = new THREE.Group();
    holder.add(g);
    g.position.y = 0.7;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    holder.add(ring);
    holder.position.set(it.x, it.y, it.z);
    this.scene.add(holder);
    this.items.set(it.id, { ...it, mesh: holder, spin: g });
  }

  removeItem(id) {
    const it = this.items.get(id);
    if (!it) return;
    this.scene.remove(it.mesh);
    this.items.delete(id);
  }

  addProjectile(m) {
    let mesh;
    if (m.kind === 'rocket') {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), new THREE.MeshStandardMaterial({ color: '#ddd' }));
      body.rotation.x = Math.PI / 2;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 8), new THREE.MeshBasicMaterial({ color: '#ffa830' }));
      flame.rotation.x = -Math.PI / 2; flame.position.z = -0.5;
      mesh.add(body, flame);
    } else {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: '#4b6b2f' }));
    }
    mesh.position.set(m.x, m.y, m.z);
    this.scene.add(mesh);
    this.projectiles.set(m.id, { ...m, mesh });
  }

  addMine(m) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.1, 16), new THREE.MeshStandardMaterial({ color: '#4a4f45', metalness: 0.5 }));
    body.position.y = 0.05;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff3030' }));
    light.position.y = 0.12;
    g.add(body, light);
    g.userData.light = light;
    g.position.set(m.x, m.y, m.z);
    this.scene.add(g);
    this.mines.set(m.id, g);
  }

  // ------------------------------------------------------------ effects
  onShot(m) {
    const from = new THREE.Vector3(...m.from);
    if (m.id === this.myId && this.me) this.me.sm.recoil = 1;
    else { const r = this.remotes.get(m.id); if (r) { r.sm.recoil = 1; from.set(r.sm.root.position.x, from.y, r.sm.root.position.z); } }
    const color = m.w === 'sniper' ? '#9ff' : '#ffe9a0';
    for (const to of m.to) {
      const end = new THREE.Vector3(...to);
      const geo = new THREE.BufferGeometry().setFromPoints([from, end]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      this.scene.add(line);
      this.effects.push({ obj: line, life: 0.12, max: 0.12, fade: true });
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff6c0', transparent: true }));
      spark.position.copy(end);
      this.scene.add(spark);
      this.effects.push({ obj: spark, life: 0.2, max: 0.2, fade: true, grow: 2 });
    }
  }

  explosion(x, y, z, radius) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffb340', transparent: true, opacity: 0.9 }));
    ball.position.set(x, y, z);
    this.scene.add(ball);
    this.effects.push({ obj: ball, life: 0.45, max: 0.45, fade: true, grow: radius * 2.2 });
    const light = new THREE.PointLight('#ffaa44', 60, radius * 4);
    light.position.set(x, y + 1, z);
    this.scene.add(light);
    this.effects.push({ obj: light, life: 0.3, max: 0.3, light: 60 });
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.6, 8, 6), new THREE.MeshStandardMaterial({ color: '#6d6763', transparent: true, opacity: 0.7 }));
      s.position.set(x + (Math.random() - 0.5) * radius, y + Math.random() * 1.5, z + (Math.random() - 0.5) * radius);
      this.scene.add(s);
      this.effects.push({ obj: s, life: 1.2, max: 1.2, fade: true, grow: 2.5, rise: 1.5 });
    }
    if (this.me) {
      const d = Math.hypot(this.me.x - x, this.me.z - z);
      if (d < 30) this.shake = Math.max(this.shake, 0.6 * (1 - d / 30));
    }
  }

  puff(x, y, z) {
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 8, 6), new THREE.MeshBasicMaterial({ color: i % 3 ? '#ffffff' : '#ffe27a', transparent: true }));
      s.position.set(x + (Math.random() - 0.5), y + (Math.random() - 0.5) * 1.5, z + (Math.random() - 0.5));
      this.scene.add(s);
      this.effects.push({ obj: s, life: 0.8, max: 0.8, fade: true, grow: 2, rise: 2, drift: [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3] });
    }
  }

  hitmark(ko) {
    const h = $('hitmark');
    h.classList.toggle('ko', !!ko);
    h.classList.add('show');
    clearTimeout(this.hmTimer);
    this.hmTimer = setTimeout(() => h.classList.remove('show'), 90);
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
  }

  banner(text) {
    const b = $('banner');
    b.textContent = text;
    b.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.add('hidden'), 5000);
  }

  // ------------------------------------------------------------ main loop
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    if (this.mode === 'play' && this.me) this.updatePlay(dt);
    else this.updateMenu(dt);
    this.updateWorld(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateMenu(dt) {
    const t = this.time * 0.12;
    const c = this.previewSpot;
    this.camera.position.set(c.x + Math.sin(t) * 5.5, 2.4, c.z + Math.cos(t) * 5.5);
    this.camera.lookAt(c.x, 1.2, c.z);
    if (this.preview) {
      this.preview.root.rotation.y = t + Math.PI * 0.15;
      this.preview.animate(dt, {}, this.time);
    }
    this.sun.target.position.copy(c);
    this.sun.position.set(c.x - 40, 70, c.z - 50);
  }

  updatePlay(dt) {
    const me = this.me;
    const ctl = this.controls;
    const { ev, look } = ctl.take();

    // look
    this.yaw -= look.x;
    this.pitch = Math.max(-1.2, Math.min(1.1, this.pitch - look.y));

    for (const e of ev) {
      if (e === 'jump' && me.onGround) { me.vy = C.JUMP_SPEED; me.crouch = false; me.slide = 0; }
      if (e === 'crouch') {
        if (me.speed > C.WALK_SPEED * 0.9 && me.onGround && !me.crouch) {
          me.slide = C.SLIDE_TIME; me.crouch = true;
          me.slideDir = [Math.sin(me.moveYaw), Math.cos(me.moveYaw)];
        } else me.crouch = !me.crouch;
      }
      if (e === 'open' && this.nearChest != null) this.send({ t: 'open', id: this.nearChest });
      if (e === 'bandage' || e === 'medkit') this.send({ t: 'heal', kind: e });
      if (e.startsWith('slot:') && this.inv) {
        const n = this.inv.weapons.length;
        const arg = e.slice(5);
        const i = arg === '+' ? (this.inv.slot + 1) % n : arg === '-' ? (this.inv.slot + n - 1) % n : Number(arg);
        if (i < n) this.send({ t: 'slot', i });
      }
    }

    // movement
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    const mx = ctl.move.x, my = ctl.move.y;
    const mag = Math.min(1, Math.hypot(mx, my));
    let dx = 0, dz = 0, speed = 0;
    if (me.slide > 0) {
      me.slide -= dt;
      speed = C.CROUCH_SPEED + (C.SLIDE_SPEED - C.CROUCH_SPEED) * Math.max(0, me.slide / C.SLIDE_TIME);
      dx = me.slideDir[0] * speed * dt; dz = me.slideDir[1] * speed * dt;
    } else if (mag > 0.05) {
      const wx = fx * my + rx * mx, wz = fz * my + rz * mx;
      const len = Math.hypot(wx, wz) || 1;
      speed = me.crouch ? C.CROUCH_SPEED * mag : mag > 0.85 ? C.RUN_SPEED : C.WALK_SPEED * (mag / 0.85);
      dx = (wx / len) * speed * dt; dz = (wz / len) * speed * dt;
      me.moveYaw = Math.atan2(wx, wz);
    }
    // knockback
    dx += me.kx * dt; dz += me.kz * dt;
    me.kx *= Math.max(0, 1 - dt * 6); me.kz *= Math.max(0, 1 - dt * 6);
    me.speed = speed;
    const height = me.crouch ? C.CROUCH_HEIGHT : C.PLAYER_HEIGHT;
    movePlayer(this.world, me, dx, dz, dt, height);

    // body faces where the camera looks (like Fortnite)
    me.sm.root.position.set(me.x, me.y, me.z);
    me.sm.root.rotation.y = me.slide > 0 ? Math.atan2(me.slideDir[0], me.slideDir[1]) : this.yaw;
    me.sm.animate(dt, { speed, crouch: me.crouch && me.slide <= 0, slide: me.slide > 0, air: !me.onGround, pitch: this.pitch }, this.time);

    // camera: over the right shoulder, pulled in if a wall is in the way
    const eyeY = me.y + (me.crouch ? 1.25 : 1.7);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dirX = fx * cp, dirY = sp, dirZ = fz * cp;
    const pivotX = me.x + rx * 0.75, pivotZ = me.z + rz * 0.75;
    let dist = 3.6;
    const hit = rayWorld(this.world, pivotX, eyeY, pivotZ, -dirX, -dirY, -dirZ, dist + 0.3);
    dist = Math.max(0.6, Math.min(dist, hit - 0.3));
    const shake = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.4 : 0;
    this.shake = Math.max(0, this.shake - dt * 2);
    this.camera.position.set(pivotX - dirX * dist + shake, Math.max(0.3, eyeY - dirY * dist) + shake, pivotZ - dirZ * dist);
    this.camera.lookAt(pivotX + dirX * 10, eyeY + dirY * 10, pivotZ + dirZ * 10);

    // shooting
    const w = this.inv && this.inv.weapons[this.inv.slot];
    const def = C.WEAPONS[w];
    const now = performance.now();
    if (ctl.fire && def && now - this.lastFire >= def.rate * 1000) {
      this.lastFire = now;
      const cam = this.camera.position;
      const range = def.type === 'gun' ? def.range : 60;
      // what is under the crosshair?
      let t = rayWorld(this.world, cam.x, cam.y, cam.z, dirX, dirY, dirZ, range + dist);
      for (const r of this.remotes.values()) {
        const p = r.sm.root.position;
        const tt = rayPlayer(cam.x, cam.y, cam.z, dirX, dirY, dirZ, p.x, p.y, p.z, (r.flags & 1) ? C.CROUCH_HEIGHT : C.PLAYER_HEIGHT);
        if (tt < t) t = tt;
      }
      const tx = cam.x + dirX * t, ty = cam.y + dirY * t, tz = cam.z + dirZ * t;
      const oy = me.y + height - 0.3;
      let ax = tx - me.x, ay = ty - oy, az = tz - me.z;
      if (def.type === 'melee' || def.type === 'mine') { ax = dirX; ay = dirY; az = dirZ; }
      const len = Math.hypot(ax, ay, az) || 1;
      this.send({ t: 'fire', d: [ax / len, ay / len, az / len] });
      if (def.type === 'melee') me.sm.swing = 1;
    }

    // nearby chest?
    let near = null, best = 2.8;
    if (this.golden && Math.hypot(this.golden.x - me.x, this.golden.z - me.z) < 3) near = 'golden';
    else this.world.chests.forEach((c, i) => {
      if (this.chestMeshes[i].userData.open) return;
      const d = Math.hypot(c.x - me.x, c.z - me.z);
      if (d < best) { best = d; near = i; }
    });
    this.nearChest = near;
    const ob = $('btnOpen');
    ob.classList.toggle('hidden', near == null);
    ob.textContent = this.controls.touch ? 'OPEN' : 'OPEN (E)';

    // golden chest pointer
    if (this.golden) {
      const gx = this.golden.x - me.x, gz = this.golden.z - me.z;
      let ang = Math.atan2(gx, gz) - this.yaw;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      const c = $('compass');
      c.style.left = `${50 - Math.max(-1, Math.min(1, ang / 1.2)) * 40}%`;
      $('compassDist').textContent = `${Math.round(Math.hypot(gx, gz))} m`;
    }

    // send position 20 times a second
    if (now - this.lastSend > 50) {
      this.lastSend = now;
      const f = (me.crouch ? 1 : 0) | (me.slide > 0 ? 2 : 0) | (speed > 0.3 ? 4 : 0) | (!me.onGround ? 8 : 0);
      this.send({ t: 'state', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), ry: +me.sm.root.rotation.y.toFixed(3), pitch: +this.pitch.toFixed(2), f });
    }

    this.sun.target.position.set(me.x, 0, me.z);
    this.sun.position.set(me.x - 40, 70, me.z - 50);
  }

  updateWorld(dt) {
    const t = this.time;
    // remote players glide toward their latest position
    const k = 1 - Math.exp(-dt * 14);
    for (const r of this.remotes.values()) {
      const p = r.sm.root.position;
      const ox = p.x, oz = p.z;
      p.x += (r.tx - p.x) * k; p.y += (r.ty - p.y) * k; p.z += (r.tz - p.z) * k;
      let d = r.try - r.sm.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      r.sm.root.rotation.y += d * k;
      const sp = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 1e-3);
      r.speed += (sp - r.speed) * Math.min(1, dt * 8);
      r.sm.animate(dt, { speed: r.speed, crouch: !!(r.flags & 1) && !(r.flags & 2), slide: !!(r.flags & 2), air: !!(r.flags & 8), pitch: r.pitch }, t);
    }
    // chest lids
    for (const m of this.chestMeshes) {
      const target = m.userData.open ? -1.9 : 0;
      m.userData.lid.rotation.x += (target - m.userData.lid.rotation.x) * Math.min(1, dt * 8);
    }
    if (this.goldenMesh.visible) {
      this.goldenMesh.rotation.y = t * 0.6;
      this.goldenLight.intensity = 20 + Math.sin(t * 4) * 8;
    }
    // items bob and spin
    for (const it of this.items.values()) {
      it.spin.rotation.y = t * 1.8;
      it.spin.position.y = 0.7 + Math.sin(t * 3 + it.id) * 0.1;
    }
    // projectiles (visual copy of the server simulation)
    for (const p of this.projectiles.values()) {
      if (p.kind === 'grenade') p.vy -= C.GRAVITY * dt;
      const nx = p.mesh.position.x + p.vx * dt, ny = p.mesh.position.y + p.vy * dt, nz = p.mesh.position.z + p.vz * dt;
      if (p.kind === 'grenade' && ny < 0.13) { p.vy = Math.abs(p.vy) * 0.35; p.vx *= 0.6; p.vz *= 0.6; p.mesh.position.set(nx, 0.13, nz); }
      else p.mesh.position.set(nx, ny, nz);
      if (p.kind === 'rocket') p.mesh.lookAt(nx + p.vx, ny + p.vy, nz + p.vz);
    }
    for (const m of this.mines.values()) m.userData.light.visible = Math.sin(t * 6) > 0;
    // effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      const f = Math.max(0, e.life / e.max);
      if (e.fade && e.obj.material) e.obj.material.opacity = f * (e.obj.material.userData.o0 ??= e.obj.material.opacity);
      if (e.grow) e.obj.scale.setScalar(1 + (1 - f) * e.grow);
      if (e.rise) e.obj.position.y += e.rise * dt;
      if (e.drift) { e.obj.position.x += e.drift[0] * dt; e.obj.position.z += e.drift[1] * dt; }
      if (e.light) e.obj.intensity = e.light * f;
      if (e.life <= 0) {
        this.scene.remove(e.obj);
        e.obj.geometry?.dispose();
        e.obj.material?.dispose();
        this.effects.splice(i, 1);
      }
    }
    this.water.position.y = -0.35 + Math.sin(t * 0.8) * 0.05;
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
