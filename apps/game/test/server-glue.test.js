// The server glue (issues #12 and #19): boot the real server with a temp data file,
// sign up, join the arena over a WebSocket, leave, then stop it and check the account was saved
// to the temp file (and not to the real one).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { decodeServerMessage } from '@pvp/net-protocol';
import { ANYWHERE, decodeWord } from '@pvp/name-filter/words';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const REAL_DATA = fileURLToPath(new URL('../data/accounts.json', import.meta.url));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvp-test-'));
const dataFile = path.join(dataDir, 'accounts.json');
const NAME = 'glue_' + Date.now().toString(36).slice(-8);
let child, port, exitCode;

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

const post = (url, body, token) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: url, method: 'POST', headers: token ? { 'x-token': token } : {} }, res => {
    let raw = '';
    res.on('data', c => { raw += c; });
    res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
  });
  req.on('error', reject);
  req.end(JSON.stringify(body));
});

const realDataHasName = () => {
  try { return fs.readFileSync(REAL_DATA, 'utf8').includes(NAME); } catch { return false; }
};

before(async () => {
  port = await freePort();
  child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), DATA_FILE: dataFile, ARENA_SEED: '12345' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  child.on('exit', code => { exitCode = code; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
    child.stdout.on('data', d => { if (String(d).includes('running')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`server exited (${code})`)); });
  });
});

after(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// Collects every server message on a socket; next(t) waits for the next message of type t.
function messages(ws) {
  const seen = [];
  const waiters = [];
  ws.on('message', raw => {
    const r = decodeServerMessage(String(raw));
    assert.ok(r.ok, `server sent a message the protocol rejects: ${r.error} (${String(raw).slice(0, 120)})`);
    seen.push(r.msg);
    for (const w of [...waiters]) if (w.t === r.msg.t) { waiters.splice(waiters.indexOf(w), 1); w.resolve(r.msg); }
  });
  return {
    seen,
    next: (t, ms = 3000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no "${t}" message`)), ms);
      waiters.push({ t, resolve: m => { clearTimeout(timer); resolve(m); } });
    }),
  };
}

test('sign up, join the arena, bad messages are dropped, leave', async () => {
  const signup = await post('/api/signup', { name: NAME, password: 'secret1' });
  assert.equal(signup.status, 200);
  assert.deepEqual(Object.keys(signup.body.account).sort(), ['bar', 'bombs', 'coins', 'name', 'owned', 'potions', 'skin', 'stash']);

  // the Inventory and the fast bar (#39): an empty bar; you can't put in what you don't own
  const inv = await post('/api/inventory', {}, signup.body.token);
  assert.equal(inv.status, 200);
  assert.deepEqual(inv.body.account.bar, [null, null, null, null, null]);
  const notOwned = await post('/api/bar/put', { kind: 'weapon', id: 'icesword' }, signup.body.token);
  assert.equal(notOwned.status, 400);
  assert.equal(notOwned.body.error, "You don't have that in your Inventory");
  assert.equal((await post('/api/bar/put', { kind: 'hat', id: 'cap', slot: 'x' }, signup.body.token)).status, 400);
  assert.equal((await post('/api/bar/take', { slot: 0 }, signup.body.token)).body.error, 'That bar slot is empty');
  assert.equal((await post('/api/bar/take', { slot: 0 })).status, 401);

  const taken = await post('/api/signup', { name: NAME, password: 'secret1' });
  assert.equal(taken.status, 400);
  assert.equal(taken.body.error, 'Someone already has that name. Please pick a new name.');

  // #41: names with swear words are refused (sign up and rename); look-alikes are taken
  const rude = `Big_${decodeWord(ANYWHERE[0])}`;
  const badSignup = await post('/api/signup', { name: rude, password: 'secret1' });
  assert.deepEqual([badSignup.status, badSignup.body.error], [400, "You can't use that name. Please pick a new name."]);
  const badRename = await post('/api/rename', { name: rude }, signup.body.token);
  assert.deepEqual([badRename.status, badRename.body.error], [400, "You can't use that name. Please pick a new name."]);
  const alike = await post('/api/signup', { name: NAME.replace(/o/g, '0').toUpperCase(), password: 'secret1' });
  assert.equal(alike.body.error, 'Someone already has that name. Please pick a new name.');
  const renamed = await post('/api/rename', { name: NAME.toUpperCase() }, signup.body.token);
  assert.equal(renamed.body.account.name, NAME.toUpperCase());
  assert.equal((await post('/api/rename', { name: NAME }, signup.body.token)).body.account.name, NAME);
  assert.equal((await post('/api/rename', { name: 'x' })).status, 401);

  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${signup.body.token}`);
  const inbox = messages(ws);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });

  // junk first: it must be ignored, not crash anything
  ws.send('not json');
  ws.send(JSON.stringify({ t: 'state', x: 'far away' }));
  ws.send(JSON.stringify({ t: 'teleport', x: 0 }));

  const welcome = inbox.next('welcome');
  const invMsg = inbox.next('inv');
  ws.send(JSON.stringify({ t: 'join' }));
  const w = await welcome;
  assert.equal(typeof w.id, 'number');
  assert.ok(w.players.some(p => p.id === w.id && p.name === NAME));
  const firstInv = await invMsg;
  assert.deepEqual(firstInv.weapons, ['gun']);
  assert.equal(firstInv.potions, 0, 'no free potions');
  ws.send(JSON.stringify({ t: 'drink' })); // no potion, full health: ignored
  ws.send(JSON.stringify({ t: 'heal', kind: 'bandage' })); // gone: dropped like junk

  const snap = await inbox.next('snap');
  assert.ok(snap.p.some(a => a[0] === w.id));

  const me = await post('/api/me', {}, signup.body.token);
  assert.equal(me.body.online, 1);

  const left = inbox.next('left');
  ws.send(JSON.stringify({ t: 'leave' }));
  await left;
  ws.close();
  assert.equal((await post('/api/me', {}, signup.body.token)).body.online, 0);
});

test('stopping the server saves accounts to DATA_FILE, never the real file', async () => {
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await exited;
  assert.equal(exitCode, 0);
  assert.ok(fs.readFileSync(dataFile, 'utf8').includes(NAME));
  assert.equal(realDataHasName(), false);
});
