// Smoke test: boot the real server as a child process and fetch a few files.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
let child, port;

// ask the OS for a free port
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

// raw GET so paths like /../ are sent as-is
const get = path => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject);
});

before(async () => {
  port = await freePort();
  child = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  // wait until the server says it is listening
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
    child.stdout.on('data', d => { if (String(d).includes('running')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`server exited (${code})`)); });
  });
});

after(() => { child?.kill(); });

test('serves the page', async () => {
  assert.equal(await get('/'), 200);
});

test('serves three.js', async () => {
  assert.equal(await get('/three/build/three.module.js'), 200);
});

test('serves shared code', async () => {
  assert.equal(await get('/shared/config.js'), 200);
});

test('blocks path traversal', async () => {
  assert.equal(await get('/shared/../server.js'), 403);
  assert.equal(await get('/three/../../package.json'), 403);
});
