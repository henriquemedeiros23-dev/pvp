// Players: join, leave, movement updates (with anti-teleport), slot switch, healing.

import { findSpawn } from '@pvp/world-gen';
import { at, send, weaponDef, maxDurability } from './state.js';
import { welcomeFor } from './snapshot.js';

/** Heal kind -> the player field that counts it, and the rule with its limit. */
export const HEAL_SLOTS = Object.freeze({
  bandage: { field: 'bandages', max: 'MAX_BANDAGES' },
  medkit: { field: 'medkits', max: 'MAX_MEDKITS' },
});

export function inventoryMsg(p, picked) {
  const msg = { t: 'inv', weapons: [...p.weapons], dur: [...p.dur], slot: p.slot, bandages: p.bandages, medkits: p.medkits, coins: p.coins, hp: p.hp };
  if (picked !== undefined) msg.picked = picked;
  return msg;
}

export const playerInfo = p => ({ id: p.id, name: p.name, skin: { ...p.skin } });

export function join(A, key, { name, skin, loadout = [], coins = 0 } = {}, now) {
  now = at(A, now);
  const R = A.rules;
  const oldId = A.byKey.get(key);
  const others = A.players.size - (oldId !== undefined ? 1 : 0);
  if (others >= R.MAX_PLAYERS) return { ok: false, reason: 'full' };

  // Same account joins again: the old player leaves alive first.
  let replaced = null;
  if (oldId !== undefined) replaced = { id: oldId, weapons: leave(A, oldId, { alive: true }) };

  // The starting weapon (free, slot 1), then weapons from the loadout (best first is the server's
  // choice), one of each kind, as many as fit.
  const freeStart = Boolean(weaponDef(A, R.STARTING_WEAPON));
  const weapons = freeStart ? [R.STARTING_WEAPON] : [];
  for (const w of Array.isArray(loadout) ? loadout : []) {
    if (weapons.length >= R.MAX_SLOTS) break;
    if (weaponDef(A, w) && !weapons.includes(w)) weapons.push(w);
  }

  const spot = findSpawn(A.island, [...A.players.values()], A.rnd.spawn);
  const p = {
    id: A.newId(), key, name: String(name ?? key), skin: { ...(skin ?? R.DEFAULT_SKIN ?? {}) },
    coins: Number.isInteger(coins) && coins >= 0 ? coins : 0,
    x: spot.x, y: 0, z: spot.z, ry: 0, pitch: 0, flags: 0,
    // dur: uses left per slot (parallel to weapons), null = never breaks. Loadout weapons start full.
    hp: R.MAX_HP, weapons, dur: weapons.map(w => maxDurability(A, w)), slot: 0, bandages: 1, medkits: 0, lastFire: -Infinity, lastHeal: -Infinity,
    protectUntil: now + R.SPAWN_PROTECT_MS, lastState: now,
    freeStart, // still holds the free starting weapon (it is not put in the backpack on leave)
  };
  A.players.set(p.id, p);
  A.byKey.set(key, p.id);

  send(A, p.id, welcomeFor(A, p.id));
  send(A, p.id, inventoryMsg(p));
  send(A, 'all', { t: 'pjoin', ...playerInfo(p) }, p.id);
  return { ok: true, id: p.id, weapons: weapons.slice(freeStart ? 1 : 0), replaced };
}

/**
 * The host sets a player's coin total (the account is the single source of truth, e.g. after a shop buy
 * from another device). Queues an 'inv' with the new total. Unknown id or a bad total: ignored, returns false.
 */
export function setCoins(A, id, total) {
  const p = A.players.get(id);
  if (!p || !Number.isInteger(total) || total < 0) return false;
  p.coins = total;
  send(A, p.id, inventoryMsg(p));
  return true;
}

/** Removes a player from the arena (no messages). */
export function removePlayer(A, p) {
  A.players.delete(p.id);
  if (A.byKey.get(p.key) === p.id) A.byKey.delete(p.key);
}

/**
 * Leaves the arena. Alive: returns the weapons to put back in the backpack: everything carried
 * except the free starting weapon given at join (if it has not broken).
 * Broken weapons are already gone; worn ones go back as plain ids (the backpack keeps no durability,
 * so they are full again next time).
 */
export function leave(A, id, { alive = true } = {}) {
  const p = A.players.get(id);
  if (!p) return [];
  removePlayer(A, p);
  send(A, 'all', { t: 'pleave', id: p.id });
  if (!alive) return [];
  const back = [...p.weapons];
  if (p.freeStart) {
    const i = back.indexOf(A.rules.STARTING_WEAPON);
    if (i >= 0) back.splice(i, 1);
  }
  return back;
}

/** A movement update from the player. Returns false if refused (a `pos` correction is queued). */
export function setState(A, id, s, now) {
  const p = A.players.get(id);
  if (!p || !s) return false;
  now = at(A, now);
  const T = A.tune;
  const dt = Math.max(T.minStateDtS, (now - p.lastState) / 1000);
  p.lastState = now;
  const x = Number(s.x), y = Number(s.y), z = Number(s.z);
  if (![x, y, z].every(Number.isFinite)) return false;
  // Light anti-cheat: refuse impossible teleports.
  const maxMove = A.rules.SLIDE_SPEED * dt * T.teleportSlack + T.teleportExtra;
  if (Math.hypot(x - p.x, z - p.z) > maxMove || Math.abs(y - p.y) > T.maxFallSpeed * dt + T.fallExtra) {
    send(A, p.id, { t: 'pos', x: p.x, y: p.y, z: p.z });
    return false;
  }
  p.x = x; p.y = Math.max(0, y); p.z = z;
  p.ry = Number(s.ry) || 0;
  p.pitch = Number(s.pitch) || 0;
  p.flags = ((s.f ?? s.flags) | 0) & 255;
  if (p.flags & 4) p.protectUntil = Math.min(p.protectUntil, now + T.movingEndsProtectMs); // moving soon ends protection
  return true;
}

/** Put a player somewhere without the anti-teleport check (server use, tests). */
export function teleport(A, id, { x, y = 0, z, ry } = {}) {
  const p = A.players.get(id);
  if (!p || ![x, y, z].every(Number.isFinite)) return false;
  p.x = x; p.y = Math.max(0, y); p.z = z;
  if (Number.isFinite(ry)) p.ry = ry;
  return true;
}

export function selectSlot(A, id, i) {
  const p = A.players.get(id);
  if (!p || !Number.isInteger(i) || i < 0 || i >= p.weapons.length) return false;
  p.slot = i;
  send(A, p.id, inventoryMsg(p));
  return true;
}

export function heal(A, id, kind, now) {
  const p = A.players.get(id);
  const slot = Object.hasOwn(HEAL_SLOTS, kind) ? HEAL_SLOTS[kind] : null;
  const def = slot && Object.hasOwn(A.rules.HEALS, kind) ? A.rules.HEALS[kind] : null;
  if (!p || !def) return false;
  now = at(A, now);
  if (now - p.lastHeal < A.tune.healCooldownMs || p.hp >= A.rules.MAX_HP || p[slot.field] <= 0) return false;
  p[slot.field]--;
  p.hp = Math.min(A.rules.MAX_HP, p.hp + def.heal);
  p.lastHeal = now;
  send(A, p.id, inventoryMsg(p));
  return true;
}
