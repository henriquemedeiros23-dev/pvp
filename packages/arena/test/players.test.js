import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs, RULES } from './helpers.js';

test('join gives the starting Gun plus the loadout, and sends welcome, inv, pjoin', () => {
  const arena = makeArena();
  const a = arena.join('ann', { name: 'Ann', loadout: ['icesword', 'shootbm', 'nope', 'icesword'], coins: 30 });
  assert.equal(a.ok, true);
  assert.deepEqual(a.weapons, ['icesword', 'shootbm', 'icesword'], 'copies are fine, unknown ids are skipped');
  const out = drain(arena);
  assert.equal(msgs(out, 'welcome', a.id)[0].id, a.id);
  assert.deepEqual(msgs(out, 'inv', a.id)[0].weapons, ['gun', 'icesword', 'shootbm', 'icesword']);
  assert.equal(msgs(out, 'inv', a.id)[0].coins, 30);
  const pj = out.find(e => e.msg?.t === 'pjoin');
  assert.equal(pj.to, 'all');
  assert.equal(pj.except, a.id);
  assert.equal(arena.playerCount(), 1);
});

test('loadout is capped at MAX_SLOTS', () => {
  const arena = makeArena();
  const a = arena.join('ann', { loadout: ['shootbm', 'shootbm', 'icesword', 'icesword', 'electricsword', 'supersword'] });
  assert.equal(a.weapons.length, RULES.MAX_SLOTS - 1);
  assert.equal(arena.getPlayer(a.id).weapons.length, RULES.MAX_SLOTS);
});

test('arena full refuses, and joining again replaces the old player', () => {
  const arena = makeArena({ rules: { ...RULES, MAX_PLAYERS: 2 } });
  const a = arena.join('a', { loadout: ['shootbm'], potions: 2 });
  arena.join('b', {});
  assert.deepEqual(arena.join('c', {}), { ok: false, reason: 'full' });
  const again = arena.join('a', {});
  assert.equal(again.ok, true);
  assert.deepEqual(again.replaced, { id: a.id, weapons: ['shootbm'], potions: 2 }, 'unused potions go back too');
  assert.equal(arena.playerCount(), 2);
  assert.equal(arena.idOf('a'), again.id);
});

test('leaving alive returns weapons; leaving not alive returns none', () => {
  const arena = makeArena();
  const a = arena.join('a', { loadout: ['icesword', 'shootbm'] });
  const b = arena.join('b', { loadout: ['supersword'] });
  drain(arena);
  assert.deepEqual(arena.leave(a.id, { alive: true }), ['icesword', 'shootbm']);
  assert.deepEqual(msgs(drain(arena), 'pleave'), [{ t: 'pleave', id: a.id }]);
  assert.deepEqual(arena.leave(b.id, { alive: false }), []);
  assert.deepEqual(arena.leave(b.id), []); // already gone
  assert.equal(arena.playerCount(), 0);
});

test('anti-teleport: a too-big jump is refused with a pos correction', () => {
  const arena = makeArena();
  const a = arena.join('a', {});
  arena.teleport(a.id, { x: 0, z: 0 });
  drain(arena);
  assert.equal(arena.setState(a.id, { x: 1, y: 0, z: 0, ry: 0.5, pitch: 0, f: 0 }, 50), true);
  assert.equal(arena.getPlayer(a.id).x, 1);
  assert.equal(arena.setState(a.id, { x: 40, y: 0, z: 0, ry: 0, pitch: 0, f: 0 }, 100), false);
  assert.deepEqual(msgs(drain(arena), 'pos', a.id), [{ t: 'pos', x: 1, y: 0, z: 0 }]);
  assert.equal(arena.getPlayer(a.id).x, 1);
});

test('slot switch; drinking is refused at full health or without a potion', () => {
  const arena = makeArena();
  const a = arena.join('a', { loadout: ['shootbm'], potions: 1 });
  assert.equal(arena.selectSlot(a.id, 1), true);
  assert.equal(arena.selectSlot(a.id, 2), false);
  assert.equal(arena.drink(a.id, 100), false); // full health
  assert.equal(arena.getPlayer(a.id).potions, 1);
  assert.equal(arena.getPlayer(a.id).slot, 1);
  const b = arena.join('b', {});
  assert.equal(arena.getPlayer(b.id).potions, 0, 'no free potions: they come from the backpack or chests');
  assert.equal(arena.drink(b.id, 100), false);
  assert.equal(arena.heal, undefined, 'no bandages or medkits any more');
});

test('a bought Gun goes into slot 2 next to the free one; only the bought copy goes back on leave', () => {
  const arena = makeArena();
  const a = arena.join('a', { loadout: ['gun', 'shootbm'] });
  assert.deepEqual(a.weapons, ['gun', 'shootbm']);
  assert.deepEqual(arena.getPlayer(a.id).weapons, ['gun', 'gun', 'shootbm']);
  assert.deepEqual(arena.getPlayer(a.id).free, [true, false, false]);
  assert.deepEqual(arena.leave(a.id, { alive: true }), ['gun', 'shootbm']);
});

test('copies of a weapon have their own durability; breaking the free Gun keeps the bought one', () => {
  const arena = makeArena();
  const id = arena.join('a', { loadout: ['gun'] }).id;
  arena.teleport(id, { x: 0, z: 0 });
  let t = RULES.SPAWN_PROTECT_MS + 100;
  for (let i = 0; i < 15; i++, t += 2000) assert.equal(arena.fire(id, [0, 1, 0], t), true); // slot 1: the free Gun
  const p = arena.getPlayer(id);
  assert.deepEqual(p.weapons, ['gun'], 'the free Gun broke, the bought one is left');
  assert.deepEqual(p.dur, [15], 'the bought Gun was never used');
  assert.deepEqual(arena.leave(id, { alive: true }), ['gun'], 'the bought Gun goes back to the backpack');
});

test('join works with rules that have no starting weapon', () => {
  const arena = makeArena({ rules: { ...RULES, STARTING_WEAPON: undefined } });
  const a = arena.join('a', { loadout: ['shootbm'] });
  assert.deepEqual(a.weapons, ['shootbm']);
  assert.deepEqual(arena.getPlayer(a.id).weapons, ['shootbm']);
  assert.deepEqual(arena.leave(a.id, { alive: true }), ['shootbm']);
});
