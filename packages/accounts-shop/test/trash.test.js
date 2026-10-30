// The trash (#53): destroy ONE item forever (no coins back), from the Inventory or from a bar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as gameRules from '@pvp/game-rules';
import { createAccounts, createMemoryStore, AccountError } from '../src/index.js';
import { destroyOne } from '../src/bar.js';

function fakeRandom() {
  let n = 0;
  return size => Buffer.alloc(size, ++n % 256);
}
const fakeClock = () => { let t = 1000; return () => (t += 1); };

function rich() {
  const store = createMemoryStore();
  const accounts = createAccounts({ store, now: fakeClock(), randomBytes: fakeRandom() });
  const { account } = accounts.signup('Trash_Kid', 'secret');
  accounts.addCoins(account, 100000);
  return { store, accounts, account };
}
const rejects = (fn, code) => assert.throws(fn, err => err instanceof AccountError && err.code === code && err.message.length > 0);

test('trash from the Inventory: one weapon copy is gone forever, no coins back', () => {
  const { accounts, account } = rich();
  accounts.buy(account, 'weapon', 'icesword');
  accounts.buy(account, 'weapon', 'icesword');
  const coins = account.coins;
  let v = accounts.destroyItem(account, { kind: 'weapon', id: 'icesword' });
  assert.deepEqual(v.stash, { icesword: 1 });
  assert.equal(v.coins, coins, 'no coins back');
  v = accounts.destroyItem(account, { kind: 'weapon', id: 'icesword', from: 'inventory' });
  assert.deepEqual(v.stash, {});
  rejects(() => accounts.destroyItem(account, { kind: 'weapon', id: 'icesword' }), 'NOT_OWNED');
});

test('trash: potions and bombs go one at a time', () => {
  const { accounts, account } = rich();
  accounts.buy(account, 'potion', 'potion');
  accounts.buy(account, 'potion', 'potion');
  accounts.buy(account, 'bomb', 'legendarybomb'); // a pack of 3
  let v = accounts.destroyItem(account, { kind: 'potion', id: 'potion' });
  assert.equal(v.potions, 1);
  v = accounts.destroyItem(account, { kind: 'bomb', id: 'legendarybomb' });
  assert.equal(v.bombs.legendarybomb, 2);
  rejects(() => accounts.destroyItem(account, { kind: 'bomb', id: 'bomb' }), 'NOT_OWNED');
});

test('trash: the exact worn copy (by its uses left) is the one destroyed (#51)', () => {
  const { accounts, account } = rich();
  accounts.buy(account, 'weapon', 'icesword');
  accounts.returnFromArena(account, { weapons: [{ id: 'icesword', dur: 10 }, { id: 'icesword', dur: 30 }] }, { refill: false });
  let v = accounts.publicView(account);
  assert.deepEqual([v.stash, v.wear], [{ icesword: 3 }, { icesword: [30, 10] }]);
  v = accounts.destroyItem(account, { kind: 'weapon', id: 'icesword', dur: 10 });
  assert.deepEqual([v.stash, v.wear], [{ icesword: 2 }, { icesword: [30] }], 'the 10-uses copy');
  rejects(() => accounts.destroyItem(account, { kind: 'weapon', id: 'icesword', dur: 10 }), 'NOT_OWNED');
  v = accounts.destroyItem(account, { kind: 'weapon', id: 'icesword', dur: 50 }); // full durability = a full copy
  assert.deepEqual([v.stash, v.wear], [{ icesword: 1 }, { icesword: [30] }], 'the full copy');
  rejects(() => accounts.destroyItem(account, { kind: 'weapon', id: 'icesword' }), 'NOT_OWNED'); // no full copy left
  rejects(() => accounts.destroyItem(account, { kind: 'weapon', id: 'icesword', dur: 999 }), 'NOT_OWNED');
  v = accounts.destroyItem(account, { kind: 'weapon', id: 'icesword', dur: 30 });
  assert.deepEqual([v.stash, v.wear], [{}, {}]);
});

