// The ranking (#47) on the real server: a knockout gives the attacker's account +1, POST /api/ranking
// answers the top list and my place, and the test-only 'debugKills' works only with PVP_TEST_HOOKS=1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { decodeServerMessage, CLIENT_MESSAGES } from '@pvp/net-protocol';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const wait = ms => new Promise(r => setTimeout(r, ms));

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

async function withServer(env, fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvp-test-'));
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PVP_TEST_HOOKS: '', ...env, PORT: String(port), DATA_FILE: path.join(dataDir, 'accounts.json'), ARENA_SEED: '7' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let out = '';
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
      child.stdout.on('data', d => { out += d; if (out.includes('Arena seed')) { clearTimeout(timer); resolve(); } });
      child.on('exit', code => { clearTimeout(timer); reject(new Error(`server exited (${code})`)); });
    });
    await fn(`http://127.0.0.1:${port}`, port);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function api(base, url, body = {}, token) {
  const res = await fetch(base + url, { method: 'POST', headers: token ? { 'x-token': token } : {}, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

async function signup(base, name) {
  const r = await api(base, '/api/signup', { name, password: 'secret1' });
  assert.equal(r.status, 200);
  return r.body.token;
}

// A socket that records every server message (checked with the protocol).
async function connect(port, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`);
  const seen = [];
  ws.on('message', raw => { const r = decodeServerMessage(String(raw)); assert.ok(r.ok, r.error); seen.push(r.msg); });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const until = async (fn, what) => {
    for (let i = 0; i < 150 && !fn(); i++) await wait(20);
    assert.ok(fn(), what);
  };
  return { ws, seen, send: m => ws.send(JSON.stringify(m)), until };
}

test('a real knockout counts for the attacker; /api/ranking gives the top list and my place', async () => {
  await withServer({ PVP_TEST_HOOKS: '1' }, async (base, port) => {
    const ann = await signup(base, 'rank_ann');
    const bob = await signup(base, 'rank_bob');
    const a = await connect(port, ann);
    const b = await connect(port, bob);
    a.send({ t: 'debugCoins', n: 250 });
    await wait(200);
    assert.equal((await api(base, '/api/buy', { kind: 'weapon', id: 'supersword' }, ann)).status, 200); // one hit knocks out
    a.send({ t: 'join' });
    b.send({ t: 'join' });
    await a.until(() => a.seen.some(m => m.t === 'welcome'), 'Ann joined');
    await b.until(() => b.seen.some(m => m.t === 'welcome'), 'Bob joined');
    await wait(3200); // spawn protection is over
    a.send({ t: 'debugTeleport', x: 0, z: 0 });
    b.send({ t: 'debugTeleport', x: 0, z: 0.4 }); // so close that facing does not matter
    a.send({ t: 'slot', i: 1 });
    await wait(200);
    a.send({ t: 'fire', d: [0, 0, 1] });
    await b.until(() => b.seen.some(m => m.t === 'dead'), 'Bob was knocked out');
    await wait(100);
    const forBob = await api(base, '/api/ranking', {}, bob);
    assert.equal(forBob.status, 200);
    assert.deepEqual(forBob.body, {
      top: [{ place: 1, name: 'rank_ann', kills: 1, skinColor: 'black' }],
      me: { place: null, name: 'rank_bob', kills: 0 },
    });
    assert.deepEqual((await api(base, '/api/ranking', {}, ann)).body.me, { place: 1, name: 'rank_ann', kills: 1 });
    assert.equal((await api(base, '/api/ranking', {})).status, 401, 'needs a login');
    a.ws.close();
    b.ws.close();
  });
});

test('debugKills (the browser test sets up the ranking with it) works only with PVP_TEST_HOOKS=1', async () => {
  assert.equal(Object.hasOwn(CLIENT_MESSAGES, 'debugKills'), false);
  for (const flag of ['', '1']) {
    await withServer({ PVP_TEST_HOOKS: flag }, async (base, port) => {
      const token = await signup(base, 'kill_kid');
      const c = await connect(port, token);
      c.send({ t: 'debugKills', n: 0 });
      c.send({ t: 'debugKills', n: 4 });
      await wait(300);
      const { body } = await api(base, '/api/ranking', {}, token);
      assert.deepEqual(body.me, flag === '1' ? { place: 1, name: 'kill_kid', kills: 4 } : { place: null, name: 'kill_kid', kills: 0 }, `flag "${flag}"`);
      c.ws.close();
    });
  }
});
