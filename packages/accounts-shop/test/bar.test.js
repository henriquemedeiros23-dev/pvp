// The fast bar (#39) and the extras bar (#50): only what is in the two bars goes into the arena; the Inventory stays safe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as gameRules from '@pvp/game-rules';
import { createAccounts, createMemoryStore, AccountError } from '../src/index.js';
import { barSize, stackMax, autoFillBar, cleanBar, emptyBar, emptyExtras, spacesOf, spaceOf, isHandWeapon } from '../src/bar.js';

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

const P = n => ({ kind: 'potion', id: 'potion', n });
const B = (id, n) => ({ kind: 'bomb', id, n });
const EX = (o = {}) => ({ shield: null, potion: null, bomb: null, legendarybomb: null, ...o });

test('the extras spaces (#50): shield, potions, bombs, legendary bombs', () => {
  assert.deepEqual(spacesOf(gameRules).map(s => [s.space, s.max]), [['shield', 1], ['potion', 3], ['bomb', 5], ['legendarybomb', 3]]);
  assert.deepEqual(emptyExtras(gameRules), EX());
  assert.equal(spaceOf(gameRules, 'weapon', 'megashield'), 'shield');
  assert.equal(spaceOf(gameRules, 'weapon', 'shield'), 'shield');
  assert.equal(spaceOf(gameRules, 'weapon', 'icesword'), null, 'hand weapons go in the fast bar');
  assert.equal(spaceOf(gameRules, 'potion', 'potion'), 'potion');
  assert.equal(spaceOf(gameRules, 'bomb', 'legendarybomb'), 'legendarybomb');
  assert.equal(spaceOf(gameRules, 'bomb', 'rocket'), null);
  assert.equal(isHandWeapon(gameRules, 'weapon', 'gun'), true);
  assert.equal(isHandWeapon(gameRules, 'weapon', 'shield'), false);
  assert.equal(isHandWeapon(gameRules, 'potion', 'potion'), false);
});

test('a new account has empty bars; bought things go to the Inventory, not the bars', () => {
  const { accounts, account } = rich();
  accounts.buy(account, 'weapon', 'icesword');
  accounts.buy(account, 'potion', 'potion');
  const view = accounts.publicView(account);
  assert.deepEqual(view.bar, emptyBar(gameRules));
  assert.deepEqual(view.extras, EX());
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
  for (const bad of [-1, 5, 1.5, null, undefined]) rejects(() => accounts.fromBar(account, bad), 'BAD_SLOT');
  rejects(() => accounts.fromBar(account, '1'), 'BAD_SPACE');
  rejects(() => accounts.toBar(account, 'weapon', 'icesword', { slot: 3 }), 'SLOT_TAKEN');
  rejects(() => accounts.toBar(account, 'weapon', 'icesword', { slot: 9 }), 'BAD_SLOT');
  rejects(() => accounts.toBar(account, 'weapon', 'icesword', { n: 2 }), 'STACK_FULL');
});

test('toBar checks: must own it, known items only, a full bar; the fast bar takes hand weapons only', () => {
  const { accounts, account } = rich();
  rejects(() => accounts.toBar(account, 'weapon', 'icesword'), 'NOT_OWNED');
  rejects(() => accounts.toBar(account, 'weapon', 'pistol'), 'UNKNOWN_ITEM');
  rejects(() => accounts.toBar(account, 'hat', 'cap'), 'UNKNOWN_ITEM');
  rejects(() => accounts.toBar(account, 'potion', 'potion'), 'NOT_OWNED');
  for (let i = 0; i < 6; i++) accounts.buy(account, 'weapon', 'gun');
  for (let i = 0; i < 5; i++) accounts.toBar(account, 'weapon', 'gun');
  rejects(() => accounts.toBar(account, 'weapon', 'gun'), 'BAR_FULL');
  assert.equal(accounts.publicView(account).stash.gun, 1, 'the 6th Gun stays in the Inventory');
  // a full fast bar does not stop a shield, potions or bombs: they have their own spaces
  accounts.buy(account, 'weapon', 'shield');
  accounts.buy(account, 'bomb', 'bomb');
  const v = accounts.toBar(account, 'weapon', 'shield', { slot: 2 }); // a slot is ignored for extras
  assert.deepEqual(v.extras.shield, W('shield'));
  assert.deepEqual(accounts.toBar(account, 'bomb', 'bomb').extras.bomb, B('bomb', 1));
  assert.ok(accounts.publicView(account).bar.every(e => e && e.id === 'gun'));
});

