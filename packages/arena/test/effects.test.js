// Electric Sword shock, Ice Sword freeze, Supersword knockout, Shield and Mega Shield (#26).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs, aimAt, chestAlways, RULES } from './helpers.js';

const READY = RULES.SPAWN_PROTECT_MS + 100; // spawn protection is over
const W = RULES.WEAPONS;

// Attacker `a` at (0, 0) facing +z holding loadout[0] in slot 2; victim `v` 2 m in front of it, facing `vry`.
function face({ loadout, victimLoadout = [], vry = Math.PI, rules, dist = 2 } = {}) {
  const arena = makeArena({ rules });
  const a = arena.join('att', { name: 'Att', loadout }).id;
  const v = arena.join('vic', { name: 'Vic', loadout: victimLoadout }).id;
  arena.selectSlot(a, 1);
  arena.teleport(a, { x: 0, z: 0, ry: 0 });
  arena.teleport(v, { x: 0, z: dist, ry: vry }); // vry = PI: the victim looks at the attacker
  drain(arena);
  return { arena, a, v };
}
const hp = (arena, id) => arena.getPlayer(id)?.hp;
const shieldOf = (arena, id) => arena.getPlayer(id)?.shield;
const swing = (arena, a, t) => arena.fire(a, [0, 0, 1], t);

test('Electric Sword: 15 damage, then 1 HP every 5 s for 15 s (3 more), on time', () => {
  const { arena, a, v } = face({ loadout: ['electricsword'] });
  const t0 = READY;
  assert.equal(swing(arena, a, t0), true);
  assert.equal(hp(arena, v), 85);
  assert.equal(arena.isShocked(v), true);
  assert.equal(arena.snapshotFor(v).p.find(e => e[0] === v)[11], 2, 'status bit 2 = shocked');
  drain(arena);
  const hpAt = t => { arena.tick(t); return hp(arena, v); };
  assert.equal(hpAt(t0 + 4999), 85);
  assert.equal(hpAt(t0 + 5000), 84);
  assert.equal(hpAt(t0 + 9999), 84);
  assert.equal(hpAt(t0 + 10000), 83);
  assert.equal(hpAt(t0 + 15000), 82);
  assert.equal(arena.isShocked(v), false, 'over after 15 s');
  assert.equal(hpAt(t0 + 40000), 82, 'exactly 3 extra damage');
  const hurts = msgs(drain(arena), 'hurt', v);
  assert.deepEqual(hurts.map(h => h.hp), [84, 83, 82]);
});

test('shock ticks that were missed by a late tick all happen, and a new hit starts it over', () => {
  const { arena, a, v } = face({ loadout: ['electricsword'] });
  swing(arena, a, READY);
  arena.tick(READY + 11000); // two ticks were due
  assert.equal(hp(arena, v), 83);
  swing(arena, a, READY + 12000); // hit again: -15, shock starts over (3 more ticks)
  assert.equal(hp(arena, v), 68);
  arena.tick(READY + 30000);
  assert.equal(hp(arena, v), 65);
  assert.equal(arena.isShocked(v), false);
});

test('a shock tick can knock out, and the attacker gets the credit', () => {
  const rules = { ...RULES, WEAPONS: { ...W, electricsword: { ...W.electricsword, dmg: 99 } } };
  const { arena, a, v } = face({ loadout: ['electricsword'], rules });
  swing(arena, a, READY);
  assert.equal(hp(arena, v), 1);
  drain(arena);
  arena.tick(READY + 5000);
  const out = drain(arena);
  assert.equal(arena.getPlayer(v), undefined);
  assert.deepEqual(msgs(out, 'dead', v), [{ t: 'dead', by: 'Att', weapon: 'electricsword' }]);
});

