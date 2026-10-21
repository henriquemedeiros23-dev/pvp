// Stickman Ruins game server: thin glue around the packages.
// - serves the game files (and the browser code of the @pvp packages)
// - accounts and the shop: @pvp/accounts-shop
// - the single always-on arena: @pvp/arena on the island from @pvp/world-gen
// - every WebSocket message is checked with @pvp/net-protocol

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';
import { RULES } from '@pvp/game-rules';
import { createAccounts, createJsonFileStore, AccountError } from '@pvp/accounts-shop';
import { generateIsland } from '@pvp/world-gen';
import { createArena } from '@pvp/arena';
import { createRandom } from '@pvp/seeded-random';
import { parseClientMessage, encode, check, MAX_CLIENT_MESSAGE_SIZE } from '@pvp/net-protocol';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
// Where accounts are saved. Tests set DATA_FILE to a temp file so they never touch the real one.
const DATA_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(ROOT, 'data', 'accounts.json');
// Seed for the arena's random numbers (loot, spawns, golden chest, gun spread). Set it to replay a match.
const ARENA_SEED = process.env.ARENA_SEED || String(Date.now());
const TICK_MS = 50;
// Test-only hooks for the browser play test (issue #13). OFF unless the server is started with
// PVP_TEST_HOOKS=1 (exactly). They are NOT in the game's message list (@pvp/net-protocol): only this
// server knows them, and only when the flag is on. With the flag off such messages are dropped like junk.
const TEST_HOOKS = process.env.PVP_TEST_HOOKS === '1';
const TEST_MESSAGES = {
  // Put me somewhere on the island (skips the anti-teleport check). The server answers with 'pos'.
  debugTeleport: { obj: { x: { type: 'number', min: -1000, max: 1000 }, z: { type: 'number', min: -1000, max: 1000 } } },
};
// The monorepo's packages/ folder (read-only: the browser loads package src files from here).
const PACKAGES_DIR = path.resolve(ROOT, '..', '..', 'packages');
// three.js may be installed here or hoisted to the workspace root.
// Its "exports" hides package.json, so resolve the main file (build/three.cjs) and go up.
const THREE_DIR = path.resolve(path.dirname(createRequire(import.meta.url).resolve('three')), '..');

// ---------------------------------------------------------------- accounts
const accounts = createAccounts({ store: createJsonFileStore(DATA_FILE, { saveDelayMs: 1000 }) });
const playerKey = acc => acc.name.toLowerCase();

function handleApi(req, res, body) {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  try {
    const url = req.url;
    if (url === '/api/signup' || url === '/api/login') {
      const { name, password } = body;
      const { token, account } = url === '/api/signup' ? accounts.signup(name, password) : accounts.login(name, password);
      return send(200, { token, account: accounts.publicView(account) });
    }

    const acc = accounts.byToken(req.headers['x-token']);
    if (!acc) return send(401, { error: 'Please log in again' });

    if (url === '/api/me') return send(200, { account: accounts.publicView(acc), online: arena.playerCount() });
    if (url === '/api/buy') {
      const account = accounts.buy(acc, body.kind, body.id);
      syncCoins(acc); // in a match on another device: show the new total there too
      return send(200, { account });
    }
    if (url === '/api/equip') return send(200, { account: accounts.equip(acc, body.kind, body.id) });
    return send(404, { error: 'Not found' });
  } catch (e) {
    if (e instanceof AccountError) return send(400, { error: e.message });
    throw e;
  }
}

