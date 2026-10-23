// Issue #38: every weapon (slot) charges on its own; a hit while charging does 25%; a swing at the air
// does not start the charge; at most one use every MIN_FIRE_GAP_MS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs, RULES } from './helpers.js';

const READY = RULES.SPAWN_PROTECT_MS + 100; // spawn protection is over
const W = RULES.WEAPONS;
const SLACK = 0.9; // ARENA_DEFAULTS.fireRateSlack: the server counts a weapon charged 10% early (lag)

// Attacker `a` at (0, 0) facing +z with the starting Gun in slot 0 and `loadout` from slot 1 (slot 1 in hand);
// victim `v` 2 m in front (in range of a sword, and in line for a shot along +z at height 1).
function face({ loadout, victimLoadout = [], rules, dist = 2 } = {}) {
  const arena = makeArena({ rules });
  const a = arena.join('att', { name: 'Att', loadout }).id;
  const v = arena.join('vic', { name: 'Vic', loadout: victimLoadout }).id;
  arena.selectSlot(a, 1);
  arena.teleport(a, { x: 0, z: 0, ry: 0 });
  arena.teleport(v, { x: 0, z: dist, ry: Math.PI });
  drain(arena);
  return { arena, a, v };
}
const hp = (arena, id) => arena.getPlayer(id)?.hp;
// along +z, down to the victim's middle (the muzzle is at PLAYER_HEIGHT - 0.3)
const aim = dist => [0, 1 - (RULES.PLAYER_HEIGHT - 0.3), dist];
const use = (arena, a, t, dist = 2) => arena.fire(a, aim(dist), t);
const lastInv = (arena, id) => msgs(drain(arena), 'inv', id).at(-1);

test('switching weapons: the other weapon is ready right away (full damage)', () => {
  const { arena, a, v } = face({ loadout: ['shootbm'] });
  assert.equal(use(arena, a, READY), true);
  assert.equal(hp(arena, v), 100 - W.shootbm.dmg);
  arena.selectSlot(a, 0); // the Gun was never used: fully charged
  assert.equal(use(arena, a, READY + 200), true);
  assert.equal(hp(arena, v), 100 - 5 - W.gun.dmg, 'full Gun damage, the Shootbm is still charging');
  arena.selectSlot(a, 1);
  assert.equal(use(arena, a, READY + 400), true);
  assert.equal(hp(arena, v), 100 - 5 - 2 - 1, 'back to the charging Shootbm: 25% of 5 = 1');
});

test('copies of the same weapon charge separately', () => {
  const { arena, a, v } = face({ loadout: ['shootbm', 'shootbm'] });
  use(arena, a, READY);
  arena.selectSlot(a, 2);
  use(arena, a, READY + 200);
  assert.equal(hp(arena, v), 100 - 5 - 5, 'the second Shootbm was ready');
});

test('inv.charge tells the client how long each slot still charges', () => {
  const { arena, a } = face({ loadout: ['shootbm', 'icesword'] });
  use(arena, a, READY);
  const full = W.shootbm.rate * 1000 * SLACK;
  assert.deepEqual(lastInv(arena, a).charge, [0, full, 0]);
  arena.selectSlot(a, 0);
  assert.equal(arena.now(), READY);
  arena.tick(READY + 1000);
  drain(arena);
  arena.selectSlot(a, 2);
  assert.deepEqual(lastInv(arena, a).charge, [0, full - 1000, 0], 'the time left goes down');
  assert.deepEqual(arena.getPlayer(a).useAt, [-Infinity, READY, -Infinity]);
});

test('a melee swing at the air does not start the charge', () => {
  const { arena, a, v } = face({ loadout: ['icesword'], dist: 30 });
  assert.equal(use(arena, a, READY), true, 'it swings');
  assert.deepEqual(arena.getPlayer(a).useAt, [-Infinity, -Infinity]);
  assert.deepEqual(arena.getPlayer(a).dur, [15, 50], 'and costs nothing (#34)');
  arena.teleport(v, { x: 0, z: 2 });
  assert.equal(use(arena, a, READY + 200), true);
  assert.equal(hp(arena, v), 100 - W.icesword.dmg, 'full damage right after an air swing');
  assert.equal(arena.isFrozen(v), true, 'with the freeze');
  assert.deepEqual(lastInv(arena, a).charge, [0, W.icesword.rate * 1000 * SLACK]);
});

