// Thrown things (type 'throw': gravity, bounce, fuse) and rockets (type 'rocket': fly straight, hit players).

import { rayBoxes } from '@pvp/collision';
import { send, weaponDef } from './state.js';
import { explode } from './combat.js';

export function launchProjectile(A, p, w, def, o, d, now) {
  const T = A.tune, off = T.launchOffset;
  const pr = {
    id: A.newId(), kind: w, type: def.type, owner: p,
    x: o.x + d.x * off, y: o.y + d.y * off, z: o.z + d.z * off,
    vx: d.x * def.speed, vy: d.y * def.speed + (def.type === 'throw' ? T.throwLift : 0), vz: d.z * def.speed,
    born: now,
  };
  A.projectiles.set(pr.id, pr);
  send(A, 'all', { t: 'proj', id: pr.id, kind: w, x: pr.x, y: pr.y, z: pr.z, vx: pr.vx, vy: pr.vy, vz: pr.vz });
}

// Move one step. Returns true if it should explode now.
function step(A, pr, sdt) {
  const T = A.tune, thrown = pr.type === 'throw';
  if (thrown) pr.vy -= A.rules.GRAVITY * sdt;
  const sp = Math.hypot(pr.vx, pr.vy, pr.vz) * sdt;
  if (!(sp > 0)) return false;
  const nx = pr.x + pr.vx * sdt, ny = pr.y + pr.vy * sdt, nz = pr.z + pr.vz * sdt;
  const dir = { x: pr.vx * sdt / sp, y: pr.vy * sdt / sp, z: pr.vz * sdt / sp };
  const wall = rayBoxes(A.island.grid, pr, dir, sp);
  if (wall < sp) {
    if (!thrown) return true;
    // bounce
    pr.vx *= -T.bounceKeep; pr.vz *= -T.bounceKeep; pr.vy = Math.abs(pr.vy) * T.bounceUp;
    if (ny <= 0.05) { pr.vx *= -1; pr.vz *= -1; pr.y = 0.1; }
    return false;
  }
  pr.x = nx; pr.y = ny; pr.z = nz;
  if (pr.type === 'rocket') {
    for (const v of A.players.values()) {
      if (v.id === pr.owner.id) continue;
      if (Math.hypot(v.x - pr.x, v.z - pr.z) < T.rocketHitRadius && pr.y > v.y && pr.y < v.y + A.rules.PLAYER_HEIGHT) return true;
    }
  }
  return false;
}

export function tickProjectiles(A, now, dt) {
  const T = A.tune;
  const steps = dt > 0 ? Math.max(1, Math.ceil(dt / T.projectileStepS - 1e-9)) : 0;
  for (const pr of A.projectiles.values()) {
    const def = weaponDef(A, pr.kind);
    let boom = !def;
    for (let s = 0; s < steps && !boom; s++) boom = step(A, pr, dt / steps);
    const age = (now - pr.born) / 1000;
    if (def && Number.isFinite(def.fuse) && age >= def.fuse) boom = true;
    if (age > T.projectileMaxAgeS) boom = true;
    if (!boom) continue;
    A.projectiles.delete(pr.id);
    send(A, 'all', { t: 'proj-', id: pr.id });
    if (def) explode(A, pr.x, Math.max(0.3, pr.y), pr.z, def, pr.owner, pr.kind);
  }
}
