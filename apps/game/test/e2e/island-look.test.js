// How the island looks on a phone (issue #43: green, alive, more realistic ground).
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
//
// Builds the practice file, opens it as a phone in landscape (844x390, touch, so the lighter `mobile`
// scenery), joins without bots, stands on a fixed open spot and checks that the ground in front of the
// player is GREEN (not dry yellow-brown) and that there are no console errors.
// With SCREENSHOTS=1 it saves docs/screenshots/island-after.png (or the name in ISLAND_SHOT).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateIsland } from '@pvp/world-gen';
import { circleHitsBox } from '@pvp/collision';
import { RUN, SKIP, launchBrowser, waitDebug, debug } from './helpers.js';
import { build, THREE_CDN } from '../../../../scripts/build-practice.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const THREE_FILE = path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.min.js');
const SHOT = path.join(ROOT, 'docs', 'screenshots', process.env.ISLAND_SHOT || 'island-after.png');
const island = generateIsland();

let browser, file;
before(async () => {
  if (!RUN) return;
  ({ file } = await build({ check: false }));
  browser = await launchBrowser();
});
after(async () => { await browser?.close(); });

const free = (x, z, r = 0.7) => Math.hypot(x, z) < island.playRadius - 3 && !island.grid.near(x, z, r + 1).some(b => circleHitsBox(x, z, r, b));

test('island look: green ground on a phone in landscape', { skip: SKIP, timeout: 180000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  context.setDefaultTimeout(60000);
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url === THREE_CDN) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(THREE_FILE) });
    if (url.startsWith('file://') || url.startsWith('data:')) return route.continue();
    return route.abort();
  });
  try {
    await page.goto(`${pathToFileURL(file).href}?debug=1&seed=island-look&bots=0`);
    await page.locator('#menu').waitFor({ state: 'visible', timeout: 60000 });
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: 60000 });
    const s = await waitDebug(page, x => x.me && x.inv, { what: 'joining' });
    // the same open spot every time: the first one (from the middle out) with 5 m free behind and 16 m ahead
    const fx = Math.sin(s.me.yaw), fz = Math.cos(s.me.yaw);
    const clear = (x, z) => { for (let t = -5; t <= 16; t += 0.5) if (!free(x + fx * t, z + fz * t, 1.2)) return false; return true; };
    let spot = null;
    for (let r = 24; r < island.playRadius - 20 && !spot; r += 4) {
      for (let a = 0; a < 24 && !spot; a++) {
        const x = Math.cos(a / 24 * Math.PI * 2) * r, z = Math.sin(a / 24 * Math.PI * 2) * r;
        if (clear(x, z)) spot = { x, z };
      }
    }
    assert.ok(spot, 'an open place');
    assert.ok(await page.evaluate(({ x, z }) => window.pvpPractice.teleport(x, z), spot), 'teleport');
    await waitDebug(page, x => x.me && Math.hypot(x.me.x - spot.x, x.me.z - spot.z) < 0.5, { what: 'the teleport' });
    await page.waitForTimeout(1500); // a few frames (software WebGL is slow)
    assert.ok((await debug(page)).me, 'still in the game');
    const png = await page.screenshot(process.env.SCREENSHOTS === '1' ? { path: SHOT } : {});
    assert.ok(png.length > 60000, `the screenshot looks empty (${png.length} bytes)`);

    // the ground between the player's feet and the horizon, away from the HUD: is it green?
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    const color = await page.evaluate(async ({ png, box }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      // a strip left of the player, below the horizon and above the joystick
      let r = 0, gr = 0, b = 0, n = 0;
      const d = g.getImageData(Math.round(box.x + box.width * 0.04), Math.round(box.y + box.height * 0.5), Math.round(box.width * 0.34), Math.round(box.height * 0.1)).data;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++; }
      return { r: r / n, g: gr / n, b: b / n };
    }, { png: png.toString('base64'), box });
    console.log(`ground color in front of the player: rgb(${color.r.toFixed(0)}, ${color.g.toFixed(0)}, ${color.b.toFixed(0)})`);
    if (!process.env.ISLAND_SHOT) { // ISLAND_SHOT=island-before.png was used once to show the old dry ground
      assert.ok(color.g > color.r * 1.08 && color.g > color.b * 1.15, `the ground should look green, got ${JSON.stringify(color)}`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
