// Headshots (#45): an orange '-8' with a 'HEADSHOT' badge, and a bigger orange hit marker for the shooter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { damageNumber, hitMarker, HEADSHOT_MARKER_SCALE, DAMAGE_COLORS } from '../src/index.js';

test('damageNumber: a headshot is orange with the badge HEADSHOT', () => {
  assert.deepEqual(damageNumber({ t: 'dmg', id: 3, amount: 8, head: true }),
    { id: 3, text: '-8', badge: 'HEADSHOT', kind: 'head', color: DAMAGE_COLORS.head });
  assert.equal(DAMAGE_COLORS.head, '#ff8a1f');
  for (const k of ['hit', 'shock', 'ko', 'blocked']) assert.notEqual(DAMAGE_COLORS.head, DAMAGE_COLORS[k], `differs from ${k}`);
});

test('damageNumber: a headshot knockout stays gold, badge HEADSHOT KO!; a blocked one just says Blocked', () => {
  assert.deepEqual(damageNumber({ t: 'dmg', id: 3, amount: 16, ko: true, head: true }),
    { id: 3, text: '-16', badge: 'HEADSHOT KO!', kind: 'ko', color: DAMAGE_COLORS.ko });
  assert.deepEqual(damageNumber({ t: 'dmg', id: 3, amount: 0, blocked: true, head: true }),
    { id: 3, text: 'Blocked', badge: '', kind: 'blocked', color: DAMAGE_COLORS.blocked });
  // without head nothing changes
  assert.equal(damageNumber({ t: 'dmg', id: 3, amount: 5 }).kind, 'hit');
});

test('hitMarker: white hit, gold KO, blue blocked, bigger orange headshot', () => {
  assert.deepEqual(hitMarker({ t: 'hitmark', dead: false }), { kind: 'hit', scale: 1, color: '#ffffff' });
  assert.deepEqual(hitMarker({ t: 'hitmark', dead: true }), { kind: 'ko', scale: 1, color: DAMAGE_COLORS.ko });
  assert.deepEqual(hitMarker({ t: 'hitmark', dead: false, blocked: true }), { kind: 'blocked', scale: 1, color: DAMAGE_COLORS.blocked });
  assert.deepEqual(hitMarker({ t: 'hitmark', dead: false, head: true }), { kind: 'head', scale: HEADSHOT_MARKER_SCALE, color: DAMAGE_COLORS.head });
  assert.deepEqual(hitMarker({ t: 'hitmark', dead: true, head: true }), { kind: 'ko', scale: HEADSHOT_MARKER_SCALE, color: DAMAGE_COLORS.ko });
  assert.ok(HEADSHOT_MARKER_SCALE > 1);
  assert.equal(hitMarker({ t: 'dmg' }), null);
  assert.equal(hitMarker(null), null);
});
