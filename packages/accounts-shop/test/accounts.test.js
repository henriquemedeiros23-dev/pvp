import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as gameRules from '@pvp/game-rules';
import { STARTING_WEAPON, DEFAULT_SKIN, MAX_SLOTS, itemPrice, weaponPrice, skinPrice } from '@pvp/game-rules';
import { createAccounts, createMemoryStore, AccountError } from '../src/index.js';

// Fake randomness: counts up, so every token and salt is different but repeatable.
function fakeRandom() {
  let n = 0;
  return size => Buffer.alloc(size, ++n % 256);
}
const fakeClock = () => { let t = 1000; return () => (t += 1); };

function setup(opts = {}) {
  const store = opts.store ?? createMemoryStore();
  const accounts = createAccounts({ store, now: fakeClock(), randomBytes: fakeRandom(), ...opts });
  return { store, accounts };
}

const rejects = (fn, code) => assert.throws(fn, err => err instanceof AccountError && err.code === code && err.message.length > 0);

test('signup gives a token and a fresh account with free items and the default skin', () => {
  const { accounts } = setup();
  const { token, account } = accounts.signup('Stick_Kid', 'pass');
  assert.equal(typeof token, 'string');
  assert.equal(accounts.byToken(token), account);
  const view = accounts.publicView(account);
  assert.deepEqual(view, {
    name: 'Stick_Kid', coins: 0,
    owned: ['color:black', 'hat:none', 'face:none', 'back:none', 'shirt:none'],
    skin: { ...DEFAULT_SKIN }, stash: {}, potions: 0, bombs: { bomb: 0, legendarybomb: 0 },
  });
  for (const secret of ['hash', 'salt', 'tokens']) assert.ok(!(secret in view));
  assert.notEqual(account.hash, 'pass');
});

test('signup is deterministic with a fake clock and random', () => {
  const a = setup().accounts.signup('Bob', 'pass');
  const b = setup().accounts.signup('Bob', 'pass');
  assert.equal(a.token, b.token);
  assert.deepEqual(a.account, b.account);
});

test('duplicate names are refused, ignoring upper/lower case', () => {
  const { accounts } = setup();
  accounts.signup('Bob', 'pass');
  rejects(() => accounts.signup('bob', 'other'), 'NAME_TAKEN');
  rejects(() => accounts.signup('BOB', 'other'), 'NAME_TAKEN');
  assert.throws(() => accounts.signup('BOB', 'other'), { message: 'That name is taken' });
});

test('bad names and short passwords are refused', () => {
  const { accounts } = setup();
  for (const name of ['ab', 'a'.repeat(17), 'has space', 'dash-name', 'émile', '', undefined, null]) {
    rejects(() => accounts.signup(name, 'pass'), 'BAD_NAME');
  }
  rejects(() => accounts.signup('Bob', 'abc'), 'BAD_PASSWORD');
  rejects(() => accounts.signup('Bob', undefined), 'BAD_PASSWORD');
  // a tricky name is just a name
  const { account } = accounts.signup('__proto__', 'pass');
  assert.equal(accounts.publicView(account).name, '__proto__');
});

test('login works with any case, wrong password or unknown name fails', () => {
  const { accounts } = setup();
  const first = accounts.signup('Bob', 'secret');
  const { token, account } = accounts.login('bOB', 'secret');
  assert.equal(account, first.account);
  assert.notEqual(token, first.token);
  assert.equal(accounts.byToken(token), account);
  rejects(() => accounts.login('Bob', 'wrong'), 'WRONG_LOGIN');
  rejects(() => accounts.login('Nobody', 'secret'), 'WRONG_LOGIN');
  rejects(() => accounts.login('x', 'secret'), 'WRONG_LOGIN');
  assert.throws(() => accounts.login('Bob', 'wrong'), { message: 'Wrong name or password' });
});

