// Headshots (#45): +3 damage for a gun bullet in the top HEAD_ZONE meters of a player.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEADSHOT_BONUS, HEAD_ZONE, isHeadshot, headshotDamage, chargingDamage, validateRules, RULES, PLAYER_HEIGHT, CROUCH_HEIGHT,
} from '../src/index.js';

test('headshots: +3 damage in the top 0.35 m of the body, in RULES too', () => {
  assert.equal(HEADSHOT_BONUS, 3);
  assert.equal(HEAD_ZONE, 0.35);
  assert.equal(RULES.HEADSHOT_BONUS, 3);
  assert.equal(RULES.HEAD_ZONE, 0.35);
  assert.ok(HEAD_ZONE < CROUCH_HEIGHT, 'a crouching player still has a body under the head');
});

test('isHeadshot: the top HEAD_ZONE meters of the body (edges count), standing and crouching', () => {
  const H = PLAYER_HEIGHT;
  assert.equal(isHeadshot(1.7, H), true);
  assert.equal(isHeadshot(H, H), true, 'the very top');
  assert.equal(isHeadshot(H - HEAD_ZONE, H), true, 'the bottom edge of the zone');
  assert.equal(isHeadshot(H - HEAD_ZONE - 0.01, H), false, 'just under the chin');
  assert.equal(isHeadshot(1.0, H), false, 'the chest');
  assert.equal(isHeadshot(H + 0.1, H), false, 'over the head');
  assert.equal(isHeadshot(1.0, CROUCH_HEIGHT), true, 'a crouching head is lower');
  assert.equal(isHeadshot(1.0, H, 0.9), true, 'own zone');
  for (const bad of [NaN, undefined, '1.7', null]) assert.equal(isHeadshot(bad, H), false);
  assert.equal(isHeadshot(1.7, H, 0), false, 'no zone, no headshot');
});

test('headshotDamage: the damage plus the bonus (after the 25% charging cut)', () => {
  assert.equal(headshotDamage(2), 5, 'Gun: 2 + 3');
  assert.equal(headshotDamage(15), 18, 'DM Gun');
  assert.equal(headshotDamage(chargingDamage(15)), 7, 'charging DM Gun: 4 + 3');
  assert.equal(headshotDamage(2, 10), 12, 'own bonus');
  assert.equal(headshotDamage(2, -1), 2, 'a negative bonus counts as 0');
  assert.equal(headshotDamage(NaN), 3);
});

test('validateRules checks HEADSHOT_BONUS and HEAD_ZONE', () => {
  assert.deepEqual(validateRules({ ...RULES, HEADSHOT_BONUS: 1.5 }), ['HEADSHOT_BONUS must be a whole number >= 0']);
  assert.deepEqual(validateRules({ ...RULES, HEADSHOT_BONUS: 0 }), []);
  assert.deepEqual(validateRules({ ...RULES, HEAD_ZONE: 0 }), ['HEAD_ZONE must be a number > 0 (meters)']);
  assert.deepEqual(validateRules({ ...RULES, HEAD_ZONE: 1.2 }), ['HEAD_ZONE must be smaller than the player (1.2 m when crouching)']);
  const without = structuredClone(RULES);
  delete without.HEADSHOT_BONUS;
  delete without.HEAD_ZONE;
  assert.deepEqual(validateRules(without), [], 'optional');
});
