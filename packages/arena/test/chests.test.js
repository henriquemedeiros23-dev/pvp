import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs, serverEvents, RULES } from './helpers.js';

const legendaryOnly = { weaponChance: 1, rarityOdds: [['legendary', 1]] };

test('chest opens once, gives coins, comes back after exactly 15 s', () => {
  const arena = makeArena();
  const a = arena.join('a', { coins: 10 });
  arena.teleport(a.id, { x: 11, z: 30 }); // chest 0 is at (10, 30)
  drain(arena);

  assert.equal(arena.openChest(a.id, 0, 1000), true);
  let out = drain(arena);
  const coins = msgs(out, 'coins', a.id)[0];
  assert.ok(coins.amount >= 5 && coins.amount <= 15);
  assert.equal(coins.total, 10 + coins.amount);
  const ev = serverEvents(out, 'coins')[0];
  assert.equal(ev.playerId, a.id);
  assert.equal(ev.playerKey, 'a');
  assert.equal(ev.amount, coins.amount);
  assert.deepEqual(msgs(out, 'chest'), [{ t: 'chest', id: 0, open: true }]);
  assert.equal(msgs(out, 'item+').length, 1);

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

test('golden chest appears at 60 s, gives coins + legendary + medkit, schedules the next', () => {
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
  const coins = msgs(out, 'coins', a.id)[0].amount;
  assert.ok(coins >= 80 && coins <= 120);
  assert.equal(serverEvents(out, 'coins')[0].amount, coins);
  const drops = msgs(out, 'item+');
  assert.equal(drops.length, 2);
  assert.ok(RULES.LOOT_TABLE.legendary.includes(drops[0].weapon));
  assert.equal(drops[1].kind, 'medkit');
  assert.deepEqual(msgs(out, 'golden'), [{ t: 'golden', golden: null, by: 'a' }]);
  assert.equal(arena.openChest(a.id, 'golden'), false);

  const next = 61000 + RULES.GOLDEN_CHEST_EVERY_MS;
  assert.equal(arena.nextGoldenAt(), next);
  arena.tick(next - 1);
  assert.equal(arena.golden(), null);
  arena.tick(next);
  assert.deepEqual(arena.golden(), { x: 30, z: -60 });
});

test('items are picked up into a free slot; full slots refuse', () => {
  const arena = makeArena({ tuning: legendaryOnly });
  const full = arena.join('full', { loadout: ['sword', 'bat', 'spear', 'axe'] });
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
  assert.deepEqual(inv.weapons, [RULES.BASIC_WEAPON, item.weapon]);
  assert.equal(inv.picked, RULES.WEAPONS[item.weapon].name);
});

test('items expire after ITEM_LIFETIME_MS', () => {
  const arena = makeArena({ tuning: legendaryOnly });
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
