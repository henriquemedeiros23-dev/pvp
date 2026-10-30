// Damage, knockouts and firing. Weapon behaviour depends only on the weapon's `type`
// (melee | gun) and its numbers in the rules; shields and effects are in effects.js.

import { rayBoxes, rayCylinderHit } from '@pvp/collision';
import { droppedDurability, isHeadshot } from '@pvp/game-rules';
import { at, send, sendNear, tellServer, weaponDef, heightOf, wearOf, chargeLeft, minFireGap, headZone } from './state.js';
import { removePlayer, inventoryMsg } from './players.js';
import { dropItem } from './loot.js';
import { strike, isFrozen } from './effects.js';
import { aimState } from './aim.js';

const round2 = v => +v.toFixed(2);

/**
 * Hurt `victim` (no shield check: use strike() in effects.js for weapon hits).
 * `attacker` is a player object (may have left already) or null; opts.byName / opts.byKey name an attacker who left.
 * opts.shock marks a shock tick (for the 'dmg' number); opts.head a gun headshot (#45: 'dmg' and 'hitmark' get head: true).
 * Everyone near the victim (the victim too) gets a 'dmg' with the health lost (#33).
 * Returns true if the damage was done (false: not in the arena, already out, or spawn protection).
 */
export function damage(A, victim, amount, attacker, weapon, kx = 0, kz = 0, opts = {}) {
  if (!A.players.has(victim.id) || victim.hp <= 0) return false;
  if (A.now < victim.protectUntil) return false;
  const before = victim.hp;
  victim.hp = Math.max(0, victim.hp - Math.round(amount));
  if (attacker && A.players.has(attacker.id)) {
    const mark = { t: 'hitmark', dead: victim.hp <= 0 };
    if (opts.head) mark.head = true;
    send(A, attacker.id, mark);
  }
  send(A, victim.id, { t: 'hurt', hp: victim.hp, kx, kz, from: attacker ? [attacker.x, attacker.z] : null });
  if (before > victim.hp) {
    const dmg = { t: 'dmg', id: victim.id, amount: before - victim.hp };
    if (victim.hp <= 0) dmg.ko = true;
    if (opts.shock) dmg.shock = true;
    if (opts.head) dmg.head = true;
    sendNear(A, victim, dmg); // before the knockout, so the victim gets it too
  }
  if (victim.hp <= 0) knockOut(A, victim, attacker, weapon, opts.byName, opts.byKey);
  return true;
}

/**
 * Knocked out: drop every weapon (the starting weapon too), every Healing Potion and every bomb, leave the arena.
 * A potion being drunk is gone (it was used up when the drinking started).
 * A dropped weapon with more than half its durability keeps it; half or less is set to half
 * (rounded up), see droppedDurability in @pvp/game-rules.
 */
function knockOut(A, victim, attacker, weapon, byName, byKey) {
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
  // bombs (#32): one ground item per bomb kind carried, with all of them (anyone can pick them up)
  for (const [id, n] of Object.entries(victim.bombs ?? {})) if (n > 0) dropItem(A, 'bomb', id, victim.x, victim.z, spread, undefined, n);
  victim.drink = null;
  removePlayer(A, victim);
  const by = attacker ? attacker.name : (byName ?? null);
  send(A, 'all', { t: 'ko', id: victim.id, x: victim.x, y: victim.y, z: victim.z, victim: victim.name, by, weapon });
  send(A, victim.id, { t: 'dead', by, weapon });
  // byKey (#47): the attacker's player key (the account), also after the attacker left; null for your own
  // bomb or no attacker. The server counts it for the ranking (never when byKey === playerKey).
  const killerKey = attacker ? attacker.key : (byKey ?? null);
  tellServer(A, 'knockedOut', {
    playerId: victim.id, playerKey: victim.key, weapons: lost, by, byId: attacker ? attacker.id : null,
    byKey: killerKey === victim.key ? null : killerKey,
  });
}

// Returns true if the swing hit someone (a player, or a raised shield); a swing at the air returns false.
// full: the weapon is fully charged (false: a weak charging hit, see strike).
function melee(A, p, w, def, full) {
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
  strike(A, p, target, w, def, ((target.x - p.x) / d) * k, ((target.z - p.z) / d) * k, full);
  return true;
}

