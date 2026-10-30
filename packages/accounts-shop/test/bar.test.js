// The fast bar (#39): only what is in the bar goes into the arena; the Inventory stays safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as gameRules from '@pvp/game-rules';
import { createAccounts, createMemoryStore, AccountError } from '../src/index.js';
import { barSize, stackMax, autoFillBar, cleanBar, emptyBar } from '../src/bar.js';

function fakeRandom() {
  let n = 0;
  return size => Buffer.alloc(size, ++n % 256);
}
const fakeClock = () => { let t = 1000; return () => (t += 1); };

function rich(opts = {}) {
  const store = opts.store ?? createMemoryStore();
  const accounts = createAccounts({ store, now: fakeClock(), randomBytes: fakeRandom(), ...opts });
  const { account } = accounts.signup('Bar_Kid', 'secret');
  accounts.addCoins(account, 100000);
  return { store, accounts, account };
}
const rejects = (fn, code) => assert.throws(fn, err => err instanceof AccountError && err.code === code && err.message.length > 0);
const W = id => ({ kind: 'weapon', id, n: 1 });

test('bar size and stack sizes come from the rules', () => {
  assert.equal(barSize(gameRules), gameRules.MAX_SLOTS);
  assert.equal(barSize({ ...gameRules, MAX_SLOTS: 3 }), 3);
  assert.equal(barSize({}), 5);
  assert.equal(stackMax(gameRules, 'weapon', 'icesword'), 1);
  assert.equal(stackMax(gameRules, 'weapon', 'megashield'), 1);
  assert.equal(stackMax(gameRules, 'potion', 'potion'), gameRules.MAX_POTIONS);
  assert.equal(stackMax(gameRules, 'bomb', 'bomb'), 5);
  assert.equal(stackMax(gameRules, 'bomb', 'legendarybomb'), 3);
  for (const [k, id] of [['weapon', 'pistol'], ['potion', 'medkit'], ['bomb', 'rocket'], ['hat', 'cap'], ['weapon', '__proto__']]) {
    assert.equal(stackMax(gameRules, k, id), 0, `${k}:${id}`);
  }
});

test('a new account has an empty bar; bought things go to the Inventory, not the bar', () => {
  const { accounts, account } = rich();
  accounts.buy(account, 'weapon', 'icesword');
  accounts.buy(account, 'potion', 'potion');
  const view = accounts.publicView(account);
  assert.deepEqual(view.bar, emptyBar(gameRules));
  assert.deepEqual(view.stash, { icesword: 1 });
  assert.equal(view.potions, 1);
});

test('toBar moves a weapon into the first free slot (or the slot asked for), fromBar moves it back', () => {
  const { accounts, account } = rich();
  for (const id of ['icesword', 'icesword', 'shootbm']) accounts.buy(account, 'weapon', id);
  let v = accounts.toBar(account, 'weapon', 'icesword');
  assert.deepEqual(v.bar, [W('icesword'), null, null, null, null]);
  assert.deepEqual(v.stash, { icesword: 1, shootbm: 1 });
  v = accounts.toBar(account, 'weapon', 'shootbm', { slot: 3 });
  assert.deepEqual(v.bar, [W('icesword'), null, null, W('shootbm'), null]);
  v = accounts.toBar(account, 'weapon', 'icesword');
  assert.deepEqual(v.bar, [W('icesword'), W('icesword'), null, W('shootbm'), null], 'a second copy takes its own slot');
  assert.deepEqual(v.stash, {});
  rejects(() => accounts.toBar(account, 'weapon', 'icesword'), 'NOT_OWNED');
  v = accounts.fromBar(account, 0);
  assert.deepEqual(v.bar, [null, W('icesword'), null, W('shootbm'), null]);
  assert.deepEqual(v.stash, { icesword: 1 });
  rejects(() => accounts.fromBar(account, 0), 'EMPTY_SLOT');
  for (const bad of [-1, 5, 1.5, '1', null, undefined]) rejects(() => accounts.fromBar(account, bad), 'BAD_SLOT');
  rejects(() => accounts.toBar(account, 'weapon', 'icesword', { slot: 3 }), 'SLOT_TAKEN');
  rejects(() => accounts.toBar(account, 'weapon', 'icesword', { slot: 9 }), 'BAD_SLOT');
});