test('a hit while charging: 25% damage, no shock, uses durability and starts the charge over', () => {
  const { arena, a, v } = face({ loadout: ['electricsword'] });
  use(arena, a, READY);
  assert.equal(hp(arena, v), 85);
  // wait out the shock (3 ticks), then hit again while the sword charges
  arena.tick(READY + 16000);
  assert.equal(hp(arena, v), 82);
  assert.equal(use(arena, a, READY + 16000), true);
  assert.equal(hp(arena, v), 82 - 15, 'charged again after 16 s');
  assert.equal(use(arena, a, READY + 16200), true, 'still charging: allowed');
  assert.equal(hp(arena, v), 82 - 15 - 4, '25% of 15 = 3.75 -> 4');
  assert.deepEqual(arena.getPlayer(a).dur, [15, 47], 'every hit wears the sword');
  assert.equal(arena.getPlayer(a).useAt[1], READY + 16200, 'the charge starts over');
  const dmg = msgs(drain(arena), 'dmg').at(-1);
  assert.equal(dmg.amount, 4);
  assert.equal(use(arena, a, READY + 16200 + 1700), true, 'not charged yet: 1.7 s < 1.8 s');
  assert.equal(hp(arena, v), 82 - 15 - 4 - 4);
});

test('a weak shock hit does not start a new shock; a weak Ice Sword hit does not freeze', () => {
  const s = face({ loadout: ['electricsword'] });
  use(s.arena, s.a, READY);
  s.arena.tick(READY + 16000); // the first shock is over
  use(s.arena, s.a, READY + 16000);
  s.arena.tick(READY + 32000); // and the second
  const before = hp(s.arena, s.v);
  use(s.arena, s.a, READY + 32000); // full
  use(s.arena, s.a, READY + 32200); // weak
  assert.equal(s.arena.isShocked(s.v), true);
  assert.equal(hp(s.arena, s.v), before - 15 - 4);

  const i = face({ loadout: ['icesword'] });
  i.arena.selectSlot(i.a, 0);
  use(i.arena, i.a, READY); // a Gun shot first: the Ice Sword is not charging
  i.arena.selectSlot(i.a, 1);
  use(i.arena, i.a, READY + 200);
  assert.equal(i.arena.isFrozen(i.v), true);
  // a weak hit after the freeze is over: no freeze
  assert.equal(use(i.arena, i.a, READY + 2500), true);
  assert.equal(hp(i.arena, i.v), 100 - 2 - 10 - 3, '25% of 10 = 2.5 -> 3');
  assert.equal(i.arena.isFrozen(i.v), false, 'no freeze on a charging hit');
});

test('Supersword while charging: 25 damage, no knockout', () => {
  const { arena, a, v } = face({ loadout: ['supersword'] });
  const c = arena.join('cat', {}).id;
  arena.teleport(c, { x: 0.5, z: 2.5 });
  drain(arena);
  use(arena, a, READY);
  assert.equal(arena.getPlayer(v), undefined, 'first hit (charged): knockout');
  drain(arena);
  use(arena, a, READY + 300);
  assert.equal(hp(arena, c), 75, 'charging: 25% of 100');
  const out = drain(arena);
  assert.equal(msgs(out, 'ko').length, 0);
  assert.deepEqual(msgs(out, 'dmg').map(m => m.amount), [25]);
});

test('anti-spam: at most one use every MIN_FIRE_GAP_MS (150 ms), whatever the weapon', () => {
  const { arena, a, v } = face({ loadout: ['shootbm'] });
  assert.equal(use(arena, a, READY), true);
  arena.selectSlot(a, 0);
  assert.equal(use(arena, a, READY + RULES.MIN_FIRE_GAP_MS - 1), false, 'too fast, even with another weapon');
  assert.equal(hp(arena, v), 95);
  assert.deepEqual(arena.getPlayer(a).dur, [15, 19], 'a refused fire costs nothing');
  assert.equal(use(arena, a, READY + RULES.MIN_FIRE_GAP_MS), true);
  assert.equal(hp(arena, v), 93);
  // tapping very fast for 3 s: at most one use every 150 ms
  let n = 0;
  for (let t = READY + 1000; t < READY + 4000; t += 16) if (use(arena, a, t, 30)) n++;
  assert.ok(n <= Math.ceil(3000 / RULES.MIN_FIRE_GAP_MS), `${n} uses`);
});

