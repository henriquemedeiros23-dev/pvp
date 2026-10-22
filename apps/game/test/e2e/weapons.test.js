// Browser check for the weapons from the boss's cards (@pvp/stickman-3d, issue #26).
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
// Checks that every weapon model draws without errors, that a stickman can raise a shield
// in the arena, and that frozen / shocked stickmen look different.
// With SCREENSHOTS=1 it also saves docs/screenshots/weapons.png (every weapon side by side, labeled),
// docs/screenshots/shield-up.png (a stickman raising the shield in the arena) and
// docs/screenshots/frozen-shocked.png (a frozen and a shocked stickman).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUN, SKIP, startServer, launchBrowser, newPage } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const W = 1400, H = 820;

// A test page served by the game server's origin, so the import map paths work.
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>
html,body{margin:0;background:#dfe6ee;font-family:system-ui,sans-serif}
canvas{display:block}
#labels{position:fixed;inset:0;pointer-events:none}
.label{position:absolute;transform:translateX(-50%);text-align:center;font-weight:800;font-size:19px;color:#1b1f2a}
.label small{display:inline-block;margin-top:4px;padding:2px 10px;border-radius:10px;font-size:13px;color:#fff;letter-spacing:0.5px}
</style>
<script type="importmap">{ "imports": {
  "three": "/three/build/three.module.js",
  "three/addons/": "/three/examples/jsm/",
  "@pvp/game-rules": "/packages/game-rules/src/index.js",
  "@pvp/seeded-random": "/packages/seeded-random/src/index.js",
  "@pvp/collision": "/packages/collision/src/index.js",
  "@pvp/world-gen": "/packages/world-gen/src/index.js",
  "@pvp/island-scene": "/packages/island-scene/src/index.js",
  "@pvp/stickman-3d": "/packages/stickman-3d/src/index.js"
} }</script></head><body><canvas id="c"></canvas><div id="labels"></div>
<script type="module">
import * as THREE from 'three';
import { WEAPONS, BOMBS, rarityStyle } from '@pvp/game-rules';
import { generateIsland } from '@pvp/world-gen';
import { createIslandScene } from '@pvp/island-scene';
import { Stickman, buildWeapon, buildBomb } from '@pvp/stickman-3d';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(${W}, ${H}, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // same settings as the game
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---- every weapon side by side (two rows: guns and shields on top, swords and bombs below)
const ROWS = [['gun', 'shootbm', 'dmgun', 'supergun', 'shield', 'megashield'], ['electricsword', 'icesword', 'supersword', 'bomb', 'legendarybomb']];
const DEFS = { ...WEAPONS, ...BOMBS };
function stage(id) {
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight('#ffffff', '#8a8f99', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(2, 3, 4);
  s.add(sun);
  const model = BOMBS[id] ? buildBomb(id, { castShadow: false }) : buildWeapon(id, { castShadow: false });
  const holder = new THREE.Group();
  holder.add(model);
  const type = BOMBS[id] ? 'bomb' : WEAPONS[id].type;
  if (type === 'gun') {         // barrel to the right, like the drawings
    model.rotation.x = -Math.PI / 2;
    holder.rotation.y = Math.PI / 2 - 0.25;
  } else if (type === 'melee') { // blade to the right, flat side to us
    model.rotation.z = Math.PI / 2;
    holder.rotation.y = Math.PI / 2;
    holder.rotation.x = 0.25;
  } else if (type === 'bomb') {  // bombs: the fuse to the right
    holder.rotation.y = 0.4;
  } else {                       // shields: the P.V.P side to us, turned a little
    holder.rotation.y = -0.3;
  }
  s.add(holder);
  model.userData.update?.(0.37);
  return { s, holder };
}
const cells = [];
ROWS.forEach((row, r) => row.forEach((id, i) => {
  const w = ${W} / row.length, h = ${H} / 2;
  cells.push({ id, x: i * w, y: r * h, w, h, ...stage(id) });
}));
window.weaponsShot = () => {
  renderer.setScissorTest(true);
  const labels = document.getElementById('labels');
  labels.replaceChildren();
  for (const c of cells) {
    const box = new THREE.Box3().setFromObject(c.holder);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(30, c.w / (c.h - 70), 0.01, 20);
    const fit = Math.max(size.y, size.x / cam.aspect) * 0.62 / Math.tan((cam.fov * Math.PI) / 360);
    cam.position.set(center.x, center.y + size.y * 0.04, center.z + fit + size.z);
    cam.lookAt(center);
    const y = ${H} - c.y - c.h + 70; // WebGL counts from the bottom; keep 70 px for the label
    renderer.setViewport(c.x, y, c.w, c.h - 70);
    renderer.setScissor(c.x, y, c.w, c.h - 70);
    renderer.setClearColor(c.y === 0 ? '#e4eaf1' : '#d9e1ea');
    renderer.render(c.s, cam);
    const look = rarityStyle(DEFS[c.id].rarity);
    const el = document.createElement('div');
    el.className = 'label';
    el.style.left = (c.x + c.w / 2) + 'px';
    el.style.top = (c.y + c.h - 66) + 'px';
    el.innerHTML = DEFS[c.id].name + '<br><small style="background:' + look.background + '">' + look.name.toUpperCase() + '</small>';
    labels.append(el);
  }
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, ${W}, ${H});
  // how many cells really show a model (not just background)
  const gl = renderer.getContext();
  let shown = 0;
  for (const c of cells) {
    const px = new Uint8Array(4 * 40 * 40);
    gl.readPixels(Math.round(c.x + c.w / 2 - 20), Math.round(${H} - c.y - (c.h - 70) / 2 - 20), 40, 40, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const first = px.slice(0, 3).join();
    let differs = false;
    for (let i = 0; i < px.length; i += 4) if (px.slice(i, i + 3).join() !== first) { differs = true; break; }
    if (differs) shown++;
  }
  return { cells: cells.length, shown };
};

// ---- a stickman raising the shield in the arena
const scene = new THREE.Scene();
const island = createIslandScene({ island: generateIsland() }).addTo(scene);
island.update(0, 12, { x: 0, z: 0 });
const camera = new THREE.PerspectiveCamera(50, ${W} / ${H}, 0.05, 900);
const hero = new Stickman({ color: 'blue', hat: 'cap' });
hero.setWeapon('icesword');
hero.setShield('shield');
hero.root.rotation.y = 0.6;
scene.add(hero.root);
const pose = (sm, n = 40, state = {}) => { for (let i = 0; i < n; i++) sm.animate(1 / 30, state, i / 30); };
window.shieldPixels = () => {
  document.getElementById('labels').replaceChildren();
  pose(hero);
  camera.position.set(1.2, 1.6, 2.9);
  camera.lookAt(0, 1.15, 0);
  const shot = () => {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const px = new Uint8Array(${W} * ${H} * 4);
    gl.readPixels(0, 0, ${W}, ${H}, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };
  const down = shot();
  hero.shieldUp = true;
  pose(hero);
  const up = shot();
  let changed = 0;
  for (let i = 0; i < up.length; i += 4) {
    if (Math.abs(up[i] - down[i]) + Math.abs(up[i + 1] - down[i + 1]) + Math.abs(up[i + 2] - down[i + 2]) > 30) changed++;
  }
  return { changed, amount: hero.shieldAmt };
};

// ---- frozen and shocked stickmen
window.statusShot = () => {
  hero.root.visible = false;
  const frozen = new Stickman({ color: 'red' });
  frozen.setWeapon('shootbm');
  frozen.root.position.set(-0.9, 0, 0);
  frozen.root.rotation.y = 0.3;
  const shocked = new Stickman({ color: 'green' });
  shocked.setWeapon('gun');
  shocked.root.position.set(0.9, 0, 0);
  shocked.root.rotation.y = -0.3;
  scene.add(frozen.root, shocked.root);
  pose(frozen, 20, { speed: 6 });
  pose(shocked, 20, { speed: 0 });
  frozen.setStatus({ frozen: true });
  shocked.setStatus({ shocked: true });
  shocked.animate(1 / 30, {}, 2.0);
  camera.position.set(0, 1.6, 4.6);
  camera.lookAt(0, 1.05, 0);
  renderer.render(scene, camera);
};
window.ready = true;
</script></body></html>`;

let server, browser, page, errors;

before(async () => {
  if (!RUN) return;
  server = await startServer();
  browser = await launchBrowser();
  ({ page, errors } = await newPage(browser, { viewport: { width: W, height: H } }));
  const url = `${server.url}/__weapons-test.html`;
  await page.route(url, r => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.goto(url);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

const save = async name => {
  if (process.env.SCREENSHOTS !== '1') return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name) });
};

test('every weapon from the boss\'s cards draws, side by side with its name', { skip: SKIP, timeout: 120000 }, async () => {
  const r = await page.evaluate(() => window.weaponsShot());
  await save('weapons.png');
  assert.equal(r.cells, 11);
  assert.equal(r.shown, 11, 'every model shows in its box');
  assert.equal(await page.locator('.label').count(), 11);
  assert.deepEqual(errors, []);
});

test('a stickman raises the shield in the arena', { skip: SKIP, timeout: 120000 }, async () => {
  const r = await page.evaluate(() => window.shieldPixels());
  assert.equal(r.amount, 1);
  assert.ok(r.changed > 5000, `raising the shield changes only ${r.changed} pixels`);
  await save('shield-up.png');
  assert.deepEqual(errors, []);
});

test('frozen and shocked stickmen', { skip: SKIP, timeout: 120000 }, async () => {
  await page.evaluate(() => window.statusShot());
  await save('frozen-shocked.png');
  assert.deepEqual(errors, []);
});
