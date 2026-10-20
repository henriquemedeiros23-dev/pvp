// Stickman Ruins game server: serves the game files, handles accounts and the
// shop, and runs the single always-on arena.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import * as C from './shared/config.js';
import { generateWorld, rayWorld, rayPlayer, findSpawn, nearbyBoxes, circleHitsBox } from './shared/world.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.join(ROOT, 'data', 'accounts.json');

// ---------------------------------------------------------------- accounts
let accounts = {};
try { accounts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { accounts = {}; }
let saveTimer = null;
function saveAccounts() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(accounts, null, 1));
  }, 1000);
}
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const byToken = token => Object.values(accounts).find(a => a.token && a.token === token);

function publicAccount(a) {
  return { name: a.name, coins: a.coins, owned: a.owned, skin: a.skin, stash: a.stash };
}

function priceOf(kind, id) {
  if (kind === 'color') return C.COLORS[id]?.price;
  if (kind === 'weapon') return C.WEAPONS[id] && C.WEAPONS[id].rarity !== 'basic' ? C.WEAPONS[id].price : undefined;
  return C.OUTFITS[kind]?.[id]?.price;
}

function handleApi(req, res, body) {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const url = req.url;
  if (url === '/api/signup' || url === '/api/login') {
    const name = String(body.name || '').trim().slice(0, 16);
    const pw = String(body.password || '');
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return send(400, { error: 'Name must be 3-16 letters, numbers or _' });
    if (pw.length < 4) return send(400, { error: 'Password must be at least 4 characters' });
    const key = name.toLowerCase();
    if (url === '/api/signup') {
      if (accounts[key]) return send(400, { error: 'That name is taken' });
      const salt = crypto.randomBytes(8).toString('hex');
      accounts[key] = {
        name, salt, hash: hashPw(pw, salt), coins: 0,
        owned: ['color:black', 'hat:none', 'face:none', 'back:none', 'shirt:none'],
        skin: { ...C.DEFAULT_SKIN }, stash: {},
      };
    } else {
      const a = accounts[key];
      if (!a || hashPw(pw, a.salt) !== a.hash) return send(400, { error: 'Wrong name or password' });
    }
    accounts[key].token = crypto.randomBytes(24).toString('hex');
    saveAccounts();
    return send(200, { token: accounts[key].token, account: publicAccount(accounts[key]) });
  }

  const acc = byToken(req.headers['x-token']);
  if (!acc) return send(401, { error: 'Please log in again' });

  if (url === '/api/me') return send(200, { account: publicAccount(acc), online: arena.players.size });

  if (url === '/api/buy') {
    const { kind, id } = body;
    const price = priceOf(kind, id);
    if (price === undefined) return send(400, { error: 'Unknown item' });
    if (kind !== 'weapon' && acc.owned.includes(kind + ':' + id)) return send(400, { error: 'You already own it' });
    if (acc.coins < price) return send(400, { error: 'Not enough coins' });
    acc.coins -= price;
    if (kind === 'weapon') acc.stash[id] = (acc.stash[id] || 0) + 1;
    else acc.owned.push(kind + ':' + id);
    saveAccounts();
    return send(200, { account: publicAccount(acc) });
  }

  if (url === '/api/equip') {
    const { kind, id } = body;
    if (!acc.owned.includes(kind + ':' + id)) return send(400, { error: 'Buy it first' });
    acc.skin[kind] = id;
    saveAccounts();
    return send(200, { account: publicAccount(acc) });
  }
  send(404, { error: 'Not found' });
}

// ---------------------------------------------------------------- static files
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (p === '/') p = '/index.html';
  if (p.startsWith('/shared/')) file = path.join(ROOT, p);
  else if (p.startsWith('/three/')) file = path.join(ROOT, 'node_modules', 'three', p.slice(7));
  else file = path.join(ROOT, 'public', p);
  const allowed = [path.join(ROOT, 'public'), path.join(ROOT, 'shared'), path.join(ROOT, 'node_modules', 'three')];
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
    req.on('data', c => { raw += c; if (raw.length > 1e4) req.destroy(); });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch {}
      handleApi(req, res, body);
    });
    return;
  }
  serveStatic(req, res);
});

