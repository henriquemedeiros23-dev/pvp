// Coins stay in sync (issue #23): the account is the single source of truth.
// A player in the arena buys something in the shop from another device: the arena must
// send the new coin total over the WebSocket.
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
import { createAccounts, createJsonFileStore } from '@pvp/accounts-shop';
import { RULES } from '@pvp/game-rules';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvp-coins-'));
const dataFile = path.join(dataDir, 'accounts.json');
const NAME = 'coins_kid';
const PASSWORD = 'secret1';
const START_COINS = 100;
let child, port;

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

before(async () => {
  // An account that already has coins, saved to the temp file before the server starts.
  const accounts = createAccounts({ store: createJsonFileStore(dataFile, { saveDelayMs: 0 }) });
  const { account } = accounts.signup(NAME, PASSWORD);
  accounts.addCoins(account, START_COINS);
  await accounts.flush();

  port = await freePort();
  child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), DATA_FILE: dataFile, ARENA_SEED: '23' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
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

// Waits for the next server message that matches `pred`.
function waitFor(ws, pred, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', on); reject(new Error('message did not come')); }, ms);
    function on(raw) {
      const r = decodeServerMessage(String(raw));
      assert.ok(r.ok, `server sent a message the protocol rejects: ${r.error}`);
      if (pred(r.msg)) { clearTimeout(timer); ws.off('message', on); resolve(r.msg); }
    }
    ws.on('message', on);
  });
}

test('buying in the shop from another device sends the new coin total to the arena player', async () => {
  const phone = await post('/api/login', { name: NAME, password: PASSWORD });
  const laptop = await post('/api/login', { name: NAME, password: PASSWORD });
  assert.equal(phone.status, 200);
  assert.equal(phone.body.account.coins, START_COINS);

  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${phone.body.token}`);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const firstInv = waitFor(ws, m => m.t === 'inv');
  ws.send(JSON.stringify({ t: 'join' }));
  assert.equal((await firstInv).coins, START_COINS);

  const price = RULES.WEAPONS.sword.price;
  const update = waitFor(ws, m => m.t === 'inv' && m.coins !== START_COINS);
  const buy = await post('/api/buy', { kind: 'weapon', id: 'sword' }, laptop.body.token);
  assert.equal(buy.status, 200);
  assert.equal(buy.body.account.coins, START_COINS - price);
  assert.equal((await update).coins, START_COINS - price);

  ws.close();
});
