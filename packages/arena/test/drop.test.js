// Issue #34: a melee swing at the air costs no durability; dropping the weapon in your hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs, RULES } from './helpers.js';

const READY = RULES.SPAWN_PROTECT_MS + 100;

function holder(loadout, victimAt) {
  const arena = makeArena();
  const id = arena.join('a', { loadout }).id;
  arena.selectSlot(id, 1);
  arena.teleport(id, { x: 0, z: 0, ry: 0 });
  let v = null;
  if (victimAt) { v = arena.join('v', { loadout: ['shield'] }).id; arena.teleport(v, { x: victimAt[0], z: victimAt[1], ry: Math.PI }); }
  drain(arena);
  return { arena, id, v };
}
const dur = (arena, id) => arena.getPlayer(id).dur[1];

test('a melee swing that hits nothing costs no durability; a hit on a player does', () => {
  const { arena, id, v } = holder(['icesword'], [30, 30]); // the other player is far away
  assert.equal(arena.fire(id, [0, 0, 1], READY), true, 'it still swings (and waits for the next swing)');
  assert.deepEqual(msgs(drain(arena), 'swing'), [{ t: 'swing', id }]);
  assert.equal(dur(arena, id), 50);
  assert.equal(arena.fire(id, [0, 0, 1], READY + 100), false, 'the anti-spam gap (150 ms) still counts');
  arena.teleport(v, { x: 0, z: 2 });
  arena.fire(id, [0, 0, 1], READY + 3000);
  assert.equal(arena.getPlayer(v).hp, 90);
  assert.equal(dur(arena, id), 49);
});

test('a melee hit on a raised shield uses durability (and the Supersword still costs the shield 5)', () => {
  const { arena, id, v } = holder(['supersword'], [0, 2]);
  arena.setShield(v, true, READY);
  arena.fire(id, [0, 0, 1], READY);
  assert.equal(arena.getPlayer(v).hp, 100);
  assert.equal(arena.getPlayer(v).shield.dur, 55);
  assert.equal(dur(arena, id), 39);
});

test('guns still use durability on every shot, hit or miss', () => {
  const { arena, id } = holder(['shootbm']);
  arena.fire(id, [0, 1, 0], READY); // at the sky
  assert.equal(dur(arena, id), 19);
});

test('drop the weapon in your hand: exact durability on the ground, inv updated, anyone can pick it up', () => {
  // test-only Ice Sword: 20 hits, 1 damage, so the target stays in while we wear it down
  const rules = { ...RULES, WEAPONS: { ...RULES.WEAPONS, icesword: { ...RULES.WEAPONS.icesword, durability: 20, dmg: 1, freezeMs: 1 } } };
  const arena = makeArena({ rules });
  const id = arena.join('a', { loadout: ['icesword', 'shootbm'] }).id;
  const v = arena.join('v', {}).id;
  arena.selectSlot(id, 1);
  arena.teleport(id, { x: 0, z: 0, ry: 0 });
  arena.teleport(v, { x: 0, z: 2 });
  let t = READY;
  for (let i = 0; i < 12; i++, t += 3000) arena.fire(id, [0, 0, 1], t);
  const left = dur(arena, id);
  assert.equal(left, 8, '8 of 20: less than half, a knockout drop would make it 10');
  arena.teleport(v, { x: 40, z: 40 });
  drain(arena);
  const itemId = arena.dropWeapon(id, t);
  assert.equal(typeof itemId, 'number');
  const out = drain(arena);
  const drop = msgs(out, 'item+')[0];
  assert.deepEqual([drop.id, drop.weapon, drop.dur], [itemId, 'icesword', left], 'exact durability, no half rule');
  const inv = msgs(out, 'inv', id).at(-1);
  assert.deepEqual(inv.weapons, ['gun', 'shootbm']);
  assert.equal(inv.slot, 1, 'the hand moves to the next weapon in the same slot number');
  // standing on it: not picked straight back up
  arena.tick(t + 100);
  assert.equal(arena.items().length, 1);
  // someone else walks over it and gets it with the same durability
  const b = arena.join('b', {}).id;
  arena.teleport(b, { x: drop.x, z: drop.z });
  arena.tick(t + 200);
  const binv = msgs(drain(arena), 'inv', b).at(-1);
  assert.deepEqual(binv.weapons, ['gun', 'icesword']);
  assert.equal(binv.picked, 'Ice Sword');
  assert.deepEqual(binv.dur, [15, left]);
});

test('you can pick your dropped weapon up again after stepping away; nothing in hand = nothing to drop', () => {
  const { arena, id } = holder(['shootbm']);
  arena.fire(id, [0, 1, 0], READY);
  const itemId = arena.dropWeapon(id, READY + 10);
  const it = arena.items().find(i => i.id === itemId);
  arena.tick(READY + 100);
  assert.equal(arena.items().length, 1, 'not while standing on it');
  arena.teleport(id, { x: 20, z: 20 });
  arena.tick(READY + 200);
  arena.teleport(id, { x: it.x, z: it.z });
  arena.tick(READY + 300);
  assert.equal(arena.items().length, 0);
  assert.deepEqual(arena.getPlayer(id).weapons, ['gun', 'shootbm']);
  assert.deepEqual(arena.getPlayer(id).dur, [15, 19]);
  // empty hands
  const e = makeArena({ rules: { ...RULES, STARTING_WEAPON: undefined } });
  const eid = e.join('e', {}).id;
  assert.equal(e.dropWeapon(eid), null);
  assert.equal(e.dropWeapon(999), null);
});

test('the free starting Gun can be dropped, and stays free (it never goes into a backpack)', () => {
  const { arena, id } = holder([]);
  arena.selectSlot(id, 0);
  const itemId = arena.dropWeapon(id, READY);
  assert.deepEqual(arena.getPlayer(id).weapons, []);
  const it = arena.items().find(i => i.id === itemId);
  assert.equal(it.dur, 15);
  const b = arena.join('b', {}).id;
  arena.teleport(b, { x: it.x, z: it.z });
  arena.tick(READY + 100);
  assert.deepEqual(arena.getPlayer(b).weapons, ['gun', 'gun']);
  assert.deepEqual(arena.leave(b, { alive: true }), [], 'neither Gun goes into the backpack');
  assert.deepEqual(arena.leave(id, { alive: true }), []);
});

test('no dropping while frozen; drop is deterministic', () => {
  const run = () => {
    const { arena, id } = holder(['icesword', 'shootbm']);
    const c = arena.join('c', { loadout: ['icesword'] }).id;
    arena.selectSlot(c, 1);
    arena.teleport(c, { x: 0, z: -2, ry: 0 });
    arena.fire(c, [0, 0, 1], READY); // freezes a
    const frozenDrop = arena.dropWeapon(id, READY + 10);
    arena.tick(READY + 2100);
    const later = arena.dropWeapon(id, READY + 2200);
    return { frozenDrop, later, out: JSON.stringify(drain(arena)) };
  };
  const one = run();
  assert.equal(one.frozenDrop, null);
  assert.equal(typeof one.later, 'number');
  assert.deepEqual(run(), one);
});