// ---------------------------------------------------------------- arena
const world = generateWorld();
let nextId = 1;
const newId = () => nextId++;

const arena = {
  players: new Map(),   // id -> player
  chests: world.chests.map(c => ({ ...c, openUntil: 0 })),
  golden: null,         // { x, z } while a golden chest is waiting
  nextGolden: Date.now() + 60000, // first one after 1 minute
  items: new Map(),     // id -> { id, kind: 'weapon'|'bandage'|'medkit', weapon, x, y, z, expires }
  projectiles: new Map(),
  mines: new Map(),
};

function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const p of arena.players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s);
}
const sendTo = (p, msg) => p.ws.readyState === 1 && p.ws.send(JSON.stringify(msg));

function inventoryMsg(p) {
  return { t: 'inv', weapons: p.weapons, slot: p.slot, bandages: p.bandages, medkits: p.medkits, coins: p.acc.coins, hp: p.hp };
}

function playerInfo(p) {
  return { id: p.id, name: p.acc.name, skin: p.acc.skin };
}

function joinArena(conn) {
  const acc = conn.acc;
  if (arena.players.size >= C.MAX_PLAYERS) return sendTo(conn, { t: 'full' });
  for (const p of arena.players.values()) if (p.acc === acc) leaveArena(p, true);

  // Bought weapons come out of the backpack, best first, as many as fit.
  const weapons = [C.BASIC_WEAPON];
  const owned = Object.keys(acc.stash).filter(k => acc.stash[k] > 0).sort((a, b) => C.WEAPONS[b].price - C.WEAPONS[a].price);
  for (const w of owned) {
    if (weapons.length >= C.MAX_SLOTS) break;
    weapons.push(w);
    acc.stash[w]--;
    if (!acc.stash[w]) delete acc.stash[w];
  }
  saveAccounts();

  const spot = findSpawn(world, [...arena.players.values()]);
  const p = {
    id: newId(), ws: conn.ws, acc, x: spot.x, y: 0, z: spot.z, ry: 0, pitch: 0, flags: 0,
    hp: C.MAX_HP, weapons, slot: 0, bandages: 1, medkits: 0, lastFire: 0, lastHeal: 0,
    protectUntil: Date.now() + C.SPAWN_PROTECT_MS, lastState: Date.now(),
  };
  conn.player = p;
  arena.players.set(p.id, p);

  sendTo(p, {
    t: 'welcome', id: p.id, x: p.x, z: p.z,
    players: [...arena.players.values()].map(playerInfo),
    chests: arena.chests.filter(c => c.openUntil > Date.now()).map(c => c.id),
    golden: arena.golden,
    items: [...arena.items.values()].map(itemMsg),
    mines: [...arena.mines.values()].map(m => ({ id: m.id, x: m.x, z: m.z, owner: m.owner })),
  });
  sendTo(p, inventoryMsg(p));
  broadcast({ t: 'pjoin', ...playerInfo(p) }, p);
}

function leaveArena(p, keepWeapons) {
  if (!arena.players.has(p.id)) return;
  arena.players.delete(p.id);
  if (keepWeapons) {
    // Left the game alive: weapons go back into the backpack.
    for (const w of p.weapons) if (w !== C.BASIC_WEAPON) p.acc.stash[w] = (p.acc.stash[w] || 0) + 1;
    saveAccounts();
  }
  broadcast({ t: 'pleave', id: p.id });
}

const itemMsg = it => ({ id: it.id, kind: it.kind, weapon: it.weapon, x: it.x, y: it.y, z: it.z });