function gun(A, p, w, def, o, dir, full) {
  // aiming (#37) with a weapon that can aim: a smaller spread (more accurate)
  const R = A.rules, r = A.rnd.combat, spread = (def.spread || 0) * aimState(A, p).spreadMul;
  const radius = R.PLAYER_RADIUS + A.tune.hitRadiusExtra;
  const tracers = [];
  for (let i = 0; i < (def.pellets || 1); i++) {
    let sx = dir.x + (r.next() - 0.5) * 2 * spread;
    let sy = dir.y + (r.next() - 0.5) * 2 * spread;
    let sz = dir.z + (r.next() - 0.5) * 2 * spread;
    const l = Math.hypot(sx, sy, sz) || 1; sx /= l; sy /= l; sz /= l;
    const sd = { x: sx, y: sy, z: sz };
    let dist = Math.min(def.range, rayBoxes(A.island.grid, o, sd, def.range));
    let hit = null, head = false;
    for (const v of A.players.values()) {
      if (v === p) continue;
      const height = heightOf(A, v);
      const h = rayCylinderHit(o, sd, { x: v.x, y: v.y, z: v.z, height, radius });
      if (h && h.t < dist) { dist = h.t; hit = v; head = isHeadshot(h.h, height, headZone(A)); }
    }
    // headshot (#45): the bullet hit the top HEAD_ZONE meters of the player: HEADSHOT_BONUS more damage
    if (hit) strike(A, p, hit, w, def, 0, 0, full, head);
    tracers.push([round2(o.x + sx * dist), round2(o.y + sy * dist), round2(o.z + sz * dist)]);
  }
  send(A, 'all', { t: 'shot', id: p.id, w, from: [round2(o.x), round2(o.y), round2(o.z)], to: tracers });
}

/**
 * Use the weapon in hand, aiming along dir ([x, y, z] or { x, y, z }). Returns true if it fired.
 * Not while frozen, and not while the shield is raised.
 * Charging (#38): every carried weapon (slot) charges on its own for its `rate` after a use, so another
 * weapon can be used right away. A weapon that is still charging can be used too, but a hit then does only
 * CHARGING_DAMAGE (25%) of the damage and no specials (see strike). A gun shot always (re)starts the charge,
 * a melee swing only when it hits someone (a swing at the air neither charges nor wears, #34).
 * Anti-spam: at most one use every MIN_FIRE_GAP_MS (150 ms) per player, whatever the weapon.
 */
export function fire(A, id, dir, now) {
  const p = A.players.get(id);
  if (!p) return false;
  now = at(A, now);
  if (isFrozen(A, p) || p.shieldUp) return false;
  const w = p.weapons[p.slot];
  const def = weaponDef(A, w);
  if (p.drink) return false; // busy drinking a potion (switch slots to stop, the potion is wasted)
  if (!def || now - p.lastFire < minFireGap(A)) return false;
  let [dx, dy, dz] = Array.isArray(dir) ? dir.map(Number) : dir ? [dir.x, dir.y, dir.z].map(Number) : [0, 0, 1];
  const len = Math.hypot(dx, dy, dz);
  if (!len || !Number.isFinite(len)) return false;
  p.lastFire = now;
  p.protectUntil = 0; // attacking ends spawn protection
  const d = { x: dx / len, y: dy / len, z: dz / len };
  const o = { x: p.x, y: p.y + heightOf(A, p) - A.tune.muzzleDrop, z: p.z };

  const slot = p.slot;
  const full = chargeLeft(A, p, slot) === 0; // fully charged: full damage and specials
  let used = true; // a gun shot always wears and charges; a melee swing only when it hits someone (#34, #38)
  switch (def.type) {
    case 'melee': used = melee(A, p, w, def, full); break;
    case 'gun': gun(A, p, w, def, o, d, full); break;
    default: return false;
  }
  if (!A.players.has(p.id)) return true; // knocked out by a reflected hit: everything already dropped
  if (used) {
    p.useAt[slot] = now; // this weapon charges again (the others keep their own charge)
    wear(A, p, slot);
  }
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
  p.useAt.splice(slot, 1); // its charge is lost: whoever picks it up gets it fully charged (#38)
  p.slot = Math.max(0, Math.min(slot, p.weapons.length - 1));
  const it = dropItem(A, 'weapon', weapon, p.x, p.z, A.tune.dropSpread, dur);
  it.ignore = p.id; // not picked straight back up by the one who dropped it
  if (free) it.free = true;
  send(A, p.id, inventoryMsg(A, p));
  return it.id;
}

/** One use of the weapon in `slot`: lose wearPerUse durability; at 0 it breaks and is gone. Sends an 'inv'. */
function wear(A, p, slot) {
  const left = p.dur[slot];
  if (left === null || left === undefined) { // never breaks
    send(A, p.id, inventoryMsg(A, p)); // still: the new charge of this slot (#38)
    return;
  }
  p.dur[slot] = Math.max(0, left - wearOf(A, p.weapons[slot]));
  if (p.dur[slot] === 0) {
    const [weapon] = p.weapons.splice(slot, 1);
    p.dur.splice(slot, 1);
    p.free.splice(slot, 1);
    p.useAt.splice(slot, 1);
    p.slot = Math.max(0, Math.min(p.slot, p.weapons.length - 1)); // same slot number, or the last one
    send(A, p.id, { t: 'broke', slot, weapon });
  }
  send(A, p.id, inventoryMsg(A, p)); // so the durability bar is always right
}
