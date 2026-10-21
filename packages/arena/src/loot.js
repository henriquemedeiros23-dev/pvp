// Items on the ground: dropping, rolling chest loot, expiring and auto pick up.

import { circleHitsBox } from '@pvp/collision';
import { chestChance } from '@pvp/game-rules';
import { send, weaponDef, maxDurability } from './state.js';
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

/**
 * The weight of each weapon in a chest: its chestChance (percent). For the golden chest
 * (golden = true) the weight is multiplied by the rules' GOLDEN_CHEST_BOOST for its rarity
 * (Epic, Legendary and Megalegend x2; Common stays the same). Returns [[id, weight], ...] in rules order.
 */
export function chestWeights(rules, { golden = false } = {}) {
  const boost = (golden && rules.GOLDEN_CHEST_BOOST) || {};
  return Object.keys(rules.WEAPONS).map(id => {
    const b = Object.hasOwn(boost, rules.WEAPONS[id].rarity) ? boost[rules.WEAPONS[id].rarity] : 1;
    return [id, chestChance(id, rules.WEAPONS) * b];
  });
}

/**
 * Pick a chest weapon by the weights from chestWeights: a weapon with chestChance 15 comes out
 * 15 times in 100 when they add up to 100 (they are normalized if they don't).
 * One random draw. Returns a weapon id, or null if no weapon has a chance.
 */
export function rollChestWeapon(A, { golden = false } = {}, r = A.rnd.loot) {
  const weights = chestWeights(A.rules, { golden }).filter(([, w]) => w > 0);
  let total = 0;
  for (const [, w] of weights) total += w;
  if (!(total > 0)) return null;
  let roll = r.next() * total;
  for (const [id, w] of weights) {
    if (roll < w) return id;
    roll -= w;
  }
  return weights[weights.length - 1][0]; // rounding at the very end
}

/**
 * Loot from a normal chest: exactly one weapon (full durability), picked by chestChance.
 * Heals from chests are a separate setting (tuning chestHealChance, 0 = off for now).
 */
export function rollLoot(A, x, z) {
  const r = A.rnd.loot;
  const w = rollChestWeapon(A, {}, r);
  if (w) dropItem(A, 'weapon', w, x, z);
  if (A.tune.chestHealChance > 0 && r.next() < A.tune.chestHealChance) {
    dropItem(A, r.next() < A.tune.bandageChance ? 'bandage' : 'medkit', null, x, z);
  }
}

/** Try to put an item into a player's inventory. Returns the picked name, or null if no room. */
function take(A, p, it) {
  if (it.kind === 'weapon') {
    if (p.weapons.includes(it.weapon) || p.weapons.length >= A.rules.MAX_SLOTS) return null;
    p.weapons.push(it.weapon);
    p.dur.push(it.dur === undefined ? maxDurability(A, it.weapon) : it.dur); // what the ground item had
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
