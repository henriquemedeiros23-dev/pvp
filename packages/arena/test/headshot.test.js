// Issue #45: a gun bullet in the top HEAD_ZONE (0.35 m) of a player is a headshot: HEADSHOT_BONUS (3) more damage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAG_CROUCH } from '@pvp/net-protocol';
import { chargingDamage } from '@pvp/game-rules';
import { makeArena, drain, msgs, RULES } from './helpers.js';

const READY = RULES.SPAWN_PROTECT_MS + 100;
const W = RULES.WEAPONS;
const MUZZLE = RULES.PLAYER_HEIGHT - 0.3; // a standing shooter's bullets start here (tuning muzzleDrop)
const HEAD = RULES.PLAYER_HEIGHT - 0.15;  // the middle of a standing player's head zone
const CHEST = 1;

// Attacker `a` at (0, 0) facing +z with [gun, <weapon>], victim `v` 5 m in front, looking back at `a`.
function setup({ weapon = 'dmgun', victimLoadout = [], rules, seed = 45 } = {}) {
  const arena = makeArena({ rules, seed });
  const a = arena.join('att', { name: 'Att', loadout: [weapon] }).id;
  const v = arena.join('vic', { name: 'Vic', loadout: victimLoadout }).id;
  arena.teleport(a, { x: 0, z: 0, ry: 0 });
  arena.teleport(v, { x: 0, z: 5, ry: Math.PI });
  arena.selectSlot(a, weapon === 'gun' ? 0 : 1);
  drain(arena);
  return { arena, a, v };
}
// Shoot at height `h` above the victim's feet (5 m away); returns the arena's messages.
function shootAt(arena, a, h, t) {
  assert.equal(arena.fire(a, [0, h - MUZZLE, 5], t), true);
  return drain(arena);
}
const hp = (arena, id) => arena.getPlayer(id).hp;

test('the same shot at the body and at the head: the head does +3', () => {
  for (const weapon of ['gun', 'dmgun', 'supergun', 'shootbm']) {
    const body = setup({ weapon });
    const outBody = shootAt(body.arena, body.a, CHEST, READY);
    assert.equal(hp(body.arena, body.v), 100 - W[weapon].dmg, `${weapon}: body`);
    assert.deepEqual(msgs(outBody, 'dmg', body.v), [{ t: 'dmg', id: body.v, amount: W[weapon].dmg }]);
    assert.deepEqual(msgs(outBody, 'hitmark', body.a), [{ t: 'hitmark', dead: false }]);

    const head = setup({ weapon });
    const outHead = shootAt(head.arena, head.a, HEAD, READY);
    assert.equal(hp(head.arena, head.v), 100 - W[weapon].dmg - RULES.HEADSHOT_BONUS, `${weapon}: head`);
    assert.deepEqual(msgs(outHead, 'dmg', head.v), [{ t: 'dmg', id: head.v, amount: W[weapon].dmg + 3, head: true }]);
    assert.deepEqual(msgs(outHead, 'hitmark', head.a), [{ t: 'hitmark', dead: false, head: true }]);
  }
});

test('the edge of the head zone: just under it is a body shot, just inside it a headshot', () => {
  const zoneBottom = RULES.PLAYER_HEIGHT - RULES.HEAD_ZONE;
  const under = setup({ weapon: 'shootbm', seed: 1 });
  // aim a bit lower: the Shootbm's tiny spread may move the bullet a few mm
  shootAt(under.arena, under.a, zoneBottom - 0.06, READY);
  assert.equal(hp(under.arena, under.v), 100 - W.shootbm.dmg);
  const inside = setup({ weapon: 'shootbm', seed: 1 });
  shootAt(inside.arena, inside.a, zoneBottom + 0.06, READY);
  assert.equal(hp(inside.arena, inside.v), 100 - W.shootbm.dmg - 3);
});

test('a weak (charging) headshot: 25% of the damage, then +3', () => {
  const { arena, a, v } = setup({ weapon: 'dmgun' });
  shootAt(arena, a, HEAD, READY); // full: 15 + 3
  assert.equal(hp(arena, v), 100 - 18);
  const out = shootAt(arena, a, HEAD, READY + 500); // still charging: chargingDamage(15) = 4, + 3
  const weak = chargingDamage(W.dmgun.dmg) + 3;
  assert.equal(weak, 7);
  assert.equal(hp(arena, v), 100 - 18 - weak);
  assert.deepEqual(msgs(out, 'dmg', v), [{ t: 'dmg', id: v, amount: weak, head: true }]);
});

