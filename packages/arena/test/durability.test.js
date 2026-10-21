import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs, aimAt, RULES } from './helpers.js';

const READY = RULES.SPAWN_PROTECT_MS + 100;

// Rules where every weapon is like the real one, but with a chosen durability / wearPerUse.
function rulesWith(changes) {
  const WEAPONS = { ...RULES.WEAPONS };
  for (const [id, extra] of Object.entries(changes)) WEAPONS[id] = { ...WEAPONS[id], ...extra };
  return { ...RULES, WEAPONS };
}

// One player holding `weapon` in slot 1, far away from anyone.
function holder(weapon, { rules, loadout = [weapon] } = {}) {
  const arena = makeArena({ rules });
  const id = arena.join('a', { loadout }).id;
  arena.selectSlot(id, 1);
  arena.teleport(id, { x: 0, z: 0 });
  drain(arena);
  return { arena, id };
}

const durOf = (arena, id) => arena.getPlayer(id).dur;

test('join: every weapon starts full, the starting Gun too', () => {
  const arena = makeArena();
  const id = arena.join('a', { loadout: ['sniper', 'pistol'] }).id;
  const inv = msgs(drain(arena), 'inv', id)[0];
  assert.deepEqual(inv.weapons, ['gun', 'sniper', 'pistol']);
  assert.deepEqual(inv.dur, [15, RULES.WEAPONS.sniper.durability, RULES.WEAPONS.pistol.durability]);
  assert.deepEqual(durOf(arena, id), inv.dur);
});

test('each use that passes the rate check costs 1; refused fires cost nothing', () => {
  const { arena, id } = holder('pistol');
  const max = RULES.WEAPONS.pistol.durability;
  assert.equal(arena.fire(id, [0, 0, 1], READY), true);
  assert.equal(durOf(arena, id)[1], max - 1);
  assert.deepEqual(msgs(drain(arena), 'inv', id).at(-1).dur, [15, max - 1]);
  assert.equal(arena.fire(id, [0, 0, 1], READY + 10), false); // too fast
  assert.equal(durOf(arena, id)[1], max - 1);
  assert.equal(arena.fire(id, [0, 0, 0], READY + 1000), false); // no direction
  assert.equal(durOf(arena, id)[1], max - 1);
});

test('wearPerUse is used', () => {
  const { arena, id } = holder('pistol', { rules: rulesWith({ pistol: { durability: 10, wearPerUse: 3 } }) });
  arena.fire(id, [0, 0, 1], READY);
  assert.equal(durOf(arena, id)[1], 7);
});

test('every weapon type wears out: swing, shot, throw, rocket, mine', () => {
  for (const w of ['sword', 'shotgun', 'grenade', 'rocket', 'mine']) {
    const { arena, id } = holder(w);
    assert.equal(arena.fire(id, [0, 0, 1], READY), true, w);
    assert.equal(durOf(arena, id)[1], RULES.WEAPONS[w].durability - 1, w);
  }
});

test('breaks exactly at 0: disappears, sends broke + inv, hand moves to a valid slot', () => {
  const rules = rulesWith({ sniper: { durability: 3 } });
  const { arena, id } = holder('sniper', { rules, loadout: ['sniper', 'pistol'] });
  let t = READY;
  for (let i = 0; i < 2; i++, t += 2000) assert.equal(arena.fire(id, [0, 0, 1], t), true);
  assert.deepEqual(arena.getPlayer(id).weapons, ['gun', 'sniper', 'pistol'], 'still there at 1');
  assert.equal(durOf(arena, id)[1], 1);
  drain(arena);

  assert.equal(arena.fire(id, [0, 0, 1], t), true); // last use still fires
  const out = drain(arena);
  assert.equal(msgs(out, 'shot').length, 1);
  assert.deepEqual(msgs(out, 'broke', id), [{ t: 'broke', slot: 1, weapon: 'sniper' }]);
  const order = out.filter(e => e.to === id).map(e => e.msg.t);
  assert.ok(order.indexOf('broke') < order.lastIndexOf('inv'), 'inv after broke');
  const inv = msgs(out, 'inv', id).at(-1);
  assert.deepEqual(inv.weapons, ['gun', 'pistol']);
  assert.deepEqual(inv.dur, [15, RULES.WEAPONS.pistol.durability]);
  assert.equal(inv.slot, 1);
  const p = arena.getPlayer(id);
  assert.deepEqual(p.weapons, ['gun', 'pistol']);
  assert.equal(p.slot, 1);
  // gone for good: leaving alive gives back only the pistol
  assert.deepEqual(arena.leave(id, { alive: true }), ['pistol']);
});

