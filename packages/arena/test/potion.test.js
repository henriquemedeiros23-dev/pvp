// The Healing Potion (#28): the only heal. Drinking takes POTION.drinkMs (5 s) and gives full H.P.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeArena, drain, msgs, aimAt, RULES } from './helpers.js';

const READY = RULES.SPAWN_PROTECT_MS + 100; // spawn protection is over
const DRINK = RULES.POTION.drinkMs;

// A shooter (Gun, Shootbm in slot 2, Supersword in slot 3) and a victim with potions 2 m in front of it;
// the victim is hurt once by the Shootbm.
const SHOOTBM = RULES.WEAPONS.shootbm.dmg;
const HURT = RULES.MAX_HP - SHOOTBM;
function hurtPlayer({ potions = 2, victimLoadout = ['icesword'] } = {}) {
  const arena = makeArena();
  const s = arena.join('shooter', { loadout: ['shootbm', 'supersword'] }).id;
  const v = arena.join('victim', { loadout: victimLoadout, potions }).id;
  arena.selectSlot(s, 1);
  arena.teleport(s, { x: 0, z: 0, ry: 0 });
  arena.teleport(v, { x: 0, z: 2 });
  assert.equal(arena.fire(s, aimAt(arena, s, v), READY), true);
  drain(arena);
  assert.equal(arena.getPlayer(v).hp, HURT);
  return { arena, s, v };
}

test('drinking heals to full after exactly 5 s, not before', () => {
  const { arena, v } = hurtPlayer();
  const t0 = READY + 1000;
  assert.equal(DRINK, 5000);
  assert.equal(arena.drink(v, t0), true);
  let out = drain(arena);
  assert.deepEqual(msgs(out, 'drink', v), [{ t: 'drink', state: 'start', ms: 5000, hp: HURT }]);
  assert.equal(msgs(out, 'inv', v).at(-1).potions, 1, 'the potion is used up when drinking starts');
  assert.deepEqual(arena.getPlayer(v).drink, { start: t0, end: t0 + DRINK });

  arena.tick(t0 + 2500);
  arena.tick(t0 + DRINK - 1);
  out = drain(arena);
  assert.equal(arena.getPlayer(v).hp, HURT, 'not healed before 5 s');
  assert.equal(msgs(out, 'drink').length, 0);

  arena.tick(t0 + DRINK);
  out = drain(arena);
  assert.equal(arena.getPlayer(v).hp, RULES.MAX_HP, 'full H.P');
  assert.deepEqual(msgs(out, 'drink', v), [{ t: 'drink', state: 'done', ms: 0, hp: 100 }]);
  assert.equal(msgs(out, 'inv', v).at(-1).hp, 100);
  assert.equal(arena.getPlayer(v).drink, null);
  assert.equal(arena.getPlayer(v).potions, 1);
});

test('switching to a weapon before 5 s cancels it: the potion is wasted', () => {
  const { arena, v } = hurtPlayer();
  const t0 = READY + 1000;
  arena.drink(v, t0);
  arena.tick(t0 + 4900);
  drain(arena);
  assert.equal(arena.selectSlot(v, 1), true);
  let out = drain(arena);
  assert.deepEqual(msgs(out, 'drink', v), [{ t: 'drink', state: 'cancel', ms: 0, hp: HURT }]);
  arena.tick(t0 + DRINK + 1000);
  out = drain(arena);
  assert.equal(arena.getPlayer(v).hp, HURT, 'no health');
  assert.equal(arena.getPlayer(v).potions, 1, 'the potion is gone');
  assert.equal(msgs(out, 'drink').length, 0);
});

test('picking the slot you already hold does not cancel; a slot change after the 5 s does not waste it', () => {
  const { arena, v } = hurtPlayer();
  const t0 = READY + 1000;
  arena.drink(v, t0);
  arena.selectSlot(v, 0); // the same slot
  arena.tick(t0 + DRINK);
  assert.equal(arena.getPlayer(v).hp, 100);

  // drinking is done by the clock, but the slot change comes before the next tick: still healed
  const b = hurtPlayer();
  b.arena.drink(b.v, t0);
  b.arena.tick(t0 + DRINK - 10);
  b.arena.setState(b.v, { x: 0, y: 0, z: 2, ry: 0, pitch: 0, f: 0 }, t0 + DRINK); // the clock moves on
  b.arena.selectSlot(b.v, 1);
  const out = drain(b.arena);
  assert.deepEqual(msgs(out, 'drink', b.v).map(m => m.state), ['start', 'done']);
  assert.equal(b.arena.getPlayer(b.v).hp, 100);
});

