// PvP Island game server: thin glue around the packages.
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
import { rankPlayers } from '@pvp/leaderboard';
import { createRandom } from '@pvp/seeded-random';
import { parseClientMessage, encode, check, MAX_CLIENT_MESSAGE_SIZE } from '@pvp/net-protocol';
import { createTokenBucket, createRateLimiter, createConcurrencyLimit, createWindowQuota, createAttemptGuard } from '@pvp/rate-limit';
import { securityHeaders, inlineScriptHashes, clientIp, isHttps, parseTrustProxy, safeJoin } from '@pvp/http-guard';
import { backupIfDue, applyPendingReset } from '@pvp/file-backup';

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
const PRODUCTION = process.env.NODE_ENV === 'production';
// Test hooks can give coins and teleport: they must never be on for real players.
if (PRODUCTION && TEST_HOOKS) {
  console.error('Refusing to start: PVP_TEST_HOOKS=1 is only for automatic tests and must never be used with NODE_ENV=production.');
  process.exit(1);
}

// ---------------------------------------------------------------- limits (all can be changed with environment variables)
function envInt(name, def, min = 1) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) { console.error(`Refusing to start: ${name} must be a whole number of at least ${min} (got "${raw}").`); process.exit(1); }
  return n;
}
const LIMITS = {
  maxPlayers: envInt('MAX_PLAYERS', RULES.MAX_PLAYERS),            // players in the arena at the same time
  connectionsPerIp: envInt('MAX_CONNECTIONS_PER_IP', 20),          // open game connections from one address (a school shares one!)
  messagesPerSecond: envInt('MAX_MESSAGES_PER_SECOND', 60),        // per connection (the game sends about 20-30)
  apiPerSecond: envInt('MAX_API_PER_SECOND', 20),                  // account/shop requests per address
  signupsPerIpPerDay: envInt('MAX_SIGNUPS_PER_IP_PER_DAY', 30),    // new accounts from one address in 24 hours
  loginTriesPerName: envInt('LOGIN_FREE_TRIES_PER_NAME', 5),       // wrong passwords for one name before waiting
  loginTriesPerIp: envInt('LOGIN_FREE_TRIES_PER_IP', 30),          // wrong passwords from one address before waiting
  maxBodyBytes: envInt('MAX_BODY_BYTES', 10_000),                  // biggest /api request
  backupsToKeep: envInt('BACKUPS_TO_KEEP', 7),                     // daily copies of the accounts file
};
LIMITS.maxConnections = envInt('MAX_CONNECTIONS', LIMITS.maxPlayers * 3); // all game connections together
// How many proxies (the host's HTTPS front door) sit in front of us. 0: X-Forwarded-* headers are ignored.
const TRUST_PROXY = parseTrustProxy(process.env.TRUST_PROXY);
const TOO_MANY_TRIES = 'Too many tries. Wait a minute.';
let stopping = false; // true once SIGTERM/SIGINT came: new requests and connections are turned away
const TEST_MESSAGES = {
  // Put me somewhere on the island (skips the anti-teleport check). The server answers with 'pos'.
  debugTeleport: { obj: { x: { type: 'number', min: -1000, max: 1000 }, z: { type: 'number', min: -1000, max: 1000 } } },
  // Give my account some coins (to buy things in the shop during a browser test). The arena gets the new total.
  debugCoins: { obj: { n: { type: 'uint', min: 1, max: 10000 } } },
  // Give my account some knockouts for the ranking (#47), as if I knocked out n players just now.
  debugKills: { obj: { n: { type: 'uint', min: 1, max: 1000 } } },
};
// The monorepo's packages/ folder (read-only: the browser loads package src files from here).
const PACKAGES_DIR = path.resolve(ROOT, '..', '..', 'packages');
// three.js may be installed here or hoisted to the workspace root.
// Its "exports" hides package.json, so resolve the main file (build/three.cjs) and go up.
const THREE_DIR = path.resolve(path.dirname(createRequire(import.meta.url).resolve('three')), '..');

// ---------------------------------------------------------------- accounts
// A launch-day reset asked for with `npm run admin:reset-accounts -- --yes` finishes here (backup first, then empty).
{
  const r = applyPendingReset(DATA_FILE, { now: Date.now() });
  if (r) console.log(`Launch-day reset done: all accounts were wiped${r.backup ? ` (backup: ${r.backup})` : ''}.`);
}
function dailyBackup() {
  try {
    const b = backupIfDue(DATA_FILE, { now: Date.now(), keep: LIMITS.backupsToKeep });
    if (b) console.log(`Backup of the accounts saved: ${b}`);
  } catch (e) { console.error('Could not back up the accounts:', e.message); }
}
dailyBackup();
setInterval(dailyBackup, 60 * 60 * 1000).unref(); // checks every hour, copies once a day
const accounts = createAccounts({ store: createJsonFileStore(DATA_FILE, { saveDelayMs: 1000 }) });
const playerKey = acc => acc.name.toLowerCase();