test('toBar checks: must own it, known items only, full bar, one shield', () => {
  const { accounts, account } = rich();
  rejects(() => accounts.toBar(account, 'weapon', 'icesword'), 'NOT_OWNED');
  rejects(() => accounts.toBar(account, 'weapon', 'pistol'), 'UNKNOWN_ITEM');
  rejects(() => accounts.toBar(account, 'hat', 'cap'), 'UNKNOWN_ITEM');
  rejects(() => accounts.toBar(account, 'potion', 'potion'), 'NOT_OWNED');
  for (const id of ['shield', 'megashield', 'gun', 'gun', 'gun', 'gun', 'gun']) accounts.buy(account, 'weapon', id);
  accounts.toBar(account, 'weapon', 'shield');
  rejects(() => accounts.toBar(account, 'weapon', 'megashield'), 'ONE_SHIELD');
  for (let i = 0; i < 4; i++) accounts.toBar(account, 'weapon', 'gun');
  rejects(() => accounts.toBar(account, 'weapon', 'gun'), 'BAR_FULL');
  assert.equal(accounts.publicView(account).stash.gun, 1, 'the 5th Gun stays in the Inventory');
  // swap the shield: take it out, put the Mega Shield in its place
  accounts.fromBar(account, 0);
  assert.deepEqual(accounts.toBar(account, 'weapon', 'megashield').bar[0], W('megashield'));
});

test('potions and bombs stack in one slot, capped (3 potions, 5 Bombs, 3 Legendary Bombs)', () => {
  const { accounts, account } = rich();
  for (let i = 0; i < 5; i++) accounts.buy(account, 'potion', 'potion');
  for (let i = 0; i < 7; i++) accounts.buy(account, 'bomb', 'bomb');
  accounts.buy(account, 'bomb', 'legendarybomb'); // a pack of 3
  accounts.buy(account, 'bomb', 'legendarybomb');
  let v = accounts.toBar(account, 'potion', 'potion', { n: 1 });
  assert.deepEqual(v.bar[0], { kind: 'potion', id: 'potion', n: 1 });
  v = accounts.toBar(account, 'potion', 'potion', { slot: 4 }); // stacks onto its slot, as many as fit
  assert.deepEqual(v.bar, [{ kind: 'potion', id: 'potion', n: 3 }, null, null, null, null]);
  assert.equal(v.potions, 2);
  rejects(() => accounts.toBar(account, 'potion', 'potion'), 'STACK_FULL');
  rejects(() => accounts.toBar(account, 'bomb', 'bomb', { n: 6 }), 'STACK_FULL');
  rejects(() => accounts.toBar(account, 'bomb', 'bomb', { n: 0 }), 'BAD_COUNT');
  rejects(() => accounts.toBar(account, 'bomb', 'bomb', { n: 2.5 }), 'BAD_COUNT');
  rejects(() => accounts.toBar(account, 'bomb', 'legendarybomb', { n: 7 }), 'NOT_OWNED');
  v = accounts.toBar(account, 'bomb', 'bomb');
  v = accounts.toBar(account, 'bomb', 'legendarybomb', { slot: 2 });
  assert.deepEqual(v.bar, [
    { kind: 'potion', id: 'potion', n: 3 }, { kind: 'bomb', id: 'bomb', n: 5 }, { kind: 'bomb', id: 'legendarybomb', n: 3 }, null, null,
  ]);
  assert.deepEqual(v.bombs, { bomb: 2, legendarybomb: 3 });
  rejects(() => accounts.toBar(account, 'bomb', 'bomb', { slot: 0 }), 'STACK_FULL'); // goes to its own stack, which is full
  rejects(() => accounts.toBar(account, 'bomb', 'bomb', { n: 1 }), 'STACK_FULL');
  // taking the stack out puts all of it back
  assert.deepEqual(accounts.fromBar(account, 1).bombs, { bomb: 7, legendarybomb: 3 });
});

