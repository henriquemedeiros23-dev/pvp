// Damage, knockouts, explosions and firing. Weapon behaviour depends only on the
// weapon's `type` (melee | gun | throw | rocket | mine) and its numbers in the rules.

import { rayBoxes, rayCylinder } from '@pvp/collision';
import { at, send, tellServer, weaponDef, heightOf } from './state.js';
import { removePlayer } from './players.js';
import { dropItem } from './loot.js';
import { launchProjectile } from './projectiles.js';
import { placeMine } from './mines.js';

const round2 = v => +v.toFixed(2);

/** Hurt `victim`. `attacker` is a player object (may have left already) or null. */
export function damage(A, victim, amount, attacker, weapon, kx = 0, kz = 0) {
  if (!A.players.has(victim.id) || victim.hp <= 0) return;
  if (A.now < victim.protectUntil) return;
  victim.hp = Math.max(0, victim.hp - Math.round(amount));
  if (attacker) send(A, attacker.id, { t: 'hitmark', dead: victim.hp <= 0 });
  send(A, victim.id, { t: 'hurt', hp: victim.hp, kx, kz, from: attacker ? [attacker.x, attacker.z] : null });
  if (victim.hp > 0) return;
  knockOut(A, victim, attacker, weapon);
}

/** Knocked out: drop everything except the basic weapon, leave the arena. */
function knockOut(A, victim, attacker, weapon) {
  const R = A.rules, spread = A.tune.koDropSpread;
  const lost = victim.weapons.filter(w => w !== R.BASIC_WEAPON);
  for (const w of lost) dropItem(A, 'weapon', w, victim.x, victim.z, spread);
  if (victim.medkits) dropItem(A, 'medkit', null, victim.x, victim.z, spread);
  if (victim.bandages) dropItem(A, 'bandage', null, victim.x, victim.z, spread);
  removePlayer(A, victim);
  const by = attacker ? attacker.name : null;
  send(A, 'all', { t: 'ko', id: victim.id, x: victim.x, y: victim.y, z: victim.z, victim: victim.name, by, weapon });
  send(A, victim.id, { t: 'dead', by, weapon });
  tellServer(A, 'knockedOut', { playerId: victim.id, playerKey: victim.key, weapons: lost, by, byId: attacker ? attacker.id : null });
}

/** Explosion with damage falling off from the center. The owner is never hurt. */
export function explode(A, x, y, z, def, owner, weapon) {
  const T = A.tune;
  send(A, 'all', { t: 'boom', x, y, z, r: def.radius });
  for (const v of [...A.players.values()]) {
    if (owner && v.id === owner.id) continue; // no self damage
    const d = Math.hypot(v.x - x, v.y + 0.9 - y, v.z - z);
    if (d > def.radius) continue;
    const f = 1 - (d / def.radius) * T.explosionFalloff;
    const len = Math.hypot(v.x - x, v.z - z) || 1;
    damage(A, v, def.dmg * f, owner, weapon, ((v.x - x) / len) * T.explosionKnock, ((v.z - z) / len) * T.explosionKnock);
  }
}

function melee(A, p, w, def) {
  const T = A.tune;
  send(A, 'all', { t: 'swing', id: p.id });
  let target = null, best = def.range;
  const fx = Math.sin(p.ry), fz = Math.cos(p.ry);
  for (const v of A.players.values()) {
    if (v === p) continue;
    const vx = v.x - p.x, vz = v.z - p.z, d = Math.hypot(vx, vz);
    if (d > best || Math.abs(v.y - p.y) > T.meleeMaxHeightDiff) continue;
    if (d > T.meleeCloseRange && (vx * fx + vz * fz) / d < T.meleeFrontDot) continue; // must be in front
    best = d; target = v;
  }
  if (!target) return;
  const d = best || 1, k = def.knock || T.meleeKnock;
  damage(A, target, def.dmg, p, w, ((target.x - p.x) / d) * k, ((target.z - p.z) / d) * k);
}

function gun(A, p, w, def, o, dir) {
  const R = A.rules, r = A.rnd.combat, spread = def.spread || 0;
  const radius = R.PLAYER_RADIUS + A.tune.hitRadiusExtra;
  const tracers = [];
  for (let i = 0; i < (def.pellets || 1); i++) {
    let sx = dir.x + (r.next() - 0.5) * 2 * spread;
    let sy = dir.y + (r.next() - 0.5) * 2 * spread;
    let sz = dir.z + (r.next() - 0.5) * 2 * spread;
    const l = Math.hypot(sx, sy, sz) || 1; sx /= l; sy /= l; sz /= l;
    const sd = { x: sx, y: sy, z: sz };
    let dist = Math.min(def.range, rayBoxes(A.island.grid, o, sd, def.range));
    let hit = null;
    for (const v of A.players.values()) {
      if (v === p) continue;
      const t = rayCylinder(o, sd, { x: v.x, y: v.y, z: v.z, height: heightOf(A, v), radius });
      if (t < dist) { dist = t; hit = v; }
    }
    if (hit) damage(A, hit, def.dmg, p, w);
    tracers.push([round2(o.x + sx * dist), round2(o.y + sy * dist), round2(o.z + sz * dist)]);
  }
  send(A, 'all', { t: 'shot', id: p.id, w, from: [round2(o.x), round2(o.y), round2(o.z)], to: tracers });
}

/** Use the weapon in hand, aiming along dir ([x, y, z] or { x, y, z }). Returns true if it fired. */
export function fire(A, id, dir, now) {
  const p = A.players.get(id);
  if (!p) return false;
  now = at(A, now);
  const w = p.weapons[p.slot];
  const def = weaponDef(A, w);
  if (!def || now - p.lastFire < def.rate * 1000 * A.tune.fireRateSlack) return false;
  let [dx, dy, dz] = Array.isArray(dir) ? dir.map(Number) : dir ? [dir.x, dir.y, dir.z].map(Number) : [0, 0, 1];
  const len = Math.hypot(dx, dy, dz);
  if (!len || !Number.isFinite(len)) return false;
  p.lastFire = now;
  p.protectUntil = 0; // attacking ends spawn protection
  const d = { x: dx / len, y: dy / len, z: dz / len };
  const o = { x: p.x, y: p.y + heightOf(A, p) - A.tune.muzzleDrop, z: p.z };

  switch (def.type) {
    case 'melee': melee(A, p, w, def); return true;
    case 'gun': gun(A, p, w, def, o, d); return true;
    case 'throw':
    case 'rocket': launchProjectile(A, p, w, def, o, d, now); return true;
    case 'mine': placeMine(A, p, w, def, now); return true;
    default: return false;
  }
}
