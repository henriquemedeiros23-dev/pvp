// Chests in fixed spots (back after CHEST_RESPAWN_MS) and the golden chest.

import { at, send, tellServer, randInt, randPick } from './state.js';
import { dropItem, rollLoot } from './loot.js';

function giveCoins(A, p, amount) {
  p.coins += amount;
  send(A, p.id, { t: 'coins', amount, total: p.coins });
  tellServer(A, 'coins', { playerId: p.id, playerKey: p.key, amount, total: p.coins });
}

/** Open chest `which` (a chest index, or 'golden'). Returns true if it opened. */
export function openChest(A, id, which, now) {
  const p = A.players.get(id);
  if (!p) return false;
  now = at(A, now);
  const T = A.tune;

  if (which === 'golden') {
    const g = A.golden;
    if (!g || Math.hypot(g.x - p.x, g.z - p.z) > T.openDistance) return false;
    A.golden = null;
    A.nextGolden = now + A.rules.GOLDEN_CHEST_EVERY_MS;
    giveCoins(A, p, randInt(A.rnd.loot, T.goldenCoins[0], T.goldenCoins[1]));
    const legends = A.rules.LOOT_TABLE.legendary ?? [];
    if (legends.length) dropItem(A, 'weapon', randPick(A.rnd.loot, legends), g.x, g.z);
    dropItem(A, 'medkit', null, g.x, g.z);
    send(A, 'all', { t: 'golden', golden: null, by: p.name });
    return true;
  }

  const c = Number.isInteger(which) ? A.chests[which] : undefined;
  if (!c || c.openUntil > now || Math.hypot(c.x - p.x, c.z - p.z) > T.openDistance) return false;
  c.openUntil = now + A.rules.CHEST_RESPAWN_MS;
  giveCoins(A, p, randInt(A.rnd.loot, T.chestCoins[0], T.chestCoins[1]));
  rollLoot(A, c.x, c.z);
  send(A, 'all', { t: 'chest', id: c.id, open: true });
  return true;
}

export function tickChests(A, now) {
  for (const c of A.chests) {
    if (c.openUntil && c.openUntil <= now) { c.openUntil = 0; send(A, 'all', { t: 'chest', id: c.id, open: false }); }
  }
  const spots = A.island.goldenSpots ?? [];
  if (!A.golden && now >= A.nextGolden && spots.length) {
    const spot = randPick(A.rnd.golden, spots);
    A.golden = { x: spot.x, z: spot.z };
    send(A, 'all', { t: 'golden', golden: { ...A.golden } });
  }
}
