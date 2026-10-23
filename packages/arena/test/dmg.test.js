// Damage numbers (#33): everyone near a player who loses health gets a 'dmg' message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs, aimAt, RULES } from './helpers.js';

const READY = RULES.SPAWN_PROTECT_MS + 100; // spawn protection is over
const W = RULES.WEAPONS;
const R = 160; // tuning snapshotRadius

// Attacker `a` at (0, 0) facing +z with loadout[0] in hand, victim `v` 2 m in front looking back,
// `near` 30 m away, `far` farther than the snapshot radius from the victim.
function setup({ loadout = ['electricsword'], victimLoadout = [], rules } = {}) {
  const arena = makeArena({ rules, tuning: { snapshotRadius: R } });
  const a = arena.join('att', { name: 'Att', loadout }).id;
  const v = arena.join('vic', { name: 'Vic', loadout: victimLoadout }).id;
  const near = arena.join('near', { name: 'Near' }).id;
  const far = arena.join('far', { name: 'Far' }).id;
  arena.selectSlot(a, 1);
  arena.teleport(a, { x: 0, z: 0, ry: 0 });
  arena.teleport(v, { x: 0, z: 2, ry: Math.PI });
  arena.teleport(near, { x: 30, z: 2 });
  arena.teleport(far, { x: -(R + 10), z: 2 });
  drain(arena);
  return { arena, a, v, near, far };
}
const swing = (arena, a, t) => arena.fire(a, [0, 0, 1], t);
const dmgEvents = out => out.filter(e => e.msg?.t === 'dmg');

test('a hit: "-15" goes to everyone near the victim (the victim and the attacker too), not to far players', () => {
  const { arena, a, v, near, far } = setup();
  swing(arena, a, READY);
  const out = drain(arena);
  const evs = dmgEvents(out);
  assert.equal(evs.length, 1, 'one event with a list of player ids');
  assert.deepEqual(evs[0].msg, { t: 'dmg', id: v, amount: W.electricsword.dmg });
  assert.deepEqual([...evs[0].to].sort(), [a, v, near].sort());
  assert.ok(!evs[0].to.includes(far));
  assert.deepEqual(msgs(out, 'dmg', far), []);
});

test('shock ticks show "-1" with shock: true', () => {
  const { arena, a, v } = setup();
  swing(arena, a, READY);
  drain(arena);
  arena.tick(READY + 5000);
  assert.deepEqual(msgs(drain(arena), 'dmg', v), [{ t: 'dmg', id: v, amount: 1, shock: true }]);
});

test('a knockout: the hp that was left, ko: true, also sent to the knocked-out player', () => {
  const { arena, a, v, near } = setup({ loadout: ['supersword'] });
  swing(arena, a, READY);
  const out = drain(arena);
  assert.equal(arena.getPlayer(v), undefined, 'knocked out');
  const ko = { t: 'dmg', id: v, amount: 100, ko: true };
  assert.deepEqual(msgs(out, 'dmg', v), [ko]);
  assert.deepEqual(msgs(out, 'dmg', near), [ko]);
  // it comes before the 'ko' message, so the number shows over the stickman before it disappears
  assert.ok(out.findIndex(e => e.msg?.t === 'dmg') < out.findIndex(e => e.msg?.t === 'ko'));
});

test('a blocked hit: amount 0, blocked: true; a Mega Shield reflect shows on the attacker', () => {
  const { arena, a, v, near } = setup({ victimLoadout: ['megashield'] });
  arena.setShield(v, true, READY);
  swing(arena, a, READY);
  const out = drain(arena);
  assert.equal(arena.getPlayer(v).hp, 100);
  assert.deepEqual(msgs(out, 'dmg', near), [
    { t: 'dmg', id: v, amount: 0, blocked: true },
    { t: 'dmg', id: a, amount: Math.round(W.electricsword.dmg * W.megashield.reflect) },
  ]);
});

test('no number without damage: spawn protection', () => {
  const { arena, a } = setup({ loadout: ['shootbm'] });
  const fresh = arena.join('new', { name: 'New' }, READY).id; // just joined: still protected
  arena.teleport(fresh, { x: 10, z: -3 }); // nobody else in the line of fire
  drain(arena);
  arena.fire(a, aimAt(arena, a, fresh), READY);
  assert.equal(arena.getPlayer(fresh).hp, 100);
  assert.deepEqual(dmgEvents(drain(arena)), []);
});

test('damage numbers replay exactly the same', () => {
  const run = () => {
    const { arena, a, v } = setup({ loadout: ['electricsword', 'icesword'], victimLoadout: ['shield'] });
    const log = [];
    for (let t = READY, i = 0; t < READY + 60000; t += 1000, i++) {
      if (i % 9 === 0) arena.setShield(v, i % 2 === 0, t);
      if (i % 7 === 0) arena.selectSlot(a, 1 + (i % 2));
      swing(arena, a, t);
      arena.tick(t);
      log.push(...drain(arena));
    }
    return log;
  };
  const one = run();
  assert.ok(dmgEvents(one).some(e => e.msg.shock) && dmgEvents(one).some(e => e.msg.blocked));
  assert.deepEqual(run(), one);
});
