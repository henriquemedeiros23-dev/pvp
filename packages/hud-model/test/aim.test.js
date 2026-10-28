// Aiming (#37): the AIM button, zoom, scope ring and crosshair for the Shootbm and the DM Gun.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '@pvp/game-rules';
import { aimView, aimBlend, zoomedFov, AIM_TIME_MS, AIM_CAMERA, AIM_BUTTON } from '../src/index.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('the AIM button shows only for the Shootbm and the DM Gun', () => {
  const shown = Object.keys(RULES.WEAPONS).filter(id => aimView(id).canAim);
  assert.deepEqual(shown, ['shootbm', 'dmgun']);
  assert.equal(aimView(RULES.WEAPONS.shootbm).canAim, true, 'a weapon object works too');
  for (const w of [undefined, null, '', 'nope']) assert.equal(aimView(w).canAim, false);
  assert.deepEqual(AIM_BUTTON, { icon: '🎯', label: 'AIM', title: 'Hold to aim' });
});

test('aiming fully with the Shootbm: zoom, slower walk, closer camera, scope, small crosshair', () => {
  const a = RULES.WEAPONS.shootbm.aim;
  const v = aimView('shootbm', { held: true });
  assert.deepEqual(v, {
    canAim: true, aiming: true, blend: 1, zoom: a.zoom, moveMul: a.moveMul,
    cameraDistance: AIM_CAMERA.distance, shoulder: AIM_CAMERA.shoulder, crosshairScale: AIM_CAMERA.crosshair,
    scope: true, scopeOpacity: 1,
  });
});

test('not aiming, blocked, or a weapon that cannot aim: everything normal', () => {
  const normal = { zoom: 1, moveMul: 1, cameraDistance: 1, shoulder: 1, crosshairScale: 1, scope: false, scopeOpacity: 0 };
  const pick = v => Object.fromEntries(Object.keys(normal).map(k => [k, v[k]]));
  assert.deepEqual(pick(aimView('shootbm')), normal);
  assert.deepEqual(pick(aimView('shootbm', { held: true, blocked: true })), normal, 'shield up / drinking / frozen');
  assert.equal(aimView('shootbm', { held: true, blocked: true }).aiming, false);
  const gun = aimView('gun', { held: true, blend: 1 });
  assert.equal(gun.aiming, false);
  assert.equal(gun.canAim, false);
  assert.deepEqual(pick(gun), normal, 'the Gun never zooms');
});

test('the zoom goes in and out smoothly over AIM_TIME_MS', () => {
  let b = 0;
  b = aimBlend(b, true, AIM_TIME_MS / 2);
  close(b, 0.5);
  const half = aimView('dmgun', { held: true, blend: b });
  close(half.zoom, 1 + (RULES.WEAPONS.dmgun.aim.zoom - 1) * 0.5); // the middle of the smooth curve is half
  assert.ok(half.crosshairScale < 1 && half.crosshairScale > AIM_CAMERA.crosshair);
  assert.equal(half.moveMul, RULES.WEAPONS.dmgun.aim.moveMul, 'slower at once');
  b = aimBlend(b, true, AIM_TIME_MS);
  assert.equal(b, 1, 'never above 1');
  b = aimBlend(b, false, AIM_TIME_MS / 4);
  close(b, 0.75);
  b = aimBlend(b, false, 10 * AIM_TIME_MS);
  assert.equal(b, 0, 'never below 0');
  assert.equal(aimBlend(undefined, true, NaN), 0, 'bad numbers: no change from 0');
  assert.equal(aimBlend(0, true, 5, 0), 1, 'no time: at once');
  // the steps add up the same however the time is cut (deterministic)
  let x = 0, y = 0;
  for (let i = 0; i < 10; i++) x = aimBlend(x, true, 8);
  y = aimBlend(y, true, 80);
  close(x, y);
});

test('zoomedFov: twice the zoom makes things look twice as big', () => {
  close(zoomedFov(70, 1), 70);
  const f = zoomedFov(90, 2);
  close(Math.tan((f * Math.PI) / 360), Math.tan(Math.PI / 4) / 2);
  assert.equal(zoomedFov(70, 0), 70);
  assert.equal(zoomedFov(70, NaN), 70);
});