function dropItem(kind, weapon, x, z, spread = 1.2) {
  const a = Math.random() * Math.PI * 2, d = Math.random() * spread;
  let ix = x + Math.cos(a) * d, iz = z + Math.sin(a) * d;
  if ([...nearbyBoxes(world.grid, ix, iz, 1)].some(b => b.h > 0.5 && circleHitsBox(ix, iz, 0.3, b))) { ix = x; iz = z; }
  let y = 0;
  for (const b of nearbyBoxes(world.grid, ix, iz, 0.5)) if (circleHitsBox(ix, iz, 0.2, b) && b.h <= 1.4) y = Math.max(y, b.y + b.h);
  const it = { id: newId(), kind, weapon, x: ix, y, z: iz, expires: Date.now() + C.ITEM_LIFETIME_MS };
  arena.items.set(it.id, it);
  broadcast({ t: 'item+', ...itemMsg(it) });
}

function rollLoot(x, z) {
  if (Math.random() < 0.5) {
    const roll = Math.random();
    const rarity = roll < 0.68 ? 'common' : roll < 0.95 ? 'rare' : 'legendary';
    const list = C.LOOT_TABLE[rarity];
    dropItem('weapon', list[Math.floor(Math.random() * list.length)], x, z);
  } else {
    dropItem(Math.random() < 0.75 ? 'bandage' : 'medkit', null, x, z);
  }
}

function giveCoins(p, n) {
  p.acc.coins += n;
  saveAccounts();
  sendTo(p, { t: 'coins', amount: n, total: p.acc.coins });
}

function openChest(p, id) {
  if (id === 'golden') {
    const g = arena.golden;
    if (!g || Math.hypot(g.x - p.x, g.z - p.z) > 3.2) return;
    arena.golden = null;
    arena.nextGolden = Date.now() + C.GOLDEN_CHEST_EVERY_MS;
    giveCoins(p, 80 + Math.floor(Math.random() * 41));
    const legends = C.LOOT_TABLE.legendary;
    dropItem('weapon', legends[Math.floor(Math.random() * legends.length)], g.x, g.z);
    dropItem('medkit', null, g.x, g.z);
    broadcast({ t: 'golden', golden: null, by: p.acc.name });
    return;
  }
  const c = arena.chests[id];
  const now = Date.now();
  if (!c || c.openUntil > now || Math.hypot(c.x - p.x, c.z - p.z) > 3.2) return;
  c.openUntil = now + C.CHEST_RESPAWN_MS;
  giveCoins(p, 5 + Math.floor(Math.random() * 11));
  rollLoot(c.x, c.z);
  broadcast({ t: 'chest', id: c.id, open: true });
}

function damage(victim, amount, attacker, weapon, kx = 0, kz = 0) {
  if (!arena.players.has(victim.id) || victim.hp <= 0) return;
  if (Date.now() < victim.protectUntil) return;
  victim.hp = Math.max(0, victim.hp - Math.round(amount));
  if (attacker) sendTo(attacker, { t: 'hitmark', dead: victim.hp <= 0 });
  sendTo(victim, { t: 'hurt', hp: victim.hp, kx, kz, from: attacker ? [attacker.x, attacker.z] : null });
  if (victim.hp > 0) return;

  // Knocked out: drop everything except the basic weapon, back to the menu.
  for (const w of victim.weapons) if (w !== C.BASIC_WEAPON) dropItem('weapon', w, victim.x, victim.z, 2);
  if (victim.medkits) dropItem('medkit', null, victim.x, victim.z, 2);
  if (victim.bandages) dropItem('bandage', null, victim.x, victim.z, 2);
  arena.players.delete(victim.id);
  broadcast({ t: 'ko', id: victim.id, x: victim.x, y: victim.y, z: victim.z, victim: victim.acc.name, by: attacker ? attacker.acc.name : null, weapon });
  sendTo(victim, { t: 'dead', by: attacker ? attacker.acc.name : null, weapon });
}

function explode(x, y, z, def, owner, weaponId) {
  broadcast({ t: 'boom', x, y, z, r: def.radius });
  for (const v of [...arena.players.values()]) {
    if (v === owner) continue; // no self damage
    const d = Math.hypot(v.x - x, v.y + 0.9 - y, v.z - z);
    if (d > def.radius) continue;
    const f = 1 - (d / def.radius) * 0.7;
    const len = Math.hypot(v.x - x, v.z - z) || 1;
    damage(v, def.dmg * f, owner, weaponId, ((v.x - x) / len) * 8, ((v.z - z) / len) * 8);
  }
}

