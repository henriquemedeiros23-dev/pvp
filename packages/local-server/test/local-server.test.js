import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeServerMessage, encodeClient } from '@pvp/net-protocol';
import { createLocalServer, createFakeSocket, practiceHash, practiceCanClaim, PRACTICE_FORM_SINCE, OPEN, CLOSED } from '../src/index.js';
import { ANYWHERE, decodeWord } from '@pvp/name-filter/words';

const settle = () => new Promise(r => setTimeout(r, 0)); // let the deferred (microtask) deliveries run

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m };
}

function setup(opts = {}) {
  let t = 1_000_000;
  const clock = { now: () => t, advance: ms => { t += ms; } };
  let n = 0;
  const server = createLocalServer({
    seed: 'test', storage: opts.storage ?? fakeStorage(), now: clock.now, autoStart: false,
    randomBytes: size => new Uint8Array(size).fill(++n % 256), ...opts,
  });
  // run the server for ms milliseconds of fake time, one 50 ms tick at a time
  const run = async ms => { for (let i = 0; i < ms / 50; i++) { clock.advance(50); server.tick(); } await settle(); };
  return { server, clock, run };
}

// Open a connection like the game does and record every message (checked with net-protocol).
async function open(server, token) {
  const ws = server.connect(token);
  const got = [];
  const out = { ws, got, closed: null, of: t => got.filter(m => m.t === t), send: (type, f) => ws.send(encodeClient(type, f)) };
  ws.onmessage = e => { const r = decodeServerMessage(e.data); assert.ok(r.ok, r.error); got.push(r.msg); };
  ws.onclose = e => { out.closed = e; };
  await settle();
  return out;
}

test('practiceHash is repeatable, 32 bytes of hex, and depends on salt and password', () => {
  assert.equal(practiceHash('pw', 'salt'), practiceHash('pw', 'salt'));
  assert.match(practiceHash('pw', 'salt'), /^[0-9a-f]{64}$/);
  assert.notEqual(practiceHash('pw', 'salt'), practiceHash('pw', 'salt2'));
  assert.notEqual(practiceHash('pw', 'salt'), practiceHash('pw2', 'salt'));
});

test('the API works through @pvp/api-client: sign up, me, shop errors, 401', async () => {
  const storage = fakeStorage();
  const { server } = setup({ storage });
  const api = server.createApi();
  const { account } = await api.signup('Practice_1', 'secret');
  assert.equal(account.name, 'Practice_1');
  assert.ok(api.hasToken());
  assert.equal(storage.getItem('pvp.practice.token'), api.token);
  const me = await api.me();
  assert.equal(me.account.coins, 0);
  assert.equal(me.online, 0);
  await assert.rejects(api.buy('hat', 'crown'), /Not enough coins/);
  await assert.rejects(api.signup('Practice_1', 'secret'), /already has that name/);
  api.logout();
  await assert.rejects(api.me(), e => e.status === 401);
  const again = await api.login('practice_1', 'secret');
  assert.equal(again.account.name, 'Practice_1');
});

test('accounts and coins are kept in the storage between page loads', async () => {
  const storage = fakeStorage();
  const a = setup({ storage });
  const api = a.server.createApi();
  const { token } = await api.signup('Saver_1', 'secret');
  a.server.accounts.addCoins(a.server.accounts.byToken(token), 50);
  const b = setup({ storage });
  const me = await b.server.createApi().me(); // same token key in the same storage
  assert.equal(me.account.coins, 50);
});

test('a connection with a bad token closes with 4001', async () => {
  const { server } = setup();
  const c = await open(server, 'nope');
  assert.equal(c.ws.readyState, CLOSED);
  assert.equal(c.closed.code, 4001);
});

