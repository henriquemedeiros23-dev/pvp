import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '@pvp/seeded-random';
import { makeArena, drain, msgs, serverEvents, chestAlways, testIsland, RULES } from './helpers.js';
import { rollChestWeapon, chestWeights } from '../src/loot.js';
import { createState } from '../src/state.js';

const shootbmOnly = chestAlways('shootbm');

test('chest opens once, gives exactly CHEST_COINS coins and one full weapon, comes back after exactly 15 s', () => {
  const arena = makeArena();
  const a = arena.join('a', { coins: 10 });
  arena.teleport(a.id, { x: 11, z: 30 }); // chest 0 is at (10, 30)
  drain(arena);

  assert.equal(arena.openChest(a.id, 0, 1000), true);
  let out = drain(arena);
  const coins = msgs(out, 'coins', a.id)[0];
  assert.equal(coins.amount, RULES.CHEST_COINS);
  assert.equal(coins.amount, 3);
  assert.equal(coins.total, 10 + coins.amount);
  const ev = serverEvents(out, 'coins')[0];
  assert.equal(ev.playerId, a.id);
  assert.equal(ev.playerKey, 'a');
  assert.equal(ev.amount, coins.amount);
  assert.deepEqual(msgs(out, 'chest'), [{ t: 'chest', id: 0, open: true }]);
  const loot = msgs(out, 'item+');
  assert.equal(loot.length, 1, 'exactly one item');
  assert.equal(loot[0].kind, 'weapon', 'always a weapon (chest heals are off)');
  assert.equal(loot[0].dur, RULES.WEAPONS[loot[0].weapon].durability, 'chest loot is full');

  assert.equal(arena.openChest(a.id, 0, 1001), false);
  arena.tick(1000 + RULES.CHEST_RESPAWN_MS - 1);
  assert.equal(msgs(drain(arena), 'chest').length, 0);
  assert.equal(arena.openChest(a.id, 0), false);
  arena.tick(1000 + RULES.CHEST_RESPAWN_MS);
  assert.deepEqual(msgs(drain(arena), 'chest'), [{ t: 'chest', id: 0, open: false }]);
  assert.equal(arena.openChest(a.id, 0), true);
});

test('opening a chest from too far away fails', () => {
  const arena = makeArena();
  const a = arena.join('a', {});
  arena.teleport(a.id, { x: 10, z: 34 }); // 4 m away
  assert.equal(arena.openChest(a.id, 0), false);
  assert.equal(arena.openChest(a.id, 99), false);
  assert.equal(serverEvents(drain(arena), 'coins').length, 0);
});

test('welcome lists open chests', () => {
  const arena = makeArena();
  const a = arena.join('a', {});
  arena.teleport(a.id, { x: 10, z: 30 });
  arena.openChest(a.id, 0, 10);
  assert.deepEqual(arena.welcomeFor(a.id).chests, [0]);
});

test('golden chest appears at 60 s, gives exactly 10 coins + one weapon, schedules the next', () => {
  const arena = makeArena();
  const a = arena.join('a', {});
  drain(arena);
  arena.tick(59999);
  assert.equal(arena.golden(), null);
  arena.tick(60000);
  assert.deepEqual(msgs(drain(arena), 'golden'), [{ t: 'golden', golden: { x: 30, z: -60 } }]);

  arena.teleport(a.id, { x: 31, z: -60 });
  assert.equal(arena.openChest(a.id, 'golden', 61000), true);
  const out = drain(arena);
  assert.equal(msgs(out, 'coins', a.id)[0].amount, 10);
  assert.equal(RULES.GOLDEN_CHEST_COINS, 10);
  assert.equal(serverEvents(out, 'coins')[0].amount, 10);
  const drops = msgs(out, 'item+');
  assert.equal(drops.length, 1, 'one weapon, no medkit');
  assert.equal(drops[0].kind, 'weapon');
  assert.equal(drops[0].dur, RULES.WEAPONS[drops[0].weapon].durability);
  assert.deepEqual(msgs(out, 'golden'), [{ t: 'golden', golden: null, by: 'a' }]);
  assert.equal(arena.openChest(a.id, 'golden'), false);

  const next = 61000 + RULES.GOLDEN_CHEST_EVERY_MS;
  assert.equal(arena.nextGoldenAt(), next);
  arena.tick(next - 1);
  assert.equal(arena.golden(), null);
  arena.tick(next);
  assert.deepEqual(arena.golden(), { x: 30, z: -60 });
});

test('golden chest doubles the weights of Epic, Legendary and Megalegend (Common stays)', () => {
  const golden = new Map(chestWeights(RULES, { golden: true }));
  const normal = new Map(chestWeights(RULES));
  assert.equal(normal.get('gun'), 15);
  assert.equal(golden.get('gun'), 15);
  assert.equal(golden.get('shootbm'), normal.get('shootbm'));
  assert.equal(golden.get('icesword'), 2 * normal.get('icesword'));
  assert.equal(golden.get('shield'), 2 * normal.get('shield'));
  assert.equal(golden.get('megashield'), 2 * normal.get('megashield'));
  assert.equal(golden.get('supersword'), 2 * normal.get('supersword'));
  const mega = { ...RULES, WEAPONS: { c: { rarity: 'common', chestChance: 50 }, m: { rarity: 'megalegend', chestChance: 50 } } };
  assert.deepEqual(chestWeights(mega, { golden: true }), [['c', 50], ['m', 100]]);

  // Picks follow the doubled weights, and the same seed gives the same picks.
  const pickMany = seed => {
    const A = createState({ island: testIsland(), random: createRandom(seed) });
    const counts = {};
    for (let i = 0; i < 20000; i++) { const w = rollChestWeapon(A, { golden: true }); counts[w] = (counts[w] || 0) + 1; }
    return counts;
  };
  const counts = pickMany(9);
  assert.deepEqual(pickMany(9), counts);
  let total = 0;
  for (const w of golden.values()) total += w;
  for (const [id, w] of golden) {
    const share = (counts[id] || 0) / 20000, want = w / total;
    assert.ok(Math.abs(share - want) < 0.012, `${id}: ${share.toFixed(3)} vs ${want.toFixed(3)}`);
  }
});

