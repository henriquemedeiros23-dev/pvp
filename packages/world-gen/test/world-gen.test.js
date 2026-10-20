import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '@pvp/seeded-random';
import { circleHitsBox } from '@pvp/collision';
import {
  generateIsland, findSpawn, validateIsland, DEFAULT_SEED, ISLAND_RADIUS, PLAY_RADIUS, CHEST_RADIUS,
} from '../src/index.js';
import { generateWorld } from '../../../apps/game/shared/world.js';

const plain = island => ({ boxes: island.boxes, chests: island.chests, goldenSpots: island.goldenSpots });

test('default seed reproduces the old map from apps/game exactly', () => {
  const old = generateWorld();
  const island = generateIsland();
  assert.equal(island.seed, DEFAULT_SEED);
  assert.equal(island.islandRadius, ISLAND_RADIUS);
  assert.equal(island.playRadius, PLAY_RADIUS);
  assert.deepEqual(island.boxes, old.boxes);
  assert.deepEqual(island.chests, old.chests);
  assert.deepEqual(island.goldenSpots, old.goldenSpots);
  assert.ok(island.boxes.length > 300, 'the map is not empty');
});

test('same seed twice gives an identical island', () => {
  for (const seed of [1, 42, 'island-1']) {
    assert.deepEqual(plain(generateIsland({ seed })), plain(generateIsland({ seed })));
  }
});

test('different seeds give different islands', () => {
  assert.notDeepEqual(plain(generateIsland({ seed: 1 })), plain(generateIsland({ seed: 2 })));
  assert.notDeepEqual(plain(generateIsland({ seed: 1 })), plain(generateIsland()));
});

test('validateIsland finds no problems for seeds 1..20 and the default seed', () => {
  assert.deepEqual(validateIsland(generateIsland()), []);
  for (let seed = 1; seed <= 20; seed++) {
    assert.deepEqual(validateIsland(generateIsland({ seed })), [], `seed ${seed}`);
  }
});

test('validateIsland reports each kind of problem', () => {
  const boxes = [
    { id: 0, x: 0, z: 0, w: 4, d: 4, h: 2, y: 0, kind: 'wall' },
    { id: 0, x: 300, z: 0, w: 2, d: 2, h: 2, y: 0, kind: 'rubble' },
  ];
  const chests = [{ id: 0, x: 0.5, z: 0 }, { id: 0, x: 50, z: 50 }];
  const goldenSpots = [{ x: 0, z: 1 }];
  const types = validateIsland({ islandRadius: 210, boxes, chests, goldenSpots }).map(p => p.type).sort();
  assert.deepEqual(types, [
    'box-outside-island', 'chest-inside-box', 'duplicate-box-id', 'duplicate-chest-id', 'golden-spot-inside-box',
  ]);
});

test('every chest has free room around it (not inside a box)', () => {
  for (const seed of [DEFAULT_SEED, 3, 7, 'x']) {
    const island = generateIsland({ seed });
    assert.ok(island.chests.length > 50);
    for (const c of island.chests) {
      const blocked = island.boxes.some(b => circleHitsBox(c.x, c.z, CHEST_RADIUS, b));
      assert.equal(blocked, false, `seed ${seed} chest ${c.id}`);
      assert.ok(Math.hypot(c.x, c.z) < island.playRadius, 'chest is inside the play area');
    }
    island.chests.forEach((c, i) => assert.equal(c.id, i));
    island.boxes.forEach((b, i) => assert.equal(b.id, i));
  }
});

test('golden spots are never inside a box', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const island = generateIsland({ seed });
    for (const g of island.goldenSpots) {
      assert.ok(!island.boxes.some(b => b.x - b.w / 2 < g.x && g.x < b.x + b.w / 2
        && b.z - b.d / 2 < g.z && g.z < b.z + b.d / 2), `seed ${seed}`);
    }
  }
});

test('the grid finds the island boxes', () => {
  const island = generateIsland();
  assert.equal(island.grid.boxes.length, island.boxes.length);
  const tower = island.boxes.find(b => b.kind === 'tower');
  assert.ok(island.grid.near(tower.x, tower.z, 0).includes(tower));
});

test('findSpawn is deterministic with the same random seed', () => {
  const island = generateIsland();
  const occupied = [{ x: 50, z: 50 }, { x: -80, z: 10 }];
  const a = findSpawn(island, occupied, createRandom(7));
  const b = findSpawn(island, occupied, createRandom(7).next);
  assert.deepEqual(a, b);
  const r1 = createRandom(9), r2 = createRandom(9);
  for (let i = 0; i < 10; i++) assert.deepEqual(findSpawn(island, [], r1), findSpawn(island, [], r2));
});

test('findSpawn keeps away from boxes and occupied spots', () => {
  const island = generateIsland();
  const random = createRandom('spawns');
  const occupied = [];
  for (let i = 0; i < 20; i++) {
    const p = findSpawn(island, occupied, random);
    assert.ok(!island.boxes.some(b => circleHitsBox(p.x, p.z, 1.5, b)), 'not inside a box');
    assert.ok(Math.hypot(p.x, p.z) <= island.playRadius, 'inside the play area');
    for (const o of occupied) assert.ok(Math.hypot(o.x - p.x, o.z - p.z) >= 25, 'far from others');
    occupied.push(p);
  }
  const close = findSpawn(island, [{ x: 0, z: 0 }], createRandom(1), { minDistanceFromOthers: 60 });
  assert.ok(Math.hypot(close.x, close.z) >= 60);
});

test('findSpawn needs a seeded random', () => {
  assert.throws(() => findSpawn(generateIsland(), []), TypeError);
});

test('options change what gets built', () => {
  const kinds = island => island.boxes.reduce((m, b) => ((m[b.kind] = (m[b.kind] || 0) + 1), m), {});

  const empty = generateIsland({ plaza: false, houses: 0, towers: 0, colonnades: 0, brokenWalls: 0, rocks: 0, openChests: 0 });
  assert.deepEqual(empty.boxes, []);
  assert.deepEqual(empty.chests, []);
  assert.deepEqual(empty.goldenSpots, []);

  const towersOnly = generateIsland({ plaza: false, houses: 0, towers: 7, colonnades: 0, brokenWalls: 0, rocks: 0, openChests: 0 });
  assert.equal(kinds(towersOnly).tower, 7);
  assert.equal(towersOnly.goldenSpots.length, 3); // towers 0, 3, 6

  const chestsOnly = generateIsland({ houses: 0, towers: 0, colonnades: 0, brokenWalls: 0, rocks: 0, openChests: 25 });
  assert.equal(chestsOnly.chests.length, 25);
  assert.equal(kinds(chestsOnly).pillar, 12); // the plaza
  assert.deepEqual(chestsOnly.goldenSpots, [{ x: 0, z: 0 }]);

  const fewerRocks = generateIsland({ rocks: 10 });
  const moreRocks = generateIsland({ rocks: 150 });
  assert.ok(kinds(moreRocks).rubble > kinds(fewerRocks).rubble);

  const small = generateIsland({ islandRadius: 80, playRadius: 70, seed: 5 });
  assert.equal(small.islandRadius, 80);
  assert.equal(small.playRadius, 70);
  assert.deepEqual(validateIsland(small), []);
  assert.ok(small.boxes.length < generateIsland({ seed: 5 }).boxes.length);
});
