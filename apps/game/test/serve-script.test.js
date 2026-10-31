// `npm run serve` on the family laptop (#57): the settings are right (pure function), test hooks are refused,
// and the real script starts the game in Cloudflare Tunnel mode with the accounts in the home folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveEnv, laptopDataFile, serveBanner, LAPTOP_DATA_DIR } from '../../../scripts/laptop-env.mjs';

const SERVE = fileURLToPath(new URL('../../../scripts/serve.mjs', import.meta.url));
const RESET = fileURLToPath(new URL('../../../scripts/reset-accounts.mjs', import.meta.url));
const dirs = [];
const tempDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pvp-serve-')); dirs.push(d); return d; };
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

// A clean environment: nothing from the outside (NODE_ENV, TRUST_PROXY, DATA_FILE...) leaks in.
const cleanEnv = extra => {
  const env = { ...process.env };
  for (const k of ['NODE_ENV', 'PVP_TEST_HOOKS', 'TRUST_PROXY', 'DATA_FILE', 'PORT']) delete env[k];
  return { ...env, ...extra };
};

test('serveEnv: production, port 3000, accounts in the home folder, Cloudflare Tunnel mode', () => {
  const input = { PATH: '/bin', TRUST_PROXY: '1' };
  const env = serveEnv(input, { home: '/Users/kid', platform: 'darwin' });
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.PORT, '3000');
  assert.equal(env.DATA_FILE, `/Users/kid/${LAPTOP_DATA_DIR}/accounts.json`);
  assert.equal(env.TRUST_PROXY, 'cloudflare'); // always: a numeric proxy count would be unsafe on a laptop
  assert.equal(env.PATH, '/bin');
  assert.deepEqual(input, { PATH: '/bin', TRUST_PROXY: '1' }, 'the input is not changed');
});

test('serveEnv: Windows paths; PORT and DATA_FILE can still be chosen', () => {
  assert.equal(serveEnv({}, { home: 'C:\\Users\\Kid', platform: 'win32' }).DATA_FILE, 'C:\\Users\\Kid\\pvp-island-data\\accounts.json');
  const env = serveEnv({ PORT: '4000', DATA_FILE: 'D:\\pvp\\accounts.json' }, { home: 'C:\\Users\\Kid', platform: 'win32' });
  assert.equal(env.PORT, '4000');
  assert.equal(env.DATA_FILE, 'D:\\pvp\\accounts.json');
  assert.throws(() => laptopDataFile({}), /home folder/);
});

test('serveEnv refuses the test hooks', () => {
  for (const v of ['1', '0', 'yes']) assert.throws(() => serveEnv({ PVP_TEST_HOOKS: v }, { home: '/h' }), /Refusing to start: PVP_TEST_HOOKS/);
  assert.doesNotThrow(() => serveEnv({ PVP_TEST_HOOKS: '' }, { home: '/h' }));
});

test('serveBanner: where the accounts are and the tunnel command', () => {
  const text = serveBanner(serveEnv({}, { home: 'C:\\Users\\Kid', platform: 'win32' }));
  assert.match(text, /C:\\Users\\Kid\\pvp-island-data/);
  assert.match(text, /cloudflared tunnel --url http:\/\/localhost:3000/);
});

test('the serve script refuses to start with PVP_TEST_HOOKS=1', () => {
  const home = tempDir();
  const r = spawnSync(process.execPath, [SERVE], { env: cleanEnv({ HOME: home, USERPROFILE: home, PVP_TEST_HOOKS: '1', PORT: '1' }), encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing to start/);
  assert.doesNotMatch(r.stdout, /running/);
});

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});
const get = (port, p, headers = {}) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p, headers, agent: false }, res => {
    let t = ''; res.on('data', c => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: t }));
  }).on('error', reject);
});

test('npm run serve: starts in production + tunnel mode, accounts in <home>/pvp-island-data, saves on stop', async t => {
  const home = tempDir();
  const port = await freePort();
  const child = spawn(process.execPath, [SERVE], { env: cleanEnv({ HOME: home, USERPROFILE: home, PORT: String(port), ARENA_SEED: '57' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const exited = new Promise(r => child.once('exit', code => r(code)));
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('did not start:\n' + out)), 10000);
    child.stdout.on('data', () => { if (out.includes('Arena seed')) { clearTimeout(timer); resolve(); } });
    exited.then(code => { clearTimeout(timer); reject(new Error(`exited (${code}):\n${out}`)); });
  });
  const dataFile = path.join(home, 'pvp-island-data', 'accounts.json');
  assert.match(out, /servidor en esta laptop/);
  assert.match(out, /Cloudflare Tunnel mode/);
  assert.ok(out.includes(`Accounts file: ${dataFile}`), out);
  assert.doesNotMatch(out, /WARNING: DATA_FILE/);
  assert.equal((await get(port, '/healthz')).text, 'ok');
  const page = await get(port, '/', { 'x-forwarded-proto': 'https' });
  assert.ok(page.headers['strict-transport-security'], 'https from the tunnel on this computer');
  const signup = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/signup', method: 'POST', agent: false }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.end(JSON.stringify({ name: 'laptop_kid', password: 'secret1' }));
  });
  assert.equal(signup, 200);
  child.kill('SIGINT'); // Ctrl+C
  assert.equal(await exited, 0);
  assert.ok(fs.existsSync(dataFile), 'accounts saved in the home folder');
});

test('admin:reset-laptop wipes the laptop accounts file (needs --yes)', () => {
  const home = tempDir();
  const file = path.join(home, 'pvp-island-data', 'accounts.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{"accounts":[{"name":"x"}]}');
  const env = cleanEnv({ HOME: home, USERPROFILE: home });
  const dry = spawnSync(process.execPath, [RESET, '--laptop'], { env, encoding: 'utf8' });
  assert.equal(dry.status, 2);
  assert.ok(dry.stderr.includes(file), dry.stderr);
  assert.match(dry.stderr, /admin:reset-laptop -- --yes/);
  const r = spawnSync(process.execPath, [RESET, '--laptop', '--yes'], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.readdirSync(path.dirname(file)).some(f => f.includes('before-reset')));
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /"x"/);
});