test('Ice Sword: 10 damage and the target is completely stuck for 2 s', () => {
  const { arena, a, v } = face({ loadout: ['icesword'], victimLoadout: ['shootbm', 'shield'], vry: 0 }); // victim looks away
  const t0 = READY;
  swing(arena, a, t0);
  assert.equal(hp(arena, v), 90);
  assert.equal(arena.isFrozen(v), true);
  assert.equal(arena.snapshotFor(v).p.find(e => e[0] === v)[11] & 4, 4, 'status bit 4 = frozen');
  drain(arena);
  // cannot move (a 'pos' puts it back), turn, shoot, switch slot or raise the shield
  const before = arena.getPlayer(v);
  assert.equal(arena.setState(v, { x: before.x + 0.5, y: 0, z: before.z, ry: 1, pitch: 0, f: 4 }, t0 + 100), false);
  assert.deepEqual(msgs(drain(arena), 'pos', v), [{ t: 'pos', x: before.x, y: before.y, z: before.z }]);
  assert.equal(arena.getPlayer(v).x, before.x);
  assert.equal(arena.getPlayer(v).ry, before.ry);
  assert.equal(arena.fire(v, [0, 0, -1], t0 + 200), false);
  assert.equal(arena.selectSlot(v, 1), false);
  assert.equal(arena.setShield(v, true, t0 + 300), false);
  assert.equal(arena.getPlayer(v).slot, 0);
  // just before 2 s still stuck, at 2 s free again
  assert.equal(arena.fire(v, [0, 0, -1], t0 + 1999), false);
  arena.tick(t0 + 2000);
  assert.equal(arena.isFrozen(v), false);
  assert.equal(arena.setState(v, { x: before.x + 0.5, y: 0, z: before.z, ry: 1, pitch: 0, f: 4 }, t0 + 2050), true);
  assert.equal(arena.selectSlot(v, 1), true);
  assert.equal(arena.fire(v, [0, 0, -1], t0 + 2100), true);
});

test('freezing lowers a raised shield (only possible from behind)', () => {
  const { arena, a, v } = face({ loadout: ['icesword'], victimLoadout: ['shield'], vry: 0 });
  assert.equal(arena.setShield(v, true, READY), true);
  swing(arena, a, READY);
  assert.equal(hp(arena, v), 90, 'from behind the shield does not help');
  assert.equal(arena.getPlayer(v).shieldUp, false);
  assert.equal(shieldOf(arena, v).dur, 60);
});

test('Supersword: any hit knocks out at once, 1.5 s between hits', () => {
  const { arena, a, v } = face({ loadout: ['supersword'] });
  const c = arena.join('cat', {}).id;
  arena.teleport(c, { x: 0.5, z: 2.5 });
  assert.equal(swing(arena, a, READY), true);
  assert.equal(arena.getPlayer(v), undefined, 'one hit, knocked out');
  assert.equal(swing(arena, a, READY + 1300), false, 'too soon (the server allows 10% early for lag)');
  assert.equal(swing(arena, a, READY + 1500), true);
  assert.equal(arena.getPlayer(c), undefined);
  // even with more HP than 100 it is a knockout
  const rules = { ...RULES, MAX_HP: 250 };
  const big = face({ loadout: ['supersword'], rules });
  swing(big.arena, big.a, READY);
  assert.equal(big.arena.getPlayer(big.v), undefined);
});

test('Shield: only on the arm, never in a slot; join wears the first shield of the loadout', () => {
  const arena = makeArena();
  const r = arena.join('a', { loadout: ['shield', 'shootbm', 'megashield', 'icesword'] });
  assert.deepEqual(r.weapons, ['shield', 'shootbm', 'icesword'], 'the second shield is not taken (stays in the backpack)');
  const p = arena.getPlayer(r.id);
  assert.deepEqual(p.weapons, ['gun', 'shootbm', 'icesword']);
  assert.deepEqual(p.shield, { id: 'shield', dur: 60 });
  const inv = msgs(drain(arena), 'inv', r.id)[0];
  assert.deepEqual(inv.shield, { id: 'shield', dur: 60 });
  assert.equal(arena.selectSlot(r.id, 3), false, 'no slot for the shield');
  assert.equal(arena.snapshotFor(r.id).p[0][10], 'shield', 'others see it on the arm');
  assert.deepEqual(arena.leave(r.id, { alive: true }), ['shootbm', 'icesword', 'shield'], 'it goes back to the backpack');
  const none = arena.join('b', {});
  assert.equal(arena.getPlayer(none.id).shield, null);
  assert.equal(arena.setShield(none.id, true), false, 'no shield to raise');
});