test('join, walk, open a chest: +3 coins in the game and in the account; leave', async () => {
  const { server, run } = setup();
  const api = server.createApi();
  const { token } = await api.signup('Chester', 'secret');
  const c = await open(server, token);
  assert.equal(c.ws.readyState, OPEN);
  assert.throws(() => server.connect(token).send('x'), /connecting/i); // like a real WebSocket

  c.send('join');
  await settle();
  const welcome = c.of('welcome')[0];
  assert.ok(welcome, 'welcome');
  assert.equal(c.of('inv')[0].weapons[0], 'gun');
  assert.equal((await api.me()).online, 1);

  // walk a little (a normal state update is accepted, no 'pos' correction)
  await run(100);
  c.send('state', { x: welcome.x + 0.2, y: 0, z: welcome.z, ry: 0, pitch: 0, f: 0 });
  await run(50);
  assert.equal(c.of('pos').length, 0);
  assert.ok(c.of('snap').length > 0);

  // go next to chest 0 and open it
  const chest = server.island.chests[0];
  assert.ok(server.teleport(token, chest.x + 1, chest.z));
  await settle();
  assert.deepEqual(c.of('pos').at(-1), { t: 'pos', x: chest.x + 1, y: 0, z: chest.z });
  c.send('open', { id: 0 });
  await settle();
  assert.deepEqual(c.of('coins')[0], { t: 'coins', amount: 3, total: 3 });
  assert.equal((await api.me()).account.coins, 3);
  assert.ok(c.of('chest').some(m => m.id === 0 && m.open));

  c.send('leave');
  await settle();
  assert.equal(c.of('left').length, 1);
  assert.equal((await api.me()).online, 0);
});

test('a bad client message is dropped; closing the socket leaves the arena', async () => {
  const { server } = setup();
  const { token } = await server.createApi().signup('Closer', 'secret');
  const c = await open(server, token);
  c.ws.send('{"t":"join","x":');
  c.ws.send('{"t":"hack"}');
  await settle();
  assert.equal(c.got.length, 0);
  c.send('join');
  await settle();
  assert.equal(server.arena.playerCount(), 1);
  c.ws.close();
  await settle();
  assert.equal(c.closed.code, 1000);
  assert.equal(server.arena.playerCount(), 0);
});

test('a shop buy during a match sends the new coins to the game', async () => {
  const { server } = setup();
  const api = server.createApi();
  const { token } = await api.signup('Buyer_1', 'secret');
  server.accounts.addCoins(server.accounts.byToken(token), 10);
  const c = await open(server, token);
  c.send('join');
  await settle();
  await api.buy('weapon', 'gun');
  await settle();
  assert.equal(c.of('inv').at(-1).coins, 10 - 3);
});

