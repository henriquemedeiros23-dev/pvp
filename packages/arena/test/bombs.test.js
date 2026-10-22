// Bombs (#32): thrown up to maxThrow meters, explode fuseMs after the throw, hurt everyone inside the
// square area (the Bomb also its thrower, the Legendary Bomb never), not blocked by a raised shield.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs, serverEvents, WALL, RULES } from './helpers.js';
import { ARENA_DEFAULTS } from '../src/index.js';

const READY = RULES.SPAWN_PROTECT_MS + 100; // spawn protection is over
const BOMB = RULES.BOMBS.bomb, LEGEND = RULES.BOMBS.legendarybomb;
const HAND = RULES.PLAYER_HEIGHT - ARENA_DEFAULTS.muzzleDrop; // a bomb leaves the hand at this height
// aim from the hand at a spot on the ground `dist` m in front (+z)
const atGround = dist => [0, -HAND, dist];

function setup({ bombs = { bomb: 5, legendarybomb: 3 }, others = [] } = {}) {
  const arena = makeArena();
  const a = arena.join('thrower', { bombs }).id;
  arena.teleport(a, { x: 0, z: 0, ry: 0 });
  const ids = others.map(([name, x, z]) => {
    const id = arena.join(name, {}).id;
    arena.teleport(id, { x, z });
    return id;
  });
  drain(arena);
  return { arena, a, ids };
}

test('bombs come along like potions: a counter per bomb, capped at its maxCarry, in the inv message', () => {
  const arena = makeArena();
  const r = arena.join('a', { bombs: { bomb: 9, legendarybomb: 7, rocket: 4 } });
  assert.deepEqual(r.bombs, { bomb: 5, legendarybomb: 3 }, 'Bomb max 5, Legendary Bomb max 3');
  const inv = msgs(drain(arena), 'inv', r.id)[0];
  assert.deepEqual(inv.bombs, [{ id: 'bomb', n: 5 }, { id: 'legendarybomb', n: 3 }]);
  assert.deepEqual(inv.weapons, ['gun'], 'bombs never take a weapon slot');
  assert.deepEqual(arena.getPlayer(r.id).bombs, { bomb: 5, legendarybomb: 3 });
  assert.deepEqual(arena.join('b', {}).bombs, { bomb: 0, legendarybomb: 0 });
});

test('a thrown bomb lands where you aim, flies, and everyone sees it', () => {
  const { arena, a } = setup();
  const id = arena.throwBomb(a, 'bomb', atGround(4), READY);
  assert.ok(id);
  const out = drain(arena);
  const [m] = msgs(out, 'bomb', 'all');
  assert.equal(m.id, id);
  assert.equal(m.by, a);
  assert.equal(m.b, 'bomb');
  assert.deepEqual(m.from, [0, HAND, 0]);
  assert.deepEqual(m.to, [0, 0, 4]);
  assert.equal(m.ms, 3000, 'the whole fuse');
  assert.equal(m.area, 2);
  assert.equal(m.fly, ARENA_DEFAULTS.bombFlyMs + ARENA_DEFAULTS.bombFlyMsPerM * 4);
  assert.equal(msgs(out, 'inv', a).at(-1).bombs[0].n, 4, 'one bomb used');
  assert.equal(arena.getPlayer(a).bombs.bomb, 4);
  const [live] = arena.bombs();
  assert.deepEqual({ ...live.to }, { x: 0, y: 0, z: 4 });
  assert.equal(live.explodeAt, READY + 3000);
});

test('a bomb is thrown at most maxThrow meters (7 for the Bomb, 15 for the Legendary Bomb), measured flat', () => {
  const { arena, a } = setup();
  arena.throwBomb(a, 'bomb', [0, 0.2, 1], READY);                  // aiming far away, a bit up
  arena.throwBomb(a, 'legendarybomb', [1, 0, 0], READY + 1000);    // straight ahead to the side
  const [b1, b2] = msgs(drain(arena), 'bomb');
  assert.deepEqual(b1.to, [0, 0, 7]);
  assert.deepEqual(b2.to, [15, 0, 0]);
  assert.ok(b2.fly <= LEGEND.fuseMs);
});

