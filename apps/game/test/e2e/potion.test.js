// Browser check for the Healing Potion model (@pvp/stickman-3d, issue #28): the flask from the boss's drawing.
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
// Checks that the potion draws without errors and shows red liquid.
// With SCREENSHOTS=1 it also saves docs/screenshots/potion.png (the potion alone, close up).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUN, SKIP, startServer, launchBrowser, newPage } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const W = 700, H = 700;

// A test page served by the game server's origin, so the import map paths work.
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}canvas{display:block}</style>
<script type="importmap">{ "imports": {
  "three": "/three/build/three.module.js",
  "@pvp/game-rules": "/packages/game-rules/src/index.js",
  "@pvp/stickman-3d": "/packages/stickman-3d/src/index.js"
} }</script></head><body><canvas id="c"></canvas>
<script type="module">
import * as THREE from 'three';
import { buildPotion } from '@pvp/stickman-3d';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(${W}, ${H}, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // same settings as the game
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe6ee');
scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f99', 1.6));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(2, 3, 4);
scene.add(sun);
const potion = buildPotion({ castShadow: false });
potion.rotation.y = 0.4;
scene.add(potion);
const box = new THREE.Box3().setFromObject(potion);
const c = box.getCenter(new THREE.Vector3());
const camera = new THREE.PerspectiveCamera(30, ${W} / ${H}, 0.01, 10);
camera.position.set(c.x, c.y + 0.12, c.z + 0.95);
camera.lookAt(c);
renderer.render(scene, camera);

// How many strongly red pixels (the liquid) the picture has.
window.redPixels = () => {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const px = new Uint8Array(${W} * ${H} * 4);
  gl.readPixels(0, 0, ${W}, ${H}, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let red = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] > 150 && px[i + 1] < 80 && px[i + 2] < 90) red++;
  return { red, meshes: potion.children.length };
};
window.ready = true;
</script></body></html>`;

let server, browser, page, errors;

before(async () => {
  if (!RUN) return;
  server = await startServer();
  browser = await launchBrowser();
  ({ page, errors } = await newPage(browser, { viewport: { width: W, height: H } }));
  const url = `${server.url}/__potion-test.html`;
  await page.route(url, r => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.goto(url);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

test('the Healing Potion model: a flask with red liquid, close up', { skip: SKIP, timeout: 60000 }, async () => {
  const r = await page.evaluate(() => window.redPixels());
  assert.ok(r.meshes >= 5, `glass, liquid, rings and cork (${r.meshes} parts)`);
  assert.ok(r.red > 1000, `the red liquid covers only ${r.red} pixels`);
  if (process.env.SCREENSHOTS === '1') {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'potion.png') });
  }
  assert.deepEqual(errors, []);
});