// Brute-force protection (per name and per address), the API speed limit and the new-account quota.
const loginGuardName = createAttemptGuard({ freeTries: LIMITS.loginTriesPerName });
const loginGuardIp = createAttemptGuard({ freeTries: LIMITS.loginTriesPerIp });
const apiLimiter = createRateLimiter({ capacity: LIMITS.apiPerSecond * 3, perSecond: LIMITS.apiPerSecond });
const signupQuota = createWindowQuota({ max: LIMITS.signupsPerIpPerDay, windowMs: 24 * 60 * 60 * 1000 });
setInterval(() => {
  const now = Date.now();
  loginGuardName.prune(now); loginGuardIp.prune(now); apiLimiter.prune(now); signupQuota.prune(now);
}, 60_000).unref();

function sendJson(res, code, obj, extra = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json', ...extra });
  res.end(JSON.stringify(obj));
}

function handleApi(req, res, body, ip) {
  const send = (code, obj) => sendJson(res, code, obj);
  const now = Date.now();
  try {
    const url = req.url;
    if (url === '/api/login') {
      const nameKey = String(body.name ?? '').trim().toLowerCase().slice(0, 32);
      const wait = Math.max(loginGuardName.waitMs(nameKey, now), loginGuardIp.waitMs(ip, now));
      if (wait > 0) return sendJson(res, 429, { error: TOO_MANY_TRIES }, { 'Retry-After': String(Math.ceil(wait / 1000)) });
      let r;
      try { r = accounts.login(body.name, body.password); } catch (e) {
        if (e instanceof AccountError) { loginGuardName.fail(nameKey, now); loginGuardIp.fail(ip, now); }
        throw e;
      }
      loginGuardName.reset(nameKey);
      return send(200, { token: r.token, account: accounts.publicView(r.account) });
    }
    if (url === '/api/signup') {
      if (!signupQuota.allowed(ip, now)) {
        console.log(`Signup limit reached for ${ip}`);
        return send(429, { error: 'Too many new accounts from here today. Try again tomorrow!' });
      }
      const { token, account } = accounts.signup(body.name, body.password);
      signupQuota.add(ip, now);
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
    if (url === '/api/ranking') return send(200, ranking(acc));
    if (url === '/api/rename') { // #41: the ✏️ name button (no bad words, nobody has it or a look-alike)
      if (arena.idOf(playerKey(acc)) !== undefined) return send(400, { error: 'Leave the arena first' });
      return send(200, { account: accounts.rename(acc, body.name) });
    }
    // The Inventory and the fast bar (#39): read it, put an item into a bar slot, take a slot back.
    if (url === '/api/inventory') return send(200, { account: accounts.publicView(acc) });
    if (url === '/api/bar/put') return send(200, { account: accounts.toBar(acc, body.kind, body.id, { slot: body.slot, n: body.n, dur: body.dur }) });
    if (url === '/api/bar/take') return send(200, { account: body.space !== undefined ? accounts.fromExtras(acc, body.space) : accounts.fromBar(acc, body.slot) });
    return send(404, { error: 'Not found' });
  } catch (e) {
    if (e instanceof AccountError) return send(400, { error: e.message });
    throw e;
  }
}

// The ranking (#47): top 50 accounts by knockouts (@pvp/leaderboard) and my own place.
function ranking(acc) {
  return rankPlayers(accounts.rankingEntries(), { me: { name: acc.name, kills: acc.kills, lastKillAt: acc.lastKillAt } });
}

// A knockout counts for the ranking (#47) when a real account did it: not your own bomb (byKey is null
// then, or the same as playerKey), not the island, not a bot. The time breaks ties.
function countKnockout(ev, now) {
  if (!ev.byKey || ev.byKey === ev.playerKey) return;
  const killer = accounts.byName(ev.byKey);
  if (killer) accounts.addKnockout(killer, now);
}

// ---------------------------------------------------------------- static files
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serveStatic(req, res) {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end('Bad Request'); }
  let file;
  if (p === '/') p = '/index.html';
  // safeJoin (@pvp/http-guard) keeps every path inside its folder (no ../ tricks).
  if (p.startsWith('/three/')) file = safeJoin(THREE_DIR, p.slice('/three'.length));
  else if (p.startsWith('/packages/')) {
    // Browser code of the @pvp packages: only /packages/<name>/src/... may be read.
    const m = /^\/packages\/([a-z0-9-]+)\/src\//.exec(p);
    if (!m) { res.writeHead(403); return res.end(); }
    file = safeJoin(path.join(PACKAGES_DIR, m[1], 'src'), p.slice(m[0].length - 1));
  }
  else file = safeJoin(path.join(ROOT, 'public'), p);
  if (!file) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    // HTML pages: allow exactly their own inline scripts (the import map) in the Content-Security-Policy.
    if (ext === '.html') setSecurityHeaders(req, res, inlineScriptHashes(String(data)));
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function setSecurityHeaders(req, res, scriptHashes = []) {
  const h = securityHeaders({ scriptHashes, host: req.headers.host, https: isHttps(req, { trustProxy: TRUST_PROXY }) });
  for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
}

const server = http.createServer((req, res) => {
  setSecurityHeaders(req, res);
  if (stopping) { res.setHeader('Connection', 'close'); return sendJson(res, 503, { error: 'The island is restarting. Try again in a moment!' }); }
  // The host checks this to know the game is alive.
  if (req.url === '/healthz' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end('ok');
  }
  if (req.url.startsWith('/api/') && req.method === 'POST') {
    const ip = clientIp(req, { trustProxy: TRUST_PROXY });
    if (!apiLimiter.take(ip, Date.now())) {
      req.resume();
      return sendJson(res, 429, { error: TOO_MANY_TRIES }, { 'Retry-After': '5' });
    }
    if (Number(req.headers['content-length']) > LIMITS.maxBodyBytes) {
      res.setHeader('Connection', 'close');
      return sendJson(res, 413, { error: 'That is too big.' });
    }
    const chunks = [];
    let size = 0, tooBig = false;
    req.on('error', () => {}); // aborted: just drop it
    req.on('data', c => {
      if (tooBig) return;
      size += c.length;
      if (size > LIMITS.maxBodyBytes) {
        tooBig = true;
        res.setHeader('Connection', 'close');
        sendJson(res, 413, { error: 'That is too big.' });
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return;
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch {}
      if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
      try { handleApi(req, res, body, ip); } catch (e) {
        console.error('API error:', e); // the details stay in the server log, the player only sees "Server error"
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error' }));
      }
    });
    return;
  }
  serveStatic(req, res);
});

// ---------------------------------------------------------------- arena
const arena = createArena({ island: generateIsland(), rules: { ...RULES, MAX_PLAYERS: LIMITS.maxPlayers }, random: createRandom(ARENA_SEED), now: Date.now() });
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
      // Knocked out: what came from the fast bar is lost (dropped on the island); the Inventory stays safe.
      if (ev.kind === 'knockedOut') { countKnockout(ev, Date.now()); gone.push(ev.playerId); }
      continue;
    }
    const text = JSON.stringify(ev.msg);
    if (ev.to === 'all') {
      for (const id of arena.playerIds()) if (id !== ev.except) sendRaw(conns.get(id), text);
    } else if (Array.isArray(ev.to)) {
      for (const id of ev.to) sendRaw(conns.get(id), text); // the players near someone (e.g. 'dmg' numbers, #33)
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

// Leave the arena alive (no connection needed): what survived goes back into its fast bar slots (#39), loot into the Inventory.
function leaveArenaAlive(acc, id) {
  if (!arena.hasPlayer(id)) return;
  const { potions, bombs } = arena.getPlayer(id);
  accounts.returnFromArena(acc, { weapons: arena.leave(id, { alive: true }), potions, bombs });
}

function leaveAlive(conn) {
  const id = conn.playerId;
  if (id == null) return;
  conn.playerId = null;
  conns.delete(id);
  leaveArenaAlive(conn.acc, id);
}

function join(conn, now) {
  const acc = conn.acc;
  // Same account already in (another tab or device): that player leaves alive first,
  // so its things are back in the account before the new fast bar is taken.
  const oldId = arena.idOf(playerKey(acc));
  if (oldId !== undefined) {
    const old = conns.get(oldId);
    if (old) { leaveAlive(old); if (old !== conn) sendRaw(old, encode('left')); }
    else leaveArenaAlive(acc, oldId);
  }

  // Only what is in the fast bar comes along (#39); the rest of the Inventory stays safe in the account.
  const { loadout, potions, bombs, starter } = accounts.takeBar(acc);
  const r = arena.join(playerKey(acc), { name: acc.name, skin: { ...acc.skin }, loadout, starter, coins: acc.coins, potions, bombs }, now);
  if (!r.ok) {
    accounts.returnFromArena(acc, { weapons: loadout, potions, bombs });
    sendRaw(conn, encode('full'));
    return;
  }
  // Give back anything the arena didn't take (it goes back into its bar slot).
  const rest = [...loadout];
  for (const w of r.weapons) { const i = rest.indexOf(w); if (i >= 0) rest.splice(i, 1); }
  const bombsBack = Object.fromEntries(Object.keys(bombs).map(b => [b, bombs[b] - (r.bombs[b] ?? 0)]));
  accounts.returnFromArena(acc, { weapons: rest, potions: potions - r.potions, bombs: bombsBack });
  if (r.replaced) {
    const old = conns.get(r.replaced.id);
    if (old) { old.playerId = null; conns.delete(r.replaced.id); }
    accounts.returnFromArena(acc, { weapons: r.replaced.weapons, potions: r.replaced.potions, bombs: r.replaced.bombs }, { refill: false });
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
    case 'drink': if (id != null) arena.drink(id, now); break;
    case 'shield': if (id != null) arena.setShield(id, m.up, now); break;
    case 'drop': if (id != null) arena.dropWeapon(id, now); break;
    case 'throw': if (id != null) arena.throwBomb(id, m.b, m.d, now); break;
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
  if (m.t === 'debugCoins') { accounts.addCoins(conn.acc, m.n); syncCoins(conn.acc); return; }
  if (m.t === 'debugKills') { for (let i = 0; i < m.n; i++) accounts.addKnockout(conn.acc, Date.now()); return; }
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
// Close codes the page understands (apps/game/public/js/game.js shows a friendly message).
const CLOSE_BUSY = 4029;      // too many connections (from this address, or in total)
const CLOSE_TOO_FAST = 4008;  // far too many messages
const CLOSE_RESTART = 1012;   // the server is restarting (an update)
const connsPerIp = createConcurrencyLimit({ max: LIMITS.connectionsPerIp });
const wss = new WebSocketServer({ server, maxPayload: MAX_CLIENT_MESSAGE_SIZE });
wss.on('connection', (ws, req) => {
  if (stopping) { ws.close(CLOSE_RESTART, 'restart'); return; }
  const ip = clientIp(req, { trustProxy: TRUST_PROXY });
  if (wss.clients.size > LIMITS.maxConnections || !connsPerIp.open(ip)) {
    console.log(`Connection refused (too many) for ${ip}`);
    ws.close(CLOSE_BUSY, 'busy');
    return;
  }
  ws.on('close', () => connsPerIp.close(ip));
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  const acc = accounts.byToken(token);
  if (!acc) { ws.close(4001, 'login'); return; }
  const conn = { ws, acc, playerId: null };
  // Message speed limit: extra messages are dropped; a connection that keeps flooding is closed.
  const bucket = createTokenBucket({ capacity: LIMITS.messagesPerSecond * 2, perSecond: LIMITS.messagesPerSecond }, Date.now());
  let dropped = 0, dropWindow = Date.now();

  ws.on('message', raw => {
    const now = Date.now();
    if (!bucket.take(now)) {
      if (now - dropWindow > 10_000) { dropped = 0; dropWindow = now; }
      if (++dropped > LIMITS.messagesPerSecond * 5) ws.close(CLOSE_TOO_FAST, 'too fast');
      return;
    }
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
  console.log(`PvP Island is running!`);
  console.log(`  On this computer:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  On phones (same Wi-Fi): http://${n.address}:${PORT}`);
  }
  if (PRODUCTION && !process.env.DATA_FILE) console.log('  WARNING: DATA_FILE is not set. On a host, point it at the persistent disk (e.g. /data/accounts.json) or accounts are lost on every update!');
  console.log(`  Accounts file: ${DATA_FILE}`);
  if (TEST_HOOKS) console.log('  TEST HOOKS ARE ON (PVP_TEST_HOOKS=1): only for automatic tests, never for real players!');
  console.log(`  Arena seed: ${ARENA_SEED}`);
});

// Stopping (the host sends SIGTERM before an update or a restart): everyone in the arena leaves alive,
// so the things in their bars go back into their accounts; then the accounts are saved.
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal || 'Stop'}: saving accounts and stopping...`);
  clearInterval(ticker);
  server.close();
  let n = 0;
  for (const conn of new Set(conns.values())) {
    try { if (conn.playerId != null) { leaveAlive(conn); n++; } } catch (e) { console.error('Could not return a player\'s things:', e); }
  }
  for (const ws of wss.clients) { try { ws.close(CLOSE_RESTART, 'restart'); } catch {} }
  let code = 0;
  try { await accounts.flush(); console.log(`Accounts saved (${n} player${n === 1 ? '' : 's'} left the arena safely).`); }
  catch (e) { console.error('Could not save accounts:', e); code = 1; }
  process.exit(code);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
