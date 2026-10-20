// What a player gets to see: the welcome message and the per-tick snapshot.

import { itemMsg } from './loot.js';
import { mineMsg } from './mines.js';
import { playerInfo } from './players.js';

const round2 = v => +v.toFixed(2);

/** The 'welcome' message for a player in the arena, or null. */
export function welcomeFor(A, id) {
  const p = A.players.get(id);
  if (!p) return null;
  return {
    t: 'welcome', id: p.id, x: p.x, z: p.z,
    players: [...A.players.values()].map(playerInfo),
    chests: A.chests.filter(c => c.openUntil > A.now).map(c => c.id),
    golden: A.golden ? { ...A.golden } : null,
    items: [...A.items.values()].map(itemMsg),
    mines: [...A.mines.values()].map(mineMsg),
  };
}

/** The 'snap' message for a player: everyone within snapshotRadius (and the player), or null. */
export function snapshotFor(A, id) {
  const p = A.players.get(id);
  if (!p) return null;
  const near = [];
  for (const o of A.players.values()) {
    if (o !== p && Math.hypot(o.x - p.x, o.z - p.z) > A.tune.snapshotRadius) continue;
    near.push([o.id, round2(o.x), round2(o.y), round2(o.z), round2(o.ry), round2(o.pitch), o.flags, o.weapons[o.slot], o.hp, A.now < o.protectUntil ? 1 : 0]);
  }
  return { t: 'snap', p: near, n: A.players.size };
}
