import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs, RULES } from './helpers.js';

test('join gives the basic weapon plus the loadout, and sends welcome, inv, pjoin', () => {
  const arena = makeArena();
  const a = arena.join('ann', { name: 'Ann', loadout: ['rocket', 'pistol', 'nope', 'rocket'], coins: 30 });
  assert.equal(a.ok, true);
  assert.deepEqual(a.weapons, ['rocket', 'pistol']);
  const out = drain(arena);
  assert.equal(msgs(out, 'welcome', a.id)[0].id, a.id);
  assert.deepEqual(msgs(out, 'inv', a.id)[0].weapons, [RULES.BASIC_WEAPON, 'rocket', 'pistol']);
  assert.equal(msgs(out, 'inv', a.id)[0].coins, 30);
  const pj = out.find(e => e.msg?.t === 'pjoin');
  assert.equal(pj.to, 'all');
  assert.equal(pj.except, a.id);
  assert.equal(arena.playerCount(), 1);
});

test('loadout is capped at MAX_SLOTS', () => {
  const arena = makeArena();
  const a = arena.join('ann', { loadout: ['sword', 'bat', 'spear', 'axe', 'pistol', 'rifle'] });
  assert.equal(a.weapons.length, RULES.MAX_SLOTS - 1);
  assert.equal(arena.getPlayer(a.id).weapons.length, RULES.MAX_SLOTS);
});

test('arena full refuses, and joining again replaces the old player', () => {
  const arena = makeArena({ rules: { ...RULES, MAX_PLAYERS: 2 } });
  const a = arena.join('a', { loadout: ['pistol'] });
  arena.join('b', {});
  assert.deepEqual(arena.join('c', {}), { ok: false, reason: 'full' });
  const again = arena.join('a', {});
  assert.equal(again.ok, true);
  assert.deepEqual(again.replaced, { id: a.id, weapons: ['pistol'] });
  assert.equal(arena.playerCount(), 2);
  assert.equal(arena.idOf('a'), again.id);
});

test('leaving alive returns weapons; leaving not alive returns none', () => {
  const arena = makeArena();
  const a = arena.join('a', { loadout: ['rocket', 'pistol'] });
  const b = arena.join('b', { loadout: ['sniper'] });
  drain(arena);
  assert.deepEqual(arena.leave(a.id, { alive: true }), ['rocket', 'pistol']);
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

test('slot switch and heal', () => {
  const arena = makeArena();
  const a = arena.join('a', { loadout: ['pistol'] });
  assert.equal(arena.selectSlot(a.id, 1), true);
  assert.equal(arena.selectSlot(a.id, 2), false);
  assert.equal(arena.heal(a.id, 'bandage', 100), false); // full health
  assert.equal(arena.getPlayer(a.id).slot, 1);
});