function fire(p, msg) {
  const w = p.weapons[p.slot];
  const def = C.WEAPONS[w];
  const now = Date.now();
  if (!def || now - p.lastFire < def.rate * 1000 * 0.9) return;
  p.lastFire = now;
  p.protectUntil = 0; // attacking ends spawn protection

  const height = (p.flags & 1) ? C.CROUCH_HEIGHT : C.PLAYER_HEIGHT;
  const ox = p.x, oy = p.y + height - 0.3, oz = p.z;
  let [dx, dy, dz] = Array.isArray(msg.d) ? msg.d.map(Number) : [0, 0, 1];
  let len = Math.hypot(dx, dy, dz);
  if (!len || !isFinite(len)) return;
  dx /= len; dy /= len; dz /= len;

  if (def.type === 'melee') {
    broadcast({ t: 'swing', id: p.id });
    let target = null, best = def.range;
    for (const v of arena.players.values()) {
      if (v === p) continue;
      const vx = v.x - p.x, vz = v.z - p.z, d = Math.hypot(vx, vz);
      if (d > best || Math.abs(v.y - p.y) > 2) continue;
      const fx = Math.sin(p.ry), fz = Math.cos(p.ry);
      if (d > 0.6 && (vx * fx + vz * fz) / d < 0.45) continue; // must be in front
      best = d; target = v;
    }
    if (target) {
      const d = best || 1, k = def.knock || 3;
      damage(target, def.dmg, p, w, ((target.x - p.x) / d) * k, ((target.z - p.z) / d) * k);
    }
    return;
  }

  if (def.type === 'gun') {
    const tracers = [];
    for (let i = 0; i < def.pellets; i++) {
      let sx = dx + (Math.random() - 0.5) * 2 * def.spread;
      let sy = dy + (Math.random() - 0.5) * 2 * def.spread;
      let sz = dz + (Math.random() - 0.5) * 2 * def.spread;
      const l = Math.hypot(sx, sy, sz); sx /= l; sy /= l; sz /= l;
      let dist = rayWorld(world, ox, oy, oz, sx, sy, sz, def.range);
      let hit = null;
      for (const v of arena.players.values()) {
        if (v === p) continue;
        const h = (v.flags & 1) ? C.CROUCH_HEIGHT : C.PLAYER_HEIGHT;
        const t = rayPlayer(ox, oy, oz, sx, sy, sz, v.x, v.y, v.z, h);
        if (t < dist) { dist = t; hit = v; }
      }
      if (hit) damage(hit, def.dmg, p, w);
      tracers.push([+(ox + sx * dist).toFixed(2), +(oy + sy * dist).toFixed(2), +(oz + sz * dist).toFixed(2)]);
    }
    broadcast({ t: 'shot', id: p.id, w, from: [+ox.toFixed(2), +oy.toFixed(2), +oz.toFixed(2)], to: tracers });
    return;
  }

  if (def.type === 'throw' || def.type === 'rocket') {
    const pr = {
      id: newId(), kind: w, owner: p,
      x: ox + dx * 0.8, y: oy + dy * 0.8, z: oz + dz * 0.8,
      vx: dx * def.speed, vy: dy * def.speed + (def.type === 'throw' ? 4 : 0), vz: dz * def.speed,
      born: now,
    };
    arena.projectiles.set(pr.id, pr);
    broadcast({ t: 'proj', id: pr.id, kind: w, x: pr.x, y: pr.y, z: pr.z, vx: pr.vx, vy: pr.vy, vz: pr.vz });
    return;
  }

  if (def.type === 'mine') {
    const mine = [...arena.mines.values()].filter(m => m.ownerId === p.id);
    if (mine.length >= def.maxActive) {
      arena.mines.delete(mine[0].id);
      broadcast({ t: 'mine-', id: mine[0].id });
    }
    const m = { id: newId(), x: p.x, y: p.y, z: p.z, ownerId: p.id, owner: p, armAt: now + 1000, born: now };
    arena.mines.set(m.id, m);
    broadcast({ t: 'mine+', id: m.id, x: m.x, y: m.y, z: m.z, owner: p.id });
  }
}