test('logged in on 2 devices max: the oldest token stops working', () => {
  const { accounts } = setup();
  const t1 = accounts.signup('Bob', 'pass').token;
  const t2 = accounts.login('Bob', 'pass').token;
  assert.ok(accounts.byToken(t1));
  assert.ok(accounts.byToken(t2));
  const t3 = accounts.login('Bob', 'pass').token;
  assert.equal(accounts.byToken(t1), null);
  assert.ok(accounts.byToken(t2));
  assert.ok(accounts.byToken(t3));
});

test('logout ends only that device', () => {
  const { accounts } = setup();
  const t1 = accounts.signup('Bob', 'pass').token;
  const t2 = accounts.login('Bob', 'pass').token;
  assert.equal(accounts.logout(t1), true);
  assert.equal(accounts.byToken(t1), null);
  assert.ok(accounts.byToken(t2));
  assert.equal(accounts.logout(t1), false);
  assert.equal(accounts.logout(undefined), false);
  assert.equal(accounts.byToken(undefined), null);
});

test('coins never go negative or NaN', () => {
  const { accounts } = setup();
  const { account } = accounts.signup('Bob', 'pass');
  assert.equal(accounts.addCoins(account, 50), 50);
  assert.equal(accounts.addCoins(account, -80), 0);
  assert.throws(() => accounts.addCoins(account, NaN), TypeError);
  assert.throws(() => accounts.addCoins(account, Infinity), TypeError);
  assert.throws(() => accounts.addCoins(account, '5'), TypeError);
  assert.equal(account.coins, 0);
  assert.equal(accounts.addCoins(account, 2.7), 2);
});

test('buy a skin item, buying it twice fails, not enough coins fails', () => {
  const { accounts } = setup();
  const { account } = accounts.signup('Bob', 'pass');
  accounts.addCoins(account, 500);
  const view = accounts.buy(account, 'hat', 'crown');
  assert.equal(view.coins, 500 - skinPrice('hat', 'crown'));
  assert.ok(view.owned.includes('hat:crown'));
  rejects(() => accounts.buy(account, 'hat', 'crown'), 'ALREADY_OWNED');
  rejects(() => accounts.buy(account, 'color', 'black'), 'ALREADY_OWNED');
  rejects(() => accounts.buy(account, 'color', 'rainbow'), 'NOT_ENOUGH_COINS');
  assert.throws(() => accounts.buy(account, 'color', 'rainbow'), { message: 'Not enough coins' });
  assert.equal(account.coins, 200);
  assert.ok(!account.owned.includes('color:rainbow'));
});

test('weapons can be bought many times into the stash', () => {
  const { accounts } = setup();
  const { account } = accounts.signup('Bob', 'pass');
  accounts.addCoins(account, 100);
  accounts.buy(account, 'weapon', 'icesword');
  const view = accounts.buy(account, 'weapon', 'icesword');
  assert.deepEqual(view.stash, { icesword: 2 });
  assert.equal(view.coins, 100 - 2 * weaponPrice('icesword'));
  rejects(() => accounts.buy(account, 'weapon', 'supersword'), 'NOT_ENOUGH_COINS');
});

test('unknown items cannot be bought; the starting Gun can (into the backpack)', () => {
  const { accounts } = setup();
  const { account } = accounts.signup('Bob', 'pass');
  accounts.addCoins(account, 1003);
  assert.deepEqual(accounts.buy(account, 'weapon', STARTING_WEAPON).stash, { gun: 1 });
  assert.equal(account.coins, 1000);
  rejects(() => accounts.buy(account, 'weapon', 'woodsword'), 'UNKNOWN_ITEM');
  rejects(() => accounts.buy(account, 'weapon', 'laser'), 'UNKNOWN_ITEM');
  for (const old of ['sword', 'pistol', 'rocket', 'sniper']) rejects(() => accounts.buy(account, 'weapon', old), 'UNKNOWN_ITEM');
  rejects(() => accounts.buy(account, 'boots', 'none'), 'UNKNOWN_ITEM');
  rejects(() => accounts.buy(account, 'hat', 'toString'), 'UNKNOWN_ITEM');
  assert.equal(account.coins, 1000);
});

