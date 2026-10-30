#!/usr/bin/env node
// Load check (#52): can one server run a full island? Joins N fake players (default 125, the MAX_PLAYERS
// rule) to the real @pvp/arena on the real island, lets them walk around, shoot and open chests for a few
// seconds of game time, and measures what the server does every tick (arena.tick + turning every queued
// message into JSON, like apps/game/server.js does).
//
//   npm run load-check                    # 125 players, 10 s of game time, 20 ticks a second
//   npm run load-check -- --players 200 --seconds 20 --json
//
// Game time is simulated (seeded, passed in), so the game part is the same every run; only the
// measured milliseconds depend on the computer.
import { performance } from 'node:perf_hooks';
import { RULES } from '@pvp/game-rules';
import { generateIsland, findSpawn } from '@pvp/world-gen';
import { createArena } from '@pvp/arena';
import { createRandom } from '@pvp/seeded-random';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};

/** Run the load check. Returns the numbers (also used by the test in apps/game/test/load-check.test.js). */
export function loadCheck({ players = RULES.MAX_PLAYERS, seconds = 10, tickMs = 50, seed = 'load-check' } = {}) {
  const island = generateIsland();
  const random = createRandom(seed);
  const rnd = () => random.next();
  const arena = createArena({ island, rules: { ...RULES, MAX_PLAYERS: Math.max(players, RULES.MAX_PLAYERS) }, random: createRandom(seed + '-arena'), now: 0 });
  let now = 1000;

  const bots = [];
  for (let i = 0; i < players; i++) {
    const r = arena.join(`bot${i}`, { name: `Bot${i}`, skin: { color: 'red' }, loadout: [], coins: 0 }, now);
    if (!r.ok) throw new Error(`player ${i} could not join: ${r.reason}`);
    const p = arena.getPlayer(r.id);
    bots.push({ id: r.id, x: p.x, y: p.y, z: p.z, dir: rnd() * Math.PI * 2 });
  }
  arena.drain(); // welcome messages are a one-time cost

  // How spread out the spawns are: distance from each player to the closest other player.
  const nearest = bots.map(b => Math.min(...bots.filter(o => o !== b).map(o => Math.hypot(o.x - b.x, o.z - b.z))));
  nearest.sort((a, b) => a - b);

  const bytesTo = new Map(bots.map(b => [b.id, 0]));
  const tickTimes = [];
  const ticks = Math.round((seconds * 1000) / tickMs);
  const chests = island.chests;
  for (let t = 0; t < ticks; t++) {
    now += tickMs;
    const start = performance.now();
    // every player sends its position (the game sends it 20 times a second), sometimes shoots or opens a chest
    for (const b of bots) {
      if (!arena.hasPlayer(b.id)) continue;
      if (rnd() < 0.02) b.dir = rnd() * Math.PI * 2;
      const step = RULES.RUN_SPEED * (tickMs / 1000);
      let nx = b.x + Math.cos(b.dir) * step, nz = b.z + Math.sin(b.dir) * step;
      if (Math.hypot(nx, nz) > island.playRadius - 5) { b.dir += Math.PI; nx = b.x; nz = b.z; }
      b.x = nx; b.z = nz;
      arena.setState(b.id, { x: b.x, y: 0, z: b.z, ry: b.dir, pitch: 0, f: 4 }, now);
      if (rnd() < 0.05) arena.fire(b.id, [Math.cos(b.dir), 0, Math.sin(b.dir)], now);
      if (rnd() < 0.01) arena.openChest(b.id, chests[Math.floor(rnd() * chests.length)].id, now);
    }
    arena.tick(now);
    for (const ev of arena.drain()) {
      if (ev.to === 'server') continue;
      const size = Buffer.byteLength(JSON.stringify(ev.msg));
      const to = ev.to === 'all' ? arena.playerIds().filter(id => id !== ev.except) : Array.isArray(ev.to) ? ev.to : [ev.to];
      for (const id of to) if (bytesTo.has(id)) bytesTo.set(id, bytesTo.get(id) + size);
    }
    tickTimes.push(performance.now() - start);
  }

  tickTimes.sort((a, b) => a - b);
  const pct = (list, q) => list[Math.min(list.length - 1, Math.floor(q * list.length))];
  const perPlayer = [...bytesTo.values()].map(b => b / seconds).sort((a, b) => a - b);
  const avg = list => list.reduce((s, v) => s + v, 0) / list.length;
  const area = Math.PI * island.playRadius ** 2;
  return {
    players,
    seconds,
    tickMs,
    stillIn: arena.playerCount(),
    tick: { avgMs: avg(tickTimes), p95Ms: pct(tickTimes, 0.95), maxMs: tickTimes.at(-1), budgetMs: tickMs, busyPercent: (avg(tickTimes) / tickMs) * 100 },
    bytesPerPlayerPerSecond: { avg: avg(perPlayer), p95: pct(perPlayer, 0.95), max: perPlayer.at(-1) },
    totalOutKBps: perPlayer.reduce((s, v) => s + v, 0) / 1024,
    island: {
      playRadius: island.playRadius,
      areaPerPlayerM2: area / players,
      chests: chests.length,
      chestsPerPlayer: chests.length / players,
      spawnNearestOtherM: { min: nearest[0], median: pct(nearest, 0.5) },
      // how many players fit with the spawn rule (25 m apart) before it has to give up the distance
      spawnSpotsAt25m: countSpawnSpots(island, seed),
    },
  };
}

// Place players one by one with findSpawn's 25 m rule until a spot breaks it: how many fit?
function countSpawnSpots(island, seed) {
  const r = createRandom(seed + '-spots');
  const placed = [];
  for (let i = 0; i < 1000; i++) {
    const s = findSpawn(island, placed, r);
    if (placed.some(o => Math.hypot(o.x - s.x, o.z - s.z) < 25)) return placed.length;
    placed.push(s);
  }
  return placed.length;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const r = loadCheck({ players: arg('players', RULES.MAX_PLAYERS), seconds: arg('seconds', 10), tickMs: arg('tick', 50) });
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    const f = n => n.toFixed(1);
    console.log(`Load check: ${r.players} players, ${r.seconds} s of game time, a tick every ${r.tickMs} ms (${r.stillIn} still in at the end)`);
    console.log(`  Tick time:   avg ${f(r.tick.avgMs)} ms, 95% under ${f(r.tick.p95Ms)} ms, worst ${f(r.tick.maxMs)} ms (budget ${r.tickMs} ms, ${f(r.tick.busyPercent)}% busy)`);
    console.log(`  Sent:        ${f(r.bytesPerPlayerPerSecond.avg / 1024)} KB/s per player on average (95%: ${f(r.bytesPerPlayerPerSecond.p95 / 1024)}, max ${f(r.bytesPerPlayerPerSecond.max / 1024)}), ${f(r.totalOutKBps / 1024)} MB/s in total`);
    console.log(`  Island:      ${r.island.chests} chests (${r.island.chestsPerPlayer.toFixed(2)} per player), ${Math.round(r.island.areaPerPlayerM2)} m² per player, ${r.island.spawnSpotsAt25m} spawn spots 25 m apart`);
    console.log(`  Spawns:      closest other player ${f(r.island.spawnNearestOtherM.min)} m at worst, ${f(r.island.spawnNearestOtherM.median)} m for half of them`);
  }
}
