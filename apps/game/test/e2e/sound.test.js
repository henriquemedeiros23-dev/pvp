// Browser check for sounds (#55). Skipped in a normal `npm test`. Run it with:  npm run test:e2e
// 1) The page loads with sound: audio starts after the first tap (log in), every sound plays without errors
//    (headless Chromium may have no speakers: the page must still work).
// 2) The 🔊 button mutes; after a reload it is still muted (saved in this browser); the 🎚️ slider sets the volume.
// 3) In the arena: the small 🔊 in the HUD, and walking makes footsteps.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { RUN, SKIP, startServer, launchBrowser, newPage, signedIn, openAndLogIn, debug, waitDebug } from './helpers.js';

let server, browser;

before(async () => {
  if (!RUN) return;
  server = await startServer({ ARENA_SEED: 'sound-test' });
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

const stats = page => page.evaluate(() => window.pvpSound.stats());

test('sounds: start on the first tap, all play, mute is remembered, volume slider, footsteps', { skip: SKIP, timeout: 300000 }, async () => {
  const { page, errors } = await newPage(browser);
  try {
    const name = await signedIn(page, server.url, 'snd_');
    // logging in was a tap: audio started (or there is no audio at all on this machine)
    let s = await stats(page);
    assert.notEqual(s.state, 'locked', 'audio should start on the first tap');
    const audio = s.state === 'running';
    assert.equal(await page.textContent('#btnSound'), '🔊');
    assert.equal(await page.getAttribute('#btnSound', 'aria-pressed'), 'false');

    // every sound, mine and from around me: no errors
    const played = await page.evaluate(() => {
      const p = window.pvpSound;
      p.setListener({ x: 0, z: 0, yaw: 0 });
      let n = 0, t = 0;
      for (const name of ['gun', 'shootbm', 'dmgun', 'supergun', 'swing', 'swordHit', 'iceHit', 'zapHit', 'zap', 'shieldUp', 'shieldBlock',
        'headshot', 'hitmark', 'hit', 'hurt', 'knockout', 'weaponBreak', 'bombThrow', 'fuse', 'boom', 'bigBoom', 'chestOpen', 'coins',
        'goldenChest', 'goldenAppear', 'drink', 'heal', 'pickup', 'footstep', 'click', 'buy']) {
        if (p.play(name, { pos: (t++ % 2) ? [t, 0, 5] : null, delayMs: t * 40 })) n++;
      }
      return n;
    });
    s = await stats(page);
    assert.equal(s.errors, 0);
    if (audio) assert.ok(played >= 10, `played ${played}`);
    assert.ok(s.playing <= s.maxVoices, 'the cap holds');
    await page.waitForTimeout(800);

    // the 🔊 button mutes
    await page.click('#btnSound');
    assert.equal(await page.textContent('#btnSound'), '🔇');
    assert.equal(await page.getAttribute('#btnSound', 'aria-pressed'), 'true');
    assert.equal((await stats(page)).muted, true);
    assert.equal(await page.evaluate(() => window.pvpSound.play('gun')), false, 'muted: nothing plays');

    // ... and is remembered after a reload
    await openAndLogIn(page, server.url, name);
    assert.equal(await page.textContent('#btnSound'), '🔇');
    assert.equal((await stats(page)).muted, true);
    await page.click('#btnSound');
    assert.equal(await page.textContent('#btnSound'), '🔊');

    // the 🎚️ panel: the Sounds slider
    await page.click('#btnSoundSettings');
    await page.locator('#soundPanel').waitFor({ state: 'visible' });
    await page.fill('#soundVolume', '30');
    assert.equal(await page.textContent('#soundVolumeText'), '30%');
    assert.equal((await stats(page)).volume, 0.3);
    await page.click('#btnSoundClose');
    await page.locator('#soundPanel').waitFor({ state: 'hidden' });

    // in the arena: the small 🔊 in the HUD shows the same and mutes too; walking makes footsteps
    await page.click('#btnJoin');
    await page.locator('#hud').waitFor({ state: 'visible', timeout: 60000 });
    await waitDebug(page, x => x.me && x.inv, { what: 'joining' });
    assert.equal(await page.textContent('#btnSoundHud'), '🔊');
    assert.ok((await debug(page)).sound, 'pvpDebug shows the sound stats');
    if (audio) {
      await page.keyboard.down('w');
      try {
        await waitDebug(page, x => (x.sound.counts.footstep || 0) > 0, { what: 'a footstep', timeout: 60000 });
      } finally {
        await page.keyboard.up('w');
      }
    }
    await page.click('#btnSoundHud');
    assert.equal(await page.textContent('#btnSoundHud'), '🔇');
    assert.equal(await page.textContent('#btnSound'), '🔇', 'both buttons agree');
    await page.click('#btnSoundHud');
    assert.equal((await stats(page)).errors, 0);
    assert.deepEqual(errors, []);
  } finally {
    await page.context().close();
  }
});
