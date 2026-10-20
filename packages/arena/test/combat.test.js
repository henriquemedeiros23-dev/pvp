import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs, serverEvents, aimAt, RULES, WALL } from './helpers.js';

const READY = RULES.SPAWN_PROTECT_MS + 100; // spawn protection is over

// Two players: shooter with `loadout` in slot 1, victim with `victimLoadout`.
function duel({ loadout = ['sniper'], victimLoadout = [], rules, at = [[0, 0], [20, 0]] } = {}) {
  const arena = makeArena({ rules });
  const s = arena.join('shooter', { loadout }).id;
  const v = arena.join('victim', { loadout: victimLoadout }).id;
  arena.selectSlot(s, 1);
  arena.teleport(s, { x: at[0][0], z: at[0][1] });
  arena.teleport(v, { x: at[1][0], z: at[1][1] });
  drain(arena);
  return { arena, s, v };
}

const hp = (arena, id) => arena.getPlayer(id)?.hp;

test('gun hits a player in line of sight', () => {
  const { arena, s, v } = duel();
  assert.equal(arena.fire(s, aimAt(arena, s, v), READY), true);
  const out = drain(arena);
  assert.equal(hp(arena, v), RULES.MAX_HP - RULES.WEAPONS.sniper.dmg);
  assert.deepEqual(msgs(out, 'hitmark', s), [{ t: 'hitmark', dead: false }]);
  assert.equal(msgs(out, 'hurt', v)[0].hp, hp(arena, v));
  assert.equal(msgs(out, 'shot')[0].w, 'sniper');
});

test('gun does not shoot through a wall', () => {
  const { arena, s, v } = duel({ at: [[45, 0], [55, 0]] }); // wall at x = 50
  arena.fire(s, aimAt(arena, s, v), READY);
  assert.equal(hp(arena, v), RULES.MAX_HP);
  const end = msgs(drain(arena), 'shot')[0].to[0];
  assert.ok(Math.abs(end[0] - (WALL.x - WALL.w / 2)) < 0.01, 'tracer stops at the wall');
});

test('fire rate is respected', () => {
  const { arena, s, v } = duel();
  assert.equal(arena.fire(s, aimAt(arena, s, v), READY), true);
  assert.equal(arena.fire(s, aimAt(arena, s, v), READY + 100), false);
});

test('melee needs the target in front', () => {
  const { arena, s, v } = duel({ loadout: [], at: [[0, 0], [0, 2]] });
  arena.selectSlot(s, 0);
  arena.teleport(s, { x: 0, z: 0, ry: Math.PI }); // facing -z, target is at +z
  arena.fire(s, [0, 0, -1], READY);
  assert.equal(hp(arena, v), RULES.MAX_HP);
  assert.deepEqual(msgs(drain(arena), 'swing'), [{ t: 'swing', id: s }]);
  arena.teleport(s, { x: 0, z: 0, ry: 0 }); // facing +z
  arena.fire(s, [0, 0, 1], READY + 1000);
  assert.equal(hp(arena, v), RULES.MAX_HP - RULES.WEAPONS[RULES.BASIC_WEAPON].dmg);
  const hurt = msgs(drain(arena), 'hurt', v)[0];
  assert.ok(hurt.kz > 0, 'knocked away from the attacker');
});

test('spawn protection blocks damage', () => {
  const { arena, s, v } = duel();
  arena.fire(s, aimAt(arena, s, v), 100);
  assert.equal(hp(arena, v), RULES.MAX_HP);
  assert.equal(msgs(drain(arena), 'hurt').length, 0);
});

test('grenade explodes after its fuse and never hurts the thrower', () => {
  const { arena, s, v } = duel({ loadout: ['grenade'], at: [[0, 0], [2, 0]] });
  arena.tick(READY);
  arena.fire(s, [0, -1, 0], READY); // throw it at our own feet
  const proj = msgs(drain(arena), 'proj')[0];
  assert.equal(proj.kind, 'grenade');
  const fuseEnd = READY + RULES.WEAPONS.grenade.fuse * 1000;
  let t = READY;
  while (t + 50 < fuseEnd) { t += 50; arena.tick(t); }
  assert.equal(msgs(drain(arena), 'boom').length, 0, 'not before the fuse');
  arena.tick(fuseEnd);
  const out = drain(arena);
  assert.deepEqual(msgs(out, 'proj-'), [{ t: 'proj-', id: proj.id }]);
  assert.equal(msgs(out, 'boom').length, 1);
  assert.ok(hp(arena, v) < RULES.MAX_HP, 'victim hurt');
  assert.equal(hp(arena, s), RULES.MAX_HP, 'no self damage');
});

