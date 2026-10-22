// The 3D game: draws the island, runs your stickman, talks to the server.
// Glue only: the rules, island, movement, stickman, controls and messages all come from packages.
import * as THREE from 'three';
import * as C from '@pvp/game-rules';
import { generateIsland } from '@pvp/world-gen';
import { movePlayer, rayBoxes, rayCylinder } from '@pvp/collision';
import { Stickman, buildWeapon, buildPotion, holdPotion } from '@pvp/stickman-3d';
import { createIslandScene } from '@pvp/island-scene';
import { createInputState, attachTouchControls, attachDesktopControls, isTouchDevice } from '@pvp/touch-controls';
import { decodeServerMessage, encodeClient, unpackSnapshotPlayer, makeFlags, readFlags } from '@pvp/net-protocol';
import { slotBar, heldDurabilityView, healthView, pickSlot, brokeMessage, shieldView, WEAPON_ICONS } from '@pvp/hud-model';
import { potionView, drinkState, drinkMessage, POTION_ICON_SVG } from '@pvp/hud-model';
import { chargeView } from '@pvp/hud-model';
import { DamageNumbers } from './damage-numbers.js';

const $ = id => document.getElementById(id);
const JOIN_TIMEOUT_MS = 8000;  // give up joining if 'welcome' does not come
const LEAVE_TIMEOUT_MS = 3000; // stop waiting for the server's 'left'
const MENU_PREVIEW_SHIFT_X = 0.27; // menu stickman this part of the screen right of the middle (landscape)
const MENU_PREVIEW_SHIFT_Y = 0.2;  // ... or below the middle (portrait)

const HIT_RADIUS = C.PLAYER_RADIUS + 0.1; // a bit wider than the body, like the server
const v3 = (x, y, z) => ({ x, y, z });

// Distance along a unit ray to the first wall or the ground, at most maxDist.
function rayWorld(world, ox, oy, oz, dx, dy, dz, maxDist) {
  return Math.min(maxDist, rayBoxes(world.grid, v3(ox, oy, oz), v3(dx, dy, dz), maxDist)); // rayBoxes gives Infinity on a miss
}