function heal(p, kind) {
  const now = Date.now();
  if (now - p.lastHeal < 800 || p.hp >= C.MAX_HP) return;
  if (kind === 'bandage' && p.bandages > 0) { p.bandages--; p.hp = Math.min(C.MAX_HP, p.hp + C.BANDAGE_HEAL); }
  else if (kind === 'medkit' && p.medkits > 0) { p.medkits--; p.hp = Math.min(C.MAX_HP, p.hp + C.MEDKIT_HEAL); }
  else return;
  p.lastHeal = now;
  sendTo(p, inventoryMsg(p));
}

function onState(p, m) {
  const now = Date.now();
  const dt = Math.max(0.03, (now - p.lastState) / 1000);
  p.lastState = now;
  const x = Number(m.x), y = Number(m.y), z = Number(m.z);
  if (![x, y, z].every(isFinite)) return;
  // Light anti-cheat: refuse impossible teleports.
  const maxMove = C.SLIDE_SPEED * dt * 1.6 + 2;
  if (Math.hypot(x - p.x, z - p.z) > maxMove || Math.abs(y - p.y) > 25 * dt + 3) {
    sendTo(p, { t: 'pos', x: p.x, y: p.y, z: p.z });
    return;
  }
  p.x = x; p.y = Math.max(0, y); p.z = z;
  p.ry = Number(m.ry) || 0;
  p.pitch = Number(m.pitch) || 0;
  p.flags = m.f | 0;
  if (p.flags & 4) p.protectUntil = Math.min(p.protectUntil, now + 300); // moving soon ends protection
}