test('prices come from the rules (itemPrice helper)', () => {
  const rules = { ...gameRules, itemPrice: (kind, id) => (kind === 'weapon' && id === 'icesword' ? 7 : itemPrice(kind, id)) };
  const { accounts } = setup({ rules });
  const { account } = accounts.signup('Bob', 'pass');
  accounts.addCoins(account, 10);
  assert.equal(accounts.buy(account, 'weapon', 'icesword').coins, 3);
});

test('equip needs the item to be owned', () => {
  const { accounts } = setup();
  const { account } = accounts.signup('Bob', 'pass');
  rejects(() => accounts.equip(account, 'color', 'red'), 'NOT_OWNED');
  assert.throws(() => accounts.equip(account, 'color', 'red'), { message: 'Buy it first' });
  rejects(() => accounts.equip(account, 'weapon', 'icesword'), 'UNKNOWN_ITEM');
  accounts.addCoins(account, 50);
  accounts.buy(account, 'color', 'red');
  assert.equal(accounts.equip(account, 'color', 'red').skin.color, 'red');
  assert.equal(accounts.equip(account, 'color', 'black').skin.color, 'black');
});

test('takeLoadout: most expensive first, copies too, one slot kept for the starting Gun, rest stays in the stash', () => {
  const { accounts } = setup();
  const { account } = accounts.signup('Bob', 'pass');
  accounts.addCoins(account, 10000);
  for (const id of ['shootbm', 'shootbm', 'gun', 'supersword', 'icesword', 'electricsword', 'gun']) accounts.buy(account, 'weapon', id);
  const weapons = accounts.takeLoadout(account);
  assert.equal(weapons.length, MAX_SLOTS - 1);
  assert.deepEqual(weapons, ['supersword', 'icesword', 'electricsword', 'shootbm']);
  assert.deepEqual(account.stash, { shootbm: 1, gun: 2 });
  // two of a kind take two slots, a bought Gun too
  accounts.buy(account, 'weapon', 'icesword');
  accounts.buy(account, 'weapon', 'icesword');
  assert.deepEqual(accounts.takeLoadout(account), ['icesword', 'icesword', 'shootbm', 'gun']);
  assert.deepEqual(account.stash, { gun: 1 });
  assert.deepEqual(accounts.takeLoadout(account), ['gun']);
  assert.deepEqual(account.stash, {});
});

test('takeLoadout: shields take no slot; the best shield comes along, the others stay', () => {
  const { accounts } = setup();
  const { account } = accounts.signup('Bob', 'pass');
  accounts.addCoins(account, 10000);
  for (const id of ['shield', 'megashield', 'shield', 'icesword', 'icesword', 'icesword', 'icesword', 'shootbm']) accounts.buy(account, 'weapon', id);
  assert.deepEqual(accounts.takeLoadout(account), ['icesword', 'icesword', 'icesword', 'icesword', 'megashield']);
  assert.deepEqual(account.stash, { shield: 2, shootbm: 1 });
  assert.deepEqual(accounts.takeLoadout(account), ['shootbm', 'shield']);
  assert.deepEqual(account.stash, { shield: 1 });
});

test('takeLoadout respects a smaller MAX_SLOTS and an empty stash', () => {
  const { accounts } = setup({ rules: { ...gameRules, MAX_SLOTS: 2 } });
  const { account } = accounts.signup('Bob', 'pass');
  assert.deepEqual(accounts.takeLoadout(account), []);
  accounts.addCoins(account, 1000);
  accounts.buy(account, 'weapon', 'electricsword');
  accounts.buy(account, 'weapon', 'icesword');
  assert.deepEqual(accounts.takeLoadout(account), ['icesword']);
  assert.deepEqual(account.stash, { electricsword: 1 });
});

