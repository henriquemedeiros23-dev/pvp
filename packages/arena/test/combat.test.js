import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs, serverEvents, aimAt, RULES, WALL } from './helpers.js';

const READY = RULES.SPAWN_PROTECT_MS + 100; // spawn protection is over

// Two players: attacker with `loadout` in slot 2, victim with `victimLoadout`.
function duel({ loadout = ['shootbm'], victimLoadout = [], victimPotions = 0, rules, at = [[0, 0], [20, 0]] } = {}) {
  const arena = makeArena({ rules });
  const s = arena.join('shooter', { loadout }).id;
  const v = arena.join('victim', { loadout: victimLoadout, potions: victimPotions }).id;
  arena.selectSlot(s, 1);
  arena.teleport(s, { x: at[0][0], z: at[0][1] });
  arena.teleport(v, { x: at[1][0], z: at[1][1] });
  drain(arena);
  return { arena, s, v };
}

const hp = (arena, id) => arena.getPlayer(id)?.hp;

test('Shootbm hits a player in line of sight for 5', () => {
  const { arena, s, v } = duel();
  assert.equal(arena.fire(s, aimAt(arena, s, v), READY), true);
  const out = drain(arena);
  assert.equal(hp(arena, v), RULES.MAX_HP - 5);
  assert.deepEqual(msgs(out, 'hitmark', s), [{ t: 'hitmark', dead: false }]);
  assert.equal(msgs(out, 'hurt', v)[0].hp, hp(arena, v));
  const shot = msgs(out, 'shot')[0];
  assert.equal(shot.w, 'shootbm');
  assert.equal(shot.to.length, 1, 'one bullet');
});

test('gun does not shoot through a wall', () => {
  const { arena, s, v } = duel({ at: [[45, 0], [55, 0]] }); // wall at x = 50
  arena.fire(s, aimAt(arena, s, v), READY);
  assert.equal(hp(arena, v), RULES.MAX_HP);
  const end = msgs(drain(arena), 'shot')[0].to[0];
  assert.ok(Math.abs(end[0] - (WALL.x - WALL.w / 2)) < 0.01, 'tracer stops at the wall');
});

test('charging (#38): Shootbm charges 3 s; a shot while charging does 25%, after the charge 100%', () => {
  const { arena, s, v } = duel();
  assert.equal(arena.fire(s, aimAt(arena, s, v), READY), true);
  assert.equal(hp(arena, v), RULES.MAX_HP - 5);
  assert.equal(arena.fire(s, aimAt(arena, s, v), READY + 2000), true, 'allowed while charging');
  assert.equal(hp(arena, v), RULES.MAX_HP - 5 - 1, '25% of 5 = 1.25 -> 1');
  assert.equal(arena.fire(s, aimAt(arena, s, v), READY + 2000 + 3000), true);
  assert.equal(hp(arena, v), RULES.MAX_HP - 5 - 1 - 5, 'charged again: full damage');
});

test('melee needs the target in front', () => {
  const { arena, s, v } = duel({ loadout: ['icesword'], at: [[0, 0], [0, 2]] });
  arena.teleport(s, { x: 0, z: 0, ry: Math.PI }); // facing -z, target is at +z
  arena.fire(s, [0, 0, -1], READY);
  assert.equal(hp(arena, v), RULES.MAX_HP);
  assert.deepEqual(msgs(drain(arena), 'swing'), [{ t: 'swing', id: s }]);
  arena.teleport(s, { x: 0, z: 0, ry: 0 }); // facing +z
  arena.fire(s, [0, 0, 1], READY + 3000);
  assert.equal(hp(arena, v), RULES.MAX_HP - RULES.WEAPONS.icesword.dmg);
  const hurt = msgs(drain(arena), 'hurt', v)[0];
  assert.ok(hurt.kz > 0, 'knocked away from the attacker');
});

test('spawn protection blocks damage', () => {
  const { arena, s, v } = duel();
  arena.fire(s, aimAt(arena, s, v), 100);
  assert.equal(hp(arena, v), RULES.MAX_HP);
  assert.equal(msgs(drain(arena), 'hurt').length, 0);
});

test('knockout drops weapons, shield and potions, emits ko + dead + knockedOut', () => {
  const { arena, s, v } = duel({ loadout: ['supersword'], victimLoadout: ['icesword', 'shootbm', 'shield'], victimPotions: 2, at: [[0, 0], [0, 2]] });
  assert.equal(arena.fire(s, [0, 0, 1], READY), true);
  const out = drain(arena);
  assert.equal(arena.getPlayer(v), undefined);
  assert.equal(arena.playerCount(), 1);
  const drops = msgs(out, 'item+');
  assert.deepEqual(drops.map(d => d.weapon ?? d.kind), ['gun', 'icesword', 'shootbm', 'shield', 'potion', 'potion'], 'the Gun, the shield and every potion drop too');
  assert.equal(drops.find(d => d.weapon === 'shield').dur, 60);
  const ko = msgs(out, 'ko')[0];
  assert.equal(ko.id, v);
  assert.equal(ko.victim, 'victim');
  assert.equal(ko.by, 'shooter');
  assert.equal(ko.weapon, 'supersword');
  assert.deepEqual(msgs(out, 'dead', v), [{ t: 'dead', by: 'shooter', weapon: 'supersword' }]);
  assert.deepEqual(msgs(out, 'hitmark', s).at(-1), { t: 'hitmark', dead: true });
  const k = serverEvents(out, 'knockedOut')[0];
  assert.equal(k.playerId, v);
  assert.deepEqual(k.weapons, ['gun', 'icesword', 'shootbm', 'shield']);
  assert.deepEqual(arena.leave(v, { alive: true }), [], 'nothing to give back after a knockout');
});

test('new weapons work by only editing the rules (behaviour comes from type)', () => {
  const rules = {
    ...RULES,
    WEAPONS: { ...RULES.WEAPONS, laser: { name: 'Laser', type: 'gun', dmg: 40, range: 100, rate: 0.2, spread: 0, pellets: 1, rarity: 'epic', price: 1, chestChance: 0 } },
  };
  const { arena, s, v } = duel({ loadout: ['laser'], rules });
  arena.fire(s, aimAt(arena, s, v), READY);
  assert.equal(hp(arena, v), RULES.MAX_HP - 40);
});