test('rocket hits a player', () => {
  const { arena, s, v } = duel({ loadout: ['rocket'], at: [[0, 0], [15, 0]] });
  arena.tick(READY);
  arena.fire(s, [1, 0, 0], READY);
  let t = READY;
  for (let i = 0; i < 20 && !msgs(arena.drain(), 'boom').length; i++) { t += 50; arena.tick(t); }
  assert.ok(t < READY + 1000, 'rocket arrived quickly');
  assert.ok(hp(arena, v) < RULES.MAX_HP - 50, 'big hit');
  assert.equal(arena.projectiles().length, 0);
});

test('mine triggers on an enemy, not on its owner, and does not hurt the owner', () => {
  const { arena, s, v } = duel({ loadout: ['mine'], at: [[0, 0], [30, 0]] });
  arena.fire(s, [0, 0, 1], READY);
  const mine = msgs(drain(arena), 'mine+')[0];
  assert.equal(mine.owner, s);
  arena.tick(READY + 2000); // armed, owner standing on it
  assert.equal(arena.mines().length, 1);
  arena.teleport(v, { x: 0.5, z: 0 });
  arena.tick(READY + 2050);
  const out = drain(arena);
  assert.deepEqual(msgs(out, 'mine-'), [{ t: 'mine-', id: mine.id }]);
  assert.equal(msgs(out, 'boom').length, 1);
  assert.ok(hp(arena, v) < RULES.MAX_HP);
  assert.equal(hp(arena, s), RULES.MAX_HP);
});

test('mines over maxActive replace the oldest', () => {
  const { arena, s } = duel({ loadout: ['mine'] });
  let t = READY;
  for (let i = 0; i <= RULES.WEAPONS.mine.maxActive; i++) { arena.fire(s, [0, 0, 1], t); t += 2000; }
  const out = drain(arena);
  assert.equal(msgs(out, 'mine-').length, 1);
  assert.equal(arena.mines().length, RULES.WEAPONS.mine.maxActive);
});

test('knockout drops weapons and heals, emits ko + dead + knockedOut', () => {
  const { arena, s, v } = duel({ victimLoadout: ['rocket', 'pistol'] });
  arena.fire(s, aimAt(arena, s, v), READY);
  arena.fire(s, aimAt(arena, s, v), READY + 2000);
  const out = drain(arena);
  assert.equal(arena.getPlayer(v), undefined);
  assert.equal(arena.playerCount(), 1);
  const drops = msgs(out, 'item+');
  assert.deepEqual(drops.map(d => d.weapon ?? d.kind), ['rocket', 'pistol', 'bandage']);
  const ko = msgs(out, 'ko')[0];
  assert.equal(ko.id, v);
  assert.equal(ko.victim, 'victim');
  assert.equal(ko.by, 'shooter');
  assert.equal(ko.weapon, 'sniper');
  assert.deepEqual(msgs(out, 'dead', v), [{ t: 'dead', by: 'shooter', weapon: 'sniper' }]);
  assert.deepEqual(msgs(out, 'hitmark', s).at(-1), { t: 'hitmark', dead: true });
  const k = serverEvents(out, 'knockedOut')[0];
  assert.equal(k.playerId, v);
  assert.deepEqual(k.weapons, ['rocket', 'pistol']);
  assert.deepEqual(arena.leave(v, { alive: true }), [], 'nothing to give back after a knockout');
});

test('new weapons work by only editing the rules (behaviour comes from type)', () => {
  const rules = {
    ...RULES,
    WEAPONS: { ...RULES.WEAPONS, laser: { name: 'Laser', type: 'gun', dmg: 40, range: 100, rate: 0.2, spread: 0, pellets: 1, rarity: 'rare', price: 1 } },
  };
  const { arena, s, v } = duel({ loadout: ['laser'], rules });
  arena.fire(s, aimAt(arena, s, v), READY);
  assert.equal(hp(arena, v), RULES.MAX_HP - 40);
});