test('breaking the last slot moves the hand to the slot before it', () => {
  const { arena, id } = holder('rocket', { rules: rulesWith({ rocket: { durability: 1 } }) });
  arena.fire(id, [0, 0, 1], READY);
  const p = arena.getPlayer(id);
  assert.deepEqual(p.weapons, ['gun']);
  assert.equal(p.slot, 0);
  assert.equal(arena.projectiles().length, 1, 'the last rocket still flies');
});

test('the starting Gun: 2 damage, one shot every 2 s, breaks after 15 shots and disappears', () => {
  const arena = makeArena();
  const id = arena.join('a', {}).id;
  const v = arena.join('v', {}).id;
  arena.teleport(id, { x: 0, z: 0 });
  arena.teleport(v, { x: 10, z: 0 });
  let t = READY;
  assert.equal(arena.fire(id, aimAt(arena, id, v), t), true);
  assert.equal(arena.getPlayer(v).hp, RULES.MAX_HP - 2);
  assert.equal(arena.fire(id, aimAt(arena, id, v), t + 1000), false, 'too soon: 2 s between shots');
  for (let i = 1; i < 15; i++) { t += 2000; assert.equal(arena.fire(id, [0, 1, 0], t), true, `shot ${i + 1}`); }
  const out = drain(arena);
  assert.deepEqual(msgs(out, 'broke', id), [{ t: 'broke', slot: 0, weapon: 'gun' }]);
  assert.deepEqual(arena.getPlayer(id).weapons, [], 'nothing left, not even fists');
  assert.deepEqual(durOf(arena, id), []);
  assert.deepEqual(msgs(out, 'inv', id).at(-1).weapons, []);
  assert.equal(arena.fire(id, [0, 1, 0], t + 5000), false);
  assert.deepEqual(arena.leave(id, { alive: true }), [], 'a broken starting Gun is not given back');
});

test('never breaks is a per-weapon setting', () => {
  const rules = rulesWith({ gun: { durability: 2 }, pistol: { durability: null } });
  const arena = makeArena({ rules });
  const id = arena.join('a', { loadout: ['pistol'] }).id;
  arena.fire(id, [0, 0, 1], READY);
  arena.fire(id, [0, 0, 1], READY + 3000);
  assert.deepEqual(arena.getPlayer(id).weapons, ['pistol'], 'the gun broke');
  assert.equal(arena.getPlayer(id).slot, 0);
  assert.equal(arena.snapshotFor(id).p[0][7], 'pistol');
  let t = READY + 6000;
  for (let i = 0; i < 100; i++, t += 1000) arena.fire(id, [0, 0, 1], t);
  assert.deepEqual(arena.getPlayer(id).weapons, ['pistol']);
});

test('an empty inventory is safe: nothing to fire, snapshot still valid, picking up works', () => {
  const arena = makeArena({ rules: rulesWith({ gun: { durability: 1 } }) });
  const id = arena.join('a', {}).id;
  arena.fire(id, [0, 0, 1], READY);
  assert.deepEqual(arena.getPlayer(id).weapons, []);
  assert.equal(arena.fire(id, [0, 0, 1], READY + 3000), false);
  assert.equal(arena.selectSlot(id, 0), false);
  arena.tick(READY + 3100);
  drain(arena); // checks every message against the protocol
  assert.equal(arena.snapshotFor(id).p[0][7], '');
  // open a chest and pick up what it gives
  arena.teleport(id, { x: 10, z: 30 });
  arena.openChest(id, 0, READY + 3200);
  const item = arena.items()[0];
  arena.teleport(id, { x: item.x, z: item.z });
  arena.tick(READY + 3300);
  const inv = msgs(drain(arena), 'inv', id).at(-1);
  assert.deepEqual(inv.weapons, [item.weapon]);
  assert.equal(inv.slot, 0);
});