test('returnLoadout puts weapons back (a bought Gun too); unknown ids are ignored', () => {
  const { accounts } = setup();
  const { account } = accounts.signup('Bob', 'pass');
  accounts.addCoins(account, 1000);
  accounts.buy(account, 'weapon', 'icesword');
  accounts.buy(account, 'weapon', 'icesword');
  const weapons = accounts.takeLoadout(account);
  assert.deepEqual(weapons, ['icesword', 'icesword']);
  assert.deepEqual(account.stash, {});
  // picked up an Electric Sword and a second Gun in the arena, then left alive (counts add up)
  const view = accounts.returnLoadout(account, [...weapons, 'electricsword', 'gun', 'woodsword', 'pistol', 'not-a-weapon']);
  assert.deepEqual(view.stash, { icesword: 2, electricsword: 1, gun: 1 });
  // knocked out: nothing is returned, the weapons are gone
  assert.deepEqual(accounts.takeLoadout(account), ['icesword', 'icesword', 'electricsword', 'gun']);
  assert.deepEqual(account.stash, {});
});

test('accounts survive a reload from the store', async () => {
  const store = createMemoryStore();
  const { accounts } = setup({ store });
  const { token, account } = accounts.signup('Bob', 'pass');
  accounts.addCoins(account, 70);
  accounts.buy(account, 'weapon', 'shootbm');
  await accounts.flush();
  const again = createAccounts({ store });
  const back = again.byToken(token);
  assert.ok(back);
  assert.deepEqual(again.publicView(back), accounts.publicView(account));
  assert.ok(again.login('bob', 'pass').token);
});

test('old data with a single token still works', () => {
  const store = createMemoryStore();
  const { accounts } = setup({ store });
  const { token } = accounts.signup('Bob', 'pass');
  const data = store.load();
  data.bob.token = data.bob.tokens[0];
  delete data.bob.tokens;
  data.bob.coins = NaN;
  const again = createAccounts({ store: createMemoryStore(data) });
  const acc = again.byToken(token);
  assert.ok(acc);
  assert.equal(acc.coins, 0);
});

test('accounts from somewhere else are refused', () => {
  const { accounts } = setup();
  const other = setup().accounts.signup('Bob', 'pass').account;
  assert.throws(() => accounts.buy(other, 'weapon', 'icesword'), TypeError);
  assert.throws(() => accounts.publicView({ name: 'Bob' }), TypeError);
});

test('old accounts with weapons no longer in the game (wooden sword, Pistol, Rocket...) still load; they are dropped', () => {
  const store = createMemoryStore();
  const { accounts } = setup({ store });
  const { account } = accounts.signup('Old_Kid', 'secret');
  accounts.addCoins(account, 100);
  accounts.buy(account, 'weapon', 'shootbm');
  const data = store.load();
  data.old_kid.stash = { woodsword: 2, pistol: 1, sword: 3, rocket: 1, mine: 2, shootbm: 1 };
  const again = createAccounts({ store: createMemoryStore(data), now: fakeClock(), randomBytes: fakeRandom() });
  const acc = again.login('Old_Kid', 'secret').account;
  assert.deepEqual(again.publicView(acc).stash, { shootbm: 1 });
  assert.deepEqual(again.takeLoadout(acc), ['shootbm']);
});

test('Healing Potions: buy for 10 coins (many times) into the backpack; take up to 3 into the arena, return the rest', () => {
  const { accounts } = setup();
  const { account } = accounts.signup('Potty', 'secret');
  rejects(() => accounts.buy(account, 'potion', 'potion'), 'NOT_ENOUGH_COINS');
  accounts.addCoins(account, 45);
  for (let i = 0; i < 4; i++) accounts.buy(account, 'potion', 'potion');
  const view = accounts.publicView(account);
  assert.equal(view.potions, 4);
  assert.equal(view.coins, 5, '4 potions cost 40 coins');
  rejects(() => accounts.buy(account, 'potion', 'medkit'), 'UNKNOWN_ITEM');
  rejects(() => accounts.buy(account, 'potion', 'bandage'), 'UNKNOWN_ITEM');
  assert.equal(accounts.takePotions(account), 3, 'at most 3 go into the arena');
  assert.equal(accounts.publicView(account).potions, 1);
  assert.equal(accounts.returnPotions(account, 2).potions, 3, 'left alive with 2 unused');
  accounts.returnPotions(account, -5);
  accounts.returnPotions(account, 'x');
  assert.equal(accounts.publicView(account).potions, 3, 'bad counts are ignored');
  assert.equal(accounts.takePotions(account), 3);
  assert.equal(accounts.takePotions(account), 0, 'empty backpack: none');
});

