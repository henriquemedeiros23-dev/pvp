import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as gameRules from '@pvp/game-rules';
import { STARTING_WEAPON, DEFAULT_SKIN, itemPrice, weaponPrice, skinPrice } from '@pvp/game-rules';
import { createAccounts, createMemoryStore, AccountError } from '../src/index.js';
// #41: rude test names come from the name-filter word list (ROT13), so none is written in this file.
import { ANYWHERE, decodeWord } from '@pvp/name-filter/words';

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
    bar: [null, null, null, null, null],
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
  assert.throws(() => accounts.signup('BOB', 'other'), { message: 'Someone already has that name. Please pick a new name.' });
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
  const start = skinPrice('hat', 'crown') + skinPrice('color', 'rainbow') - 1; // after the crown, 1 coin short of the rainbow
  accounts.addCoins(account, start);
  const view = accounts.buy(account, 'hat', 'crown');
  assert.equal(view.coins, start - skinPrice('hat', 'crown'));
  assert.ok(view.owned.includes('hat:crown'));
  rejects(() => accounts.buy(account, 'hat', 'crown'), 'ALREADY_OWNED');
  rejects(() => accounts.buy(account, 'color', 'black'), 'ALREADY_OWNED');
  rejects(() => accounts.buy(account, 'color', 'rainbow'), 'NOT_ENOUGH_COINS');
  assert.throws(() => accounts.buy(account, 'color', 'rainbow'), { message: 'Not enough coins' });
  assert.equal(account.coins, skinPrice('color', 'rainbow') - 1);
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

test('unknown items cannot be bought; the starting Gun can (into the Inventory)', () => {
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
  assert.deepEqual(again.takeBar(acc).loadout, [], 'nothing in the bar (it has a bar already)');
});

test('Healing Potions: buy for 10 coins (many times) into the Inventory; up to 3 in the fast bar go into the arena, the rest comes back', () => {
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
  // 3 fit in one bar slot; joining takes only those
  rejects(() => accounts.toBar(account, 'potion', 'potion', { n: 5 }), 'NOT_OWNED');
  assert.deepEqual(accounts.toBar(account, 'potion', 'potion').bar[0], { kind: 'potion', id: 'potion', n: 3 });
  assert.equal(accounts.publicView(account).potions, 1);
  assert.equal(accounts.takeBar(account).potions, 3, 'at most 3 go into the arena');
  assert.equal(accounts.publicView(account).potions, 1, 'the 4th stays in the Inventory');
  // left alive with 2 unused: back into the bar slot; bad counts are ignored
  assert.deepEqual(accounts.returnFromArena(account, { potions: 2 }).bar[0], { kind: 'potion', id: 'potion', n: 2 });
  accounts.returnFromArena(account, { potions: -5 });
  accounts.returnFromArena(account, { potions: 'x' });
  assert.equal(accounts.publicView(account).potions, 1, 'bad counts are ignored');
  assert.equal(accounts.takeBar(account).potions, 2);
  assert.equal(accounts.takeBar(account).potions, 0, 'empty bar: none');
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
  assert.equal(again.takeBar(odd).potions, 0);
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
  accounts.toBar(account, 'bomb', 'bomb');
  accounts.toBar(account, 'bomb', 'legendarybomb');
  assert.deepEqual(accounts.takeBar(account).bombs, { bomb: 5, legendarybomb: 3 }, 'carry max 5 Bombs and 3 Legendary Bombs');
  assert.deepEqual(accounts.publicView(account).bombs, { bomb: 2, legendarybomb: 3 });
  const back = accounts.returnFromArena(account, { bombs: { bomb: 4, legendarybomb: 1, rocket: 9 } });
  assert.deepEqual(back.bar.slice(0, 2), [{ kind: 'bomb', id: 'bomb', n: 4 }, { kind: 'bomb', id: 'legendarybomb', n: 1 }]);
  accounts.fromBar(account, 0);
  accounts.fromBar(account, 1);
  accounts.returnFromArena(account, { bombs: { bomb: -2, legendarybomb: 'x' } });
  accounts.returnFromArena(account, { bombs: null });
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
  assert.deepEqual(again.takeBar(odd).bombs, { bomb: 0, legendarybomb: 0 });
});