test('aimed at a wall, the bomb lands in front of it', () => {
  const { arena, a } = setup();
  arena.teleport(a, { x: 45, z: 0 });
  arena.throwBomb(a, 'bomb', [1, 0, 0], READY);
  const [m] = msgs(drain(arena), 'bomb');
  const face = WALL.x - WALL.w / 2;
  assert.equal(m.to[1], 0);
  assert.ok(Math.abs(m.to[0] - (face - ARENA_DEFAULTS.bombWallBack)) < 0.02, `lands at x ${m.to[0]}`);
});

test('the Bomb explodes exactly 3 s after the throw: 3 damage to everyone in the 2x2 m square, the thrower too', () => {
  const { arena, a, ids: [inside, edge, outside] } = setup({ others: [['in', 0.5, 4.5], ['edge', 1, 3], ['out', 1.2, 4]] });
  arena.teleport(a, { x: 0, z: 3.5 }); // the thrower walks into its own bomb's area
  arena.throwBomb(a, 'bomb', [0, -HAND, 0.5], READY); // lands at z = 4 (0.5 m in front)
  const [m] = msgs(drain(arena), 'bomb');
  assert.deepEqual(m.to, [0, 0, 4]);
  arena.tick(READY + 2999);
  let out = drain(arena);
  assert.equal(msgs(out, 'boom').length, 0, 'not before 3 s');
  assert.equal(arena.bombs().length, 1);
  arena.tick(READY + 3000);
  out = drain(arena);
  assert.deepEqual(msgs(out, 'boom', 'all'), [{ t: 'boom', id: m.id, b: 'bomb', x: 0, y: 0, z: 4, area: 2 }]);
  assert.equal(arena.bombs().length, 0);
  const hp = id => arena.getPlayer(id).hp;
  assert.equal(hp(inside), 97);
  assert.equal(hp(edge), 97, 'the edge of the square counts');
  assert.equal(hp(outside), 100);
  assert.equal(hp(a), 97, 'the Bomb hurts its thrower too');
  assert.equal(msgs(out, 'hurt', inside).length, 1);
  assert.equal(msgs(out, 'hitmark', a).length, 2, 'the thrower sees a hit marker for each other player hit');
});

test('the Legendary Bomb: 10 damage in a 5x5 m square, never to its thrower', () => {
  const { arena, a, ids: [near, corner, far] } = setup({ others: [['near', 2, 8], ['corner', 2.5, 12.5], ['far', 0, 13] ] });
  arena.throwBomb(a, 'legendarybomb', [0, -HAND, 10], READY); // lands at z = 10
  const [m] = msgs(drain(arena), 'bomb');
  assert.deepEqual(m.to, [0, 0, 10]);
  assert.equal(m.area, 5);
  arena.teleport(a, { x: 0, z: 9 }); // runs into the area: still safe
  arena.tick(READY + LEGEND.fuseMs);
  drain(arena);
  const hp = id => arena.getPlayer(id).hp;
  assert.deepEqual([hp(near), hp(corner), hp(far), hp(a)], [90, 90, 100, 100]);
});

test('a raised shield does NOT block a bomb; spawn protection does', () => {
  const { arena, a } = setup();
  const s = arena.join('shielded', { loadout: ['shield'] }).id;
  arena.teleport(s, { x: 0, z: 4, ry: Math.PI }); // facing the thrower
  arena.tick(READY);
  assert.equal(arena.setShield(s, true, READY), true);
  arena.throwBomb(a, 'bomb', atGround(4), READY);
  const fresh = arena.join('fresh', {}, READY + 100).id; // just joined: protected for SPAWN_PROTECT_MS
  arena.teleport(fresh, { x: 0.5, z: 4 });
  arena.tick(READY + 3000);
  const out = drain(arena);
  assert.equal(arena.getPlayer(s).hp, 97);
  assert.equal(arena.getPlayer(s).shield.dur, RULES.WEAPONS.shield.durability, 'the shield is not used');
  assert.equal(msgs(out, 'block').length, 0);
  assert.equal(arena.getPlayer(fresh).hp, 100, 'still spawn protected');
});

