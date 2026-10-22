// Browser check for the Gun model (@pvp/stickman-3d, issue #25): a stickman holds the Gun on the island.
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
// Checks that the Gun draws without errors and really shows in the hand.
// With SCREENSHOTS=1 it also saves docs/screenshots/gun.png (close third-person view) and
// docs/screenshots/gun-model.png (the Gun alone, side view like the boss's drawing).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUN, SKIP, startServer, launchBrowser, newPage } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const W = 1100, H = 620;

// A test page served by the game server's origin, so the import map paths work.
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}canvas{display:block}</style>
<script type="importmap">{ "imports": {
  "three": "/three/build/three.module.js",
  "three/addons/": "/three/examples/jsm/",
  "@pvp/game-rules": "/packages/game-rules/src/index.js",
  "@pvp/seeded-random": "/packages/seeded-random/src/index.js",
  "@pvp/collision": "/packages/collision/src/index.js",
  "@pvp/world-gen": "/packages/world-gen/src/index.js",
  "@pvp/island-scene": "/packages/island-scene/src/index.js",
  "@pvp/stickman-3d": "/packages/stickman-3d/src/index.js"
} }</script></head><body><canvas id="c"></canvas>
<script type="module">
import * as THREE from 'three';
import { generateIsland } from '@pvp/world-gen';
import { createIslandScene } from '@pvp/island-scene';
import { Stickman, buildWeapon } from '@pvp/stickman-3d';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(${W}, ${H}, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // same settings as the game
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(55, ${W} / ${H}, 0.05, 900);

const scene = new THREE.Scene();
const island = createIslandScene({ island: generateIsland() }).addTo(scene);
const sm = new Stickman({ color: 'black' });
scene.add(sm.root);
sm.root.position.set(0, 0, 0);
sm.root.rotation.y = 0.5;
sm.setWeapon('gun');
for (let i = 0; i < 30; i++) sm.animate(1 / 30, { speed: 0, pitch: 0.05 }, i / 30);
island.update(0, 12, { x: 0, z: 0 });

// Camera behind and right of the shoulder, looking past the hand (third person, close).
const forward = new THREE.Vector3(Math.sin(0.5), 0, Math.cos(0.5));
const right = new THREE.Vector3(forward.z, 0, -forward.x); // the stickman's right (+x)
const hand = new THREE.Vector3();
sm.armR.hand.getWorldPosition(hand);
camera.position.copy(hand).addScaledVector(forward, -0.75).addScaledVector(right, 0.95).add(new THREE.Vector3(0, 0.3, 0));
camera.lookAt(hand.clone().addScaledVector(forward, 0.25).add(new THREE.Vector3(0, -0.05, 0)));

function pixels() {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const px = new Uint8Array(${W} * ${H} * 4);
  gl.readPixels(0, 0, ${W}, ${H}, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px;
}
// How many pixels change when the Gun is taken away: the Gun really shows on screen.
window.gunPixels = () => {
  const withGun = pixels();
  sm.setWeapon(null);
  const without = pixels();
  sm.setWeapon('gun');
  let changed = 0;
  for (let i = 0; i < withGun.length; i += 4) {
    if (Math.abs(withGun[i] - without[i]) + Math.abs(withGun[i + 1] - without[i + 1]) + Math.abs(withGun[i + 2] - without[i + 2]) > 30) changed++;
  }
  renderer.render(scene, camera); // leave the picture with the Gun on screen
  return { changed, meshes: sm.weapon.children.length };
};
// The Gun alone, seen from its right side (barrel to the right, like the boss's drawing).
window.modelShot = () => {
  const s = new THREE.Scene();
  s.background = new THREE.Color('#dfe6ee');
  s.add(new THREE.HemisphereLight('#ffffff', '#8a8f99', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(2, 3, 4);
  s.add(sun);
  const gun = buildWeapon('gun', { castShadow: false });
  gun.rotation.x = -Math.PI / 2;  // up (+z) becomes world up, forward (-y) becomes -z
  gun.rotation.z = 0;
  const holder = new THREE.Group();
  holder.add(gun);
  holder.rotation.y = Math.PI / 2 - 0.25; // barrel to the right like the drawing, turned a little to show its depth
  s.add(holder);
  const box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(30, ${W} / ${H}, 0.01, 10);
  cam.position.set(c.x, c.y + 0.06, c.z + 1.05);
  cam.lookAt(c);
  renderer.render(s, cam);
};
window.ready = true;
</script></body></html>`;

let server, browser, page, errors;

before(async () => {
  if (!RUN) return;
  server = await startServer();
  browser = await launchBrowser();
  ({ page, errors } = await newPage(browser, { viewport: { width: W, height: H } }));
  const url = `${server.url}/__gun-test.html`;
  await page.route(url, r => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.goto(url);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

test('a stickman holds the Gun: it draws and shows in the hand', { skip: SKIP, timeout: 120000 }, async () => {
  const r = await page.evaluate(() => window.gunPixels());
  assert.ok(r.meshes >= 10, `a detailed pistol (${r.meshes} parts)`);
  assert.ok(r.changed > 1500, `the Gun covers only ${r.changed} pixels`);
  if (process.env.SCREENSHOTS === '1') {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'gun.png') });
  }
  assert.deepEqual(errors, []);
});

test('the Gun alone, close up (like the boss\'s drawing)', { skip: SKIP, timeout: 120000 }, async () => {
  await page.evaluate(() => window.modelShot());
  if (process.env.SCREENSHOTS === '1') await page.screenshot({ path: path.join(SHOTS, 'gun-model.png') });
  assert.deepEqual(errors, []);
});
