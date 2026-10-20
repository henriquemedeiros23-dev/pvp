// Mines (type 'mine'): placed at your feet, arm after a moment, blow up when an enemy steps close.

import { send, weaponDef } from './state.js';
import { explode } from './combat.js';

export const mineMsg = m => ({ id: m.id, x: m.x, z: m.z, owner: m.ownerId });

export function placeMine(A, p, w, def, now) {
  const mine = [...A.mines.values()].filter(m => m.ownerId === p.id);
  if (mine.length >= (def.maxActive || Infinity)) {
    A.mines.delete(mine[0].id);
    send(A, 'all', { t: 'mine-', id: mine[0].id });
  }
  const m = { id: A.newId(), kind: w, x: p.x, y: p.y, z: p.z, ownerId: p.id, owner: p, armAt: now + A.tune.mineArmMs, born: now };
  A.mines.set(m.id, m);
  send(A, 'all', { t: 'mine+', id: m.id, x: m.x, y: m.y, z: m.z, owner: p.id });
}

export function tickMines(A, now) {
  const T = A.tune;
  for (const m of A.mines.values()) {
    if (now - m.born > T.mineLifeMs) { A.mines.delete(m.id); send(A, 'all', { t: 'mine-', id: m.id }); continue; }
    if (now < m.armAt) continue;
    for (const v of A.players.values()) {
      if (v.id === m.ownerId) continue;
      if (Math.hypot(v.x - m.x, v.z - m.z) < T.mineTriggerRadius && Math.abs(v.y - m.y) < T.mineTriggerHeight) {
        A.mines.delete(m.id);
        send(A, 'all', { t: 'mine-', id: m.id });
        const def = weaponDef(A, m.kind);
        if (def) explode(A, m.x, m.y + T.mineBlastLift, m.z, def, m.owner, m.kind);
        break;
      }
    }
  }
}
