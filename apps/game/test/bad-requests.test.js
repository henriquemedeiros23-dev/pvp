// Bad requests (issue #15): boot the real server as a child process, send it
// broken web addresses and bodies, and check it answers and keeps running.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
// Never touch the real accounts file (issue #19): every run gets its own temp file.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvp-test-'));
const dataFile = path.join(dataDir, 'accounts.json');
let child, port, exited = false;

// ask the OS for a free port
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

// raw request so paths like /%E0 are sent as-is; resolves with the status code
const request = (method, path, body) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, method }, res => {
    res.resume(); res.on('end', () => resolve(res.statusCode));
  });
  req.on('error', reject);
  req.end(body);
});
const get = path => request('GET', path);

// the server must still be up and serving the page
const assertAlive = async () => {
  assert.equal(exited, false, 'server process exited');
  assert.equal(await get('/'), 200);
};

before(async () => {
  port = await freePort();
  child = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(port), DATA_FILE: dataFile }, stdio: ['ignore', 'pipe', 'inherit'] });
  child.on('exit', () => { exited = true; });
  // wait until the server says it is listening
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
    child.stdout.on('data', d => { if (String(d).includes('running')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`server exited (${code})`)); });
  });
});

// stop the server (it saves accounts on SIGTERM), then remove the temp data
const stopServer = async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
};

after(stopServer);

test('malformed web address gets 400 and the server keeps running', async () => {
  assert.equal(await get('/%E0'), 400);
  assert.equal(await get('/js/%'), 400);
  await assertAlive();
});

test('invalid JSON body is answered and the server keeps running', async () => {
  assert.equal(await request('POST', '/api/login', '{not json'), 400);
  await assertAlive();
});

test('unexpected error in the API answers 500 and the server keeps running', async () => {
  // a JSON "null" body is valid JSON but not an object
  assert.equal(await request('POST', '/api/signup', 'null'), 500);
  await assertAlive();
});

test('too big body is dropped and the server keeps running', async () => {
  // the server cuts the connection, so the request may fail or get no answer
  await request('POST', '/api/signup', 'x'.repeat(50000)).catch(() => {});
  await assertAlive();
});
