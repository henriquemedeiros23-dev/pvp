// Browser check for the island scenery (@pvp/island-scene, issues #17 and #20).
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
// Draws the real island with WebGL and checks that no black shapes show in the sky,
// and that the ruins are light stone. With SCREENSHOTS=1 it also saves docs/screenshots/chests.png
// (closed chest, open chest, golden chest).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, '..', '..', 'server.js');
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const RUN = process.env.E2E === '1';

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = path.join(root, d, sub);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { /* none */ }
  return undefined;
}

// A test page served by the game server's origin, so the import map paths work.
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000}canvas{display:block}</style>
<script type="importmap">{ "imports": {
  "three": "/three/build/three.module.js",
  "three/addons/": "/three/examples/jsm/",
  "@pvp/seeded-random": "/packages/seeded-random/src/index.js",
  "@pvp/collision": "/packages/collision/src/index.js",
  "@pvp/world-gen": "/packages/world-gen/src/index.js",
  "@pvp/island-scene": "/packages/island-scene/src/index.js"
} }</script></head><body><canvas id="c"></canvas>
<script type="module">
import * as THREE from 'three';
import { generateIsland } from '@pvp/world-gen';
import { createIslandScene } from '@pvp/island-scene';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(1100, 500, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // same settings as the game
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor('#000000');
const camera = new THREE.PerspectiveCamera(70, 1100 / 500, 0.1, 900); // same far plane as the game

// read the pixels right after drawing (no preserveDrawingBuffer needed)
function draw(scene) {
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const px = new Uint8Array(1100 * 500 * 4);
  gl.readPixels(0, 0, 1100, 500, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px; // rows bottom to top
}
const lum = (px, i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];

const world = generateIsland();
const full = new THREE.Scene();
const isl = createIslandScene({ island: world }).addTo(full);

// Look at the island from a point: returns how many pixels are (almost) black,
// and the average brightness of the pixels that show ruins.
window.view = ({ x, z, yaw, pitch = 0.05, height = 1.7 }) => {
  isl.update(0.016, 1, { x, z });
  camera.position.set(x, height, z);
  camera.lookAt(x + Math.sin(yaw) * 10, height + Math.sin(pitch) * 10, z + Math.cos(yaw) * 10);
  const px = draw(full);
  let black = 0;
  for (let i = 0; i < px.length; i += 4) if (lum(px, i) < 25) black++;
  // ruins brightness: draw again with only the stone visible on a white background
  const keep = [];
  full.traverse(o => { if (o.isMesh || o.isInstancedMesh) { keep.push([o, o.visible]); o.visible = false; } });
  isl.ruins.stone.visible = true;
  const bg = full.background; full.background = new THREE.Color('#ff00ff');
  const mask = draw(full);
  full.background = bg;
  for (const [o, v] of keep) o.visible = v;
  let sum = 0, n = 0;
  for (let i = 0; i < mask.length; i += 4) {
    if (mask[i] > 240 && mask[i + 1] < 20 && mask[i + 2] > 240) continue; // background
    sum += lum(px, i); n++;
  }
  draw(full); // leave the normal picture on screen
  return { black, stonePixels: n, stoneBrightness: n ? sum / n : 0 };
};

// Three chests on sand: closed, open, golden.
window.chests = () => {
  const small = { islandRadius: 40, boxes: [], chests: [{ x: -2.6, z: 0 }, { x: 0, z: 0 }] };
  const scene = new THREE.Scene();
  const s = createIslandScene({ island: small }).addTo(scene);
  for (const m of s.chests.meshes) m.rotation.y = 0; // all face the camera
  s.group.getObjectByName('tufts').visible = false; // grass would hide the chests
  s.chests.setOpen(1, true);
  s.chests.update(Infinity);
  s.golden.show(2.9, 0);
  s.update(0, 0.6, { x: 0, z: 0 });
  s.golden.mesh.getObjectByName('beam').visible = false; // the beam would cover the picture
  camera.position.set(-0.8, 1.9, 3.6);
  camera.lookAt(0.15, 0.45, 0);
  draw(scene);
};
window.ready = true;
</script></body></html>`;

let child, port, browser, page;
const errors = [];
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvp-test-'));

before(async () => {
  if (!RUN) return;
  port = await freePort();
  child = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(port), DATA_FILE: path.join(dataDir, 'accounts.json') }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
    child.stdout.on('data', d => { if (String(d).includes('running')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`server exited (${code})`)); });
  });
  const { chromium } = await import('playwright');
  browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  page = await browser.newPage({ viewport: { width: 1100, height: 500 } });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  const url = `http://127.0.0.1:${port}/__scenery-test.html`;
  await page.route(url, r => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.goto(url);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
});

after(async () => {
  await browser?.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const skip = !RUN && 'set E2E=1 to run (npm run test:e2e)';

test('no black shapes in the sky, from the middle and from the edge of the island', { skip, timeout: 120000 }, async () => {
  // the old bug: far from the center, the fixed sky dome went past the far plane and showed black
  const views = [
    { x: 0, z: 0, yaw: 0 }, { x: 0, z: 0, yaw: Math.PI },
    { x: 180, z: 0, yaw: Math.PI / 2 }, { x: 180, z: 0, yaw: -Math.PI / 2 },
    { x: -120, z: 140, yaw: -2.4 }, { x: -120, z: 140, yaw: 0.7, pitch: 0.4 },
  ];
  for (const [i, v] of views.entries()) {
    const r = await page.evaluate(view => window.view(view), v);
    if (process.env.SCENERY_SHOTS) await page.screenshot({ path: path.join(process.env.SCENERY_SHOTS, `view-${i}.png`) }); // for a quick look
    // a few dark pixels are fine (a keyhole, a deep shadow); the old black shape was many thousands
    assert.ok(r.black < 300, `${r.black} black pixels looking from ${JSON.stringify(v)}`);
  }
  assert.deepEqual(errors, []);
});

test('ruins look like light stone', { skip, timeout: 60000 }, async () => {
  // standing in the plaza, looking at the ruins around it (some sides in the sun, some in shade)
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const r = await page.evaluate(view => window.view(view), { x: 0, z: 0, yaw, height: 1.7 });
    console.log(`ruins brightness looking at yaw ${yaw.toFixed(2)}: ${r.stoneBrightness.toFixed(0)} (${r.stonePixels} px)`);
    if (r.stonePixels < 2000) continue; // not enough ruins in this direction
    assert.ok(r.stoneBrightness > 120, `ruins too dark (yaw ${yaw.toFixed(2)}): average ${r.stoneBrightness.toFixed(0)} of 255`);
  }
  assert.deepEqual(errors, []);
});

test('chests: closed, open and golden', { skip, timeout: 60000 }, async () => {
  await page.evaluate(() => window.chests());
  if (process.env.SCREENSHOTS === '1') {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'chests.png') });
  }
  assert.deepEqual(errors, []);
});
