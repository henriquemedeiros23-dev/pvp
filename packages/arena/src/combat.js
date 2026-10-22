// Damage, knockouts and firing. Weapon behaviour depends only on the weapon's `type`
// (melee | gun) and its numbers in the rules; shields and effects are in effects.js.

import { rayBoxes, rayCylinder } from '@pvp/collision';
import { droppedDurability } from '@pvp/game-rules';
import { at, send, sendNear, tellServer, weaponDef, heightOf, wearOf } from './state.js';
import { removePlayer, inventoryMsg } from './players.js';
import { dropItem } from './loot.js';
import { strike, isFrozen } from './effects.js';

const round2 = v => +v.toFixed(2);

/**
 * Hurt `victim` (no shield check: use strike() in effects.js for weapon hits).
 * `attacker` is a player object (may have left already) or null; opts.byName names an attacker who left.
 * opts.shock marks a shock tick (for the 'dmg' number).
 * Everyone near the victim (the victim too) gets a 'dmg' with the health lost (#33).
 * Returns true if the damage was done (false: not in the arena, already out, or spawn protection).
 */
export function damage(A, victim, amount, attacker, weapon, kx = 0, kz = 0, opts = {}) {
  if (!A.players.has(victim.id) || victim.hp <= 0) return false;
  if (A.now < victim.protectUntil) return false;
  const before = victim.hp;
  victim.hp = Math.max(0, victim.hp - Math.round(amount));
  if (attacker && A.players.has(attacker.id)) send(A, attacker.id, { t: 'hitmark', dead: victim.hp <= 0 });
  send(A, victim.id, { t: 'hurt', hp: victim.hp, kx, kz, from: attacker ? [attacker.x, attacker.z] : null });
  if (before > victim.hp) {
    const dmg = { t: 'dmg', id: victim.id, amount: before - victim.hp };
    if (victim.hp <= 0) dmg.ko = true;
    if (opts.shock) dmg.shock = true;
    sendNear(A, victim, dmg); // before the knockout, so the victim gets it too
  }
  if (victim.hp <= 0) knockOut(A, victim, attacker, weapon, opts.byName);
  return true;
}

/**
 * Knocked out: drop every weapon (the starting weapon too) and every Healing Potion, leave the arena.
 * A potion being drunk is gone (it was used up when the drinking started).
 * A dropped weapon with more than half its durability keeps it; half or less is set to half
 * (rounded up), see droppedDurability in @pvp/game-rules.
 */
function knockOut(A, victim, attacker, weapon, byName) {
  const spread = A.tune.koDropSpread;
  const lost = [...victim.weapons];
  victim.weapons.forEach((w, i) => {
    dropItem(A, 'weapon', w, victim.x, victim.z, spread, droppedDurability(w, victim.dur[i], A.rules.WEAPONS));
  });
  if (victim.shield) { // the shield drops too, with the same rule
    const { id, dur } = victim.shield;
    lost.push(id);
    dropItem(A, 'weapon', id, victim.x, victim.z, spread, droppedDurability(id, dur, A.rules.WEAPONS));
  }
  for (let i = 0; i < victim.potions; i++) dropItem(A, 'potion', null, victim.x, victim.z, spread);
  victim.drink = null;
  removePlayer(A, victim);
  const by = attacker ? attacker.name : (byName ?? null);
  send(A, 'all', { t: 'ko', id: victim.id, x: victim.x, y: victim.y, z: victim.z, victim: victim.name, by, weapon });
  send(A, victim.id, { t: 'dead', by, weapon });
  tellServer(A, 'knockedOut', { playerId: victim.id, playerKey: victim.key, weapons: lost, by, byId: attacker ? attacker.id : null });
}