test('a crouching player\'s head is lower: a shot at height 1 is a headshot, at 0.5 a body shot', () => {
  const crouch = (arena, v) => {
    const p = arena.getPlayer(v);
    arena.setState(v, { x: p.x, y: p.y, z: p.z, ry: p.ry, pitch: 0, f: FLAG_CROUCH }, READY - 50);
  };
  const h = setup({ weapon: 'dmgun' });
  crouch(h.arena, h.v);
  shootAt(h.arena, h.a, 1.0, READY);
  assert.equal(hp(h.arena, h.v), 100 - 18);
  const b = setup({ weapon: 'dmgun' });
  crouch(b.arena, b.v);
  shootAt(b.arena, b.a, 0.5, READY);
  assert.equal(hp(b.arena, b.v), 100 - 15);
  // over a crouching player's head: a miss
  const m = setup({ weapon: 'dmgun' });
  crouch(m.arena, m.v);
  shootAt(m.arena, m.a, HEAD, READY);
  assert.equal(hp(m.arena, m.v), 100);
});

test('swords never headshot', () => {
  const { arena, a, v } = setup({ weapon: 'electricsword' });
  arena.teleport(v, { x: 0, z: 2, ry: Math.PI });
  drain(arena);
  arena.fire(a, [0, 0, 1], READY); // a level swing (at head height) still does the normal damage
  const out = drain(arena);
  assert.equal(hp(arena, v), 100 - W.electricsword.dmg);
  assert.deepEqual(msgs(out, 'dmg', v), [{ t: 'dmg', id: v, amount: W.electricsword.dmg }]);
});

test('a raised shield still blocks a headshot; a Mega Shield reflects 25% of the normal damage (no bonus)', () => {
  const { arena, a, v } = setup({ weapon: 'dmgun', victimLoadout: ['megashield'] });
  arena.setShield(v, true, READY);
  const out = shootAt(arena, a, HEAD, READY);
  assert.equal(hp(arena, v), 100, 'blocked');
  assert.deepEqual(msgs(out, 'dmg', v), [
    { t: 'dmg', id: v, amount: 0, blocked: true },
    { t: 'dmg', id: a, amount: Math.round(W.dmgun.dmg * W.megashield.reflect) }, // 4 (with the bonus it would be 5)
  ]);
  assert.equal(hp(arena, a), 100 - 4);
  assert.deepEqual(msgs(out, 'hitmark', a), [{ t: 'hitmark', dead: false, blocked: true }]);
});

test('a headshot can knock out: the last HP, ko and head both set', () => {
  const { arena, a, v } = setup({ weapon: 'supergun' });
  for (let i = 0; i < 3; i++) shootAt(arena, a, HEAD, READY + i * 2000); // 3 x (25 + 3): 16 HP left
  assert.equal(hp(arena, v), 16);
  const out = shootAt(arena, a, HEAD, READY + 6000);
  assert.equal(arena.getPlayer(v), undefined);
  assert.deepEqual(msgs(out, 'dmg', a), [{ t: 'dmg', id: v, amount: 16, ko: true, head: true }]);
  assert.deepEqual(msgs(out, 'hitmark', a), [{ t: 'hitmark', dead: true, head: true }]);
});

test('the bonus and the zone come from the rules', () => {
  const rules = { ...RULES, HEADSHOT_BONUS: 10, HEAD_ZONE: 1 };
  const { arena, a, v } = setup({ weapon: 'gun', rules });
  shootAt(arena, a, CHEST, READY); // 1 m zone: the chest at 1 m is "head" now
  assert.equal(hp(arena, v), 100 - W.gun.dmg - 10);
  const off = setup({ weapon: 'gun', rules: { ...RULES, HEADSHOT_BONUS: 0 } });
  shootAt(off.arena, off.a, HEAD, READY);
  assert.equal(hp(off.arena, off.v), 100 - W.gun.dmg, 'bonus 0: no extra');
});

test('same seed, same shots: same result (deterministic)', () => {
  const run = () => {
    const { arena, a, v } = setup({ weapon: 'gun', seed: 9 });
    const res = [];
    for (let i = 0; i < 5; i++) {
      shootAt(arena, a, RULES.PLAYER_HEIGHT - RULES.HEAD_ZONE, READY + i * 2000); // right on the edge: the spread decides
      res.push(arena.getPlayer(v)?.hp);
    }
    return res;
  };
  assert.deepEqual(run(), run());
});