test('the fast bar (#39): only the bar comes into the arena; the Inventory stays; survivors go back into the bar', async () => {
  const { server } = setup();
  const api = server.createApi();
  const { token } = await api.signup('Barry_1', 'secret');
  server.accounts.addCoins(server.accounts.byToken(token), 100);
  await api.buy('weapon', 'shootbm');
  await api.buy('weapon', 'icesword');
  await api.buy('potion', 'potion');
  assert.deepEqual((await api.inventory()).account.bar, [null, null, null, null, null]);
  await api.toBar('weapon', 'shootbm');
  await assert.rejects(api.toBar('weapon', 'shootbm'), /don't have that/);
  const c = await open(server, token);
  c.send('join');
  await settle();
  const inv = c.of('inv')[0];
  assert.deepEqual(inv.weapons, ['shootbm'], 'only the bar weapon, no free Gun');
  assert.equal(inv.potions, 0, 'the potion was not in the bar');
  const during = (await api.inventory()).account;
  assert.deepEqual(during.stash, { icesword: 1 });
  assert.equal(during.potions, 1);
  c.send('leave');
  await settle();
  const after = (await api.me()).account;
  assert.deepEqual(after.bar, [{ kind: 'weapon', id: 'shootbm', n: 1 }, null, null, null, null], 'back in its slot');
  assert.deepEqual(after.stash, { icesword: 1 });
  // an empty bar: the free Gun comes like before
  await api.fromBar(0);
  const c2 = await open(server, token);
  c2.send('join');
  await settle();
  assert.deepEqual(c2.of('inv')[0].weapons, ['gun']);
});

test('rename: changes the name, but not while in the arena', async () => {
  const { server } = setup();
  const api = server.createApi();
  const { token } = await api.signup('Player_7', 'secret');
  assert.equal(server.rename(token, 'Hero_7').name, 'Hero_7');
  assert.equal((await api.me()).account.name, 'Hero_7');
  const c = await open(server, token);
  c.send('join');
  await settle();
  assert.equal(c.of('welcome')[0].players.find(p => p.id === c.of('welcome')[0].id).name, 'Hero_7');
  assert.throws(() => server.rename(token, 'Other_7'), /Leave the arena/);
  await assert.rejects(api.rename('Other_7'), e => e.status === 400 && /Leave the arena/.test(e.message));
});

test('/api/rename (#41): bad words and look-alike names are refused, a good name works', async () => {
  const { server } = setup();
  const api = server.createApi();
  await server.createApi().signup('Bob_Kid', 'secret');
  await api.signup('Player_8', 'secret');
  const rude = `Big_${decodeWord(ANYWHERE[0])}`;
  await assert.rejects(api.rename(rude), e => e.status === 400 && e.message === "You can't use that name. Please pick a new name.");
  await assert.rejects(api.rename('B0B_kid'), e => e.status === 400 && e.message === 'Someone already has that name. Please pick a new name.');
  await assert.rejects(server.createApi().signup(rude, 'secret'), e => e.message === "You can't use that name. Please pick a new name.");
  assert.equal((await api.me()).account.name, 'Player_8');
  assert.equal((await api.rename('Hero_8')).account.name, 'Hero_8');
  assert.equal((await api.me()).account.name, 'Hero_8');
});

test('ensurePlayer: a local player right away, kept on the next page load', async () => {
  const storage = fakeStorage();
  const a = setup({ storage });
  const first = a.server.ensurePlayer();
  assert.ok(first.created);
  assert.match(first.account.name, /^Player_\d{4}$/);
  const api = a.server.createApi();
  assert.ok(api.hasToken());
  assert.equal((await api.me()).account.name, first.account.name);
  assert.equal(a.server.ensurePlayer().created, false);

  const b = setup({ storage }); // reload
  const again = b.server.ensurePlayer();
  assert.equal(again.created, false);
  assert.equal(again.account.name, first.account.name);

  const blocked = setup({ storage: { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() {} } });
  const p = blocked.server.ensurePlayer();
  assert.equal((await blocked.server.createApi().me()).account.name, p.account.name);
});

test('the tick runs on the injected timer and stops', () => {
  const calls = [];
  const timer = { setInterval: (f, ms) => { calls.push(ms); return 7; }, clearInterval: h => calls.push(`clear ${h}`) };
  const server = createLocalServer({ seed: 1, timer, now: () => 5000 });
  assert.ok(server.running);
  server.stop();
  assert.deepEqual(calls, [50, 'clear 7']);
});

test('fake socket: close before open never opens; listeners work', async () => {
  const seen = [];
  const ws = createFakeSocket({ defer: f => queueMicrotask(f), accept: () => { seen.push('accept'); return true; }, receive: d => seen.push(d), closed: () => seen.push('closed') });
  ws.addEventListener('close', () => seen.push('close event'));
  ws.close();
  await settle();
  assert.deepEqual(seen, ['close event']);
});

test('bombs (#32): bought bombs come along, "throw" throws one, it explodes after 3 s; leaving returns the rest', async () => {
  const { server, run } = setup();
  const api = server.createApi();
  const { token } = await api.signup('Bomber_1', 'secret');
  server.accounts.addCoins(server.accounts.byToken(token), 3 * 6 + 60);
  for (let i = 0; i < 6; i++) await api.buy('bomb', 'bomb');
  const bought = await api.buy('bomb', 'legendarybomb');
  assert.deepEqual(bought.account.bombs, { bomb: 6, legendarybomb: 3 });
  // into the fast bar (#39): only what is in the bar comes along
  await api.toBar('bomb', 'bomb');
  const inBar = await api.toBar('bomb', 'legendarybomb');
  assert.deepEqual(inBar.account.bar.slice(0, 2), [{ kind: 'bomb', id: 'bomb', n: 5 }, { kind: 'bomb', id: 'legendarybomb', n: 3 }]);
  const c = await open(server, token);
  c.send('join');
  await settle();
  assert.deepEqual(c.of('inv')[0].bombs, [{ id: 'bomb', n: 5 }, { id: 'legendarybomb', n: 3 }], 'carry max 5 Bombs');
  assert.deepEqual((await api.me()).account.bombs, { bomb: 1, legendarybomb: 0 }, 'one Bomb stays in the Inventory');
  await run(3200); // spawn protection over
  c.send('throw', { b: 'bomb', d: [0, -0.3, 1] });
  await settle();
  const [thrown] = c.of('bomb');
  assert.ok(thrown, 'the bomb flies');
  assert.equal(c.of('inv').at(-1).bombs[0].n, 4);
  await run(3000);
  assert.deepEqual(c.of('boom').map(m => m.id), [thrown.id]);
  // a Bomb thrown at your own feet hurts you: the damage number (#33) shows for bomb hits too
  c.send('throw', { b: 'bomb', d: [0, -1, 0] });
  await settle();
  await run(3100);
  const me = c.of('welcome')[0].id;
  assert.deepEqual(c.of('dmg').filter(m => m.id === me), [{ t: 'dmg', id: me, amount: 3 }]);
  c.send('leave');
  await settle();
  const back = (await api.me()).account;
  assert.deepEqual(back.bar.slice(0, 2), [{ kind: 'bomb', id: 'bomb', n: 3 }, { kind: 'bomb', id: 'legendarybomb', n: 3 }], 'unused bombs go back into the bar');
  assert.deepEqual(back.bombs, { bomb: 1, legendarybomb: 0 }, 'the Inventory was never touched');
});

test('damage numbers (#33): a hit sends "dmg" to the players near the victim, not to far ones', async () => {
  const { server, run } = setup();
  const api = server.createApi();
  const clients = [];
  for (const name of ['Shooter', 'Target', 'Faraway']) {
    const { token } = await api.signup(name, 'secret');
    const c = await open(server, token);
    c.send('join');
    clients.push({ c, token, id: null });
  }
  await settle();
  for (const p of clients) p.id = p.c.of('welcome')[0].id;
  await run(3200); // spawn protection is over
  // an open place with nothing between the shooter and the target
  const g = server.island.grid;
  let spot = null;
  for (let x = -60; x <= 60 && !spot; x += 4) for (let z = -60; z <= 60 && !spot; z += 4) if (g.near(x, z, 4).length === 0) spot = { x, z };
  assert.ok(spot, 'an open place');
  const [shooter, target, far] = clients;
  assert.ok(server.teleport(shooter.token, spot.x, spot.z));
  assert.ok(server.teleport(target.token, spot.x, spot.z + 2));
  assert.ok(server.teleport(far.token, spot.x + 200, spot.z));
  shooter.c.send('fire', { d: [0, -0.24, 0.97] });
  await run(50);
  const dmg = { t: 'dmg', id: target.id, amount: 2 }; // the Gun does 2
  assert.deepEqual(shooter.c.of('dmg'), [dmg]);
  assert.deepEqual(target.c.of('dmg'), [dmg]);
  assert.deepEqual(far.c.of('dmg'), []);
});

test('ranking (#47): a knockout gives the attacker\'s account +1; /api/ranking lists it with my place', async () => {
  const { server, run } = setup();
  const api = server.createApi();
  const ann = await api.signup('Ann', 'secret');
  server.accounts.addCoins(server.accounts.byName('ann'), 250);
  await api.buy('weapon', 'supersword'); // 100 damage: one hit knocks out
  await api.toBar('weapon', 'supersword'); // only the fast bar comes into the arena (#39): slot 1
  const bob = await api.signup('Bob', 'secret');
  const a = await open(server, ann.token);
  const b = await open(server, bob.token);
  a.send('join');
  b.send('join');
  await settle();
  await run(3200); // spawn protection is over
  assert.ok(server.teleport(ann.token, 0, 0));
  assert.ok(server.teleport(bob.token, 0, 0.4)); // so close that facing does not matter
  a.send('slot', { i: 0 });
  a.send('fire', { d: [0, 0, 1] });
  await run(50);
  assert.equal(a.of('ko').length, 1, 'Bob was knocked out');
  assert.equal(server.accounts.byName('ann').kills, 1);
  assert.equal(server.accounts.byName('bob').kills, 0);
  // Bob (logged in now) is not ranked; Ann is first
  assert.deepEqual(await api.ranking(), {
    top: [{ place: 1, name: 'Ann', kills: 1, skinColor: 'black' }],
    me: { place: null, name: 'Bob', kills: 0 },
  });
  await api.login('Ann', 'secret');
  assert.deepEqual((await api.ranking()).me, { place: 1, name: 'Ann', kills: 1 });
});

// ---------------------------------------------------------------- #48: claim the old automatic practice player
// Practice storage like an old page left it: an ensurePlayer account renamed to 'Boss_Kid', with coins,
// saved without the #48 marks, created at `createdAt`, and the token forgotten (#46).
function oldPracticeStorage(createdAt) {
  const storage = fakeStorage();
  const { server } = setup({ storage, now: () => createdAt });
  const { token } = server.ensurePlayer();
  server.rename(token, 'Boss_Kid');
  server.accounts.addCoins(server.accounts.byName('Boss_Kid'), 42);
  const data = JSON.parse(storage.getItem('pvp.practice.accounts'));
  delete data.boss_kid.autoPassword;
  delete data.boss_kid.passwordChosen;
  storage.setItem('pvp.practice.accounts', JSON.stringify(data));
  storage.removeItem('pvp.practice.token');
  return storage;
}

test('#48 practice: "Create an account" with the old player\'s name claims it (coins kept), only once', async () => {
  const storage = oldPracticeStorage(Date.UTC(2026, 9, 20));
  const api = setup({ storage }).server.createApi();
  const res = await api.signup('Boss_Kid', 'mypass');
  assert.equal(res.claimed, true);
  assert.equal(res.account.name, 'Boss_Kid');
  assert.equal(res.account.coins, 42);
  assert.equal((await api.me()).account.coins, 42);
  api.logout();
  await assert.rejects(api.signup('Boss_Kid', 'other1'), /already has that name/);
  assert.equal((await api.login('Boss_Kid', 'mypass')).account.coins, 42);
  // still a normal account after a reload
  const again = setup({ storage }).server.createApi();
  await assert.rejects(again.signup('Boss_Kid', 'thief1'), /already has that name/);
  assert.equal((await again.login('Boss_Kid', 'mypass')).account.coins, 42);
});

test('#48 practice: accounts from the #46 form and new accounts are not claimable; ensurePlayer ones are', async () => {
  // unmarked, but made after the form existed: its password was chosen
  const api = setup({ storage: oldPracticeStorage(PRACTICE_FORM_SINCE + 60_000) }).server.createApi();
  await assert.rejects(api.signup('Boss_Kid', 'mypass'), /already has that name/);
  // a new account is marked
  const s2 = setup().server;
  const api2 = s2.createApi();
  await api2.signup('New_Kid', 'pass');
  assert.equal(s2.accounts.byName('New_Kid').passwordChosen, true);
  await assert.rejects(api2.signup('New_Kid', 'pass2'), /already has that name/);
  // an ensurePlayer account made today is marked autoPassword and can be claimed
  const s3 = setup({ now: () => PRACTICE_FORM_SINCE + 1e9 }).server;
  const { account } = s3.ensurePlayer();
  const api3 = s3.createApi();
  api3.logout();
  const res = await api3.signup(account.name, 'mine1');
  assert.equal(res.claimed, true);
});

test('#48 practiceCanClaim: no mark and (autoPassword or saved before the form existed)', () => {
  assert.equal(practiceCanClaim({ passwordChosen: true, autoPassword: true, createdAt: 1 }), false);
  assert.equal(practiceCanClaim({ autoPassword: true, createdAt: PRACTICE_FORM_SINCE + 1 }), true);
  assert.equal(practiceCanClaim({ createdAt: PRACTICE_FORM_SINCE - 1 }), true);
  assert.equal(practiceCanClaim({}), true);
  assert.equal(practiceCanClaim({ createdAt: PRACTICE_FORM_SINCE }), false);
  assert.equal(practiceCanClaim(null), false);
});
