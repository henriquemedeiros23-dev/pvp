// Ready to go online (#52): /healthz, security headers, limits (players, connections, messages, logins,
// new accounts, body size), the trusted proxy, refusing test hooks in production, daily backups,
// the launch-day reset, and SIGTERM giving players their things back before saving.
// Every server here is a real child process with its own temp accounts file.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { inlineScriptHashes } from '@pvp/http-guard';
import { listBackups, resetMarkerPath, RESET_LABEL } from '@pvp/file-backup';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const RESET_SCRIPT = fileURLToPath(new URL('../../../scripts/reset-accounts.mjs', import.meta.url));
const INDEX_HTML = fileURLToPath(new URL('../public/index.html', import.meta.url));
const dirs = [];
const servers = [];
const tempDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pvp-prod-')); dirs.push(d); return d; };

after(async () => {
  for (const s of servers) await s.stop();
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

/** Start a server. Returns { port, dataFile, output(), child, stop() } once it says "running". */
async function start(env = {}, dataFile = path.join(tempDir(), 'accounts.json')) {
  const port = await freePort();
  // NODE_ENV and PVP_TEST_HOOKS from the outside must not leak in
  const base = { ...process.env };
  delete base.NODE_ENV; delete base.PVP_TEST_HOOKS; delete base.TRUST_PROXY;
  const child = spawn(process.execPath, [SERVER], {
    env: { ...base, ARENA_SEED: '52', ...env, PORT: String(port), DATA_FILE: dataFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start:\n' + out)), 10000);
    const check = () => { if (out.includes('running')) { clearTimeout(timer); resolve(); } };
    child.stdout.on('data', check);
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`server exited (${code}):\n${out}`)); });
  });
  const s = {
    port, dataFile, child, output: () => out,
    async stop(signal = 'SIGTERM') {
      if (child.exitCode !== null || child.signalCode !== null) return child.exitCode;
      const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
      child.kill(signal);
      return exited;
    },
  };
  servers.push(s);
  return s;
}

function request(port, { method = 'GET', path: p = '/', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text: raw, body: json });
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const post = (port, p, body, { token, headers = {} } = {}) =>
  request(port, { method: 'POST', path: p, body, headers: { ...headers, ...(token ? { 'x-token': token } : {}) } });

let nameCounter = 0;
const newName = () => `prod_${process.pid % 1000}_${nameCounter++}`;
async function signup(port, headers) {
  const name = newName();
  const r = await post(port, '/api/signup', { name, password: 'secret1' }, { headers });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { name, token: r.body.token };
}

