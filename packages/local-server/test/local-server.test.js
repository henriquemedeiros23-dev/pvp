import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeServerMessage, encodeClient } from '@pvp/net-protocol';
import { createLocalServer, createFakeSocket, practiceHash, OPEN, CLOSED } from '../src/index.js';

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
  await assert.rejects(api.signup('Practice_1', 'secret'), /taken/);
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