test('joining takes ONLY the bar; the Inventory stays; survivors go back into their slots, loot into the Inventory', () => {
  const { accounts, account } = rich();
  for (const id of ['icesword', 'shootbm', 'supersword', 'megashield']) accounts.buy(account, 'weapon', id);
  for (let i = 0; i < 4; i++) accounts.buy(account, 'potion', 'potion');
  accounts.buy(account, 'bomb', 'bomb');
  accounts.toBar(account, 'weapon', 'megashield'); // slot 0
  accounts.toBar(account, 'weapon', 'shootbm');    // slot 1
  accounts.toBar(account, 'potion', 'potion');     // slot 2: 3 potions
  const out = accounts.takeBar(account);
  assert.deepEqual(out, { loadout: ['shootbm', 'megashield'], potions: 3, bombs: { bomb: 0, legendarybomb: 0 }, starter: false });
  let v = accounts.publicView(account);
  assert.deepEqual(v.bar, emptyBar(gameRules), 'the bar went into the arena');
  assert.deepEqual(v.stash, { icesword: 1, supersword: 1 }, 'the rest stays safe in the Inventory');
  assert.equal(v.potions, 1);
  assert.deepEqual(v.bombs, { bomb: 1, legendarybomb: 0 });
  // left alive: the Shootbm, 1 potion and a looted Ice Sword come back; the Mega Shield broke
  v = accounts.returnFromArena(account, { weapons: ['shootbm', 'icesword', 'pistol'], potions: 1, bombs: { bomb: 0 } });
  assert.deepEqual(v.bar, [null, W('shootbm'), { kind: 'potion', id: 'potion', n: 1 }, null, null]);
  assert.deepEqual(v.stash, { icesword: 2, supersword: 1 }, 'loot goes to the Inventory, unknown ids are ignored');
  assert.equal(v.potions, 1);
});

test('knocked out: the bar is lost, the Inventory is not', () => {
  const { accounts, account } = rich();
  for (const id of ['icesword', 'shootbm']) accounts.buy(account, 'weapon', id);
  accounts.toBar(account, 'weapon', 'icesword');
  assert.deepEqual(accounts.takeBar(account).loadout, ['icesword']);
  // knocked out: nothing is returned
  const v = accounts.publicView(account);
  assert.deepEqual(v.stash, { shootbm: 1 });
  assert.deepEqual(v.bar, emptyBar(gameRules));
  // the next match: an empty bar, so the free Gun comes
  assert.deepEqual(accounts.takeBar(account), { loadout: [], potions: 0, bombs: { bomb: 0, legendarybomb: 0 }, starter: true });
});

test('a bar with only a shield (no hand weapon) still gets the free starting Gun', () => {
  const { accounts, account } = rich();
  accounts.buy(account, 'weapon', 'shield');
  accounts.toBar(account, 'weapon', 'shield');
  assert.deepEqual(accounts.takeBar(account), { loadout: ['shield'], potions: 0, bombs: { bomb: 0, legendarybomb: 0 }, starter: true });
});

test('returning does not overwrite slots filled meanwhile; refill: false puts all in the Inventory', () => {
  const { accounts, account } = rich();
  for (const id of ['icesword', 'shootbm', 'shield', 'megashield']) accounts.buy(account, 'weapon', id);
  accounts.toBar(account, 'weapon', 'icesword');
  accounts.toBar(account, 'weapon', 'shield');
  accounts.takeBar(account);
  // in the arena, on another device: the Shootbm and the Mega Shield are put into the bar
  accounts.toBar(account, 'weapon', 'shootbm');
  accounts.toBar(account, 'weapon', 'megashield');
  const v = accounts.returnFromArena(account, { weapons: ['icesword', 'shield'] });
  assert.deepEqual(v.bar, [W('shootbm'), W('megashield'), null, null, null]);
  assert.deepEqual(v.stash, { icesword: 1, shield: 1 }, 'one shield in the bar only');
  accounts.fromBar(account, 0);
  accounts.fromBar(account, 1);
  const w = accounts.returnFromArena(account, { weapons: ['gun'] }, { refill: false });
  assert.deepEqual(w.bar, emptyBar(gameRules));
  assert.equal(w.stash.gun, 1);
});

test('the bar is deterministic and saved', async () => {
  const run = () => {
    const { accounts, account, store } = rich();
    accounts.buy(account, 'weapon', 'dmgun');
    accounts.buy(account, 'bomb', 'legendarybomb');
    accounts.toBar(account, 'bomb', 'legendarybomb', { slot: 4, n: 2 });
    accounts.toBar(account, 'weapon', 'dmgun');
    return { view: accounts.publicView(account), store, accounts };
  };
  const a = run(), b = run();
  assert.deepEqual(a.view, b.view);
  await a.accounts.flush();
  const again = createAccounts({ store: a.store, now: fakeClock(), randomBytes: fakeRandom() });
  const back = again.login('Bar_Kid', 'secret').account;
  assert.deepEqual(again.publicView(back).bar, a.view.bar);
});