// ---------------------------------------------------------------- static files
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serveStatic(req, res) {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end('Bad Request'); }
  let file;
  if (p === '/') p = '/index.html';
  let allowed = [path.join(ROOT, 'public'), THREE_DIR];
  if (p.startsWith('/three/')) file = path.join(THREE_DIR, p.slice(7));
  else if (p.startsWith('/packages/')) {
    // Browser code of the @pvp packages: only /packages/<name>/src/... may be read.
    const m = /^\/packages\/([a-z0-9-]+)\/src\//.exec(p);
    if (!m) { res.writeHead(403); return res.end(); }
    file = path.join(PACKAGES_DIR, p.slice('/packages/'.length));
    allowed = [path.join(PACKAGES_DIR, m[1], 'src')];
  }
  else file = path.join(ROOT, 'public', p);
  if (!allowed.some(dir => path.resolve(file).startsWith(dir + path.sep))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/') && req.method === 'POST') {
    let raw = '';
    req.on('error', () => {}); // aborted or too big: just drop it
    req.on('data', c => { raw += c; if (raw.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch {}
      try { handleApi(req, res, body); } catch (e) {
        console.error('API error:', e);
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error' }));
      }
    });
    return;
  }
  serveStatic(req, res);
});

// ---------------------------------------------------------------- arena
const arena = createArena({ island: generateIsland(), rules: RULES, random: createRandom(ARENA_SEED), now: Date.now() });
const conns = new Map(); // arena player id -> connection { ws, acc, playerId }

const sendRaw = (conn, text) => { if (conn && conn.ws.readyState === 1) conn.ws.send(text); };

// The account is the single source of truth for coins. After any coin change from outside the arena
// (a shop buy, maybe from another device), give the arena the account's total and send it.
function syncCoins(acc) {
  const id = arena.idOf(playerKey(acc));
  if (id !== undefined && arena.setCoins(id, acc.coins)) pump();
}

// Send everything the arena queued, and handle its events for the server.
function pump() {
  const gone = [];
  for (const ev of arena.drain()) {
    if (ev.to === 'server') {
      const conn = conns.get(ev.playerId);
      if (ev.kind === 'coins' && conn) {
        // Chest coins: add them to the account; if the arena's total was off, the account's total wins
        // (the corrected 'inv' goes out on the next pump).
        const total = accounts.addCoins(conn.acc, ev.amount);
        if (total !== ev.total) arena.setCoins(ev.playerId, total);
      }
      // Knocked out: the weapons are lost (dropped on the island), nothing goes back to the backpack.
      if (ev.kind === 'knockedOut') gone.push(ev.playerId);
      continue;
    }
    const text = JSON.stringify(ev.msg);
    if (ev.to === 'all') {
      for (const id of arena.playerIds()) if (id !== ev.except) sendRaw(conns.get(id), text);
    } else {
      sendRaw(conns.get(ev.to), text); // also a player who was just knocked out ('dead')
    }
  }
  for (const id of gone) {
    const conn = conns.get(id);
    if (conn && conn.playerId === id) conn.playerId = null;
    conns.delete(id);
  }
}

// Leave the arena alive: carried weapons go back into the backpack.
function leaveAlive(conn) {
  const id = conn.playerId;
  if (id == null) return;
  conn.playerId = null;
  conns.delete(id);
  if (arena.hasPlayer(id)) accounts.returnLoadout(conn.acc, arena.leave(id, { alive: true }));
}

function join(conn, now) {
  const acc = conn.acc;
  // Same account already in (another tab or device): that player leaves alive first,
  // so its weapons are back in the backpack before the new loadout is taken.
  const oldId = arena.idOf(playerKey(acc));
  if (oldId !== undefined) {
    const old = conns.get(oldId);
    if (old) { leaveAlive(old); if (old !== conn) sendRaw(old, encode('left')); }
    else accounts.returnLoadout(acc, arena.leave(oldId, { alive: true }));
  }

  const loadout = accounts.takeLoadout(acc);
  const r = arena.join(playerKey(acc), { name: acc.name, skin: { ...acc.skin }, loadout, coins: acc.coins }, now);
  if (!r.ok) {
    accounts.returnLoadout(acc, loadout);
    sendRaw(conn, encode('full'));
    return;
  }
  // Give back any loadout weapons the arena didn't take.
  const rest = [...loadout];
  for (const w of r.weapons) { const i = rest.indexOf(w); if (i >= 0) rest.splice(i, 1); }
  if (rest.length) accounts.returnLoadout(acc, rest);
  if (r.replaced) {
    const old = conns.get(r.replaced.id);
    if (old) { old.playerId = null; conns.delete(r.replaced.id); }
    accounts.returnLoadout(acc, r.replaced.weapons);
  }
  conn.playerId = r.id;
  conns.set(r.id, conn);
}