test('knockout drops weapons with their wear; picking one up keeps it', () => {
  const arena = makeArena();
  const s = arena.join('shooter', { loadout: ['sniper'] }).id;
  const v = arena.join('victim', { loadout: ['pistol'] }).id;
  const w = arena.join('walker', {}).id;
  arena.teleport(s, { x: 0, z: 0 });
  arena.teleport(v, { x: 20, z: 0 });
  arena.teleport(w, { x: -40, z: 0 });
  arena.selectSlot(v, 1);
  arena.fire(v, [0, 1, 0], READY); // victim wears the pistol a bit
  arena.fire(v, [0, 1, 0], READY + 1000);
  const left = RULES.WEAPONS.pistol.durability - 2;
  arena.selectSlot(s, 1);
  arena.fire(s, aimAt(arena, s, v), READY + 2000);
  arena.fire(s, aimAt(arena, s, v), READY + 4000);
  const out = drain(arena);
  assert.equal(arena.getPlayer(v), undefined, 'knocked out');
  const drop = msgs(out, 'item+').find(m => m.weapon === 'pistol');
  assert.equal(drop.dur, left);
  assert.equal(msgs(out, 'item+').find(m => m.kind === 'bandage').dur, undefined, 'heals have no dur');
  assert.equal(arena.items().find(i => i.id === drop.id).dur, left);
  assert.equal(arena.welcomeFor(s).items.find(i => i.id === drop.id).dur, left);

  arena.teleport(w, { x: drop.x, z: drop.z });
  arena.tick(READY + 4050);
  const inv = msgs(drain(arena), 'inv', w).at(-1);
  assert.deepEqual(inv.weapons, ['gun', 'pistol']);
  assert.deepEqual(inv.dur, [15, left], 'more than half left: keeps it');
});

test('dropped weapons with half or less durability come back at half (rounded up); more than half keeps it', () => {
  const rules = rulesWith({ pistol: { durability: 11 } });
  const arena = makeArena({ rules });
  const s = arena.join('shooter', { loadout: ['sniper'] }).id;
  const v = arena.join('victim', { loadout: ['pistol'] }).id;
  const w = arena.join('walker', {}).id;
  arena.teleport(s, { x: 0, z: 0 });
  arena.teleport(v, { x: 20, z: 0 });
  arena.teleport(w, { x: -40, z: 0 });
  arena.selectSlot(v, 1);
  let t = READY;
  for (let i = 0; i < 9; i++, t += 1000) arena.fire(v, [0, 1, 0], t); // pistol: 2 of 11 left
  arena.selectSlot(v, 0);
  t += 2000;
  assert.equal(arena.fire(v, [0, 1, 0], t), true); // gun: 14 of 15 left
  arena.selectSlot(s, 1);
  arena.fire(s, aimAt(arena, s, v), t + 100);
  arena.fire(s, aimAt(arena, s, v), t + 2100);
  const out = drain(arena);
  assert.equal(arena.getPlayer(v), undefined, 'knocked out');
  const drops = msgs(out, 'item+');
  assert.equal(drops.find(m => m.weapon === 'pistol').dur, 6, '2 of 11 -> 5.5 rounded up');
  assert.equal(drops.find(m => m.weapon === 'gun').dur, 14, '14 of 15 is more than half: kept');
  const pistol = drops.find(m => m.weapon === 'pistol');
  arena.teleport(w, { x: pistol.x, z: pistol.z });
  arena.tick(t + 2200);
  const inv = msgs(drain(arena), 'inv', w).at(-1);
  assert.deepEqual(inv.weapons, ['gun', 'pistol']);
  assert.deepEqual(inv.dur, [15, 6]);
});

test('chest loot starts full', () => {
  const arena = makeArena();
  const id = arena.join('a', {}).id;
  arena.teleport(id, { x: 10, z: 30 });
  arena.openChest(id, 0, 100);
  const item = msgs(drain(arena), 'item+')[0];
  assert.equal(item.kind, 'weapon');
  assert.equal(item.dur, RULES.WEAPONS[item.weapon].durability);
});

test('leaving alive returns worn weapons as plain ids (full again next join)', () => {
  const { arena, id } = holder('pistol');
  arena.fire(id, [0, 0, 1], READY);
  const back = arena.leave(id, { alive: true });
  assert.deepEqual(back, ['pistol']);
  const again = arena.join('a', { loadout: back }).id;
  assert.equal(durOf(arena, again)[1], RULES.WEAPONS.pistol.durability);
});