// Distance along a unit ray to a standing player, or Infinity.
function rayPlayer(ox, oy, oz, dx, dy, dz, px, py, pz, height) {
  return rayCylinder(v3(ox, oy, oz), v3(dx, dy, dz), { x: px, y: py, z: pz, height, radius: HIT_RADIUS });
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
  constructor(canvas, ui, { openSocket } = {}) {
    this.ui = ui; // callbacks: onPlaying(), onDead(by, weapon), onLeft(reason), onFull()
    // token -> a WebSocket (or a WebSocket-like object, e.g. practice mode's @pvp/local-server)
    this.openSocket = openSocket || (token => new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/?token=${encodeURIComponent(token)}`));
    this.canvas = canvas;
    this.world = generateIsland(); // same seed as the server: the same island
    this.moveOpts = {
      radius: C.PLAYER_RADIUS, height: C.PLAYER_HEIGHT, stepHeight: C.STEP_HEIGHT,
      gravity: C.GRAVITY, boundsRadius: this.world.playRadius,
    };
    this.mobile = isTouchDevice(window);
    this.setupControls(canvas);
    this.buildSlots();
    $('potionIcon').innerHTML = POTION_ICON_SVG; // the flask from the boss's drawing (@pvp/hud-model)
    $('drinkIcon').innerHTML = POTION_ICON_SVG;
    this.drink = null; // the potion drinking in progress: { startedAt, ms } (from the server's 'drink' messages)
    this.dmgNums = new DamageNumbers($('dmgNums')); // "-15" above heads (#33)
    this.lastFire = -Infinity; // when I last shot or swung (performance.now()), for "Charging 1.4s" (#35)
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
    // the scenery: sky, sun, ground, water, palms, ruins, chests (@pvp/island-scene)
    this.island = createIslandScene({ island: this.world, mobile: this.mobile }).addTo(this.scene);
    this.chests = this.island.chests;
    this.golden = null;

    this.remotes = new Map();   // id -> remote player
    this.infos = new Map();     // id -> { name, skin }
    this.items = new Map();
    this.effects = [];
    this.shieldUp = false; // my shield is raised (Shift / the shield button)
    this.frozen = false;   // I am frozen (Ice Sword): no moving, turning, shooting or switching
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
  }

  // Joystick + buttons on phones, keyboard + mouse on computers (@pvp/touch-controls).
  setupControls(canvas) {
    const touch = this.mobile;
    document.body.classList.toggle('desktop', !touch);
    $('keysHelp').classList.toggle('hidden', touch);
    this.input = createInputState({ enabled: false }); // switched on while playing
    if (touch) {
      attachTouchControls(this.input, {
        canvas, stick: $('stick'), knob: $('knob'),
        buttons: {
          fire: $('btnFire'), jump: $('btnJump'), crouch: $('btnCrouch'), open: $('btnOpen'),
          potion: $('btnPotion'), shield: $('btnShield'),
        },
      });
    } else {
      attachDesktopControls(this.input, { canvas, target: window });
      const tap = name => { this.input.button(name, true); this.input.button(name, false); };
      $('btnOpen').addEventListener('click', () => tap('open'));
      $('btnPotion').addEventListener('pointerdown', e => { e.preventDefault(); tap('potion'); });
    }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 85 : 70;
    this.frameMenu();
  }

  // In the menu the stickman stands next to the buttons, not behind them: the picture is shifted so
  // it shows on the right (landscape: buttons on the left) or low (portrait: buttons on top).
  // See the matching #menu layout in style.css.
  frameMenu() {
    const w = innerWidth, h = innerHeight, cam = this.camera;
    if (this.mode === 'play') cam.clearViewOffset();
    else if (w >= h * 1.1) cam.setViewOffset(w, h, -w * MENU_PREVIEW_SHIFT_X, 0, w, h);
    else cam.setViewOffset(w, h, 0, -h * MENU_PREVIEW_SHIFT_Y, w, h);
    cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ menu preview
  showPreview(skin) {
    if (this.preview) { this.scene.remove(this.preview.root); this.preview.dispose(); }
    this.preview = new Stickman(skin);
    this.preview.setWeapon(C.STARTING_WEAPON);
    this.preview.root.position.copy(this.previewSpot);
    this.scene.add(this.preview.root);
  }

  // ------------------------------------------------------------ network
  connect(token) {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === 1) return resolve();
      const ws = this.openSocket(token);
      this.opening = ws; // a socket that is still opening (closed if the join gives up)
      ws.onopen = () => { if (this.opening === ws) this.opening = null; this.ws = ws; resolve(); };
      ws.onerror = () => reject(new Error('Could not connect to the server'));
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        if (this.opening === ws) this.opening = null;
        reject(new Error('Could not connect to the server')); // no effect if it opened before
        this.settleJoin(new Error('Lost connection to the server. Try again!'));
        this.settleLeave();
        if (this.mode === 'play') { this.endPlay(); this.ui.onLeft('Lost connection to the server'); }
      };
      ws.onmessage = e => {
        const r = decodeServerMessage(e.data);
        if (r.ok) this.onMessage(r.msg);
        else console.warn('Ignored a bad server message:', r.error);
      };
    });
  }

  // Build and check a message (@pvp/net-protocol), then send it.
  send(type, fields) {
    if (!this.ws || this.ws.readyState !== 1) return;
    let text;
    try { text = encodeClient(type, fields); } catch (e) { console.warn(e.message); return; }
    this.ws.send(text);
  }

  join() { this.send('join'); }

  /**
   * Connect and join. Resolves 'playing' on 'welcome' or 'full' on a full arena (the ui callbacks
   * run as before). Rejects with a friendly message if the socket fails or nothing comes back in time;
   * the socket is then closed so a late 'welcome' cannot pull you into the arena.
   */
  joinArena(token, timeoutMs = JOIN_TIMEOUT_MS) {
    this.settleJoin(new Error('Join was cancelled'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settleJoin(new Error("The arena didn't answer. Try again in a moment!"));
      }, timeoutMs);
      this.pendingJoin = { resolve, reject, timer };
      this.connect(token).then(
        () => { if (this.pendingJoin) this.join(); },
        e => this.settleJoin(e),
      );
    });
  }

  // Finish the pending join: a result string resolves it, an Error rejects it (and closes the socket).
  settleJoin(result) {
    const p = this.pendingJoin;
    if (!p) return;
    this.pendingJoin = null;
    clearTimeout(p.timer);
    if (result instanceof Error) {
      for (const ws of [this.ws, this.opening]) if (ws) ws.close();
      this.ws = this.opening = null;
      p.reject(result);
    } else p.resolve(result);
  }

  /** Leave the arena. Resolves when the server confirms with 'left' (or the socket closes, or after a short wait). */
  leave(timeoutMs = LEAVE_TIMEOUT_MS) {
    this.settleLeave();
    const open = this.ws && this.ws.readyState === 1;
    this.send('leave');
    this.endPlay();
    if (!open) return Promise.resolve();
    return new Promise(resolve => {
      this.pendingLeave = { resolve, timer: setTimeout(() => this.settleLeave(), timeoutMs) };
    });
  }

  settleLeave() {
    const p = this.pendingLeave;
    if (!p) return;
    this.pendingLeave = null;
    clearTimeout(p.timer);
    p.resolve();
  }

  // Small read-only view for tests and debugging.
  debugState() {
    const me = this.me;
    const play = this.mode === 'play';
    const pos = o => ({ x: +o.x.toFixed(2), y: +o.y.toFixed(2), z: +o.z.toFixed(2) });
    return {
      mode: this.mode,
      id: this.myId,
      me: me ? { x: me.x, y: me.y, z: me.z, hp: me.hp, yaw: this.yaw } : null,
      // the other players I can see: id, name and where their stickman is drawn
      others: play ? [...this.remotes].map(([id, r]) => ({ id, name: this.infos.get(id)?.name, ...pos(r.sm.root.position) })) : [],
      // open chests and how far their lid has turned (0 = shut)
      openChests: this.chests.meshes.flatMap((m, id) => (m.userData.open ? [{ id, lid: +m.userData.lid.rotation.x.toFixed(3) }] : [])),
      nearChest: play ? this.nearChest ?? null : null,
      items: [...this.items.values()].map(it => ({ id: it.id, kind: it.kind, weapon: it.weapon, x: it.x, y: it.y, z: it.z })),
      inv: this.inv ? { weapons: [...this.inv.weapons], potions: this.inv.potions, coins: this.inv.coins, shield: this.inv.shield ?? null } : null,
      shieldUp: this.shieldUp,
      frozen: this.frozen,
      // potion drinking: null, or how far it is (0..1) as the HUD shows it
      drinking: this.drink ? potionView(this.inv, { drink: this.drink, now: performance.now() }).progress : null,
      // the "Charging 1.4s" text under the crosshair (#35) and the damage numbers above heads (#33)
      charge: play ? $('charge').classList.contains('hidden') ? '' : $('chargeText').textContent : '',
      damageNumbers: play ? this.dmgNums.shown() : [],
    };
  }

  onMessage(m) {
    switch (m.t) {
      case 'welcome': this.startPlay(m); return this.settleJoin('playing');
      case 'full': this.settleJoin('full'); return this.ui.onFull();
      case 'snap': return this.onSnap(m);
      case 'inv': return this.onInventory(m);
      case 'pjoin': this.infos.set(m.id, { name: m.name, skin: m.skin }); return;
      case 'pleave': this.removeRemote(m.id); this.infos.delete(m.id); return;
      case 'pos': if (this.me) { this.me.x = m.x; this.me.y = m.y; this.me.z = m.z; } return;
      case 'coins': this.coins = m.total; $('hudCoins').textContent = m.total; this.toast(`+${m.amount} coins`); return;
      case 'chest': return this.chests.setOpen(m.id, m.open);
      case 'golden': return this.onGolden(m);
      case 'item+': return this.addItem(m);
      case 'item-': return this.removeItem(m.id);
      case 'shot': return this.onShot(m);
      case 'swing': { const r = this.remotes.get(m.id); if (r) r.sm.swing = 1; return; }
      case 'block': return this.onBlock(m);
      case 'shieldbroke': this.shieldUp = false; return this.toast(brokeMessage(m.weapon)); // an 'inv' follows
      case 'hitmark': return this.hitmark(m.dead, m.blocked);
      case 'dmg': return this.dmgNums.add(m, this.playerPos(m.id), performance.now());
      case 'hurt': return this.onHurt(m);
      case 'drink': return this.onDrink(m);
      case 'broke': this.flashSlot(m.slot); return this.toast(brokeMessage(m.weapon)); // an 'inv' follows
      case 'ko': return this.onKO(m);
      case 'dead': this.endPlay(); return this.ui.onDead(m.by, m.weapon);
      case 'left':
        this.settleLeave();
        // We already left if we asked to; otherwise the server took us out
        // (this account joined the arena again from another tab or device).
        if (this.mode === 'play') { this.endPlay(); this.ui.onLeft('You joined the arena from somewhere else.'); }
        return;
    }
  }

  startPlay(m) {
    this.clearArena();
    this.myId = m.id;
    this.inv = null; // the server sends 'inv' right after 'welcome'
    this.drink = null;
    this.renderSlots();
    this.setHp(C.MAX_HP);
    for (const p of m.players) this.infos.set(p.id, { name: p.name, skin: p.skin });
    const info = this.infos.get(m.id);
    const sm = new Stickman(info.skin);
    this.scene.add(sm.root);
    this.me = { x: m.x, y: 0, z: m.z, vy: 0, onGround: true, crouch: false, slide: 0, slideDir: [0, 0], kx: 0, kz: 0, sm, speed: 0, hp: C.MAX_HP };
    this.yaw = Math.atan2(-m.x, -m.z); this.pitch = -0.1;
    this.chests.closeAll();
    for (const id of m.chests) this.chests.setOpen(id, true);
    this.onGolden({ golden: m.golden, quiet: true });
    for (const it of m.items) this.addItem(it);
    this.shieldUp = false;
    this.frozen = false;
    if (this.preview) this.preview.root.visible = false;
    this.mode = 'play';
    this.frameMenu();
    this.lastSend = 0; this.lastFire = -Infinity;
    this.input.reset();
    this.input.enabled = true;
    $('hud').classList.remove('hidden');
    this.ui.onPlaying();
  }

  endPlay() {
    if (this.mode !== 'play') return;
    this.mode = 'menu';
    this.drink = null;
    this.renderPotion();
    this.dmgNums.clear();
    this.lastFire = -Infinity;
    this.renderCharge();
    this.input.enabled = false;
    this.input.reset();
    if (this.me) { this.scene.remove(this.me.sm.root); this.me.sm.dispose(); this.me = null; }
    this.clearArena();
    $('hud').classList.add('hidden');
    $('btnOpen').classList.add('hidden');
    if (this.preview) this.preview.root.visible = true;
    this.frameMenu();
  }

  clearArena() {
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    for (const it of this.items.values()) this.scene.remove(it.mesh);
    this.items.clear();
    this.island.golden.hide(); this.golden = null;
    $('compass').classList.add('hidden');
  }

  onSnap(m) {
    $('hudPlayers').textContent = m.n;
    const seen = new Set();
    for (const packed of m.p) {
      const { id, x, y, z, ry, pitch, flags, weapon, hp, protected: prot, shield, shieldUp, shocked, frozen } = unpackSnapshotPlayer(packed);
      if (id === this.myId) {
        if (this.me) {
          this.setHp(hp);
          this.frozen = frozen;
          this.me.sm.setStatus({ frozen, shocked });
        }
        continue;
      }
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
      r.sm.setShield(shield || null);
      r.sm.shieldUp = shieldUp;
      r.sm.setStatus({ frozen, shocked });
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
    this.inv = m; // weapons, dur (uses left per slot, null = never breaks), slot, potions, coins, hp
    this.coins = m.coins;
    $('hudCoins').textContent = m.coins;
    this.setHp(m.hp);
    if (this.me) { this.me.sm.setWeapon(m.weapons[m.slot]); holdPotion(this.me.sm, !!this.drink); }
    if (this.me) this.me.sm.setShield(m.shield ? m.shield.id : null);
    if (!m.shield) this.shieldUp = false;
    this.renderPotion();
    this.renderSlots();
    this.renderShield();
    if (m.picked) this.toast(`Picked up ${m.picked}`);
  }

  // ------------------------------------------------------------ HUD (view-models from @pvp/hud-model)
  // The 5 slot buttons are made once and updated in place, so a slot can flash when its weapon breaks.
  buildSlots() {
    const make = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e; };
    this.slotEls = slotBar(null).map(s => {
      const b = make('button', 'slot empty');
      b.dataset.slot = s.index;
      b.append(make('span', 'key'), make('span', 'icon'), make('small', 'name'));
      b.querySelector('.key').textContent = s.key;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        const i = pickSlot(this.inv, s.index);
        if (i != null) this.send('slot', { i });
      });
      return b;
    });
    $('slots').replaceChildren(...this.slotEls);
    $('btnDrop').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.send('drop'); });
    this.renderSlots();
  }

  renderSlots() {
    for (const s of slotBar(this.inv)) {
      const b = this.slotEls[s.index];
      b.classList.toggle('empty', s.empty);
      b.classList.toggle('active', s.active);
      for (const r of C.RARITIES) b.classList.toggle(r, s.rarity === r);
      // rarity accent, colors from RARITY_COLORS in @pvp/game-rules
      const rc = !s.empty && C.RARITY_COLORS[s.rarity];
      b.style.background = !rc ? ''
        : rc.twoColors ? `radial-gradient(circle at 50% 40%, ${rc.color}aa, ${rc.color2}dd 75%)`
        : `radial-gradient(circle at 50% 40%, ${rc.color}66, rgba(10,8,16,0.6) 70%)`;
      b.querySelector('.icon').textContent = s.icon;
      b.querySelector('.name').textContent = s.name;
      const label = s.empty ? `Slot ${s.key}: empty` : `${s.key}: ${s.name}${s.durability ? ` (${s.durability.percent}%)` : ''}`;
      b.title = label;
      b.setAttribute('aria-label', label);
    }
    this.renderDurability();
    $('btnDrop').classList.toggle('hidden', heldDurabilityView(this.inv).empty); // something in your hand to drop
  }

  // ------------------------------------------------------------ Healing Potion (#28)
  onDrink(m) {
    this.drink = drinkState(this.drink, m, performance.now());
    this.setHp(m.hp);
    if (this.me) holdPotion(this.me.sm, !!this.drink);
    const text = drinkMessage(m);
    if (text) this.toast(text);
    this.renderPotion();
  }

  // The potion button (count + ring) and the big ring around the crosshair while drinking. Every frame while drinking.
  renderPotion() {
    const v = potionView(this.inv, { drink: this.drink, now: performance.now(), hp: this.me?.hp, key: this.mobile ? 'tap' : 'Q' });
    const b = $('btnPotion');
    b.style.setProperty('--p', v.progress.toFixed(3));
    b.classList.toggle('empty', v.empty);
    b.classList.toggle('drinking', v.drinking);
    b.title = v.title;
    b.setAttribute('aria-label', `Healing Potion: ${v.count}`);
    $('potionCount').textContent = v.label;
    const ring = $('drinkRing');
    ring.classList.toggle('hidden', !v.drinking || this.mode !== 'play');
    ring.style.setProperty('--p', v.progress.toFixed(3));
    ring.setAttribute('aria-valuenow', v.percent);
    $('drinkText').textContent = v.text;
  }

  // "Charging 1.4s" and a small ring just under the crosshair after you shoot or swing (#35); "Ready!" for a moment.
  // Hidden while drinking a potion (no shooting then, and the big drinking ring is around the crosshair).
  renderCharge() {
    const def = this.inv && C.WEAPONS[this.inv.weapons[this.inv.slot]];
    const v = this.mode === 'play' && !this.drink ? chargeView(def, this.lastFire, performance.now()) : null;
    const el = $('charge');
    const show = !!v?.visible;
    if (el.classList.contains('hidden') === show) el.classList.toggle('hidden', !show);
    if (!show) return;
    el.classList.toggle('ready', v.ready);
    el.style.setProperty('--p', v.progress.toFixed(3));
    const text = $('chargeText');
    if (text.textContent !== v.text) text.textContent = v.text;
  }

  // Where a player stands now (me or someone I can see), or null.
  playerPos(id) {
    if (id === this.myId) return this.me ? this.me.sm.root.position : null;
    return this.remotes.get(id)?.sm.root.position ?? null;
  }

  // The big Durability bar: the weapon in your hand (full with ∞ if it never breaks, '–' if the hand is empty).
  renderDurability() {
    const d = heldDurabilityView(this.inv);
    const meter = $('durMeter');
    meter.dataset.level = d.level || 'none';
    meter.classList.toggle('infinite', d.infinite);
    meter.classList.toggle('empty', d.empty);
    $('durFill').style.width = d.percent + '%';
    $('durText').textContent = d.label;
    const bar = $('durBar');
    bar.setAttribute('aria-valuenow', d.percent);
    bar.setAttribute('aria-valuetext', d.empty ? 'no weapon' : d.infinite ? `${d.name}: never breaks` : `${d.name}: ${d.label}`);
    bar.title = d.empty ? '' : d.infinite ? `${d.name} never breaks` : `${d.name}: ${d.label}`;
  }

  // The small shield pill next to the bars, and the phone's shield button (only while you wear a shield).
  renderShield() {
    const v = shieldView(this.inv, this.shieldUp);
    const pill = $('shieldPill');
    pill.classList.toggle('hidden', !v);
    $('btnShield').classList.toggle('hidden', !v);
    if (!v) return;
    pill.classList.toggle('up', v.up);
    pill.classList.toggle('legendary', C.WEAPONS[v.weapon]?.rarity === 'legendary');
    pill.dataset.level = v.level;
    $('shieldIcon').textContent = v.icon;
    $('shieldFill').style.width = v.percent + '%';
    $('shieldText').textContent = v.label;
    pill.setAttribute('aria-valuenow', v.percent);
    pill.title = `${v.name}: ${v.label}${v.max ? ` of ${v.max}` : ''} blocks left`;
  }

  flashSlot(i) {
    const b = this.slotEls[i];
    if (!b) return;
    b.classList.remove('broke');
    void b.offsetWidth; // restart the animation
    b.classList.add('broke');
    clearTimeout(b.flashTimer);
    b.flashTimer = setTimeout(() => b.classList.remove('broke'), 900);
  }

  setHp(hp) {
    const h = healthView(hp);
    if (this.me) this.me.hp = h.hp;
    $('hpFill').style.width = h.percent + '%';
    $('hpFill').classList.toggle('low', h.low);
    $('hpText').textContent = h.label;
    $('hpFill').parentElement.setAttribute('aria-valuenow', h.hp);
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
    if (m.golden) {
      this.island.golden.show(m.golden.x, m.golden.z);
      if (!m.quiet) this.banner('★ A GOLDEN CHEST appeared! Follow the light! ★');
    } else {
      this.island.golden.hide();
      if (m.by) this.banner(`${m.by} opened the golden chest!`);
    }
    $('compass').classList.toggle('hidden', !m.golden);
  }

  addItem(it) {
    const g = new THREE.Group();
    let color = '#ffffff';
    if (it.kind === 'weapon') {
      const w = buildWeapon(it.weapon);
      const def = C.WEAPONS[it.weapon];
      if (def.type === 'gun') w.rotation.x = Math.PI / 2; // lay guns flat-ish
      w.scale.setScalar(def.type === 'shield' ? 1 : 1.3);  // shields stand up and spin
      g.add(w);
      it = { ...it, model: w };
      color = C.RARITY_COLORS[def.rarity]?.color ?? '#d6dde8'; // ring in the rarity's color
    } else if (it.kind === 'potion') {
      const p = buildPotion(); // the Healing Potion flask (@pvp/stickman-3d)
      p.position.y = -0.2;
      p.scale.setScalar(1.3);
      g.add(p);
      color = C.RARITY_COLORS[C.POTION.rarity]?.color ?? '#3cc24a'; // Common: green ring
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

  // ------------------------------------------------------------ effects
  onShot(m) {
    const from = new THREE.Vector3(...m.from);
    if (m.id === this.myId && this.me) this.me.sm.recoil = 1;
    else { const r = this.remotes.get(m.id); if (r) { r.sm.recoil = 1; from.set(r.sm.root.position.x, from.y, r.sm.root.position.z); } }
    const color = '#ffe9a0';
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

  // A shield blocked a hit: a bright flash in front of the defender.
  onBlock(m) {
    const sm = m.id === this.myId ? this.me?.sm : this.remotes.get(m.id)?.sm;
    if (!sm) return;
    const p = sm.root.position, a = sm.root.rotation.y;
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({ color: '#cfe3ff', transparent: true, opacity: 0.9 }));
    flash.position.set(p.x + Math.sin(a) * 0.7, p.y + 1.2, p.z + Math.cos(a) * 0.7);
    this.scene.add(flash);
    this.effects.push({ obj: flash, life: 0.25, max: 0.25, fade: true, grow: 2.5 });
    if (m.id === this.myId) this.shake = Math.max(this.shake, 0.15);
  }

  puff(x, y, z) {
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 8, 6), new THREE.MeshBasicMaterial({ color: i % 3 ? '#ffffff' : '#ffe27a', transparent: true }));
      s.position.set(x + (Math.random() - 0.5), y + (Math.random() - 0.5) * 1.5, z + (Math.random() - 0.5));
      this.scene.add(s);
      this.effects.push({ obj: s, life: 0.8, max: 0.8, fade: true, grow: 2, rise: 2, drift: [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3] });
    }
  }

  hitmark(ko, blocked) {
    const h = $('hitmark');
    h.classList.toggle('ko', !!ko);
    h.classList.toggle('blocked', !!blocked);
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
    if (this.mode === 'play') this.dmgNums.update(this.camera, innerWidth, innerHeight, performance.now(), id => this.playerPos(id));
    this.renderer.render(this.scene, this.camera);
  }

  updateMenu(dt) {
    const t = this.time * 0.12;
    const c = this.previewSpot;
    this.camera.position.set(c.x + Math.sin(t) * 3.7, 1.75, c.z + Math.cos(t) * 3.7);
    this.camera.lookAt(c.x, 1.0, c.z);
    if (this.preview) {
      this.preview.root.rotation.y = t + Math.PI * 0.15;
      this.preview.animate(dt, {}, this.time);
    }
    this.focus = c;
  }

  updatePlay(dt) {
    const me = this.me;
    const input = this.input.take();
    const frozen = this.frozen; // Ice Sword: completely stuck, every input is ignored
    const { ev, look, fire } = frozen ? { ev: [], look: { x: 0, y: 0 }, fire: false } : input;
    const move = frozen ? { x: 0, y: 0 } : input.move;

    // shield: raised while Shift / the shield button is held (if you wear one); the server is told when it changes
    const wantShield = !frozen && input.shield && !!this.inv?.shield;
    if (!frozen && wantShield !== this.shieldUp) {
      this.shieldUp = wantShield;
      this.send('shield', { up: wantShield });
      this.renderShield();
    }
    me.sm.shieldUp = this.shieldUp;

    // look (yaw kept in -PI..PI so it always fits in a message)
    this.yaw -= look.x;
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
    this.pitch = Math.max(-1.2, Math.min(1.1, this.pitch - look.y));

    for (const e of ev) {
      if (e === 'jump' && me.onGround) { me.vy = C.JUMP_SPEED; me.crouch = false; me.slide = 0; }
      if (e === 'crouch') {
        if (me.speed > C.WALK_SPEED * 0.9 && me.onGround && !me.crouch) {
          me.slide = C.SLIDE_TIME; me.crouch = true;
          me.slideDir = [Math.sin(me.moveYaw), Math.cos(me.moveYaw)];
        } else me.crouch = !me.crouch;
      }
      if (e === 'open' && this.nearChest != null) this.send('open', { id: this.nearChest });
      if (e === 'drop') this.send('drop');
      if (e === 'potion') this.send('drink');
      if (e.startsWith('slot:')) {
        const i = pickSlot(this.inv, e.slice(5));
        if (i != null) this.send('slot', { i });
      }
    }

    // movement
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    const mx = move.x, my = move.y;
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
    // knockback (not while frozen in the ice)
    if (frozen) { me.kx = me.kz = 0; me.slide = 0; }
    dx += me.kx * dt; dz += me.kz * dt;
    me.kx *= Math.max(0, 1 - dt * 6); me.kz *= Math.max(0, 1 - dt * 6);
    me.speed = speed;
    const height = me.crouch ? C.CROUCH_HEIGHT : C.PLAYER_HEIGHT;
    this.moveOpts.height = height;
    movePlayer(this.world.grid, me, dx, dz, dt, this.moveOpts);

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
    if (fire && def && !this.shieldUp && now - this.lastFire >= def.rate * 1000) {
      this.lastFire = now;
      const cam = this.camera.position;
      const range = def.type === 'gun' ? def.range : 60;
      // what is under the crosshair?
      let t = rayWorld(this.world, cam.x, cam.y, cam.z, dirX, dirY, dirZ, range + dist);
      for (const r of this.remotes.values()) {
        const p = r.sm.root.position;
        const tt = rayPlayer(cam.x, cam.y, cam.z, dirX, dirY, dirZ, p.x, p.y, p.z, readFlags(r.flags).crouch ? C.CROUCH_HEIGHT : C.PLAYER_HEIGHT);
        if (tt < t) t = tt;
      }
      const tx = cam.x + dirX * t, ty = cam.y + dirY * t, tz = cam.z + dirZ * t;
      const oy = me.y + height - 0.3;
      let ax = tx - me.x, ay = ty - oy, az = tz - me.z;
      if (def.type === 'melee') { ax = dirX; ay = dirY; az = dirZ; }
      const len = Math.hypot(ax, ay, az) || 1;
      this.send('fire', { d: [ax / len, ay / len, az / len] });
      if (def.type === 'melee') me.sm.swing = 1;
    }

    if (this.drink) this.renderPotion(); // the drinking ring fills up
    this.renderCharge(); // "Charging 1.4s" counts down (#35)

    // nearby chest?
    let near = null, best = 2.8;
    if (this.golden && Math.hypot(this.golden.x - me.x, this.golden.z - me.z) < 3) near = 'golden';
    else this.world.chests.forEach((c, i) => {
      if (this.chests.isOpen(i)) return;
      const d = Math.hypot(c.x - me.x, c.z - me.z);
      if (d < best) { best = d; near = i; }
    });
    this.nearChest = near;
    const ob = $('btnOpen');
    ob.classList.toggle('hidden', near == null);
    ob.textContent = this.mobile ? 'OPEN' : 'OPEN (E)';

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
      const f = makeFlags({ crouch: me.crouch, slide: me.slide > 0, moving: speed > 0.3, air: !me.onGround });
      this.send('state', { x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), ry: +me.sm.root.rotation.y.toFixed(3), pitch: +this.pitch.toFixed(2), f });
    }

    this.focus = me;
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
      const fl = readFlags(r.flags);
      r.sm.animate(dt, { speed: r.speed, crouch: fl.crouch && !fl.slide, slide: fl.slide, air: fl.air, pitch: r.pitch }, t);
    }
    // scenery: sky, water and sun follow the player (or the menu spot); chest lids; golden chest
    this.island.update(dt, t, this.focus || this.previewSpot);
    // items bob and spin
    for (const it of this.items.values()) {
      it.spin.rotation.y = t * 1.8;
      it.spin.position.y = 0.7 + Math.sin(t * 3 + it.id) * 0.1;
    }
    // glowing / moving parts of weapons lying on the ground (lightning, snowflakes, Mega Shield dots)
    for (const it of this.items.values()) it.model?.userData.update?.(t);
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
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