test('extras (#50): one shield (swap by putting it back first)', () => {
  const { accounts, account } = rich();
  for (const id of ['shield', 'megashield']) accounts.buy(account, 'weapon', id);
  let v = accounts.toBar(account, 'weapon', 'shield');
  assert.deepEqual(v.extras, EX({ shield: W('shield') }));
  assert.deepEqual(v.bar, emptyBar(gameRules), 'a shield never takes a fast-bar slot');
  rejects(() => accounts.toBar(account, 'weapon', 'megashield'), 'ONE_SHIELD');
  accounts.buy(account, 'weapon', 'shield');
  rejects(() => accounts.toBar(account, 'weapon', 'shield'), 'STACK_FULL');
  v = accounts.fromExtras(account, 'shield');
  assert.deepEqual(v.stash, { shield: 2, megashield: 1 });
  v = accounts.toBar(account, 'weapon', 'megashield');
  assert.deepEqual(v.extras.shield, W('megashield'));
  rejects(() => accounts.fromExtras(account, 'potion'), 'EMPTY_SLOT');
  for (const bad of ['rocket', '__proto__', 0, null, undefined]) rejects(() => accounts.fromExtras(account, bad), 'BAD_SPACE');
});

test('extras (#50): potions and bombs stack in their own space, capped (3 potions, 5 Bombs, 3 Legendary Bombs); one tap fills it', () => {
  const { accounts, account } = rich();
  for (let i = 0; i < 5; i++) accounts.buy(account, 'potion', 'potion');
  for (let i = 0; i < 7; i++) accounts.buy(account, 'bomb', 'bomb');
  accounts.buy(account, 'bomb', 'legendarybomb'); // a pack of 3
  accounts.buy(account, 'bomb', 'legendarybomb');
  let v = accounts.toBar(account, 'potion', 'potion', { n: 1 });
  assert.deepEqual(v.extras.potion, P(1));
  v = accounts.toBar(account, 'potion', 'potion'); // as many as fit
  assert.deepEqual(v.extras.potion, P(3));
  assert.equal(v.potions, 2);
  rejects(() => accounts.toBar(account, 'potion', 'potion'), 'STACK_FULL');
  rejects(() => accounts.toBar(account, 'bomb', 'bomb', { n: 6 }), 'STACK_FULL');
  rejects(() => accounts.toBar(account, 'bomb', 'bomb', { n: 0 }), 'BAD_COUNT');
  rejects(() => accounts.toBar(account, 'bomb', 'bomb', { n: 2.5 }), 'BAD_COUNT');
  rejects(() => accounts.toBar(account, 'bomb', 'legendarybomb', { n: 7 }), 'NOT_OWNED');
  accounts.toBar(account, 'bomb', 'bomb');
  v = accounts.toBar(account, 'bomb', 'legendarybomb');
  assert.deepEqual(v.extras, EX({ potion: P(3), bomb: B('bomb', 5), legendarybomb: B('legendarybomb', 3) }));
  assert.deepEqual(v.bar, emptyBar(gameRules), 'nothing in the fast bar');
  assert.deepEqual(v.bombs, { bomb: 2, legendarybomb: 3 });
  rejects(() => accounts.toBar(account, 'bomb', 'bomb', { n: 1 }), 'STACK_FULL');
  // taking the space out puts all of it back
  assert.deepEqual(accounts.fromExtras(account, 'bomb').bombs, { bomb: 7, legendarybomb: 3 });
});

