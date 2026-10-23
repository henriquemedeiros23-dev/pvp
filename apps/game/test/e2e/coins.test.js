// Browser check for the coin from the boss's drawing (issue #29).
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
// Checks that the coin icon (@pvp/hud-model) draws, and that gold coins (@pvp/island-scene) pop out of an
// opened chest in 3D. With SCREENSHOTS=1 it also saves docs/screenshots/coins.png.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUN, SKIP, startServer, launchBrowser, newPage } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const W = 1200, H = 600, LEFT = 420;

// A test page served by the game server's origin, so the import map paths work.
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/style.css">
<style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#16131f;font-family:system-ui,sans-serif;color:#fff}
#left{position:fixed;left:0;top:0;width:${LEFT}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
#big{width:280px;height:280px}
.examples{display:flex;gap:12px;align-items:center}
.examples .buy{padding:10px 16px;border-radius:12px;font-weight:800}
#toastDemo{font-weight:900;font-size:22px;color:#ffc531;text-shadow:0 2px 4px #000}
#c{position:fixed;left:${LEFT}px;top:0;display:block}
#cap{position:fixed;left:${LEFT + 16}px;bottom:12px;font-weight:800;font-size:18px;text-shadow:0 2px 4px #000}
</style>
<script type="importmap">{ "imports": {
  "three": "/three/build/three.module.js",
  "three/addons/": "/three/examples/jsm/",
  "@pvp/game-rules": "/packages/game-rules/src/index.js",
  "@pvp/hud-model": "/packages/hud-model/src/index.js",
  "@pvp/seeded-random": "/packages/seeded-random/src/index.js",
  "@pvp/collision": "/packages/collision/src/index.js",
  "@pvp/world-gen": "/packages/world-gen/src/index.js",
  "@pvp/island-scene": "/packages/island-scene/src/index.js"
} }</script></head><body>
<div id="left">
  <div id="big"></div>
  <div class="examples">
    <div class="coins"><span class="coin"></span><span>125</span></div>
    <span class="pill"><span class="coin"></span><b>23</b></span>
    <button class="card"><span class="buy" style="display:flex;gap:6px;align-items:center;background:#ffc531;color:#2a1d00"><span class="coin"></span>10</span></button>
  </div>
  <div id="toastDemo"><span class="coin" style="width:30px;height:30px;vertical-align:-8px"></span> +3 coins</div>
</div>
<canvas id="c"></canvas><div id="cap">A chest opens: coins jump out!</div>
<script type="module">
import * as THREE from 'three';
import { COIN_ICON_SVG, coinIconDataUrl } from '@pvp/hud-model';
import { generateIsland } from '@pvp/world-gen';
import { createIslandScene } from '@pvp/island-scene';

document.getElementById('big').innerHTML = COIN_ICON_SVG;
document.documentElement.style.setProperty('--coin-icon', 'url("' + coinIconDataUrl() + '")');

const CW = ${W - LEFT}, CH = ${H};
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(CW, CH, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // same settings as the game
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const island = createIslandScene({ island: generateIsland() }).addTo(scene);
const chest = island.chests.meshes[0];
const camera = new THREE.PerspectiveCamera(45, CW / CH, 0.05, 900);
// in front of the chest (its front is local +z), a bit to the side and above
const front = new THREE.Vector3(0.9, 0, 1).applyQuaternion(chest.quaternion).normalize();
camera.position.copy(chest.position).addScaledVector(front, 3.1).add(new THREE.Vector3(0, 1.5, 0));
camera.lookAt(chest.position.x, 0.95, chest.position.z);

window.coinShot = () => {
  island.chests.setOpen(0, true);
  island.update(Infinity, 12, { x: chest.position.x, z: chest.position.z }); // lid fully open
  const popped = island.popChestCoins(0);
  for (let i = 0; i < 22; i++) island.update(1 / 60, 12, { x: chest.position.x, z: chest.position.z }); // coins in the air
  renderer.render(scene, camera);
  // gold pixels above the chest: the coins
  const gl = renderer.getContext();
  const px = new Uint8Array(CW * CH * 4);
  gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let gold = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] > 170 && px[i + 1] > 110 && px[i + 2] < 90 && px[i] - px[i + 2] > 120) gold++;
  return { popped, flying: island.coinPops.active, gold };
};
window.ready = true;
</script></body></html>`;

let server, browser, page, errors;

before(async () => {
  if (!RUN) return;
  server = await startServer();
  browser = await launchBrowser();
  ({ page, errors } = await newPage(browser, { viewport: { width: W, height: H } }));
  const url = `${server.url}/__coins-test.html`;
  await page.route(url, r => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.goto(url);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 })
    .catch(e => { throw new Error(`${e.message}\npage errors: ${errors.join('\n')}`); });
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

test('the coin from the boss\'s drawing, and coins popping out of an opened chest', { skip: SKIP, timeout: 120000 }, async () => {
  // the icon: the coin body, a letter and the sparkle lines
  assert.equal(await page.locator('#big svg .body').count(), 1);
  assert.equal(await page.locator('#big svg .label').count(), 1);
  assert.equal(await page.locator('#big svg .sparkle').count(), 1);
  const bg = await page.$eval('.pill .coin', e => getComputedStyle(e).backgroundImage);
  assert.match(bg, /^url\("data:image\/svg\+xml,/);

  const r = await page.evaluate(() => window.coinShot());
  assert.equal(r.popped, 6);
  assert.equal(r.flying, 6, 'still in the air');
  assert.ok(r.gold > 200, `gold coins should show (${r.gold} gold pixels)`);
  if (process.env.SCREENSHOTS === '1') {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'coins.png') });
  }
  assert.deepEqual(errors, []);
});
