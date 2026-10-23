import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '@pvp/game-rules';
import {
  chargeView, chargeStarts, damageNumber, damageFloat, READY_FLASH_MS, DAMAGE_NUMBER_MS, DAMAGE_NUMBER_RISE, DAMAGE_COLORS,
} from '../src/index.js';

const GUN = RULES.WEAPONS.gun;           // rate 2 s
const SHOOTBM = RULES.WEAPONS.shootbm;   // rate 3 s
const SUPER = RULES.WEAPONS.supersword;  // melee, rate 1.5 s

test('chargeView: counts down from the weapon\'s rate after a shot', () => {
  assert.deepEqual(chargeView(GUN, 1000, 1000), {
    visible: true, charging: true, ready: false, progress: 0, percent: 0, secondsLeft: 2, text: 'Charging 2.0s', hint: '25%',
  });
  const v = chargeView(GUN, 1000, 1600); // 0.6 s after the shot: 1.4 s left
  assert.equal(v.text, 'Charging 1.4s');
  assert.equal(v.secondsLeft, 1.4);
  assert.equal(v.progress, 0.3);
  assert.equal(v.percent, 30);
  assert.equal(chargeView(SHOOTBM, 0, 1500).text, 'Charging 1.5s');
  assert.equal(chargeView(GUN, 0, 1999).text, 'Charging 0.1s', 'never shows 0.0 while still charging');
  assert.equal(chargeView(GUN, 0, 1901).secondsLeft, 0.1, 'rounded up to 0.1 s');
});

test('chargeView: "25%" hint while charging (a hit does 25% now, #38), tunable', () => {
  assert.equal(chargeView(GUN, 0, 500).hint, '25%');
  assert.equal(chargeView(GUN, 0, 500, { chargingDamage: 0.5 }).hint, '50%');
  assert.equal(chargeView(GUN, 0, 2000).hint, '', 'ready: no hint');
  assert.equal(chargeView(GUN, null, 500).hint, '', 'never used: no hint');
});

test('chargeStarts: each slot\'s charge from inv.charge (#38)', () => {
  const inv = { weapons: ['gun', 'shootbm', 'icesword'], charge: [0, 2700, 0] };
  // the Shootbm has 2.7 s left at 10000: it "started" 3 s before it is ready
  assert.deepEqual(chargeStarts(inv, 10000), [null, 10000 + 2700 - 3000, null]);
  assert.equal(chargeView(SHOOTBM, chargeStarts(inv, 10000)[1], 10000).text, 'Charging 2.7s');
  // the held weapon decides what shows: switching to the ready Gun hides it
  assert.equal(chargeView(GUN, chargeStarts(inv, 10000)[0], 10000).visible, false);
  // a slot that just got ready keeps its old start, so "Ready!" still flashes
  const later = chargeStarts({ weapons: inv.weapons, charge: [0, 0, 0] }, 12800, [null, 9700, null]);
  assert.deepEqual(later, [null, 9700, null]);
  assert.equal(chargeView(SHOOTBM, later[1], 12800).text, 'Ready!');
  // no charge info (older server), unknown or shield ids, bad numbers: ready
  assert.deepEqual(chargeStarts({ weapons: ['gun'] }, 5), [null]);
  assert.deepEqual(chargeStarts({ weapons: ['nope', 'gun'], charge: [100, -5] }, 5), [null, null]);
  assert.deepEqual(chargeStarts(null, 5), []);
  assert.deepEqual(chargeStarts({ weapons: ['gun'], charge: [99999] }, 0), [0], 'never more than the rate');
});

test('chargeView: works for melee too (Supersword 1.5 s)', () => {
  assert.equal(chargeView(SUPER, 0, 500).text, 'Charging 1.0s');
  assert.equal(chargeView(SUPER, 0, 1500).text, 'Ready!');
});

test('chargeView: "Ready!" for a moment, then hidden', () => {
  const ready = chargeView(GUN, 0, 2000);
  assert.deepEqual(ready, { visible: true, charging: false, ready: true, progress: 1, percent: 100, secondsLeft: 0, text: 'Ready!', hint: '' });
  assert.equal(chargeView(GUN, 0, 2000 + READY_FLASH_MS - 1).text, 'Ready!');
  const gone = chargeView(GUN, 0, 2000 + READY_FLASH_MS);
  assert.equal(gone.visible, false);
  assert.equal(gone.text, '');
  assert.equal(chargeView(GUN, 0, 2000, { readyMs: 0 }).visible, false, 'no "Ready!" flash with readyMs 0');
});

test('chargeView: hidden with no shot yet, no weapon or a bad clock', () => {
  for (const v of [chargeView(GUN, null, 500), chargeView(null, 0, 500), chargeView({}, 0, 500), chargeView(GUN, 1000, 500), chargeView(GUN, 0, NaN)]) {
    assert.equal(v.visible, false);
    assert.equal(v.text, '');
  }
});

test('damageNumber: hit, shock tick, knockout, blocked', () => {
  assert.deepEqual(damageNumber({ t: 'dmg', id: 3, amount: 15 }), { id: 3, text: '-15', badge: '', kind: 'hit', color: DAMAGE_COLORS.hit });
  assert.deepEqual(damageNumber({ t: 'dmg', id: 3, amount: 1, shock: true }), { id: 3, text: '-1', badge: '', kind: 'shock', color: DAMAGE_COLORS.shock });
  assert.deepEqual(damageNumber({ t: 'dmg', id: 3, amount: 40, ko: true }), { id: 3, text: '-40', badge: 'KO!', kind: 'ko', color: DAMAGE_COLORS.ko });
  assert.deepEqual(damageNumber({ t: 'dmg', id: 3, amount: 0, blocked: true }), { id: 3, text: 'Blocked', badge: '', kind: 'blocked', color: DAMAGE_COLORS.blocked });
  assert.equal(damageNumber({ t: 'hurt', id: 3 }), null);
  assert.equal(damageNumber(null), null);
});

test('damageFloat: floats up and fades out in 2 s', () => {
  const start = damageFloat(0);
  assert.equal(start.rise, 0);
  assert.equal(start.opacity, 1);
  assert.equal(start.scale, 0.6);
  assert.equal(start.done, false);
  const mid = damageFloat(DAMAGE_NUMBER_MS / 2);
  assert.ok(mid.rise > 0 && mid.rise < DAMAGE_NUMBER_RISE);
  assert.equal(mid.opacity, 1);
  assert.equal(mid.scale, 1);
  const late = damageFloat(DAMAGE_NUMBER_MS * 0.9);
  assert.ok(late.opacity > 0 && late.opacity < 0.5, 'fading out');
  assert.ok(late.rise > mid.rise, 'still going up');
  assert.equal(damageFloat(DAMAGE_NUMBER_MS).done, true);
  assert.equal(damageFloat(DAMAGE_NUMBER_MS).opacity, 0);
  assert.equal(damageFloat(500, { ms: 500 }).done, true, 'own duration');
});