test('Shield blocks hits from the front only: 0 damage, 1 durability per blocked hit, cannot attack while raised', () => {
  const { arena, a, v } = face({ loadout: ['icesword'], victimLoadout: ['shootbm', 'shield'] });
  assert.equal(arena.setShield(v, true, READY), true);
  assert.equal(arena.setShield(v, true, READY), false, 'already up');
  assert.equal(arena.snapshotFor(v).p.find(e => e[0] === v)[11] & 1, 1, 'status bit 1 = shield up');
  swing(arena, a, READY);
  let out = drain(arena);
  assert.equal(hp(arena, v), 100);
  assert.equal(arena.isFrozen(v), false, 'a blocked hit has no freeze');
  assert.equal(shieldOf(arena, v).dur, 59);
  assert.deepEqual(msgs(out, 'block'), [{ t: 'block', id: v, by: a }]);
  assert.deepEqual(msgs(out, 'hitmark', a), [{ t: 'hitmark', dead: false, blocked: true }]);
  assert.deepEqual(msgs(out, 'inv', v).at(-1).shield, { id: 'shield', dur: 59 });
  assert.equal(msgs(out, 'hurt', v).length, 0);
  // while raised: no shooting or hitting
  arena.selectSlot(v, 1);
  assert.equal(arena.fire(v, [0, 0, -1], READY + 100), false);
  // a gun from the front is blocked too
  const s = arena.join('sho', { loadout: ['shootbm'] }).id;
  arena.selectSlot(s, 1);
  arena.teleport(s, { x: 0, z: 20 }); // behind the victim
  arena.teleport(v, { x: 0, z: 2, ry: Math.PI });
  arena.fire(s, aimAt(arena, s, v), READY + 5000);
  assert.equal(hp(arena, v), 95, 'from behind: hurt');
  arena.teleport(s, { x: -20, z: -10 }); // in front (and not behind the other attacker)
  arena.fire(s, aimAt(arena, s, v), READY + 8000);
  assert.equal(hp(arena, v), 95, 'from the front: blocked');
  assert.equal(shieldOf(arena, v).dur, 58);
  // lowered: hits land again, and the attack works again
  assert.equal(arena.setShield(v, false, READY + 9000), true);
  swing(arena, a, READY + 9000);
  assert.equal(hp(arena, v), 85);
  assert.equal(arena.fire(v, [0, 0, -1], READY + 12000), true);
});

test('Shield breaks at 0 and disappears', () => {
  const rules = { ...RULES, WEAPONS: { ...W, shield: { ...W.shield, durability: 2 } } };
  const { arena, a, v } = face({ loadout: ['icesword'], victimLoadout: ['shield'], rules });
  arena.setShield(v, true, READY);
  swing(arena, a, READY);
  swing(arena, a, READY + 3000);
  const out = drain(arena);
  assert.deepEqual(msgs(out, 'shieldbroke', v), [{ t: 'shieldbroke', weapon: 'shield' }]);
  assert.equal(shieldOf(arena, v), null);
  assert.equal(arena.getPlayer(v).shieldUp, false);
  assert.equal(msgs(out, 'inv', v).at(-1).shield, null);
  assert.equal(hp(arena, v), 100, 'the last block still blocked');
  swing(arena, a, READY + 6000);
  assert.equal(hp(arena, v), 90);
  assert.deepEqual(arena.leave(v, { alive: true }), [], 'a broken shield is gone for good');
});

test('Supersword on a raised shield: the shield loses 5, the holder takes 0', () => {
  const { arena, a, v } = face({ loadout: ['supersword'], victimLoadout: ['shield'] });
  arena.setShield(v, true, READY);
  swing(arena, a, READY);
  assert.equal(hp(arena, v), 100);
  assert.equal(shieldOf(arena, v).dur, 55);
});