test('joining takes ONLY the two bars; the Inventory stays; survivors go back into their slots and spaces, loot into the Inventory', () => {
  const { accounts, account } = rich();
  for (const id of ['icesword', 'shootbm', 'supersword', 'megashield']) accounts.buy(account, 'weapon', id);
  for (let i = 0; i < 4; i++) accounts.buy(account, 'potion', 'potion');
  accounts.buy(account, 'bomb', 'bomb');
  accounts.toBar(account, 'weapon', 'megashield'); // shield space
  accounts.toBar(account, 'weapon', 'shootbm', { slot: 1 });
  accounts.toBar(account, 'potion', 'potion');     // potion space: 3 potions
  const out = accounts.takeBar(account);
  assert.deepEqual(out, { loadout: ['shootbm', 'megashield'], potions: 3, bombs: { bomb: 0, legendarybomb: 0 }, starter: false });
  let v = accounts.publicView(account);
  assert.deepEqual(v.bar, emptyBar(gameRules), 'the bar went into the arena');
  assert.deepEqual(v.extras, EX(), 'the extras too');
  assert.deepEqual(v.stash, { icesword: 1, supersword: 1 }, 'the rest stays safe in the Inventory');
  assert.equal(v.potions, 1);
  assert.deepEqual(v.bombs, { bomb: 1, legendarybomb: 0 });
  // left alive: the Shootbm, 1 potion and a looted Ice Sword come back; the Mega Shield broke
  v = accounts.returnFromArena(account, { weapons: ['shootbm', 'icesword', 'pistol'], potions: 1, bombs: { bomb: 0 } });
  assert.deepEqual(v.bar, [null, W('shootbm'), null, null, null]);
  assert.deepEqual(v.extras, EX({ potion: P(1) }));
  assert.deepEqual(v.stash, { icesword: 2, supersword: 1 }, 'loot goes to the Inventory, unknown ids are ignored');
  assert.equal(v.potions, 1);
  // the shield survives next time: back into its space
  accounts.toBar(account, 'weapon', 'icesword');
  accounts.buy(account, 'weapon', 'shield');
  accounts.toBar(account, 'weapon', 'shield');
  accounts.takeBar(account);
  v = accounts.returnFromArena(account, { weapons: ['shield', 'icesword', 'shootbm'] });
  assert.deepEqual(v.extras.shield, W('shield'));
  assert.deepEqual(v.bar, [W('icesword'), W('shootbm'), null, null, null]);
});

test('knocked out: the bars are lost, the Inventory is not', () => {
  const { accounts, account } = rich();
  for (const id of ['icesword', 'shootbm']) accounts.buy(account, 'weapon', id);
  accounts.buy(account, 'potion', 'potion');
  accounts.toBar(account, 'weapon', 'icesword');
  accounts.toBar(account, 'potion', 'potion');
  assert.deepEqual(accounts.takeBar(account).loadout, ['icesword']);
  // knocked out: nothing is returned
  const v = accounts.publicView(account);
  assert.deepEqual(v.stash, { shootbm: 1 });
  assert.deepEqual(v.bar, emptyBar(gameRules));
  assert.deepEqual(v.extras, EX());
  // the next match: empty bars, so the free Gun comes
  assert.deepEqual(accounts.takeBar(account), { loadout: [], potions: 0, bombs: { bomb: 0, legendarybomb: 0 }, starter: true });
});

test('only a shield (no hand weapon in the fast bar) still gets the free starting Gun', () => {
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
  // in the arena, on another device: the Shootbm and the Mega Shield are put into the bars
  accounts.toBar(account, 'weapon', 'shootbm');
  accounts.toBar(account, 'weapon', 'megashield');
  const v = accounts.returnFromArena(account, { weapons: ['icesword', 'shield'] });
  assert.deepEqual(v.bar, [W('shootbm'), null, null, null, null]);
  assert.deepEqual(v.extras.shield, W('megashield'));
  assert.deepEqual(v.stash, { icesword: 1, shield: 1 }, 'one shield in the extras only');
  accounts.fromBar(account, 0);
  accounts.fromExtras(account, 'shield');
  const w = accounts.returnFromArena(account, { weapons: ['gun'], potions: 2 }, { refill: false });
  assert.deepEqual(w.bar, emptyBar(gameRules));
  assert.deepEqual(w.extras, EX());
  assert.equal(w.stash.gun, 1);
  assert.equal(w.potions, 2);
});

