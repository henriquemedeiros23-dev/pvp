// The test-only 'debugTeleport' message (issue #13) works only when the server runs with
// PVP_TEST_HOOKS=1. Without the flag it is dropped like any unknown message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { decodeServerMessage, unpackSnapshotPlayer, CLIENT_MESSAGES } from '@pvp/net-protocol';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));

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
    await fn(port, () => out);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

// Join the arena; returns the socket, my id and a function that gives my latest position from 'snap'.
async function joinArena(port) {
  const res = await fetch(`http://127.0.0.1:${port}/api/signup`, {
    method: 'POST', body: JSON.stringify({ name: 'hook_' + Date.now().toString(36).slice(-7), password: 'secret1' }),
  });
  const { token } = await res.json();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`);
  const seen = [];
  let id = null, me = null;
  ws.on('message', raw => {
    const r = decodeServerMessage(String(raw));
    assert.ok(r.ok, r.error);
    seen.push(r.msg);
    if (r.msg.t === 'welcome') id = r.msg.id;
    if (r.msg.t === 'snap') for (const a of r.msg.p) { const p = unpackSnapshotPlayer(a); if (p.id === id) me = p; }
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'join' }));
  for (let i = 0; i < 100 && !me; i++) await new Promise(r => setTimeout(r, 20));
  assert.ok(me, 'joined and got a snapshot');
  return { ws, seen, me: () => me };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

test('debugTeleport is not part of the game protocol', () => {
  assert.equal(Object.hasOwn(CLIENT_MESSAGES, 'debugTeleport'), false);
});

test('without PVP_TEST_HOOKS=1 a debugTeleport is ignored', async () => {
  for (const flag of ['', '0', 'true']) {
    await withServer({ PVP_TEST_HOOKS: flag }, async (port, out) => {
      assert.doesNotMatch(out(), /TEST HOOKS/);
      const c = await joinArena(port);
      const start = c.me();
      c.ws.send(JSON.stringify({ t: 'debugTeleport', x: start.x + 40, z: start.z }));
      await wait(400);
      assert.equal(c.seen.some(m => m.t === 'pos'), false);
      assert.ok(Math.abs(c.me().x - start.x) < 1, `flag "${flag}": the player must not move`);
      c.ws.close();
    });
  }
});

test('with PVP_TEST_HOOKS=1 a debugTeleport moves the player; bad ones are dropped', async () => {
  await withServer({ PVP_TEST_HOOKS: '1' }, async (port, out) => {
    assert.match(out(), /TEST HOOKS ARE ON/);
    const c = await joinArena(port);
    // bad values are dropped
    c.ws.send(JSON.stringify({ t: 'debugTeleport', x: 'far', z: 0 }));
    c.ws.send(JSON.stringify({ t: 'debugTeleport', x: 5000, z: 0 }));
    c.ws.send(JSON.stringify({ t: 'debugTeleport', x: 1 }));
    await wait(200);
    assert.equal(c.seen.some(m => m.t === 'pos'), false);
    // a good one moves me and the server tells me where I am
    c.ws.send(JSON.stringify({ t: 'debugTeleport', x: 12.5, z: -30 }));
    for (let i = 0; i < 50 && !c.seen.some(m => m.t === 'pos'); i++) await wait(20);
    const pos = c.seen.find(m => m.t === 'pos');
    assert.deepEqual({ x: pos.x, z: pos.z }, { x: 12.5, z: -30 });
    await wait(200);
    assert.ok(Math.hypot(c.me().x - 12.5, c.me().z + 30) < 0.1);
    c.ws.close();
  });
});

test('debugCoins (a browser test buys bombs with it) works only with PVP_TEST_HOOKS=1', async () => {
  assert.equal(Object.hasOwn(CLIENT_MESSAGES, 'debugCoins'), false);
  for (const flag of ['', '1']) {
    await withServer({ PVP_TEST_HOOKS: flag }, async port => {
      const c = await joinArena(port);
      c.ws.send(JSON.stringify({ t: 'debugCoins', n: -5 }));
      c.ws.send(JSON.stringify({ t: 'debugCoins', n: 70 }));
      await wait(300);
      const coins = c.seen.filter(m => m.t === 'inv').at(-1).coins;
      assert.equal(coins, flag === '1' ? 70 : 0, `flag "${flag}"`);
      c.ws.close();
    });
  }
});