test('old saved accounts without potions still load (0 potions); bad potion counts become 0', () => {
  const store = createMemoryStore();
  const { accounts } = setup({ store });
  accounts.signup('Old_Kid', 'secret');
  accounts.signup('Odd_Kid', 'secret');
  const data = store.load();
  delete data.old_kid.potions;
  data.odd_kid.potions = -3;
  const again = createAccounts({ store: createMemoryStore(data), now: fakeClock(), randomBytes: fakeRandom() });
  assert.equal(again.publicView(again.login('Old_Kid', 'secret').account).potions, 0);
  const odd = again.login('Odd_Kid', 'secret').account;
  assert.equal(again.publicView(odd).potions, 0);
  assert.equal(again.takePotions(odd), 0);
});

test('bombs (#32): a Bomb for 3 coins, a pack of 3 Legendary Bombs for 60; take up to the max into the arena, return the rest', () => {
  const { accounts } = setup();
  const { account } = accounts.signup('Boomer', 'secret');
  rejects(() => accounts.buy(account, 'bomb', 'bomb'), 'NOT_ENOUGH_COINS');
  accounts.addCoins(account, 3 * 7 + 60 * 2 + 1);
  for (let i = 0; i < 7; i++) accounts.buy(account, 'bomb', 'bomb');
  accounts.buy(account, 'bomb', 'legendarybomb');
  const view = accounts.buy(account, 'bomb', 'legendarybomb');
  assert.deepEqual(view.bombs, { bomb: 7, legendarybomb: 6 }, 'a Legendary Bomb pack is 3');
  assert.equal(view.coins, 1);
  assert.deepEqual(view.stash, {}, 'bombs are not weapons');
  rejects(() => accounts.buy(account, 'bomb', 'rocket'), 'UNKNOWN_ITEM');
  rejects(() => accounts.buy(account, 'weapon', 'bomb'), 'UNKNOWN_ITEM');
  assert.deepEqual(accounts.takeBombs(account), { bomb: 5, legendarybomb: 3 }, 'carry max 5 Bombs and 3 Legendary Bombs');
  assert.deepEqual(accounts.publicView(account).bombs, { bomb: 2, legendarybomb: 3 });
  assert.deepEqual(accounts.returnBombs(account, { bomb: 4, legendarybomb: 1, rocket: 9 }).bombs, { bomb: 6, legendarybomb: 4 });
  accounts.returnBombs(account, { bomb: -2, legendarybomb: 'x' });
  accounts.returnBombs(account, null);
  assert.deepEqual(accounts.publicView(account).bombs, { bomb: 6, legendarybomb: 4 }, 'bad counts are ignored');
});

test('old saved accounts without bombs still load (0 bombs); bad bomb counts become 0', () => {
  const store = createMemoryStore();
  const { accounts } = setup({ store });
  accounts.signup('Old_Kid', 'secret');
  accounts.signup('Odd_Kid', 'secret');
  const data = store.load();
  delete data.old_kid.bombs;
  data.odd_kid.bombs = { bomb: -1, legendarybomb: 2.5, rocket: 4 };
  const again = createAccounts({ store: createMemoryStore(data), now: fakeClock(), randomBytes: fakeRandom() });
  assert.deepEqual(again.publicView(again.login('Old_Kid', 'secret').account).bombs, { bomb: 0, legendarybomb: 0 });
  const odd = again.login('Odd_Kid', 'secret').account;
  assert.deepEqual(again.takeBombs(odd), { bomb: 0, legendarybomb: 0 });
});
