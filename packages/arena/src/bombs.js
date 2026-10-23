// Bombs (#32): thrown, they fly to where the player aims (at most the bomb's maxThrow meters away),
// land, and explode fuseMs after the throw. Everyone inside the square area gets the bomb's damage
// (the normal damage path: spawn protection counts, a raised shield does NOT block an area hit).
// A bomb with hurtsThrower: false never hurts its thrower. Everything comes from the rules' BOMBS
// and the time passed in.

import { rayBoxes, circleHitsBox } from '@pvp/collision';
import { inBombArea } from '@pvp/game-rules';
import { at, send, heightOf, bombTable, bombDef } from './state.js';
import { inventoryMsg } from './players.js';
import { damage } from './combat.js';
import { isFrozen } from './effects.js';

const round2 = v => +v.toFixed(2);
const AIM_RAY = 100; // how far the aim ray looks for the ground or a wall (m)


/** The highest standing surface at (x, z) that is not above `limit` (0 = the ground). */
function surfaceAt(A, x, z, limit = Infinity) {
  let y = 0;
  for (const b of A.island.grid.near(x, z, 0.3)) {
    const top = b.y + b.h;
    if (top <= limit + 1e-6 && circleHitsBox(x, z, 0.05, b)) y = Math.max(y, top);
  }
  return y;
}

/**
 * Where a bomb thrown from `from` along the unit aim `d` lands: where the aim ray first meets the ground,
 * a roof or a wall (then at the foot of the wall), but never farther than def.maxThrow (measured flat):
 * past that it lands at maxThrow in the aim's direction. Pure in the arena's state. Returns { x, y, z }.
 */
export function bombLanding(A, p, def, from, d) {
  const flat = Math.hypot(d.x, d.z);
  // aiming straight up or down: the bomb goes the way the player faces
  const ux = flat > 1e-6 ? d.x / flat : Math.sin(p.ry), uz = flat > 1e-6 ? d.z / flat : Math.cos(p.ry);
  const t = rayBoxes(A.island.grid, from, d, AIM_RAY);
  // past maxThrow it lands on the ground or something low there, never on top of a tall tower
  let dist = def.maxThrow, limit = from.y + 0.5;
  if (Number.isFinite(t)) {
    const hx = from.x + d.x * t, hy = from.y + d.y * t, hz = from.z + d.z * t;
    const hd = Math.hypot(hx - p.x, hz - p.z);
    if (hd <= def.maxThrow) {
      // on the ground or on top of something: right there; on the side of a wall: at its foot
      const onTop = hy < 0.05 || Math.abs(surfaceAt(A, hx, hz, hy + 0.05) - hy) < 0.05;
      dist = onTop ? hd : Math.max(0, hd - A.tune.bombWallBack);
      limit = hy + 0.05;
    }
  }
  const x = p.x + ux * dist, z = p.z + uz * dist;
  return { x: round2(x), y: round2(surfaceAt(A, x, z, limit)), z: round2(z) };
}

/** The 'bomb' message for a live bomb (fly and ms are what is left from now). */
export function bombMsg(A, b) {
  const def = bombDef(A, b.b);
  return {
    t: 'bomb', id: b.id, by: b.by, b: b.b,
    from: [b.from.x, b.from.y, b.from.z], to: [b.to.x, b.to.y, b.to.z],
    fly: Math.max(0, b.landAt - A.now), ms: Math.max(0, b.explodeAt - A.now), area: def ? def.area : 0,
  };
}

/**
 * Throw one bomb of kind `bombId` along `dir` ([x, y, z] or { x, y, z }). Returns the live bomb's id,
 * or null if refused: unknown bomb, none left, frozen, shield raised, drinking, or too soon after the
 * last throw (tuning bombThrowCooldownMs). Throwing ends spawn protection, like attacking.
 */
export function throwBomb(A, id, bombId, dir, now) {
  const p = A.players.get(id);
  if (!p) return null;
  now = at(A, now);
  const def = bombDef(A, bombId);
  if (!def || !(p.bombs[bombId] > 0)) return null;
  if (isFrozen(A, p) || p.shieldUp || p.drink) return null;
  if (now - p.lastThrow < A.tune.bombThrowCooldownMs) return null;
  const [dx, dy, dz] = Array.isArray(dir) ? dir.map(Number) : dir ? [dir.x, dir.y, dir.z].map(Number) : [0, 0, 1];
  const len = Math.hypot(dx, dy, dz);
  if (!len || !Number.isFinite(len)) return null;
  const d = { x: dx / len, y: dy / len, z: dz / len };

  p.lastThrow = now;
  p.protectUntil = 0;
  p.bombs[bombId]--;
  const from = { x: round2(p.x), y: round2(p.y + heightOf(A, p) - A.tune.muzzleDrop), z: round2(p.z) };
  const to = bombLanding(A, p, def, from, d);
  const flat = Math.hypot(to.x - p.x, to.z - p.z);
  const fly = Math.min(def.fuseMs, Math.round(A.tune.bombFlyMs + A.tune.bombFlyMsPerM * flat));
  const b = {
    id: A.newId(), b: bombId, by: p.id, byName: p.name, from, to,
    throwAt: now, landAt: now + fly, explodeAt: now + def.fuseMs,
  };
  A.bombs.set(b.id, b);
  send(A, 'all', bombMsg(A, b));
  send(A, p.id, inventoryMsg(A, p));
  return b.id;
}

/** Explode every bomb whose time has come (oldest first). */
export function tickBombs(A, now) {
  for (const b of [...A.bombs.values()]) {
    if (now < b.explodeAt) continue;
    A.bombs.delete(b.id);
    explode(A, b);
  }
}

// Boom: everyone inside the square (and not too far above or below it) is hurt, pushed away from the middle.
function explode(A, b) {
  const def = bombDef(A, b.b);
  if (!def) return;
  const T = A.tune;
  send(A, 'all', { t: 'boom', id: b.id, b: b.b, x: b.to.x, y: b.to.y, z: b.to.z, area: def.area });
  const thrower = A.players.get(b.by) ?? null;
  for (const p of [...A.players.values()]) {
    if (!A.players.has(p.id)) continue; // knocked out by this same bomb's earlier victims? (cannot, but safe)
    if (!inBombArea(b.b, b.to.x, b.to.z, p.x, p.z, bombTable(A))) continue;
    if (Math.abs(p.y - b.to.y) > T.bombHitHeight) continue;
    const self = p.id === b.by;
    if (self && !def.hurtsThrower) continue;
    const ox = p.x - b.to.x, oz = p.z - b.to.z, d = Math.hypot(ox, oz);
    const kx = d > 1e-6 ? (ox / d) * T.bombKnock : 0, kz = d > 1e-6 ? (oz / d) * T.bombKnock : 0;
    // your own bomb: nobody gets the credit; someone else's: the thrower (also after leaving)
    const attacker = self ? null : thrower;
    damage(A, p, def.dmg, attacker, b.b, round2(kx), round2(kz), { byName: self ? null : b.byName });
  }
}