function onMessage(conn, m) {
  const now = Date.now();
  const id = conn.playerId != null && arena.hasPlayer(conn.playerId) ? conn.playerId : null;
  switch (m.t) {
    case 'join': if (id == null) join(conn, now); break;
    case 'leave': if (id != null) { leaveAlive(conn); sendRaw(conn, encode('left')); } break;
    case 'state': if (id != null) arena.setState(id, { x: m.x, y: m.y, z: m.z, ry: m.ry, pitch: m.pitch, f: m.f }, now); break;
    case 'fire': if (id != null) arena.fire(id, m.d, now); break;
    case 'slot': if (id != null) arena.selectSlot(id, m.i); break;
    case 'open': if (id != null) arena.openChest(id, m.id, now); break;
    case 'heal': if (id != null) arena.heal(id, m.kind, now); break;
    case 'shield': if (id != null) arena.setShield(id, m.up, now); break;
    case 'drop': if (id != null) arena.dropWeapon(id, now); break;
  }
  pump();
}

// A test-only message, or null. Never called unless TEST_HOOKS is on.
function parseTestMessage(raw) {
  try {
    const data = JSON.parse(String(raw));
    if (!data || typeof data.t !== 'string' || !Object.hasOwn(TEST_MESSAGES, data.t)) return null;
    return { t: data.t, ...check(TEST_MESSAGES[data.t], data) };
  } catch { return null; }
}

function onTestMessage(conn, m) {
  const id = conn.playerId != null && arena.hasPlayer(conn.playerId) ? conn.playerId : null;
  if (id == null) return;
  if (m.t === 'debugTeleport' && arena.teleport(id, { x: m.x, y: 0, z: m.z })) {
    sendRaw(conn, encode('pos', { x: m.x, y: 0, z: m.z }));
  }
  pump();
}

const ticker = setInterval(() => {
  arena.tick(Date.now());
  pump();
}, TICK_MS);

// ---------------------------------------------------------------- sockets
const wss = new WebSocketServer({ server, maxPayload: MAX_CLIENT_MESSAGE_SIZE });
wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  const acc = accounts.byToken(token);
  if (!acc) { ws.close(4001, 'login'); return; }
  const conn = { ws, acc, playerId: null };

  ws.on('message', raw => {
    const r = parseClientMessage(raw);
    if (!r.ok) {
      // bad or unknown message: drop it (unless test hooks are on and it is a test message)
      const t = TEST_HOOKS ? parseTestMessage(raw) : null;
      if (t) {
        try { onTestMessage(conn, t); } catch (e) { console.error('Test message error:', e); }
      }
      return;
    }
    try { onMessage(conn, r.msg); } catch (e) { console.error('Message error:', e); }
  });
  ws.on('close', () => { leaveAlive(conn); pump(); });
});

server.listen(PORT, () => {
  console.log(`Stickman Ruins is running!`);
  console.log(`  On this computer:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  On phones (same Wi-Fi): http://${n.address}:${PORT}`);
  }
  if (TEST_HOOKS) console.log('  TEST HOOKS ARE ON (PVP_TEST_HOOKS=1): only for automatic tests, never for real players!');
  console.log(`  Arena seed: ${ARENA_SEED}`);
});

// Save accounts before stopping.
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(ticker);
  try { await accounts.flush(); } catch (e) { console.error('Could not save accounts:', e); }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
