// The game server's glue (accounts, shop, one arena, the 50 ms tick), but inside the page.
// Same steps as apps/game/server.js: client messages are checked with parseClientMessage,
// the arena's outbox is sent as JSON, chest coins go to the account, the account's coins win.

import { RULES } from '@pvp/game-rules';
import { createAccounts, createWebStorageStore, AccountError } from '@pvp/accounts-shop/browser';
import { generateIsland } from '@pvp/world-gen';
import { createArena } from '@pvp/arena';
import { createRandom, hashString } from '@pvp/seeded-random';
import { createApiClient, safeStorage } from '@pvp/api-client';
import { parseClientMessage, encode } from '@pvp/net-protocol';
import { createFakeSocket } from './socket.js';
import { createBots } from './bots.js';

export const TICK_MS = 50;

/**
 * A password hash for accounts that never leave this browser. NOT secure (FNV-1a based):
 * only so a local account still needs its password. 32 bytes as hex.
 */
export function practiceHash(password, salt) {
  let out = '';
  for (let i = 0; i < 8; i++) out += (hashString(`${i}:${salt}:${password}:${i}`) >>> 0).toString(16).padStart(8, '0');
  return out;
}

// Random bytes for tokens and salts: the browser's crypto when there is one, else from `fallback`.
function defaultRandomBytes(fallback) {
  return n => {
    const bytes = new Uint8Array(n);
    try { globalThis.crypto.getRandomValues(bytes); return bytes; } catch { /* no crypto */ }
    for (let i = 0; i < n; i++) bytes[i] = Math.floor(fallback.next() * 256);
    return bytes;
  };
}

/**
 * Create a game server that runs in the page.
 * @param {object} [o]
 * @param {string|number} [o.seed='practice']  seed for the arena (loot, spawns, gun spread) and the bots
 * @param {object} [o.storage]   localStorage-like; accounts and the token are kept there (memory if missing or blocked)
 * @param {string} [o.storagePrefix='pvp.practice']  storage keys: <prefix>.accounts and <prefix>.token
 * @param {Function} [o.now]     clock in ms (default Date.now)
 * @param {object} [o.timer]     { setInterval, clearInterval } for the tick (default the global ones)
 * @param {boolean} [o.autoStart=true]  start the 50 ms tick right away (tests: false, then call tick(now))
 * @param {Function} [o.defer]   runs a callback later, like a network would (default: a microtask)
 * @param {Function} [o.randomBytes]  n -> bytes for tokens and salts (default: crypto.getRandomValues)
 * @param {number} [o.bots=0]    how many bots (see bots.js)
 * @param {object} [o.island]    default generateIsland() (the same island the game draws)
 */