test('the bars are deterministic and saved', async () => {
  const run = () => {
    const { accounts, account, store } = rich();
    accounts.buy(account, 'weapon', 'dmgun');
    accounts.buy(account, 'bomb', 'legendarybomb');
    accounts.toBar(account, 'bomb', 'legendarybomb', { n: 2 });
    accounts.toBar(account, 'weapon', 'dmgun', { slot: 4 });
    return { view: accounts.publicView(account), store, accounts };
  };
  const a = run(), b = run();
  assert.deepEqual(a.view, b.view);
  await a.accounts.flush();
  const again = createAccounts({ store: a.store, now: fakeClock(), randomBytes: fakeRandom() });
  const back = again.login('Bar_Kid', 'secret').account;
  assert.deepEqual(again.publicView(back).bar, a.view.bar);
  assert.deepEqual(again.publicView(back).extras, EX({ legendarybomb: B('legendarybomb', 2) }));
});

test('old saved accounts (no bar yet) get bars filled like the old automatic pick', () => {
  const store = createMemoryStore();
  const { accounts } = rich({ store });
  const data = store.load();
  const rec = data.bar_kid;
  delete rec.bar;
  delete rec.extras;
  rec.stash = { gun: 1, shootbm: 2, icesword: 1, supersword: 1, shield: 1, megashield: 1 };
  rec.potions = 4;
  rec.bombs = { bomb: 7, legendarybomb: 0 };
  const again = createAccounts({ store: createMemoryStore(data), now: fakeClock(), randomBytes: fakeRandom() });
  const acc = again.login('Bar_Kid', 'secret').account;
  const v = again.publicView(acc);
  // the 5 best hand weapons; the best shield, 3 potions, 5 Bombs in the extras
  assert.deepEqual(v.bar, [W('supersword'), W('icesword'), W('shootbm'), W('shootbm'), W('gun')]);
  assert.deepEqual(v.extras, EX({ shield: W('megashield'), potion: P(3), bomb: B('bomb', 5) }));
  assert.deepEqual(v.stash, { shield: 1 });
  assert.equal(v.potions, 1);
  assert.deepEqual(v.bombs, { bomb: 2, legendarybomb: 0 });
  assert.ok(accounts, 'the first service is untouched');
  // nothing at all: empty bars
  const none = { stash: {}, potions: 0, bombs: {} };
  assert.deepEqual(autoFillBar(none, gameRules), emptyBar(gameRules));
  assert.deepEqual(none.extras, EX());
});

test('migration (#50): an old fast bar with potions, bombs and a shield in its slots moves them into the extras bar', () => {
  const rec = {
    stash: {}, potions: 1, bombs: { bomb: 2, legendarybomb: 0 },
    bar: [W('megashield'), W('shootbm'), P(3), B('bomb', 4), B('legendarybomb', 3)],
    lastBar: [W('shield'), W('icesword'), P(2), null, B('bomb', 5)],
  };
  cleanBar(rec, gameRules);
  assert.deepEqual(rec.bar, [null, W('shootbm'), null, null, null], 'the weapon keeps its slot');
  assert.deepEqual(rec.extras, EX({ shield: W('megashield'), potion: P(3), bomb: B('bomb', 4), legendarybomb: B('legendarybomb', 3) }));
  assert.deepEqual([rec.stash, rec.potions, rec.bombs], [{}, 1, { bomb: 2, legendarybomb: 0 }], 'nothing extra, nothing lost');
  // the remembered layout too (for things coming back from a match)
  assert.deepEqual(rec.lastBar, [null, W('icesword'), null, null, null]);
  assert.deepEqual(rec.lastExtras, { shield: W('shield'), potion: P(2), bomb: B('bomb', 5) });
  // through createAccounts: a saved #39 account
  const store = createMemoryStore();
  const { accounts } = rich({ store });
  const data = store.load();
  delete data.bar_kid.extras;
  data.bar_kid.bar = [P(2), W('shield'), W('gun'), null, null];
  const again = createAccounts({ store: createMemoryStore(data), now: fakeClock(), randomBytes: fakeRandom() });
  const v = again.publicView(again.login('Bar_Kid', 'secret').account);
  assert.deepEqual(v.bar, [null, null, W('gun'), null, null]);
  assert.deepEqual(v.extras, EX({ shield: W('shield'), potion: P(2) }));
  assert.ok(accounts);
});