test('knockouts for the ranking (#47): counted with the time, found by name, listed when > 0; old accounts start at 0', () => {
  const store = createMemoryStore();
  const { accounts } = setup({ store });
  const ann = accounts.signup('Ann', 'secret').account;
  accounts.signup('Bob', 'secret');
  assert.equal(accounts.byName('ANN'), ann);
  assert.equal(accounts.byName('nobody'), null);
  assert.equal(accounts.byName(null), null);
  assert.equal(accounts.byName('__proto__'), null);
  assert.equal(accounts.addKnockout(ann, 5000), 1);
  assert.equal(accounts.addKnockout(ann, 7000), 2);
  assert.equal(ann.kills, 2);
  assert.deepEqual(accounts.rankingEntries(), [{ name: 'Ann', kills: 2, lastKillAt: 7000, skinColor: DEFAULT_SKIN.color }]);
  assert.throws(() => accounts.addKnockout({ name: 'Ann' }), TypeError);
  // saved, and older accounts without knockouts load with 0
  const data = store.load();
  assert.equal(data.ann.kills, 2);
  delete data.bob.kills;
  delete data.bob.lastKillAt;
  data.ann.lastKillAt = 'x';
  const again = createAccounts({ store: createMemoryStore(data), now: fakeClock(), randomBytes: fakeRandom() });
  assert.equal(again.byName('bob').kills, 0);
  assert.deepEqual(again.rankingEntries().map(e => [e.name, e.kills, e.lastKillAt]), [['Ann', 2, 0]]);
});

// ---------------------------------------------------------------- #41 names
const RUDE_NAME = `Big_${decodeWord(ANYWHERE[0])}`;

test('a name with a swear word is refused at sign up and rename (kid-friendly message)', () => {
  const { accounts } = setup();
  assert.throws(() => accounts.signup(RUDE_NAME, 'pass'),
    e => e instanceof AccountError && e.code === 'BAD_WORD' && e.message === "You can't use that name. Please pick a new name.");
  assert.throws(() => accounts.signup([...decodeWord(ANYWHERE[0])].join('_'), 'pass'), e => e.code === 'BAD_WORD');
  const { account } = accounts.signup('Good_Kid', 'pass');
  assert.throws(() => accounts.rename(account, RUDE_NAME), e => e.code === 'BAD_WORD');
  assert.equal(accounts.publicView(account).name, 'Good_Kid'); // unchanged
  assert.equal(accounts.rename(account, 'Classic_Kid').name, 'Classic_Kid');
});

test('look-alike copies of a name are taken too; Bob1 and Bob2 are different', () => {
  const { accounts } = setup();
  const bob = accounts.signup('Bob', 'pass');
  for (const name of ['bob', 'B0b', 'b_o_b', 'BOB', 'B_0_B']) {
    assert.throws(() => accounts.signup(name, 'pass'),
      e => e.code === 'NAME_TAKEN' && e.message === 'Someone already has that name. Please pick a new name.', name);
  }
  accounts.signup('Bob1', 'pass');
  accounts.signup('Bob2', 'pass');
  rejects(() => accounts.signup('Bobl', 'pass'), 'NAME_TAKEN'); // looks like Bob1
  const other = accounts.signup('Zed_7', 'pass');
  rejects(() => accounts.rename(other.account, 'B_o_b'), 'NAME_TAKEN');
  assert.equal(accounts.rename(bob.account, 'B0b').name, 'B0b'); // your own name in another spelling is fine
  rejects(() => accounts.signup('bob', 'pass'), 'NAME_TAKEN');
  // after a rename the old name is free again
  accounts.rename(other.account, 'Zed_8');
  assert.equal(accounts.publicView(accounts.signup('Zed_7', 'pass').account).name, 'Zed_7');
});

