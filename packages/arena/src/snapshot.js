// What a player gets to see: the welcome message and the per-tick snapshot.

import { itemMsg } from './loot.js';
import { playerInfo } from './players.js';
import { isFrozen } from './effects.js';
import { bombMsg } from './bombs.js';
import { shownFlags } from './aim.js';

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
    // bombs in the air or on the ground that have not exploded yet (#32), same fields as the 'bomb' message
    bombs: [...A.bombs.values()].map(b => { const { t, ...m } = bombMsg(A, b); return m; }),
  };
}

/** The 'snap' message for a player: everyone within snapshotRadius (and the player), or null. */
export function snapshotFor(A, id) {
  const p = A.players.get(id);
  if (!p) return null;
  const near = [];
  for (const o of A.players.values()) {
    if (o !== p && Math.hypot(o.x - p.x, o.z - p.z) > A.tune.snapshotRadius) continue;
    // status bits (see @pvp/net-protocol STATUS_*): 1 shield up, 2 shocked, 4 frozen
    const status = (o.shieldUp ? 1 : 0) | (o.shock ? 2 : 0) | (isFrozen(A, o) ? 4 : 0);
    near.push([o.id, round2(o.x), round2(o.y), round2(o.z), round2(o.ry), round2(o.pitch), shownFlags(A, o), o.weapons[o.slot] ?? '',
      o.hp, A.now < o.protectUntil ? 1 : 0, o.shield ? o.shield.id : '', status]);
  }
  return { t: 'snap', p: near, n: A.players.size };
}