/** Open a game connection. Resolves { ws, msgs, closed: Promise<code> } once open (or closed). */
function connect(port, token) {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`);
    const msgs = [];
    const closed = new Promise(r => ws.once('close', code => r(code)));
    ws.on('message', raw => { try { msgs.push(JSON.parse(String(raw))); } catch {} });
    ws.once('open', () => resolve({ ws, msgs, closed }));
    ws.once('error', () => {});
    closed.then(() => resolve({ ws, msgs, closed }));
  });
}
async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 25)); }
  throw new Error('timed out');
}

// ------------------------------------------------------------------------------------------ the main server
const main = await start({ NODE_ENV: 'production', LOGIN_FREE_TRIES_PER_NAME: '3' });

test('GET /healthz answers 200 ok', async () => {
  const r = await request(main.port, { path: '/healthz' });
  assert.equal(r.status, 200);
  assert.equal(r.text, 'ok');
});

test('security headers on pages and API answers; the import map is allowed by its hash', async () => {
  const page = await request(main.port, { path: '/', headers: { host: 'pvp.example.com' } });
  assert.equal(page.status, 200);
  const csp = page.headers['content-security-policy'];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /connect-src 'self' ws:\/\/pvp\.example\.com wss:\/\/pvp\.example\.com/);
  for (const h of inlineScriptHashes(fs.readFileSync(INDEX_HTML, 'utf8'))) assert.ok(csp.includes(`'${h}'`), 'import map hash');
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  assert.equal(page.headers['referrer-policy'], 'no-referrer');
  assert.equal(page.headers['strict-transport-security'], undefined); // not https, and no trusted proxy
  const api = await post(main.port, '/api/me', {});
  assert.equal(api.status, 401);
  assert.equal(api.headers['x-content-type-options'], 'nosniff');
  assert.ok(api.headers['content-security-policy']);
});

test('no directory traversal and no stack traces', async () => {
  for (const p of ['/../server.js', '/js/../../server.js', '/three/../../package.json', '/%2e%2e/server.js', '/packages/arena/src/../package.json']) {
    assert.equal((await request(main.port, { path: p })).status, 403, p);
  }
  const notFound = await request(main.port, { path: '/nope.js' });
  assert.equal(notFound.status, 404);
  assert.doesNotMatch(notFound.text, /at .*\.js:\d+/);
  const bad = await post(main.port, '/api/login', { name: { evil: 1 }, password: [] });
  assert.ok(bad.status < 500);
  assert.doesNotMatch(bad.text, /Error|at .*\.js/);
});

test('a too big /api body gets 413', async () => {
  const r = await post(main.port, '/api/signup', { name: 'x'.repeat(20000), password: 'secret1' });
  assert.equal(r.status, 413);
});

test('login brute force: after the free tries even the right password waits, other names are fine', async () => {
  const ann = await signup(main.port);
  for (let i = 0; i < 3; i++) assert.equal((await post(main.port, '/api/login', { name: ann.name, password: 'wrong!' })).status, 400);
  const locked = await post(main.port, '/api/login', { name: ann.name, password: 'secret1' });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error, 'Too many tries. Wait a minute.');
  assert.ok(Number(locked.headers['retry-after']) > 0);
  // the name is locked, any spelling of it
  assert.equal((await post(main.port, '/api/login', { name: ann.name.toUpperCase(), password: 'secret1' })).status, 429);
  const bob = await signup(main.port);
  assert.equal((await post(main.port, '/api/login', { name: bob.name, password: 'secret1' })).status, 200);
});

// ------------------------------------------------------------------------------------------ other servers
test('NODE_ENV=production with PVP_TEST_HOOKS=1 refuses to start', async () => {
  const dir = tempDir();
  const r = await new Promise(resolve => {
    const child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, NODE_ENV: 'production', PVP_TEST_HOOKS: '1', PORT: '0', DATA_FILE: path.join(dir, 'a.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('exit', code => resolve({ code, out }));
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /Refusing to start: PVP_TEST_HOOKS=1/);
  assert.doesNotMatch(r.out, /running/);
});

test('a bad limit setting refuses to start', async () => {
  await assert.rejects(start({ MAX_PLAYERS: 'lots' }), /MAX_PLAYERS must be a whole number/);
});

test('MAX_PLAYERS: the next player gets "full"', async () => {
  const s = await start({ MAX_PLAYERS: '1' });
  const a = await connect(s.port, (await signup(s.port)).token);
  a.ws.send(JSON.stringify({ t: 'join' }));
  await waitFor(() => a.msgs.some(m => m.t === 'welcome'));
  const b = await connect(s.port, (await signup(s.port)).token);
  b.ws.send(JSON.stringify({ t: 'join' }));
  await waitFor(() => b.msgs.some(m => m.t === 'full'));
  a.ws.close(); b.ws.close();
  await s.stop();
});

test('connections per address and message flooding are limited', async () => {
  const s = await start({ MAX_CONNECTIONS_PER_IP: '2', MAX_MESSAGES_PER_SECOND: '5' });
  const { token } = await signup(s.port);
  const one = await connect(s.port, token);
  const two = await connect(s.port, token);
  const three = await connect(s.port, token);
  assert.equal(await three.closed, 4029); // the page shows "The island is very busy right now"
  assert.equal(one.ws.readyState, WebSocket.OPEN);
  for (let i = 0; i < 200; i++) one.ws.send(JSON.stringify({ t: 'slot', i: 0 }));
  assert.equal(await one.closed, 4008);
  // a closed connection gives its place back
  const four = await connect(s.port, token);
  assert.equal(four.ws.readyState, WebSocket.OPEN);
  two.ws.close(); four.ws.close();
  await s.stop();
});

test('new accounts per address per day; X-Forwarded-For only counts with TRUST_PROXY', async () => {
  const plain = await start({ MAX_SIGNUPS_PER_IP_PER_DAY: '1' });
  await signup(plain.port, { 'x-forwarded-for': '1.1.1.1' });
  const r = await post(plain.port, '/api/signup', { name: newName(), password: 'secret1' }, { headers: { 'x-forwarded-for': '2.2.2.2' } });
  assert.equal(r.status, 429); // the faked header is ignored: same address
  assert.match(r.body.error, /Too many new accounts/);
  await plain.stop();

  const proxied = await start({ MAX_SIGNUPS_PER_IP_PER_DAY: '1', TRUST_PROXY: '1' });
  await signup(proxied.port, { 'x-forwarded-for': '1.1.1.1' });
  await signup(proxied.port, { 'x-forwarded-for': '2.2.2.2' });
  assert.equal((await post(proxied.port, '/api/signup', { name: newName(), password: 'secret1' }, { headers: { 'x-forwarded-for': '9.9.9.9, 2.2.2.2' } })).status, 429);
  const page = await request(proxied.port, { path: '/', headers: { 'x-forwarded-proto': 'https' } });
  assert.ok(page.headers['strict-transport-security'], 'https behind a trusted proxy');
  await proxied.stop();
});

test('SIGTERM: players in the arena get their bar things back, then accounts are saved', async () => {
  const s = await start({ PVP_TEST_HOOKS: '1' });
  const { name, token } = await signup(s.port);
  const c = await connect(s.port, token);
  c.ws.send(JSON.stringify({ t: 'debugCoins', n: 1000 }));
  await new Promise(r => setTimeout(r, 200));
  assert.equal((await post(s.port, '/api/buy', { kind: 'weapon', id: 'icesword' }, { token })).status, 200);
  const put = await post(s.port, '/api/bar/put', { kind: 'weapon', id: 'icesword' }, { token });
  assert.equal(put.status, 200);
  const before = put.body.account.bar;
  assert.ok(JSON.stringify(before).includes('icesword'));
  c.ws.send(JSON.stringify({ t: 'join' }));
  await waitFor(() => c.msgs.some(m => m.t === 'welcome'));
  const code = await s.stop('SIGTERM');
  assert.equal(code, 0);
  assert.match(s.output(), /left the arena safely/);
  assert.equal(await c.closed, 1012); // "restarting for an update"

  // a new server on the same file: the Ice Sword is back in the fast bar
  const again = await start({}, s.dataFile);
  const login = await post(again.port, '/api/login', { name, password: 'secret1' });
  assert.equal(login.status, 200);
  assert.deepEqual(login.body.account.bar, before);
  await again.stop();
});

test('a daily backup is made next to the accounts file', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'accounts.json');
  fs.writeFileSync(file, '{}');
  const s = await start({ BACKUPS_TO_KEEP: '2' }, file);
  const list = listBackups(file);
  assert.equal(list.length, 1);
  await s.stop();
  const s2 = await start({}, file); // the next start the same day: no second copy
  assert.equal(listBackups(file).length, 1);
  await s2.stop();
});

test('launch-day reset: the script needs --yes, backs up, empties; the next start wipes again', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'accounts.json');
  const s = await start({}, file);
  const { name } = await signup(s.port);
  await s.stop();
  assert.ok(fs.readFileSync(file, 'utf8').includes(name));

  const env = { ...process.env, DATA_FILE: file };
  assert.throws(() => execFileSync(process.execPath, [RESET_SCRIPT], { env, stdio: 'pipe' })); // no --yes: nothing happens
  assert.ok(fs.readFileSync(file, 'utf8').includes(name));

  const out = execFileSync(process.execPath, [RESET_SCRIPT, '--yes'], { env, encoding: 'utf8' });
  assert.match(out, /wiped/i);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {});
  const backups = listBackups(file, RESET_LABEL);
  assert.equal(backups.length, 1);
  assert.ok(fs.readFileSync(backups[0].path, 'utf8').includes(name));
  assert.ok(fs.existsSync(resetMarkerPath(file)));

  // pretend the running server saved its old data again while stopping: the next start wipes it
  fs.copyFileSync(backups[0].path, file);
  const s2 = await start({}, file);
  assert.match(s2.output(), /Launch-day reset done/);
  assert.equal(fs.existsSync(resetMarkerPath(file)), false);
  assert.equal((await post(s2.port, '/api/login', { name, password: 'secret1' })).status, 400);
  await s2.stop();
});