// Returns true if the swing hit someone (a player, or a raised shield); a swing at the air returns false.
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
  if (!target) return false;
  const d = best || 1, k = def.knock || T.meleeKnock;
  strike(A, p, target, w, def, ((target.x - p.x) / d) * k, ((target.z - p.z) / d) * k);
  return true;
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
    if (hit) strike(A, p, hit, w, def);
    tracers.push([round2(o.x + sx * dist), round2(o.y + sy * dist), round2(o.z + sz * dist)]);
  }
  send(A, 'all', { t: 'shot', id: p.id, w, from: [round2(o.x), round2(o.y), round2(o.z)], to: tracers });
}

/**
 * Use the weapon in hand, aiming along dir ([x, y, z] or { x, y, z }). Returns true if it fired.
 * Not while frozen, and not while the shield is raised.
 */
export function fire(A, id, dir, now) {
  const p = A.players.get(id);
  if (!p) return false;
  now = at(A, now);
  if (isFrozen(A, p) || p.shieldUp) return false;
  const w = p.weapons[p.slot];
  const def = weaponDef(A, w);
  if (p.drink) return false; // busy drinking a potion (switch slots to stop, the potion is wasted)
  if (!def || now - p.lastFire < def.rate * 1000 * A.tune.fireRateSlack) return false;
  let [dx, dy, dz] = Array.isArray(dir) ? dir.map(Number) : dir ? [dir.x, dir.y, dir.z].map(Number) : [0, 0, 1];
  const len = Math.hypot(dx, dy, dz);
  if (!len || !Number.isFinite(len)) return false;
  p.lastFire = now;
  p.protectUntil = 0; // attacking ends spawn protection
  const d = { x: dx / len, y: dy / len, z: dz / len };
  const o = { x: p.x, y: p.y + heightOf(A, p) - A.tune.muzzleDrop, z: p.z };

  const slot = p.slot;
  let used = true; // a gun shot always wears; a melee swing only when it hits someone (#34)
  switch (def.type) {
    case 'melee': used = melee(A, p, w, def); break;
    case 'gun': gun(A, p, w, def, o, d); break;
    default: return false;
  }
  if (!A.players.has(p.id)) return true; // knocked out by a reflected hit: everything already dropped
  if (used) wear(A, p, slot);
  return true;
}

/**
 * Drop the weapon in your hand (#34) where you stand, with exactly the durability it has (no half rule:
 * that is only for knockouts). Anyone can pick it up; you only after you stepped away from it once.
 * The free starting Gun can be dropped too (it stays free: it never goes into a backpack).
 * Not while frozen. Returns the ground item id, or null if there is nothing in your hand.
 */
export function dropWeapon(A, id, now) {
  const p = A.players.get(id);
  if (!p) return null;
  at(A, now);
  if (isFrozen(A, p) || p.drink || p.slot >= p.weapons.length) return null; // not while drinking a potion
  const slot = p.slot;
  const [weapon] = p.weapons.splice(slot, 1);
  const [dur] = p.dur.splice(slot, 1);
  const [free] = p.free.splice(slot, 1);
  p.slot = Math.max(0, Math.min(slot, p.weapons.length - 1));
  const it = dropItem(A, 'weapon', weapon, p.x, p.z, A.tune.dropSpread, dur);
  it.ignore = p.id; // not picked straight back up by the one who dropped it
  if (free) it.free = true;
  send(A, p.id, inventoryMsg(p));
  return it.id;
}

/** One use of the weapon in `slot`: lose wearPerUse durability; at 0 it breaks and is gone. */
function wear(A, p, slot) {
  const left = p.dur[slot];
  if (left === null || left === undefined) return; // never breaks
  p.dur[slot] = Math.max(0, left - wearOf(A, p.weapons[slot]));
  if (p.dur[slot] === 0) {
    const [weapon] = p.weapons.splice(slot, 1);
    p.dur.splice(slot, 1);
    p.free.splice(slot, 1);
    p.slot = Math.max(0, Math.min(p.slot, p.weapons.length - 1)); // same slot number, or the last one
    send(A, p.id, { t: 'broke', slot, weapon });
  }
  send(A, p.id, inventoryMsg(p)); // so the durability bar is always right
}