test('old saved accounts (no bar yet) get a bar filled like the old automatic pick', () => {
  const store = createMemoryStore();
  const { accounts } = rich({ store });
  const data = store.load();
  const rec = data.bar_kid;
  delete rec.bar;
  rec.stash = { gun: 1, shootbm: 2, icesword: 1, supersword: 1, shield: 1, megashield: 1 };
  rec.potions = 4;
  rec.bombs = { bomb: 7, legendarybomb: 0 };
  const again = createAccounts({ store: createMemoryStore(data), now: fakeClock(), randomBytes: fakeRandom() });
  const acc = again.login('Bar_Kid', 'secret').account;
  const v = again.publicView(acc);
  // 2 best weapons, the best shield, 3 potions, 5 Bombs (5 slots full)
  assert.deepEqual(v.bar, [W('supersword'), W('icesword'), W('megashield'), { kind: 'potion', id: 'potion', n: 3 }, { kind: 'bomb', id: 'bomb', n: 5 }]);
  assert.deepEqual(v.stash, { gun: 1, shootbm: 2, shield: 1 });
  assert.equal(v.potions, 1);
  assert.deepEqual(v.bombs, { bomb: 2, legendarybomb: 0 });
  assert.ok(accounts, 'the first service is untouched');
  // only weapons: up to 5 weapons, best first
  const w = { stash: { gun: 3, shootbm: 2, icesword: 1 }, potions: 0, bombs: { bomb: 0, legendarybomb: 0 } };
  assert.deepEqual(autoFillBar(w, gameRules), [W('icesword'), W('shootbm'), W('shootbm'), W('gun'), W('gun')]);
  assert.deepEqual(w.stash, { gun: 1 });
  // nothing at all: an empty bar
  const none = { stash: {}, potions: 0, bombs: {} };
  assert.deepEqual(autoFillBar(none, gameRules), emptyBar(gameRules));
});

test('a broken saved bar is cleaned on load: nothing is lost, items no longer in the game are dropped', () => {
  const rec = {
    stash: {}, potions: 0, bombs: { bomb: 0, legendarybomb: 0 },
    bar: [
      { kind: 'weapon', id: 'shield', n: 1 },
      { kind: 'weapon', id: 'megashield', n: 1 }, // a second shield: back to the Inventory
      { kind: 'potion', id: 'potion', n: 7 },     // only 3 fit, 4 go back
      { kind: 'weapon', id: 'pistol', n: 1 },     // not in the game any more: dropped
      'junk',
      { kind: 'weapon', id: 'icesword', n: 1 },   // slot 6 does not exist: back to the Inventory
    ],
    lastBar: 'junk',
  };
  cleanBar(rec, gameRules);
  assert.deepEqual(rec.bar, [W('shield'), null, { kind: 'potion', id: 'potion', n: 3 }, null, null]);
  assert.deepEqual(rec.stash, { megashield: 1, icesword: 1 });
  assert.equal(rec.potions, 4);
  assert.equal(rec.lastBar, undefined);
  // through createAccounts too (a bar that is not an array becomes empty)
  const store = createMemoryStore();
  const { accounts } = rich({ store });
  const data = store.load();
  data.bar_kid.bar = 'oops';
  const again = createAccounts({ store: createMemoryStore(data), now: fakeClock(), randomBytes: fakeRandom() });
  assert.deepEqual(again.publicView(again.login('Bar_Kid', 'secret').account).bar, emptyBar(gameRules));
  assert.ok(accounts);
});

test('a smaller MAX_SLOTS makes a smaller bar', () => {
  const { accounts, account } = rich({ rules: { ...gameRules, MAX_SLOTS: 2 } });
  accounts.buy(account, 'weapon', 'gun');
  accounts.buy(account, 'weapon', 'gun');
  accounts.buy(account, 'weapon', 'gun');
  accounts.toBar(account, 'weapon', 'gun');
  accounts.toBar(account, 'weapon', 'gun');
  rejects(() => accounts.toBar(account, 'weapon', 'gun'), 'BAR_FULL');
  assert.equal(accounts.publicView(account).bar.length, 2);
});