test('Mega Shield: 70 blocked hits and 25% of the blocked damage goes back to the attacker', () => {
  const { arena, a, v } = face({ loadout: ['electricsword'], victimLoadout: ['megashield'] });
  assert.deepEqual(shieldOf(arena, v), { id: 'megashield', dur: 70 });
  arena.setShield(v, true, READY);
  swing(arena, a, READY);
  const out = drain(arena);
  assert.equal(hp(arena, v), 100);
  assert.equal(arena.isShocked(v), false, 'no shock through the shield');
  assert.equal(shieldOf(arena, v).dur, 69);
  assert.equal(hp(arena, a), 100 - Math.round(15 * 0.25), '25% of 15, rounded');
  assert.equal(msgs(out, 'hurt', a)[0].hp, 96);
  assert.equal(msgs(out, 'hitmark', v)[0].dead, false, 'the shield holder gets the hitmark');
  // Supersword on a Mega Shield: -5 durability, 25 back
  const s = face({ loadout: ['supersword'], victimLoadout: ['megashield'] });
  s.arena.setShield(s.v, true, READY);
  swing(s.arena, s.a, READY);
  assert.equal(hp(s.arena, s.v), 100);
  assert.equal(shieldOf(s.arena, s.v).dur, 65);
  assert.equal(hp(s.arena, s.a), 75);
});

test('a reflected hit can knock the attacker out (credit to the shield holder)', () => {
  const { arena, a, v } = face({ loadout: ['supersword'], victimLoadout: ['megashield'] });
  arena.setShield(v, true, READY);
  let t = READY;
  for (let i = 0; i < 4; i++, t += 1500) swing(arena, a, t);
  const out = drain(arena);
  assert.equal(arena.getPlayer(a), undefined, '4 x 25 = 100');
  assert.deepEqual(msgs(out, 'dead', a), [{ t: 'dead', by: 'Vic', weapon: 'megashield' }]);
  assert.equal(shieldOf(arena, v).dur, 50);
  assert.ok(msgs(out, 'item+').some(m => m.weapon === 'supersword'), 'the attacker dropped the Supersword');
});

test('picking up shields: you wear one; a rarer one swaps (yours drops), others stay on the ground', () => {
  const arena = makeArena({ rules: chestAlways('megashield') });
  const id = arena.join('a', { loadout: ['shield'] }).id;
  arena.teleport(id, { x: 10, z: 31 });
  arena.openChest(id, 0, 100);
  const mega = arena.items()[0];
  assert.equal(mega.weapon, 'megashield');
  arena.teleport(id, { x: mega.x, z: mega.z });
  drain(arena);
  arena.tick(200);
  let out = drain(arena);
  assert.deepEqual(shieldOf(arena, id), { id: 'megashield', dur: 70 });
  assert.equal(msgs(out, 'inv', id).at(-1).picked, 'Mega Shield');
  assert.deepEqual(arena.getPlayer(id).weapons, ['gun'], 'no slot used');
  const old = msgs(out, 'item+')[0];
  assert.deepEqual([old.weapon, old.dur], ['shield', 60], 'the old shield dropped with its durability');
  arena.tick(300);
  assert.equal(arena.items().length, 1, 'the plain Shield stays on the ground');
  // someone without a shield picks it up
  const b = arena.join('b', {}).id;
  arena.teleport(b, { x: old.x, z: old.z });
  arena.tick(400);
  assert.deepEqual(shieldOf(arena, b), { id: 'shield', dur: 60 });
  assert.equal(arena.items().length, 0);
});

test('effects and shields replay exactly the same', () => {
  const run = () => {
    const { arena, a, v } = face({ loadout: ['electricsword', 'icesword'], victimLoadout: ['megashield'] });
    const log = [];
    for (let t = READY, i = 0; t < READY + 40000; t += 250, i++) {
      if (i % 9 === 0) arena.setShield(v, i % 2 === 0, t);
      if (i % 7 === 0) arena.selectSlot(a, 1 + (i % 2));
      arena.fire(a, [0, 0, 1], t);
      arena.tick(t);
      log.push(...drain(arena));
    }
    return log;
  };
  const one = run();
  assert.ok(msgs(one, 'block').length > 0 && msgs(one, 'hurt').length > 0);
  assert.deepEqual(run(), one);
});