// ---------------------------------------------------------------- tick
const TICK = 50;
setInterval(() => {
  const now = Date.now();
  const dt = TICK / 1000;

  // chests come back
  for (const c of arena.chests) {
    if (c.openUntil && c.openUntil <= now) { c.openUntil = 0; broadcast({ t: 'chest', id: c.id, open: false }); }
  }
  // golden chest
  if (!arena.golden && now >= arena.nextGolden) {
    const spot = world.goldenSpots[Math.floor(Math.random() * world.goldenSpots.length)];
    arena.golden = { x: spot.x, z: spot.z };
    broadcast({ t: 'golden', golden: arena.golden });
  }
  // items expire / get picked up
  for (const it of arena.items.values()) {
    if (now > it.expires) { arena.items.delete(it.id); broadcast({ t: 'item-', id: it.id }); continue; }
    for (const p of arena.players.values()) {
      if (Math.hypot(p.x - it.x, p.z - it.z) > 1.5 || Math.abs(p.y - it.y) > 2) continue;
      let took = false;
      if (it.kind === 'weapon' && !p.weapons.includes(it.weapon) && p.weapons.length < C.MAX_SLOTS) { p.weapons.push(it.weapon); took = true; }
      if (it.kind === 'bandage' && p.bandages < C.MAX_BANDAGES) { p.bandages++; took = true; }
      if (it.kind === 'medkit' && p.medkits < C.MAX_MEDKITS) { p.medkits++; took = true; }
      if (took) {
        arena.items.delete(it.id);
        broadcast({ t: 'item-', id: it.id, by: p.id });
        sendTo(p, { ...inventoryMsg(p), picked: it.kind === 'weapon' ? C.WEAPONS[it.weapon].name : C.HEALS[it.kind].name });
        break;
      }
    }
  }
  // projectiles
  for (const pr of arena.projectiles.values()) {
    const def = C.WEAPONS[pr.kind];
    const steps = 3;
    let boom = false;
    for (let s = 0; s < steps && !boom; s++) {
      const sdt = dt / steps;
      if (pr.kind === 'grenade') pr.vy -= C.GRAVITY * sdt;
      const nx = pr.x + pr.vx * sdt, ny = pr.y + pr.vy * sdt, nz = pr.z + pr.vz * sdt;
      const sp = Math.hypot(pr.vx, pr.vy, pr.vz) * sdt;
      const wall = rayWorld(world, pr.x, pr.y, pr.z, pr.vx * sdt / sp, pr.vy * sdt / sp, pr.vz * sdt / sp, sp);
      if (wall < sp) {
        if (pr.kind === 'grenade') { // bounce
          pr.vx *= -0.4; pr.vz *= -0.4; pr.vy = Math.abs(pr.vy) * 0.35;
          if (ny <= 0.05) { pr.vx *= -1; pr.vz *= -1; pr.y = 0.1; }
          continue;
        }
        boom = true; break;
      }
      pr.x = nx; pr.y = ny; pr.z = nz;
      if (pr.kind === 'rocket') {
        for (const v of arena.players.values()) {
          if (v === pr.owner) continue;
          if (Math.hypot(v.x - pr.x, v.z - pr.z) < 0.7 && pr.y > v.y && pr.y < v.y + C.PLAYER_HEIGHT) { boom = true; break; }
        }
      }
    }
    const age = (now - pr.born) / 1000;
    if (pr.kind === 'grenade' && age >= def.fuse) boom = true;
    if (age > 6) boom = true;
    if (boom) {
      arena.projectiles.delete(pr.id);
      broadcast({ t: 'proj-', id: pr.id });
      explode(pr.x, Math.max(0.3, pr.y), pr.z, def, pr.owner, pr.kind);
    }
  }
  // mines
  for (const m of arena.mines.values()) {
    if (now - m.born > 180000) { arena.mines.delete(m.id); broadcast({ t: 'mine-', id: m.id }); continue; }
    if (now < m.armAt) continue;
    for (const v of arena.players.values()) {
      if (v.id === m.ownerId) continue;
      if (Math.hypot(v.x - m.x, v.z - m.z) < 1.6 && Math.abs(v.y - m.y) < 1.5) {
        arena.mines.delete(m.id);
        broadcast({ t: 'mine-', id: m.id });
        explode(m.x, m.y + 0.3, m.z, C.WEAPONS.mine, m.owner, 'mine');
        break;
      }
    }
  }

  // snapshot: each player only gets players near them
  const list = [...arena.players.values()];
  for (const p of list) {
    const near = [];
    for (const o of list) {
      if (o !== p && Math.hypot(o.x - p.x, o.z - p.z) > 160) continue;
      near.push([o.id, +o.x.toFixed(2), +o.y.toFixed(2), +o.z.toFixed(2), +o.ry.toFixed(2), +o.pitch.toFixed(2), o.flags, o.weapons[o.slot], o.hp, now < o.protectUntil ? 1 : 0]);
    }
    sendTo(p, { t: 'snap', p: near, n: list.length });
  }
}, TICK);

// ---------------------------------------------------------------- sockets
const wss = new WebSocketServer({ server, maxPayload: 4096 });
wss.on('connection', (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  const acc = byToken(token);
  if (!acc) { ws.close(4001, 'login'); return; }
  const conn = { ws, acc, player: null };

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const p = conn.player && arena.players.has(conn.player.id) ? conn.player : null;
    switch (m.t) {
      case 'join': if (!p) joinArena(conn); break;
      case 'leave': if (p) { leaveArena(p, true); conn.player = null; sendTo(conn, { t: 'left' }); } break;
      case 'state': if (p) onState(p, m); break;
      case 'fire': if (p) fire(p, m); break;
      case 'slot': if (p && m.i >= 0 && m.i < p.weapons.length) { p.slot = m.i | 0; sendTo(p, inventoryMsg(p)); } break;
      case 'open': if (p) openChest(p, m.id); break;
      case 'heal': if (p) heal(p, m.kind); break;
    }
  });
  ws.on('close', () => { if (conn.player) leaveArena(conn.player, true); });
});

server.listen(PORT, () => {
  console.log(`Stickman Ruins is running!`);
  console.log(`  On this computer:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  On phones (same Wi-Fi): http://${n.address}:${PORT}`);
  }
});