test('a bomb can knock out: the thrower gets the credit (with the bomb id), even after leaving', () => {
  const { arena, a, ids: [v] } = setup({ others: [['victim', 0, 4]] });
  arena.throwBomb(a, 'legendarybomb', atGround(4), READY);
  arena.throwBomb(a, 'legendarybomb', atGround(4), READY + 500);
  arena.throwBomb(a, 'legendarybomb', atGround(4), READY + 1000);
  // (the victim has 100 HP: 3 Legendary Bombs = 30)
  arena.tick(READY + 3000);
  arena.tick(READY + 3500);
  arena.leave(a);
  arena.tick(READY + 4000);
  drain(arena);
  assert.equal(arena.getPlayer(v).hp, 70);

  const { arena: B, a: t, ids: [w] } = setup({ bombs: { bomb: 5 }, others: [['weak', 0, 4]] });
  // hurt the victim down to 3 HP with the thrower's own bombs, then the last one knocks out
  for (let i = 0; i < 5; i++) B.throwBomb(t, 'bomb', atGround(4), READY + i * 600);
  B.tick(READY + 3000);
  drain(B);
  assert.equal(B.getPlayer(w).hp, 97);
  B.leave(t);
  for (let i = 1; i < 5; i++) B.tick(READY + 3000 + i * 600);
  const out = drain(B);
  assert.equal(B.getPlayer(w).hp, 85, 'bombs from a player who left still explode');
  assert.equal(msgs(out, 'ko').length, 0);
});

test('knocked out by a bomb: ko and dead name the thrower and the bomb', () => {
  const rules = { ...RULES, BOMBS: { ...RULES.BOMBS, bomb: { ...RULES.BOMBS.bomb, dmg: 100 } } };
  const arena = makeArena({ rules });
  const a = arena.join('thrower', { name: 'Ann', bombs: { bomb: 1 } }).id;
  const v = arena.join('victim', { name: 'Bob', bombs: { bomb: 2, legendarybomb: 3 } }).id;
  arena.teleport(a, { x: 0, z: 0 });
  arena.teleport(v, { x: 0, z: 4 });
  arena.throwBomb(a, 'bomb', atGround(4), READY);
  arena.tick(READY + 3000);
  const out = drain(arena);
  assert.equal(msgs(out, 'ko')[0].by, 'Ann');
  assert.equal(msgs(out, 'ko')[0].weapon, 'bomb');
  assert.deepEqual(msgs(out, 'dead', v), [{ t: 'dead', by: 'Ann', weapon: 'bomb' }]);
  assert.equal(serverEvents(out, 'knockedOut')[0].byId, a);
  // the victim's bombs drop: one ground item per kind with all of them
  const bombs = arena.items().filter(it => it.kind === 'bomb').map(it => [it.weapon, it.n]);
  assert.deepEqual(bombs, [['bomb', 2], ['legendarybomb', 3]]);
});

test('throwing is refused: unknown bomb, none left, shield raised, drinking, frozen, too fast, bad aim', () => {
  const { arena, a } = setup({ bombs: { bomb: 2 } });
  assert.equal(arena.throwBomb(a, 'rocket', [0, 0, 1], READY), null);
  assert.equal(arena.throwBomb(a, 'legendarybomb', [0, 0, 1], READY), null, 'none carried');
  assert.equal(arena.throwBomb(a, 'bomb', [0, 0, 0], READY), null);
  assert.equal(arena.throwBomb(a, 'bomb', [NaN, 0, 1], READY), null);
  assert.equal(arena.throwBomb(999, 'bomb', [0, 0, 1], READY), null);
  assert.ok(arena.throwBomb(a, 'bomb', [0, 0, 1], READY));
  assert.equal(arena.throwBomb(a, 'bomb', [0, 0, 1], READY + ARENA_DEFAULTS.bombThrowCooldownMs - 1), null, 'too fast');
  assert.ok(arena.throwBomb(a, 'bomb', [0, 0, 1], READY + ARENA_DEFAULTS.bombThrowCooldownMs));
  assert.equal(arena.throwBomb(a, 'bomb', [0, 0, 1], READY + 5000), null, 'none left');
  assert.equal(arena.getPlayer(a).bombs.bomb, 0);

  const { arena: B, a: s } = setup();
  const sh = B.join('sh', { loadout: ['shield'], bombs: { bomb: 1 } }).id;
  B.setShield(sh, true, READY);
  assert.equal(B.throwBomb(sh, 'bomb', [0, 0, 1], READY), null, 'not with the shield raised');
  const hurt = B.join('hurt', { potions: 1, bombs: { bomb: 1 } }).id;
  B.teleport(hurt, { x: 0, z: 4 });
  B.throwBomb(s, 'bomb', atGround(4), READY);
  B.tick(READY + 3000);
  assert.equal(B.drink(hurt, READY + 3000), true);
  assert.equal(B.throwBomb(hurt, 'bomb', [0, 0, 1], READY + 3100), null, 'not while drinking');
});