test('moving or getting hit does not stop drinking', () => {
  const { arena, s, v } = hurtPlayer({ potions: 1 });
  const t0 = READY + 1000;
  arena.drink(v, t0);
  // walk around while drinking
  for (let i = 1; i <= 10; i++) arena.setState(v, { x: i * 0.1, y: 0, z: 2, ry: 0, pitch: 0, f: 4 }, t0 + i * 100);
  // and get hit (with the Gun in slot 1)
  arena.selectSlot(s, 0);
  assert.equal(arena.fire(s, aimAt(arena, s, v), t0 + 2000), true);
  assert.equal(arena.getPlayer(v).hp, HURT - RULES.WEAPONS.gun.dmg, 'hit while drinking');
  assert.ok(arena.getPlayer(v).drink, 'still drinking');
  arena.tick(t0 + DRINK);
  const out = drain(arena);
  assert.equal(arena.getPlayer(v).hp, 100);
  assert.deepEqual(msgs(out, 'drink', v).map(m => m.state), ['start', 'done']);
});

test('no firing or dropping the weapon while drinking; no second potion at the same time', () => {
  const { arena, v } = hurtPlayer({ potions: 3 });
  const t0 = READY + 1000;
  assert.equal(arena.drink(v, t0), true);
  assert.equal(arena.drink(v, t0 + 100), false, 'already drinking');
  assert.equal(arena.getPlayer(v).potions, 2);
  assert.equal(arena.fire(v, [0, 0, 1], t0 + 200), false, 'busy drinking');
  assert.equal(arena.dropWeapon(v, t0 + 300), null, 'no dropping while drinking');
  arena.tick(t0 + DRINK);
  assert.equal(arena.fire(v, [0, 0, 1], t0 + DRINK + 10), true, 'can fire again after');
});

test('knocked out while drinking: the potion is gone, the others drop on the ground', () => {
  const { arena, s, v } = hurtPlayer({ potions: 3 });
  const t0 = READY + 1000;
  arena.drink(v, t0);
  arena.selectSlot(s, 2);
  assert.equal(arena.fire(s, [0, 0, 1], t0 + 2000), true); // the Supersword: knocked out
  const out = drain(arena);
  assert.equal(arena.getPlayer(v), undefined);
  assert.equal(msgs(out, 'item+').filter(m => m.kind === 'potion').length, 2, 'the 2 left drop, the one being drunk is gone');
  arena.tick(t0 + DRINK);
  assert.equal(msgs(drain(arena), 'drink').length, 0);
});

test('leaving alive: unused potions can be read before leave (they go back to the backpack)', () => {
  const arena = makeArena();
  const a = arena.join('a', { potions: 2 });
  assert.equal(a.potions, 2);
  assert.equal(arena.getPlayer(a.id).potions, 2);
  assert.deepEqual(arena.leave(a.id, { alive: true }), []);
});

test('max 3 potions; bad potion counts are 0', () => {
  const arena = makeArena();
  assert.equal(arena.join('a', { potions: 7 }).potions, 3);
  assert.equal(arena.join('b', { potions: -2 }).potions, 0);
  assert.equal(arena.join('c', { potions: 1.5 }).potions, 0);
  assert.equal(arena.join('d', {}).potions, 0);
  assert.equal(arena.getPlayer(arena.idOf('a')).potions, 3);
});

test('inv carries potions, not bandages or medkits', () => {
  const arena = makeArena();
  const a = arena.join('a', { potions: 1 });
  const inv = msgs(drain(arena), 'inv', a.id)[0];
  assert.equal(inv.potions, 1);
  assert.equal('bandages' in inv, false);
  assert.equal('medkits' in inv, false);
});