test('the charging factor and the gap come from the rules (the boss can tune them)', () => {
  const rules = { ...RULES, CHARGING_DAMAGE: 0.5, MIN_FIRE_GAP_MS: 1000 };
  const { arena, a, v } = face({ loadout: ['shootbm'], rules });
  use(arena, a, READY);
  assert.equal(use(arena, a, READY + 500), false, 'gap 1 s');
  use(arena, a, READY + 1000);
  assert.equal(hp(arena, v), 100 - 5 - 3, '50% of 5 = 2.5 -> 3');
  // rules without the numbers: the defaults (25%, 150 ms)
  const plain = { ...RULES };
  delete plain.CHARGING_DAMAGE;
  delete plain.MIN_FIRE_GAP_MS;
  const d = face({ loadout: ['shootbm'], rules: plain });
  use(d.arena, d.a, READY);
  assert.equal(use(d.arena, d.a, READY + 149), false);
  use(d.arena, d.a, READY + 150);
  assert.equal(hp(d.arena, d.v), 100 - 5 - 1);
});

test('a raised Mega Shield sends back its part of the weak damage; the shield still wears', () => {
  const { arena, a, v } = face({ loadout: ['supersword'], victimLoadout: ['megashield'] });
  arena.setShield(v, true, READY);
  use(arena, a, READY); // charged: blocked, 25 back
  assert.equal(hp(arena, a), 75);
  assert.equal(arena.getPlayer(v).shield.dur, 70 - 5);
  use(arena, a, READY + 200); // charging: 25 blocked, 25% of that back (6)
  assert.equal(hp(arena, a), 75 - 6);
  assert.equal(arena.getPlayer(v).shield.dur, 70 - 10);
});

test('a dropped weapon loses its charge: picked up again it is ready', () => {
  const { arena, a, v } = face({ loadout: ['shootbm'] });
  use(arena, a, READY);
  const itemId = arena.dropWeapon(a, READY + 10);
  const it = arena.items().find(i => i.id === itemId);
  assert.deepEqual(arena.getPlayer(a).useAt, [-Infinity], 'the slot is gone');
  arena.teleport(a, { x: 20, z: 20 });
  arena.tick(READY + 100);
  arena.teleport(a, { x: it.x, z: it.z });
  arena.tick(READY + 200);
  assert.deepEqual(arena.getPlayer(a).weapons, ['gun', 'shootbm']);
  assert.deepEqual(arena.getPlayer(a).useAt, [-Infinity, -Infinity], 'picked up fully charged');
  arena.selectSlot(a, 1);
  arena.teleport(a, { x: 0, z: 0, ry: 0 });
  use(arena, a, READY + 300);
  assert.equal(hp(arena, v), 90, 'full damage');
});

test('a broken weapon takes its charge with it (the slots stay in line)', () => {
  const rules = { ...RULES, WEAPONS: { ...RULES.WEAPONS, gun: { ...RULES.WEAPONS.gun, durability: 1 } } };
  const { arena, a } = face({ loadout: ['shootbm'], rules });
  use(arena, a, READY); // the Shootbm (slot 1) charges
  arena.selectSlot(a, 0);
  use(arena, a, READY + 200, 30); // the Gun's only shot: it breaks
  const p = arena.getPlayer(a);
  assert.deepEqual(p.weapons, ['shootbm']);
  assert.deepEqual(p.useAt, [READY], 'the Shootbm keeps its own charge');
  assert.deepEqual(lastInv(arena, a).charge, [W.shootbm.rate * 1000 * SLACK - 200]);
});

test('same calls, same messages (charging is deterministic)', () => {
  const run = () => {
    const { arena, a } = face({ loadout: ['electricsword', 'shootbm', 'icesword'] });
    const log = [];
    for (let t = READY, i = 0; t < READY + 20000; t += 130, i++) {
      if (i % 5 === 0) arena.selectSlot(a, i % 4);
      use(arena, a, t);
      arena.tick(t);
      log.push(...drain(arena));
    }
    return log;
  };
  const one = run();
  assert.ok(one.some(e => e.msg?.t === 'dmg'));
  assert.deepEqual(run(), one);
});