test('chests drop bomb packs: chestChance % each (a Bomb, or 3 Legendary Bombs); pick up only up to maxCarry', () => {
  const BOMBS = {
    bomb: { ...RULES.BOMBS.bomb, chestChance: 100 },
    legendarybomb: { ...RULES.BOMBS.legendarybomb, chestChance: 100 },
  };
  const arena = makeArena({ rules: { ...RULES, POTION: { ...RULES.POTION, chestChance: 0 }, BOMBS } });
  const a = arena.join('a', { bombs: { legendarybomb: 2 } }).id;
  arena.teleport(a, { x: 10, z: 30 });
  arena.openChest(a, 0, READY);
  const loot = msgs(drain(arena), 'item+');
  assert.deepEqual(loot.map(m => [m.kind, m.weapon, m.n]), [['weapon', loot[0].weapon, undefined], ['bomb', 'bomb', 1], ['bomb', 'legendarybomb', 3]]);
  // stand on the loot: the Bomb is picked up, only 1 of the 3 Legendary Bombs fits (max 3), 2 stay
  const legend = loot[2];
  arena.teleport(a, { x: legend.x, z: legend.z });
  arena.tick(READY + 100);
  let out = drain(arena);
  assert.equal(arena.getPlayer(a).bombs.legendarybomb, 3);
  const rest = arena.items().find(it => it.kind === 'bomb' && it.weapon === 'legendarybomb');
  assert.equal(rest.n, 2, 'the rest of the pack stays on the ground');
  assert.ok(msgs(out, 'inv', a).some(m => m.picked === 'Legendary Bomb'));
  const bomb = loot[1];
  arena.teleport(a, { x: bomb.x, z: bomb.z });
  arena.tick(READY + 200);
  out = drain(arena);
  assert.equal(arena.getPlayer(a).bombs.bomb, 1);
  // full: the rest stays
  arena.teleport(a, { x: rest.x, z: rest.z });
  arena.tick(READY + 300);
  arena.tick(READY + 400);
  assert.equal(arena.items().find(it => it.id === rest.id)?.n, 2);
  // someone else can take them
  const b = arena.join('b', {}).id;
  arena.teleport(b, { x: rest.x, z: rest.z });
  arena.tick(READY + 500);
  out = drain(arena);
  assert.equal(arena.getPlayer(b).bombs.legendarybomb, 2);
  assert.ok(msgs(out, 'inv', b).some(m => m.picked === '2× Legendary Bomb'));
});

test('welcome lists the bombs that have not exploded yet', () => {
  const { arena, a } = setup();
  arena.throwBomb(a, 'bomb', atGround(4), READY);
  drain(arena);
  arena.tick(READY + 1000);
  const late = arena.join('late', {}, READY + 1000).id;
  const w = msgs(drain(arena), 'welcome', late)[0];
  assert.equal(w.bombs.length, 1);
  assert.equal(w.bombs[0].ms, 2000, 'time left on the fuse');
  assert.equal(w.bombs[0].fly, 0, 'already landed');
});

test('leaving alive keeps the bombs for the backpack; a replaced player hands them back', () => {
  const arena = makeArena();
  const a = arena.join('a', { bombs: { bomb: 3, legendarybomb: 1 } }).id;
  arena.teleport(a, { x: 0, z: 0 });
  arena.throwBomb(a, 'bomb', atGround(4), READY);
  const again = arena.join('a', {}, READY + 10);
  assert.deepEqual(again.replaced.bombs, { bomb: 2, legendarybomb: 1 });
});

test('same seed and calls: exactly the same messages (bombs are deterministic)', () => {
  const run = () => {
    const { arena, a } = setup({ others: [['v', 0.4, 4], ['w', 2, 10]] });
    arena.throwBomb(a, 'bomb', atGround(4), READY);
    arena.throwBomb(a, 'legendarybomb', [0.1, -0.05, 1], READY + 600);
    for (let t = READY; t <= READY + 4000; t += 50) arena.tick(t);
    return JSON.stringify(drain(arena));
  };
  const one = run();
  assert.equal(run(), one);
  assert.match(one, /"t":"boom"/);
});
