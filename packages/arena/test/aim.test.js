// Issue #37: aiming with the Shootbm and the DM Gun (the aim bit 16 in the movement flags).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLAG_AIM, FLAG_MOVING } from '@pvp/net-protocol';
import { AIM_FLAG } from '../src/index.js';
import { makeArena, drain, msgs, RULES } from './helpers.js';

const READY = RULES.SPAWN_PROTECT_MS + 100;
const SHOOTBM = 1, DMGUN = 2, SUPERGUN = 3; // slots: the free Gun is slot 0

// Shooter `a` at (0, 0) looking along +z with [gun, shootbm, dmgun, supergun] and a shield;
// `b` far away (out of the line of fire).
function setup({ seed = 7, potions = 0 } = {}) {
  const arena = makeArena({ seed });
  const a = arena.join('a', { name: 'A', loadout: ['shootbm', 'dmgun', 'supergun', 'shield'], potions }).id;
  const b = arena.join('b', { name: 'B', loadout: ['icesword'] }).id;
  arena.teleport(a, { x: 0, z: 0, ry: 0 });
  arena.teleport(b, { x: -40, z: -40, ry: 0 });
  arena.selectSlot(a, SHOOTBM);
  drain(arena);
  return { arena, a, b };
}
// Tell the arena the aim button is (not) held: same place, only the flags change.
function aim(arena, id, on, t, extra = 0) {
  const p = arena.getPlayer(id);
  return arena.setState(id, { x: p.x, y: p.y, z: p.z, ry: p.ry, pitch: 0, f: (on ? FLAG_AIM : 0) | extra }, t);
}
// Where the shot's tracer ends, and how far that is from the straight line along +z (the spread).
function shoot(arena, a, t) {
  assert.equal(arena.fire(a, [0, 0, 1], t), true);
  const shot = msgs(drain(arena), 'shot').at(-1);
  const [x, y] = shot.to[0];
  return Math.hypot(x - shot.from[0], y - shot.from[1]);
}

test('the aim bit is the protocol\'s FLAG_AIM', () => {
  assert.equal(AIM_FLAG, FLAG_AIM);
  assert.equal(AIM_FLAG, 16);
});

test('aiming with the Shootbm: the numbers from its rules', () => {
  const { arena, a } = setup();
  assert.deepEqual(arena.aimState(a), { aiming: false, zoom: 1, spreadMul: 1, moveMul: 1 }, 'not aiming yet');
  assert.equal(aim(arena, a, true, READY), true);
  assert.deepEqual(arena.aimState(a), { aiming: true, ...RULES.WEAPONS.shootbm.aim });
  arena.selectSlot(a, DMGUN);
  assert.deepEqual(arena.aimState(a), { aiming: true, ...RULES.WEAPONS.dmgun.aim }, 'the DM Gun aims too');
  aim(arena, a, false, READY + 50);
  assert.equal(arena.aimState(a).aiming, false, 'let go of the button');
});

test('aiming is ignored with the Gun and the Supergun', () => {
  const { arena, a } = setup();
  aim(arena, a, true, READY);
  for (const slot of [0, SUPERGUN]) {
    arena.selectSlot(a, slot);
    assert.deepEqual(arena.aimState(a), { aiming: false, zoom: 1, spreadMul: 1, moveMul: 1 }, `slot ${slot}`);
  }
});

test('aimed shots are more accurate: spread * spreadMul (same seed, same random numbers)', () => {
  const plain = setup({ seed: 11 });
  const aimed = setup({ seed: 11 });
  aim(aimed.arena, aimed.a, true, READY);
  aim(plain.arena, plain.a, false, READY);
  const off = shoot(plain.arena, plain.a, READY + 10);
  const offAimed = shoot(aimed.arena, aimed.a, READY + 10);
  assert.ok(off > 0.05, `the plain shot spreads a bit: ${off}`);
  const mul = RULES.WEAPONS.shootbm.aim.spreadMul;
  assert.ok(Math.abs(offAimed - off * mul) < 0.02, `aimed ${offAimed} is about ${mul} x ${off}`);
});

test('the Gun shoots the same with or without the aim bit', () => {
  const plain = setup({ seed: 5 });
  const aimed = setup({ seed: 5 });
  for (const s of [plain, aimed]) s.arena.selectSlot(s.a, 0);
  aim(aimed.arena, aimed.a, true, READY);
  assert.equal(shoot(aimed.arena, aimed.a, READY + 10), shoot(plain.arena, plain.a, READY + 10));
});

test('no aiming while the shield is raised', () => {
  const { arena, a } = setup();
  aim(arena, a, true, READY);
  arena.setShield(a, true, READY);
  assert.equal(arena.aimState(a).aiming, false);
  arena.setShield(a, false, READY + 10);
  assert.equal(arena.aimState(a).aiming, true, 'shield down: aiming again');
});

test('no aiming while drinking a potion', () => {
  const { arena, a, b } = setup({ potions: 1 });
  // get hurt first (a potion needs missing H.P): b shoots a with the free Gun from close by
  arena.teleport(b, { x: 0, z: 3, ry: Math.PI });
  arena.selectSlot(b, 0);
  const pa = arena.getPlayer(a);
  assert.equal(arena.fire(b, [0, pa.y + 1 - (RULES.PLAYER_HEIGHT - 0.3), -3], READY), true);
  assert.ok(arena.getPlayer(a).hp < RULES.MAX_HP);
  aim(arena, a, true, READY + 10);
  assert.equal(arena.aimState(a).aiming, true);
  assert.equal(arena.drink(a, READY + 20), true);
  assert.equal(arena.aimState(a).aiming, false, 'busy drinking');
});

test('no aiming while frozen', () => {
  const { arena, a, b } = setup();
  aim(arena, a, true, READY);
  // b hits a with the Ice Sword from behind (a looks along +z, b stands at -z)
  arena.teleport(b, { x: 0, z: -1.5, ry: 0 });
  arena.selectSlot(b, 1);
  assert.equal(arena.fire(b, [0, 0, 1], READY + 10), true);
  assert.equal(arena.isFrozen(a), true);
  assert.equal(arena.aimState(a).aiming, false);
  arena.tick(READY + 10 + RULES.WEAPONS.icesword.freezeMs + 1);
  assert.equal(arena.aimState(a).aiming, true, 'the ice is gone: aiming again (the button is still held)');
});

test('others see the aim bit in the snapshot only while really aiming', () => {
  const { arena, a, b } = setup();
  const flagsOf = () => arena.snapshotFor(b).p.find(e => e[0] === a)[6];
  aim(arena, a, true, READY, FLAG_MOVING);
  assert.equal(flagsOf(), FLAG_AIM | FLAG_MOVING);
  arena.selectSlot(a, 0); // the Gun cannot aim
  assert.equal(flagsOf(), FLAG_MOVING, 'aim bit hidden');
});