test('a broken saved bar is cleaned on load: nothing is lost, items no longer in the game are dropped', () => {
  const rec = {
    stash: {}, potions: 0, bombs: { bomb: 0, legendarybomb: 0 },
    extras: { shield: W('shield'), potion: P(9), bomb: B('legendarybomb', 1), rocket: B('rocket', 2) },
    bar: [
      W('megashield'),                            // a second shield: back to the Inventory
      { kind: 'potion', id: 'potion', n: 7 },     // the potion space is full: back to the Inventory
      { kind: 'weapon', id: 'pistol', n: 1 },     // not in the game any more: dropped
      'junk',
      W('gun'),
      W('icesword'),                              // slot 6 does not exist: back to the Inventory
    ],
    lastBar: 'junk',
  };
  cleanBar(rec, gameRules);
  assert.deepEqual(rec.bar, [null, null, null, null, W('gun')]);
  assert.deepEqual(rec.extras, EX({ shield: W('shield'), potion: P(3) }), 'a bomb in the wrong space goes back');
  assert.deepEqual(rec.stash, { megashield: 1, icesword: 1 });
  assert.equal(rec.potions, 6 + 7);
  assert.deepEqual(rec.bombs, { bomb: 0, legendarybomb: 1 });
  assert.equal(rec.lastBar, undefined);
  // through createAccounts too (bars that are not arrays/objects become empty)
  const store = createMemoryStore();
  const { accounts } = rich({ store });
  const data = store.load();
  data.bar_kid.bar = 'oops';
  data.bar_kid.extras = ['oops'];
  const again = createAccounts({ store: createMemoryStore(data), now: fakeClock(), randomBytes: fakeRandom() });
  const v = again.publicView(again.login('Bar_Kid', 'secret').account);
  assert.deepEqual(v.bar, emptyBar(gameRules));
  assert.deepEqual(v.extras, EX());
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

// #51: weapons keep their durability when you leave the arena and come back.
const WD = (id, dur) => ({ kind: 'weapon', id, n: 1, dur });

test('durability (#51): a worn weapon comes back worn, and joins again with the same uses left', () => {
  const { accounts, account } = rich();
  for (const id of ['shootbm', 'megashield']) accounts.buy(account, 'weapon', id);
  accounts.toBar(account, 'weapon', 'shootbm');
  accounts.toBar(account, 'weapon', 'megashield');
  assert.deepEqual(accounts.takeBar(account).loadout, ['shootbm', 'megashield'], 'full: plain ids');
  // the arena gives back worn weapons as { id, dur }
  let v = accounts.returnFromArena(account, { weapons: [{ id: 'shootbm', dur: 17 }, { id: 'megashield', dur: 40 }] });
  assert.deepEqual(v.bar[0], WD('shootbm', 17));
  assert.deepEqual(v.extras.shield, WD('megashield', 40));
  assert.deepEqual(accounts.takeBar(account).loadout, [{ id: 'shootbm', dur: 17 }, { id: 'megashield', dur: 40 }]);
  // full durability, a bad dur or too high: full (no dur)
  v = accounts.returnFromArena(account, { weapons: [{ id: 'shootbm', dur: 20 }, { id: 'megashield', dur: -1 }] });
  assert.deepEqual([v.bar[0], v.extras.shield], [W('shootbm'), W('megashield')]);
});

test('durability (#51): the Inventory keeps worn copies; the fullest goes first, or the one asked for (dur)', () => {
  const { accounts, account } = rich();
  for (let i = 0; i < 3; i++) accounts.buy(account, 'weapon', 'icesword');
  accounts.takeBar(account);
  // loot: two worn Ice Swords into the Inventory (refill: false)
  let v = accounts.returnFromArena(account, { weapons: [{ id: 'icesword', dur: 10 }, { id: 'icesword', dur: 30 }] }, { refill: false });
  assert.deepEqual(v.stash, { icesword: 5 });
  assert.deepEqual(v.wear, { icesword: [30, 10] }, 'best first; the other 3 are full');
  v = accounts.toBar(account, 'weapon', 'icesword');
  assert.deepEqual(v.bar[0], W('icesword'), 'a full copy first');
  v = accounts.toBar(account, 'weapon', 'icesword', { dur: 10 });
  assert.deepEqual(v.bar[1], WD('icesword', 10), 'the copy asked for');
  assert.deepEqual(v.wear, { icesword: [30] });
  v = accounts.fromBar(account, 1);
  assert.deepEqual(v.wear, { icesword: [30, 10] }, 'back into the Inventory, still worn');
  v = accounts.toBar(account, 'weapon', 'icesword', { dur: 99 }); // not there: a full one
  assert.deepEqual(v.bar[1], W('icesword'));
  accounts.toBar(account, 'weapon', 'icesword');
  v = accounts.toBar(account, 'weapon', 'icesword'); // no full copies left: the best worn one
  assert.deepEqual(v.bar[3], WD('icesword', 30));
  v = accounts.toBar(account, 'weapon', 'icesword');
  assert.deepEqual(v.bar[4], WD('icesword', 10));
  assert.deepEqual([v.stash, v.wear], [{}, {}]);
});

test('durability (#51): saved and loaded; bad saved wear is cleaned; old saves are full', async () => {
  const store = createMemoryStore();
  const { accounts, account } = rich({ store });
  accounts.buy(account, 'weapon', 'dmgun');
  accounts.buy(account, 'weapon', 'dmgun');
  accounts.returnFromArena(account, { weapons: [{ id: 'dmgun', dur: 3 }, { id: 'shield', dur: 5 }] }, { refill: false });
  accounts.toBar(account, 'weapon', 'dmgun', { dur: 3, slot: 2 });
  await accounts.flush();
  const data = store.load();
  const again = createAccounts({ store: createMemoryStore(JSON.parse(JSON.stringify(data))), now: fakeClock(), randomBytes: fakeRandom() });
  const v = again.publicView(again.login('Bar_Kid', 'secret').account);
  assert.deepEqual(v.bar[2], WD('dmgun', 3));
  assert.deepEqual(v.wear, { shield: [5] });
  assert.deepEqual(v.stash, { dmgun: 2, shield: 1 });
  // broken saves
  const rec = {
    stash: { gun: 1, icesword: 2 }, potions: 0, bombs: {},
    wear: { gun: [3, 3, 3], icesword: [0, 50, 'x', 20], pistol: [1], shootbm: [4] },
    bar: [WD('supergun', 0), WD('supergun', 999), WD('supergun', 7)],
    extras: { shield: WD('shield', 2.5) },
  };
  cleanBar(rec, gameRules);
  assert.deepEqual(rec.wear, { gun: [3], icesword: [20] }, 'not more than the copies, only 1..max-1, known weapons');
  assert.deepEqual(rec.bar, [W('supergun'), W('supergun'), WD('supergun', 7), null, null]);
  assert.deepEqual(rec.extras.shield, W('shield'));
  // old #50 saves without wear: all full
  const old = { stash: { gun: 2 }, potions: 0, bombs: {}, bar: [W('gun'), null, null, null, null] };
  cleanBar(old, gameRules);
  assert.deepEqual(old.wear, {});
});