test('trash from the fast bar and the extras bar', () => {
  const { accounts, account } = rich();
  for (const id of ['shootbm', 'megashield']) accounts.buy(account, 'weapon', id);
  for (let i = 0; i < 3; i++) accounts.buy(account, 'potion', 'potion');
  accounts.toBar(account, 'weapon', 'shootbm', { slot: 2 });
  accounts.toBar(account, 'weapon', 'megashield');
  accounts.toBar(account, 'potion', 'potion');
  rejects(() => accounts.destroyItem(account, { from: 'bar', slot: 0 }), 'EMPTY_SLOT');
  rejects(() => accounts.destroyItem(account, { from: 'bar', slot: 9 }), 'BAD_SLOT');
  rejects(() => accounts.destroyItem(account, { from: 'bar', slot: 2, kind: 'weapon', id: 'icesword' }), 'NOT_OWNED');
  let v = accounts.destroyItem(account, { from: 'bar', slot: 2, kind: 'weapon', id: 'shootbm' });
  assert.deepEqual(v.bar, [null, null, null, null, null]);
  assert.deepEqual(v.stash, {}, 'not put back into the Inventory');
  v = accounts.destroyItem(account, { from: 'extras', slot: 'potion', kind: 'potion', id: 'potion' });
  assert.deepEqual(v.extras.potion, { kind: 'potion', id: 'potion', n: 2 }, 'one of the stack');
  v = accounts.destroyItem(account, { from: 'extras', slot: 'shield' });
  assert.equal(v.extras.shield, null);
  rejects(() => accounts.destroyItem(account, { from: 'extras', slot: 'shield' }), 'EMPTY_SLOT');
  rejects(() => accounts.destroyItem(account, { from: 'extras', slot: '__proto__' }), 'BAD_SPACE');
  rejects(() => accounts.destroyItem(account, { from: 'backpack', kind: 'potion', id: 'potion' }), 'BAD_PLACE');
  v = accounts.destroyItem(account, { from: 'extras', slot: 'potion' });
  v = accounts.destroyItem(account, { from: 'extras', slot: 'potion' });
  assert.equal(v.extras.potion, null, 'the last one empties the space');
});

test('trash: a worn weapon in the bar must match the dur asked for', () => {
  const { accounts, account } = rich();
  accounts.returnFromArena(account, { weapons: [{ id: 'shootbm', dur: 7 }] }, { refill: false });
  accounts.toBar(account, 'weapon', 'shootbm', { dur: 7 });
  rejects(() => accounts.destroyItem(account, { from: 'bar', slot: 0, dur: 20 }), 'NOT_OWNED');
  const v = accounts.destroyItem(account, { from: 'bar', slot: 0, kind: 'weapon', id: 'shootbm', dur: 7 });
  assert.equal(v.bar[0], null);
});

test('trash: bad input never changes the account', () => {
  const { accounts, account } = rich();
  accounts.buy(account, 'weapon', 'gun'); // a bought Gun is a normal weapon: it can be trashed
  const before = JSON.stringify(accounts.publicView(account));
  rejects(() => accounts.destroyItem(account, { kind: 'weapon', id: 'pistol' }), 'UNKNOWN_ITEM');
  rejects(() => accounts.destroyItem(account, { kind: 'hat', id: 'crown' }), 'UNKNOWN_ITEM');
  rejects(() => accounts.destroyItem(account, { kind: 'weapon', id: '__proto__' }), 'UNKNOWN_ITEM');
  rejects(() => accounts.destroyItem(account, null), 'UNKNOWN_ITEM');
  rejects(() => accounts.destroyItem(account, { from: 'bar', slot: '1' }), 'BAD_SLOT');
  assert.equal(JSON.stringify(accounts.publicView(account)), before);
  assert.throws(() => accounts.destroyItem({ name: 'Trash_Kid' }, { kind: 'weapon', id: 'gun' }), TypeError);
  assert.deepEqual(accounts.destroyItem(account, { kind: 'weapon', id: 'gun' }).stash, {});
});

test('trash is saved', async () => {
  const { store, accounts, account } = rich();
  accounts.buy(account, 'weapon', 'shootbm');
  accounts.buy(account, 'weapon', 'dmgun');
  accounts.destroyItem(account, { kind: 'weapon', id: 'shootbm' });
  await accounts.flush();
  const again = createAccounts({ store, now: fakeClock(), randomBytes: fakeRandom() });
  assert.deepEqual(again.publicView(again.byName('trash_kid')).stash, { dmgun: 1 });
});

test('destroyOne is a pure function of the record', () => {
  const rec = { stash: { shootbm: 2 }, wear: { shootbm: [5] }, potions: 0, bombs: {}, bar: [null, null, null, null, null], extras: { shield: null, potion: null, bomb: null, legendarybomb: null } };
  assert.deepEqual(destroyOne(rec, gameRules, { kind: 'weapon', id: 'shootbm', dur: 5 }), { kind: 'weapon', id: 'shootbm', n: 1, dur: 5 });
  assert.deepEqual([rec.stash, rec.wear], [{ shootbm: 1 }, {}]);
  assert.deepEqual(destroyOne(rec, gameRules, { kind: 'weapon', id: 'shootbm' }), { kind: 'weapon', id: 'shootbm', n: 1 });
  assert.deepEqual(rec.stash, {});
});
