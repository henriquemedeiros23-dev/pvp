// Shields (worn on the left arm, raised to block hits from the front) and status effects
// (shock: lose HP over time; freeze: completely stuck). Everything is data-driven from the rules:
// a shield is a weapon with type 'shield' (durability = blocked hits, optional reflect), and a
// weapon may have shock / freezeMs / knockout / shieldWear. Time is passed in.

import { chargingDamage, headshotDamage } from '@pvp/game-rules';
import { at, send, sendNear, weaponDef, maxDurability, chargingFactor, headshotBonus } from './state.js';
import { inventoryMsg } from './players.js';
import { damage } from './combat.js';

/** Frozen right now? (completely stuck: no moving, turning, firing, slot switch or shield) */
export const isFrozen = (A, p) => !!p && A.now < p.frozenUntil;
/** Shocked right now? (losing HP every few seconds) */
export const isShocked = (A, p) => !!p && !!p.shock;

/** Put a shield on a player's arm (replaces any shield there). dur: blocked hits left (default full). */
export function equipShield(A, p, id, dur) {
  p.shield = { id, dur: Number.isInteger(dur) && dur > 0 ? dur : maxDurability(A, id) };
  p.shieldUp = false;
}

/** Raise (up = true) or lower the shield. Returns true if it changed. */
export function setShield(A, id, up, now) {
  const p = A.players.get(id);
  if (!p) return false;
  at(A, now);
  const want = !!up && !!p.shield;
  if (isFrozen(A, p) || want === p.shieldUp) return false;
  p.shieldUp = want;
  return true;
}

// Does victim's raised shield face the attacker? The front half (tuning shieldFrontDot = 0) counts.
function facesAttacker(A, victim, attacker) {
  const ax = attacker.x - victim.x, az = attacker.z - victim.z, d = Math.hypot(ax, az);
  if (d < 1e-6) return true; // same spot: count it as the front
  return (ax * Math.sin(victim.ry) + az * Math.cos(victim.ry)) / d >= A.tune.shieldFrontDot;
}

/**
 * A weapon hit lands on victim. Order:
 * 1. a raised shield facing the attacker blocks it: 0 damage, the shield loses the weapon's shieldWear
 *    (default 1; the Supersword costs 5), a shield with `reflect` sends that part of the weapon's damage
 *    back to the attacker, and at 0 the shield breaks. No shock or freeze on a blocked hit.
 * 2. otherwise the damage (a knockout weapon takes every HP that is left), then shock / freeze if
 *    the target is still in.
 * full = false (#38): the weapon was still charging: the hit does only chargingDamage(dmg) (CHARGING_DAMAGE of
 * the rules, 25%, at least 1) and has NO specials: no knockout, no shock, no freeze. A blocked weak hit
 * still costs the shield its shieldWear; a Mega Shield sends back its part of the weak damage.
 * head = true (#45, only gun bullets, see gun() in combat.js): a headshot does HEADSHOT_BONUS (3) more, added
 * after the charging cut (a charging DM Gun: 4 + 3 = 7). A raised shield still blocks a headshot completely,
 * and a Mega Shield reflects its part of the normal damage only (the shield took the hit, not the head).
 */
export function strike(A, attacker, victim, w, def, kx = 0, kz = 0, full = true, head = false) {
  if (!A.players.has(victim.id) || victim.hp <= 0 || A.now < victim.protectUntil) return;
  const dmg = full ? (def.dmg || 0) : chargingDamage(def.dmg || 0, chargingFactor(A));
  if (victim.shield && victim.shieldUp && facesAttacker(A, victim, attacker)) {
    block(A, attacker, victim, def, dmg);
    return;
  }
  const hurt = head ? headshotDamage(dmg, headshotBonus(A)) : dmg;
  const amount = full && def.knockout ? Math.max(hurt, victim.hp) : hurt;
  if (!damage(A, victim, amount, attacker, w, kx, kz, { head })) return;
  if (victim.hp <= 0 || !full) return; // specials only on a fully charged hit
  if (def.shock) {
    // a new shock starts over: forMs / everyMs more ticks, the first one everyMs from now
    const { dmg, everyMs, forMs } = def.shock;
    victim.shock = { dmg, everyMs, left: Math.max(1, Math.round(forMs / everyMs)), next: A.now + everyMs, byId: attacker.id, by: attacker.name, weapon: w };
  }
  if (def.freezeMs) {
    victim.frozenUntil = Math.max(victim.frozenUntil, A.now + def.freezeMs);
    victim.shieldUp = false; // the ice locks your arms too
  }
}

function block(A, attacker, victim, def, dmg) {
  const shieldId = victim.shield.id;
  const sdef = weaponDef(A, shieldId) || {};
  const wear = Number.isInteger(def.shieldWear) && def.shieldWear > 0 ? def.shieldWear : 1;
  victim.shield.dur = Math.max(0, victim.shield.dur - wear);
  send(A, 'all', { t: 'block', id: victim.id, by: attacker.id });
  send(A, attacker.id, { t: 'hitmark', dead: false, blocked: true });
  sendNear(A, victim, { t: 'dmg', id: victim.id, amount: 0, blocked: true }); // "Blocked" above the holder (#33)
  if (victim.shield.dur === 0) {
    victim.shield = null;
    victim.shieldUp = false;
    send(A, victim.id, { t: 'shieldbroke', weapon: shieldId });
  }
  send(A, victim.id, inventoryMsg(A, victim));
  // Mega Shield: part of the blocked damage goes back to the attacker (never knocks back).
  const back = sdef.reflect > 0 ? Math.round(dmg * sdef.reflect) : 0;
  if (back > 0) damage(A, attacker, back, victim, shieldId);
}

/** Shock damage over time. Every tick that is due is applied, in order. */
export function tickEffects(A, now) {
  for (const p of [...A.players.values()]) {
    const s = p.shock;
    while (s && p.shock === s && s.left > 0 && now >= s.next && A.players.has(p.id)) {
      s.left--;
      s.next += s.everyMs;
      if (s.left === 0) p.shock = null;
      const by = A.players.get(s.byId) ?? null;
      damage(A, p, s.dmg, by, s.weapon, 0, 0, { byName: s.by, shock: true });
    }
  }
}