export function createLocalServer({
  seed = 'practice',
  storage,
  storagePrefix = 'pvp.practice',
  now = () => Date.now(),
  timer = { setInterval: (f, ms) => setInterval(f, ms), clearInterval: h => clearInterval(h) },
  autoStart = true,
  defer = fn => { Promise.resolve().then(fn); },
  randomBytes,
  bots: botCount = 0,
  island = generateIsland(),
} = {}) {
  const random = createRandom(String(seed));
  const accounts = createAccounts({
    store: createWebStorageStore(storage, `${storagePrefix}.accounts`),
    now,
    randomBytes: randomBytes || defaultRandomBytes(createRandom(`${seed}:bytes:${now()}`)),
    hashPassword: practiceHash,
  });
  const playerKey = acc => acc.name.toLowerCase();
  const arena = createArena({ island, rules: RULES, random, now: now() });
  const bots = botCount > 0 ? createBots({ arena, island, random: createRandom(`${seed}:bots`), count: botCount }) : null;
  const conns = new Map(); // arena player id -> connection { ws, acc, playerId }
  // The login token lives here (storage, or memory if storage is blocked); the api client and ensurePlayer share it.
  const tokenKey = `${storagePrefix}.token`;
  const tokens = safeStorage(storage);
  const tokenStorage = { getItem: k => tokens.get(k), setItem: (k, v) => tokens.set(k, v), removeItem: k => tokens.remove(k) };

  // ---------------------------------------------------------------- API (like the server's /api/*)
  function handleApi(url, body, token) {
    try {
      if (url === '/api/signup' || url === '/api/login') {
        const { name, password } = body;
        const r = url === '/api/signup' ? accounts.signup(name, password) : accounts.login(name, password);
        return [200, { token: r.token, account: accounts.publicView(r.account) }];
      }
      const acc = accounts.byToken(token);
      if (!acc) return [401, { error: 'Please log in again' }];
      if (url === '/api/me') return [200, { account: accounts.publicView(acc), online: arena.playerCount() }];
      if (url === '/api/buy') {
        const account = accounts.buy(acc, body.kind, body.id);
        syncCoins(acc);
        return [200, { account }];
      }
      if (url === '/api/equip') return [200, { account: accounts.equip(acc, body.kind, body.id) }];
      return [404, { error: 'Not found' }];
    } catch (e) {
      if (e instanceof AccountError) return [400, { error: e.message }];
      throw e;
    }
  }

  /** A fetch() that answers the /api/* paths in the page. Give it to @pvp/api-client. */
  async function fetchFn(url, init = {}) {
    let body = {};
    try { body = JSON.parse(init.body || '{}') ?? {}; } catch { /* like the server: empty body */ }
    const headers = init.headers || {};
    const token = headers['x-token'] ?? headers['X-Token'];
    let status, data;
    try { [status, data] = handleApi(String(url).replace(/^https?:\/\/[^/]+/, ''), body, token); }
    catch (e) { console.error('API error:', e); [status, data] = [500, { error: 'Server error' }]; }
    const text = JSON.stringify(data);
    return { status, ok: status >= 200 && status < 300, json: async () => JSON.parse(text) };
  }

  // ---------------------------------------------------------------- arena glue (same as server.js)
  const sendRaw = (conn, text) => { if (conn) conn.ws.deliver(text); };

  function syncCoins(acc) {
    const id = arena.idOf(playerKey(acc));
    if (id !== undefined && arena.setCoins(id, acc.coins)) pump();
  }

  function pump() {
    const gone = [];
    for (const ev of arena.drain()) {
      if (ev.to === 'server') {
        const conn = conns.get(ev.playerId);
        if (ev.kind === 'coins' && conn) {
          const total = accounts.addCoins(conn.acc, ev.amount);
          if (total !== ev.total) arena.setCoins(ev.playerId, total);
        }
        if (ev.kind === 'knockedOut') {
          if (bots && bots.knockedOut(ev.playerId, arena.now())) continue;
          gone.push(ev.playerId);
        }
        continue;
      }
      const text = JSON.stringify(ev.msg);
      if (ev.to === 'all') {
        for (const id of arena.playerIds()) if (id !== ev.except) sendRaw(conns.get(id), text);
      } else {
        sendRaw(conns.get(ev.to), text);
      }
    }
    for (const id of gone) {
      const conn = conns.get(id);
      if (conn && conn.playerId === id) conn.playerId = null;
      conns.delete(id);
    }
  }

  // Leave alive: carried weapons and unused Healing Potions go back into the backpack.
  function leaveArenaAlive(acc, id) {
    if (!arena.hasPlayer(id)) return;
    const potions = arena.getPlayer(id).potions;
    accounts.returnLoadout(acc, arena.leave(id, { alive: true }));
    if (potions) accounts.returnPotions(acc, potions);
  }

  function leaveAlive(conn) {
    const id = conn.playerId;
    if (id == null) return;
    conn.playerId = null;
    conns.delete(id);
    leaveArenaAlive(conn.acc, id);
  }

  function join(conn, t) {
    const acc = conn.acc;
    const oldId = arena.idOf(playerKey(acc));
    if (oldId !== undefined) {
      const old = conns.get(oldId);
      if (old) { leaveAlive(old); if (old !== conn) sendRaw(old, encode('left')); }
      else leaveArenaAlive(acc, oldId);
    }
    const loadout = accounts.takeLoadout(acc);
    const potions = accounts.takePotions(acc); // up to 3 Healing Potions come along
    const r = arena.join(playerKey(acc), { name: acc.name, skin: { ...acc.skin }, loadout, coins: acc.coins, potions }, t);
    if (!r.ok) {
      accounts.returnLoadout(acc, loadout);
      accounts.returnPotions(acc, potions);
      sendRaw(conn, encode('full'));
      return;
    }
    const rest = [...loadout];
    for (const w of r.weapons) { const i = rest.indexOf(w); if (i >= 0) rest.splice(i, 1); }
    if (rest.length) accounts.returnLoadout(acc, rest);
    if (r.potions < potions) accounts.returnPotions(acc, potions - r.potions);
    if (r.replaced) {
      const old = conns.get(r.replaced.id);
      if (old) { old.playerId = null; conns.delete(r.replaced.id); }
      accounts.returnLoadout(acc, r.replaced.weapons);
      if (r.replaced.potions) accounts.returnPotions(acc, r.replaced.potions);
    }
    conn.playerId = r.id;
    conns.set(r.id, conn);
  }

  function onMessage(conn, m) {
    const t = now();
    const id = conn.playerId != null && arena.hasPlayer(conn.playerId) ? conn.playerId : null;
    switch (m.t) {
      case 'join': if (id == null) join(conn, t); break;
      case 'leave': if (id != null) { leaveAlive(conn); sendRaw(conn, encode('left')); } break;
      case 'state': if (id != null) arena.setState(id, { x: m.x, y: m.y, z: m.z, ry: m.ry, pitch: m.pitch, f: m.f }, t); break;
      case 'fire': if (id != null) arena.fire(id, m.d, t); break;
      case 'slot': if (id != null) arena.selectSlot(id, m.i); break;
      case 'open': if (id != null) arena.openChest(id, m.id, t); break;
      case 'drink': if (id != null) arena.drink(id, t); break;
      case 'shield': if (id != null) arena.setShield(id, m.up, t); break;
      case 'drop': if (id != null) arena.dropWeapon(id, t); break;
    }
    pump();
  }

  /**
   * Open a WebSocket-like connection for a login token (what `new WebSocket(url)` is for the real game).
   * Opens a moment later, or closes with code 4001 if the token is not logged in.
   */
  function connect(token) {
    const conn = { ws: null, acc: null, playerId: null };
    conn.ws = createFakeSocket({
      defer,
      accept() { conn.acc = accounts.byToken(token); return conn.acc ? true : { code: 4001, reason: 'login' }; },
      receive(raw) {
        const r = parseClientMessage(raw);
        if (!r.ok) return; // bad or unknown message: dropped, like the server
        try { onMessage(conn, r.msg); } catch (e) { console.error('Message error:', e); }
      },
      closed() { if (conn.acc) { leaveAlive(conn); pump(); } },
    });
    if (!ticker && autoStart) start();
    return conn.ws;
  }

  // ---------------------------------------------------------------- tick
  /** One server tick at time t (ms): bots, then the arena, then send everything. */
  function tick(t = now()) {
    if (bots) bots.tick(t);
    arena.tick(t);
    pump();
  }

  let ticker = null;
  function start() {
    if (ticker) return;
    if (bots) tick(now()); // the bots are on the island before anyone joins
    ticker = timer.setInterval(() => {
      try { tick(now()); } catch (e) { console.error('Tick error:', e); }
    }, TICK_MS);
  }
  function stop() {
    if (ticker) timer.clearInterval(ticker);
    ticker = null;
  }
  if (autoStart) start();

  // ---------------------------------------------------------------- extras for practice mode
  function idFor(token) {
    const acc = accounts.byToken(token);
    const id = acc ? arena.idOf(playerKey(acc)) : undefined;
    return id;
  }

  return {
    fetch: fetchFn,
    connect,
    /** An @pvp/api-client that talks to this server (token kept in <storagePrefix>.token). */
    createApi: () => createApiClient({ fetch: fetchFn, storage: tokenStorage, tokenKey }),
    /**
     * Make sure someone is logged in, right now (no waiting): keeps a saved, working token, or signs up
     * a new local player 'Player_1234' (random password: practice accounts never leave the page).
     * Returns { token, account (public view), created }.
     */
    ensurePlayer() {
      const saved = tokens.get(tokenKey);
      const acc = saved && accounts.byToken(saved);
      if (acc) return { token: saved, account: accounts.publicView(acc), created: false };
      const bytes = (randomBytes || defaultRandomBytes(createRandom(`${seed}:player:${now()}`)))(12);
      const password = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      for (let i = 0; ; i++) {
        const name = `Player_${String(1000 + ((bytes[0] * 256 + bytes[1] + i * 7919) % 9000))}`;
        try {
          const r = accounts.signup(name, password);
          tokens.set(tokenKey, r.token);
          return { token: r.token, account: accounts.publicView(r.account), created: true };
        } catch (e) {
          if (!(e instanceof AccountError) || e.code !== 'NAME_TAKEN' || i > 50) throw e;
        }
      }
    },
    /** Change the name of the logged-in account (not while it is in the arena). Returns the public account. */
    rename(token, name) {
      const acc = accounts.byToken(token);
      if (!acc) throw new AccountError('WRONG_LOGIN', 'Please log in again');
      if (arena.idOf(playerKey(acc)) !== undefined) throw new AccountError('IN_ARENA', 'Leave the arena first');
      return accounts.rename(acc, name);
    },
    /** Practice/test helper: put the player of this token somewhere (like the server's debugTeleport). */
    teleport(token, x, z) {
      const id = idFor(token);
      if (id === undefined || !arena.teleport(id, { x, y: 0, z })) return false;
      const conn = conns.get(id);
      sendRaw(conn, encode('pos', { x, y: 0, z }));
      pump();
      return true;
    },
    tick,
    start,
    stop,
    get running() { return ticker != null; },
    arena,
    accounts,
    island,
    bots,
  };
}
