import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateIsland } from '@pvp/world-gen';
import { createRandom } from '@pvp/seeded-random';
import { createArena } from '../src/index.js';
import { makeArena, drain, msgs } from './helpers.js';

test('snapshot only includes players within 160 m (and yourself)', () => {
  const arena = makeArena();
  const a = arena.join('a', {}).id, b = arena.join('b', {}).id, c = arena.join('c', {}).id;
  arena.teleport(a, { x: 0, z: -100 });
  arena.teleport(b, { x: 0, z: 50 });   // 150 m away
  arena.teleport(c, { x: 0, z: 70 });   // 170 m away
  const snap = arena.snapshotFor(a);
  assert.deepEqual(snap.p.map(e => e[0]).sort(), [a, b].sort());
  assert.equal(snap.n, 3);
  assert.equal(snap.p.find(e => e[0] === a)[9], 1, 'still protected');
});

test('tick queues a snap for every player when snapshots are on', () => {
  const arena = createArena({ island: generateIsland(), random: createRandom(1), now: 0 });
  const a = arena.join('a', {}).id;
  arena.join('b', {});
  drain(arena);
  arena.tick(50);
  const snaps = drain(arena).filter(e => e.msg?.t === 'snap');
  assert.equal(snaps.length, 2);
  assert.ok(snaps.some(e => e.to === a));
});

// A scripted fight on the real island: chests, guns, grenades, rockets, mines, knockouts.
function replay(seed) {
  const island = generateIsland();
  const arena = createArena({ island, random: createRandom(seed), now: 1000 });
  const log = [];
  const keep = () => log.push(...drain(arena));
  const ids = ['ann', 'bob', 'cat', 'dan'].map((k, i) =>
    arena.join(k, { name: k, loadout: [['shotgun', 'grenade'], ['rocket', 'rifle'], ['mine', 'sniper'], ['pistol']][i] }, 1000 + i).id);
  keep();
  const c = island.chests[0];
  ids.forEach((id, i) => arena.teleport(id, { x: c.x + 1 + i * 2, z: c.z, ry: i }));
  for (let t = 1050, step = 0; t <= 75000; t += 50, step++) {
    const id = ids[step % ids.length];
    if (step % 7 === 0) arena.openChest(id, step % 3, t);
    if (step % 5 === 0) { arena.selectSlot(id, step % 3); arena.fire(id, [Math.sin(step), -0.1, Math.cos(step)], t); }
    if (step % 11 === 0) arena.heal(id, 'bandage', t);
    if (step % 3 === 0) {
      const p = arena.getPlayer(id);
      if (p) arena.setState(id, { x: p.x + 0.2, y: 0, z: p.z, ry: step / 10, pitch: 0, f: 4 }, t);
    }
    if (step === 1200) arena.openChest(ids[0], 'golden', t);
    arena.tick(t);
    keep();
  }
  return log;
}

test('replay: same seed and inputs give an identical outbox', () => {
  const one = replay(7), two = replay(7);
  assert.ok(msgs(one, 'ko').length > 0, 'knockouts happened');
  assert.ok(one.length > 1000);
  assert.ok(msgs(one, 'boom').length > 0, 'explosions happened');
  assert.ok(msgs(one, 'chest').length > 0, 'chests opened');
  assert.deepEqual(two, one);
  assert.notDeepEqual(replay(8), one, 'another seed gives another fight');
});
