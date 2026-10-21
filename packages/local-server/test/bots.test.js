import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeServerMessage, encodeClient } from '@pvp/net-protocol';
import { generateIsland } from '@pvp/world-gen';
import { createArena } from '@pvp/arena';
import { createRandom } from '@pvp/seeded-random';
import { RULES } from '@pvp/game-rules';
import { createLocalServer, createBots } from '../src/index.js';

const settle = () => new Promise(r => setTimeout(r, 0));
const island = generateIsland();

function botWorld(seed) {
  const arena = createArena({ island, rules: RULES, random: createRandom(seed), now: 0 });
  const bots = createBots({ arena, island, random: createRandom(`${seed}:bots`), count: 3 });
  let t = 0;
  const events = [];
  const run = ms => { for (let i = 0; i < ms / 50; i++) { t += 50; bots.tick(t); arena.tick(t); events.push(...arena.drain()); } };
  return { arena, bots, run, events, now: () => t };
}

test('bots join as Bot 1..3, walk around and are deterministic for a seed', () => {
  const a = botWorld('s1'), b = botWorld('s1');
  a.run(50); b.run(50);
  const names = a.bots.ids().map(id => a.arena.getPlayer(id).name);
  assert.deepEqual(names, ['Bot 1', 'Bot 2', 'Bot 3']);
  const start = a.bots.ids().map(id => a.arena.getPlayer(id));
  a.run(10000); b.run(10000);
  const pos = w => w.bots.ids().map(id => { const p = w.arena.getPlayer(id); return [p.x, p.z]; });
  assert.deepEqual(pos(a), pos(b), 'same seed, same moves');
  const moved = pos(a).map(([x, z], i) => Math.hypot(x - start[i].x, z - start[i].z));
  assert.ok(moved.every(d => d > 5), `every bot walked: ${moved}`);
  const c = botWorld('another seed'); c.run(10050);
  assert.notDeepEqual(pos(c), pos(a));
});

test('bots open chests over time', () => {
  const w = botWorld('chesty');
  w.run(90000);
  const opened = w.events.filter(e => e.to === 'server' && e.kind === 'coins');
  assert.ok(opened.length > 0, 'a bot opened a chest');
});

test('bots sometimes shoot at a real player nearby, and come back after a knockout', async () => {
  let t = 1000;
  const server = createLocalServer({ seed: 'shooty', autoStart: false, now: () => t, bots: 3, randomBytes: n => new Uint8Array(n).fill(9) });
  const api = server.createApi();
  const { token } = await api.signup('Target', 'secret');
  server.tick(t);
  const ws = server.connect(token);
  const got = [];
  ws.onmessage = e => { const r = decodeServerMessage(e.data); assert.ok(r.ok, r.error); got.push(r.msg); };
  await settle();
  ws.send(encodeClient('join'));
  await settle();
  const bots = server.bots.ids();
  assert.equal(bots.length, 3);
  assert.equal(server.arena.playerCount(), 4);
  // stand right next to Bot 1, and keep standing there
  let shot = false;
  for (let i = 0; i < 400 && !shot; i++) {
    const b = server.arena.getPlayer(server.bots.ids()[0]);
    if (i % 20 === 0) server.teleport(token, b.x + 4, b.z);
    t += 50; server.tick(t);
    await settle();
    shot = got.some(m => m.t === 'shot' && bots.includes(m.id));
  }
  assert.ok(shot, 'a bot shot at the player');

  // knock Bot 2 out: it leaves, then comes back
  const id = bots[1];
  server.arena.leave(id, { alive: false });
  t += 50; server.tick(t);
  assert.ok(!server.bots.ids().includes(id));
  for (let i = 0; i < 140; i++) { t += 50; server.tick(t); }
  assert.equal(server.bots.ids().length, 3);
});
