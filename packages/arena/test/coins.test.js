import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs } from './helpers.js';

test('setCoins updates the coins and queues an inv with the new total', () => {
  const arena = makeArena();
  const a = arena.join('ann', { coins: 30, loadout: ['pistol'] });
  drain(arena);
  arena.selectSlot(a.id, 1);
  drain(arena);
  assert.equal(arena.setCoins(a.id, 5), true);
  assert.equal(arena.getPlayer(a.id).coins, 5);
  const out = drain(arena);
  assert.equal(out.length, 1);
  assert.equal(msgs(out, 'inv', a.id)[0].coins, 5);
  // the next inv (after a pistol shot) also carries the new total
  arena.fire(a.id, [1, 0, 0], 1000);
  const later = msgs(drain(arena), 'inv', a.id);
  assert.ok(later.length > 0);
  assert.ok(later.every(m => m.coins === 5));
});

test('setCoins ignores an unknown id or a bad total', () => {
  const arena = makeArena();
  const a = arena.join('ann', { coins: 30 });
  drain(arena);
  assert.equal(arena.setCoins(999, 10), false);
  assert.equal(arena.setCoins(a.id, -1), false);
  assert.equal(arena.setCoins(a.id, 1.5), false);
  assert.equal(arena.setCoins(a.id, '7'), false);
  assert.deepEqual(drain(arena), []);
  assert.equal(arena.getPlayer(a.id).coins, 30);
});

test('setCoins is deterministic', () => {
  const run = () => {
    const arena = makeArena({ seed: 7 });
    const a = arena.join('ann', { coins: 30 });
    arena.setCoins(a.id, 12);
    arena.tick(500);
    arena.setCoins(a.id, 0);
    return JSON.stringify(drain(arena));
  };
  assert.equal(run(), run());
});
