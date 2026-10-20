// Items on the ground: dropping, rolling chest loot, expiring and auto pick up.

import { circleHitsBox } from '@pvp/collision';
import { send, randPick, weaponDef, maxDurability } from './state.js';
import { HEAL_SLOTS, inventoryMsg } from './players.js';

export const itemMsg = it => {
  const msg = { id: it.id, kind: it.kind, weapon: it.weapon, x: it.x, y: it.y, z: it.z };
  if (it.kind === 'weapon') msg.dur = it.dur;
  return msg;
};

/**
 * Drop an item near (x, z). kind: 'weapon' (with a weapon id) or a heal kind.
 * dur (weapons): uses left; left out = full (new chest loot).
 */
export function dropItem(A, kind, weapon, x, z, spread = A.tune.dropSpread, dur) {
  const r = A.rnd.loot, grid = A.island.grid;
  const a = r.next() * Math.PI * 2, d = r.next() * spread;
  let ix = x + Math.cos(a) * d, iz = z + Math.sin(a) * d;
  if (grid.near(ix, iz, 1).some(b => b.h > 0.5 && circleHitsBox(ix, iz, 0.3, b))) { ix = x; iz = z; }
  let y = 0;
  for (const b of grid.near(ix, iz, 0.5)) if (circleHitsBox(ix, iz, 0.2, b) && b.h <= 1.4) y = Math.max(y, b.y + b.h);
  const it = { id: A.newId(), kind, weapon: kind === 'weapon' ? weapon : null, x: ix, y, z: iz, expires: A.now + A.rules.ITEM_LIFETIME_MS };
  if (kind === 'weapon') it.dur = dur === undefined ? maxDurability(A, weapon) : dur;
  A.items.set(it.id, it);
  send(A, 'all', { t: 'item+', ...itemMsg(it) });
  return it;
}

/** Pick a rarity from the odds list [[rarity, chance], ...] (chances add up to 1). */
function rollRarity(A) {
  const roll = A.rnd.loot.next();
  const odds = A.tune.rarityOdds;
  let sum = 0;
  for (const [rarity, chance] of odds) { sum += chance; if (roll < sum) return rarity; }
  return odds[odds.length - 1][0];
}

/** Loot from a normal chest: a weapon of a random rarity, or a heal. */
export function rollLoot(A, x, z) {
  const r = A.rnd.loot;
  if (r.next() < A.tune.weaponChance) {
    const list = A.rules.LOOT_TABLE[rollRarity(A)] ?? [];
    if (list.length) dropItem(A, 'weapon', randPick(r, list), x, z);
  } else {
    dropItem(A, r.next() < A.tune.bandageChance ? 'bandage' : 'medkit', null, x, z);
  }
}

/** Try to put an item into a player's inventory. Returns the picked name, or null if no room. */
function take(A, p, it) {
  if (it.kind === 'weapon') {
    if (p.weapons.includes(it.weapon) || p.weapons.length >= A.rules.MAX_SLOTS) return null;
    p.weapons.push(it.weapon);
    p.dur.push(it.dur === undefined ? maxDurability(A, it.weapon) : it.dur); // keeps the wear it had
    return weaponDef(A, it.weapon)?.name ?? it.weapon;
  }
  const slot = HEAL_SLOTS[it.kind];
  if (!slot || p[slot.field] >= A.rules[slot.max]) return null;
  p[slot.field]++;
  return A.rules.HEALS[it.kind]?.name ?? it.kind;
}

export function tickItems(A, now) {
  const T = A.tune;
  for (const it of A.items.values()) {
    if (now > it.expires) { A.items.delete(it.id); send(A, 'all', { t: 'item-', id: it.id }); continue; }
    for (const p of A.players.values()) {
      if (Math.hypot(p.x - it.x, p.z - it.z) > T.pickupRadius || Math.abs(p.y - it.y) > T.pickupHeight) continue;
      const picked = take(A, p, it);
      if (picked === null) continue;
      A.items.delete(it.id);
      send(A, 'all', { t: 'item-', id: it.id, by: p.id });
      send(A, p.id, inventoryMsg(p, picked));
      break;
    }
  }
}