test('items are picked up into a free slot; full slots refuse', () => {
  const arena = makeArena({ rules: shootbmOnly });
  const full = arena.join('full', { loadout: ['shootbm', 'icesword', 'electricsword', 'supersword'] }); // + the Gun = 5
  const free = arena.join('free', {});
  arena.teleport(full.id, { x: 10, z: 31 });
  arena.teleport(free.id, { x: -50, z: 50 });
  arena.openChest(full.id, 0, 3000);
  const item = arena.items()[0];
  assert.equal(item.kind, 'weapon');
  arena.teleport(full.id, { x: item.x, z: item.z });
  drain(arena);
  arena.tick(3050);
  assert.equal(arena.items().length, 1, 'full player cannot take it');
  assert.equal(msgs(drain(arena), 'item-').length, 0);

  arena.teleport(full.id, { x: -80, z: 0 });
  arena.teleport(free.id, { x: item.x + 1, z: item.z });
  arena.tick(3100);
  const out = drain(arena);
  assert.deepEqual(msgs(out, 'item-'), [{ t: 'item-', id: item.id, by: free.id }]);
  const inv = msgs(out, 'inv', free.id)[0];
  assert.deepEqual(inv.weapons, [RULES.STARTING_WEAPON, item.weapon]);
  assert.equal(inv.picked, RULES.WEAPONS[item.weapon].name);
});

test('items expire after ITEM_LIFETIME_MS', () => {
  const arena = makeArena({ rules: shootbmOnly });
  const a = arena.join('a', {});
  arena.teleport(a.id, { x: 10, z: 31 });
  arena.openChest(a.id, 0, 0);
  arena.teleport(a.id, { x: -80, z: 0 });
  const item = arena.items()[0];
  drain(arena);
  arena.tick(RULES.ITEM_LIFETIME_MS);
  assert.equal(arena.items().length, 1);
  arena.tick(RULES.ITEM_LIFETIME_MS + 1);
  assert.deepEqual(msgs(drain(arena), 'item-'), [{ t: 'item-', id: item.id }]);
});

test('chest weapons follow the card numbers as weights (they add up to 46.3, not 100), deterministic for a seed', () => {
  const pickMany = seed => {
    const A = createState({ island: testIsland(), random: createRandom(seed) });
    const counts = {};
    for (let i = 0; i < 20000; i++) { const w = rollChestWeapon(A); counts[w] = (counts[w] || 0) + 1; }
    return counts;
  };
  const counts = pickMany(5);
  assert.deepEqual(pickMany(5), counts, 'same seed, same picks');
  let total = 0;
  for (const w of Object.values(RULES.WEAPONS)) total += w.chestChance;
  assert.ok(Math.abs(total - 46.3) < 1e-9);
  for (const [id, w] of Object.entries(RULES.WEAPONS)) {
    const share = (counts[id] || 0) / 20000, want = w.chestChance / total; // Gun: 15 / 46.3 = about 32 in 100
    assert.ok(Math.abs(share - want) < 0.012, `${id}: ${share.toFixed(3)} vs ${want.toFixed(3)}`);
  }
  assert.ok(counts.supersword > 0, 'the Supersword can come out (0.3 / 46.3)');
});

test('chest chances are weights: they are normalized, and 0 never comes out', () => {
  const WEAPONS = { a: { chestChance: 1 }, b: { chestChance: 3 }, c: { chestChance: 0 } };
  const A = createState({ island: testIsland(), random: createRandom(1), rules: { ...RULES, WEAPONS } });
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 4000; i++) counts[rollChestWeapon(A)]++;
  assert.equal(counts.c, 0);
  assert.ok(Math.abs(counts.b / 4000 - 0.75) < 0.03, JSON.stringify(counts));
  const none = createState({ island: testIsland(), random: createRandom(1), rules: { ...RULES, WEAPONS: { a: { chestChance: 0 } } } });
  assert.equal(rollChestWeapon(none), null);
});

test('chest heals are a separate setting (off by default)', () => {
  const arena = makeArena({ tuning: { chestHealChance: 1, bandageChance: 1 } });
  const a = arena.join('a', {});
  arena.teleport(a.id, { x: 10, z: 30 });
  arena.openChest(a.id, 0, 0);
  const loot = msgs(drain(arena), 'item+').map(m => m.kind);
  assert.deepEqual(loot, ['weapon', 'bandage']);
});

test('picking up a copy of a weapon you already have is fine (a free slot is enough)', () => {
  const arena = makeArena({ rules: chestAlways('gun') });
  const a = arena.join('a', {});
  arena.teleport(a.id, { x: 10, z: 31 });
  arena.openChest(a.id, 0, 100);
  const item = arena.items()[0];
  assert.equal(item.weapon, 'gun');
  arena.teleport(a.id, { x: item.x, z: item.z });
  drain(arena);
  arena.tick(200);
  const inv = msgs(drain(arena), 'inv', a.id).at(-1);
  assert.deepEqual(inv.weapons, ['gun', 'gun']);
  assert.deepEqual(inv.dur, [15, 15]);
  assert.deepEqual(arena.leave(a.id, { alive: true }), ['gun'], 'the picked up copy is not the free one');
});