test('old accounts that clash or have a bad name still load and log in; a bad name is flagged', () => {
  const first = setup();
  for (const n of ['Old_One', 'Old_Two', 'Old_Three']) first.accounts.signup(n, 'pass');
  const saved = first.store.load();
  // pretend these were saved before #41: a look-alike pair and a rude name
  const move = (from, to) => { saved[to.toLowerCase()] = { ...saved[from], name: to }; delete saved[from]; };
  move('old_two', 'Old_0ne');
  move('old_three', RUDE_NAME);
  const { accounts } = setup({ store: createMemoryStore(saved) });
  assert.equal(accounts.publicView(accounts.login('Old_One', 'pass').account).mustRename, undefined);
  assert.equal(accounts.publicView(accounts.login('Old_0ne', 'pass').account).mustRename, undefined);
  const rude = accounts.login(RUDE_NAME, 'pass').account;
  assert.equal(accounts.publicView(rude).mustRename, true);
  rejects(() => accounts.signup('0ld_One', 'pass'), 'NAME_TAKEN');
  assert.equal(accounts.rename(rude, 'New_Name').name, 'New_Name');
  assert.equal(accounts.publicView(rude).mustRename, undefined);
  assert.equal(accounts.login('New_Name', 'pass').account, rude);
});

// ---------------------------------------------------------------- #48: claim an old account with no chosen password
// An old practice player: made automatically (random password nobody knows), saved before the `passwordChosen` mark.
function oldAutoStore() {
  const { store, accounts } = setup();
  const { account } = accounts.signup('Player_1234', 'f00dcafe1234deadbeef9999');
  accounts.addCoins(account, 57);
  accounts.rename(account, 'Boss_Kid');
  accounts.addKnockout(account, 5000);
  const data = store.load();
  delete data.boss_kid.passwordChosen; // saved before #48: no mark
  return createMemoryStore(data);
}

test('#48 claim: an old account whose password was never chosen is claimed by signing up with its name', () => {
  const { accounts } = setup({ store: oldAutoStore(), allowClaimUnsetPassword: true });
  const r = accounts.signup('Boss_Kid', 'mypass');
  assert.equal(r.claimed, true);
  assert.equal(accounts.byToken(r.token), r.account);
  const view = accounts.publicView(r.account);
  assert.equal(view.name, 'Boss_Kid');
  assert.equal(view.coins, 57);
  assert.equal(r.account.kills, 1);
  assert.equal(r.account.tokens.length, 1); // only the new login
  assert.equal(accounts.login('boss_kid', 'mypass').account, r.account);
  rejects(() => accounts.login('Boss_Kid', 'f00dcafe1234deadbeef9999'), 'WRONG_LOGIN');
  // now a normal account: a second claim is refused as taken
  rejects(() => accounts.signup('Boss_Kid', 'other1'), 'NAME_TAKEN');
  assert.equal(accounts.login('Boss_Kid', 'mypass').account.coins, 57);
});

test('#48 claim: a look-alike name claims too; short passwords and bad words are still refused', () => {
  const { accounts } = setup({ store: oldAutoStore(), allowClaimUnsetPassword: true });
  rejects(() => accounts.signup('Boss_Kid', 'abc'), 'BAD_PASSWORD');
  const r = accounts.signup('B0ss_K1d', 'mypass');
  assert.equal(r.claimed, true);
  assert.equal(r.account.name, 'Boss_Kid'); // keeps its own name
  assert.equal(r.account.coins, 57);
});

test('#48 claim: accounts made with a password (the mark) and the default (real server) are never claimed', () => {
  // normal sign up: marked, not claimable even with the option on
  const a = setup({ allowClaimUnsetPassword: true }).accounts;
  a.signup('Normal_Kid', 'pass');
  rejects(() => a.signup('Normal_Kid', 'other1'), 'NAME_TAKEN');
  // the real server: no option, an unmarked old account is just taken
  const real = setup({ store: oldAutoStore() }).accounts;
  rejects(() => real.signup('Boss_Kid', 'mypass'), 'NAME_TAKEN');
  // a function says which unmarked accounts may be claimed
  const picky = setup({ store: oldAutoStore(), allowClaimUnsetPassword: rec => rec.coins > 100 }).accounts;
  rejects(() => picky.signup('Boss_Kid', 'mypass'), 'NAME_TAKEN');
});

test('#48 claim: signup with autoPassword stays claimable, and a claim logs out the old tokens', () => {
  const { accounts } = setup({ allowClaimUnsetPassword: true });
  const auto = accounts.signup('Player_5555', 'random1234', { autoPassword: true });
  assert.equal(auto.account.autoPassword, true);
  const r = accounts.signup('player_5555', 'mine1');
  assert.equal(r.claimed, true);
  assert.equal(accounts.byToken(auto.token), null);
  assert.equal(r.account.passwordChosen, true);
  assert.ok(!('autoPassword' in r.account));
});
