// Items on the ground: dropping, rolling chest loot, expiring and auto pick up.

import { circleHitsBox } from '@pvp/collision';
import { chestChance, bombMaxCarry } from '@pvp/game-rules';
import { send, weaponDef, maxDurability, isShieldId, rankOf, bombTable } from './state.js';
import { inventoryMsg, maxPotions } from './players.js';
import { equipShield } from './effects.js';

export const itemMsg = it => {
  const msg = { id: it.id, kind: it.kind, weapon: it.weapon, x: it.x, y: it.y, z: it.z };
  if (it.kind === 'weapon') msg.dur = it.dur;
  if (it.kind === 'bomb') msg.n = it.n;
  return msg;
};

/**
 * Drop an item near (x, z). kind: 'weapon' (with a weapon id), 'potion' (a Healing Potion) or 'bomb'
 * (weapon = the bomb id, n = how many: a pack).
 * dur (weapons): uses left; left out = full (new chest loot).
 */
export function dropItem(A, kind, weapon, x, z, spread = A.tune.dropSpread, dur, n = 1) {
  const r = A.rnd.loot, grid = A.island.grid;
  const a = r.next() * Math.PI * 2, d = r.next() * spread;
  let ix = x + Math.cos(a) * d, iz = z + Math.sin(a) * d;
  if (grid.near(ix, iz, 1).some(b => b.h > 0.5 && circleHitsBox(ix, iz, 0.3, b))) { ix = x; iz = z; }
  let y = 0;
  for (const b of grid.near(ix, iz, 0.5)) if (circleHitsBox(ix, iz, 0.2, b) && b.h <= 1.4) y = Math.max(y, b.y + b.h);
  const it = { id: A.newId(), kind, weapon: kind === 'weapon' || kind === 'bomb' ? weapon : null, x: ix, y, z: iz, expires: A.now + A.rules.ITEM_LIFETIME_MS };
  if (kind === 'weapon') it.dur = dur === undefined ? maxDurability(A, weapon) : dur;
  if (kind === 'bomb') it.n = Number.isInteger(n) && n > 0 ? n : 1;
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
 * Pick a chest weapon by the weights from chestWeights: chance = weight / sum of all weights,
 * so the numbers do not have to add up to 100 (shields are in the same draw).
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
 * Loot from a chest: exactly one weapon (full durability), picked by chestChance (golden: boosted),
 * POTION.chestChance % of the time an extra Healing Potion next to it, and for every bomb in the rules'
 * BOMBS (in order) its chestChance % of the time one pack of it (#32: a Bomb, or 3 Legendary Bombs).
 * Draws from the seeded loot stream in a fixed order: weapon, weapon spot, potion chance, potion spot,
 * then per bomb: its chance (and its spot when it drops).
 */
export function rollLoot(A, x, z, { golden = false } = {}) {
  const r = A.rnd.loot;
  const w = rollChestWeapon(A, { golden }, r);
  if (w) dropItem(A, 'weapon', w, x, z);
  const P = A.rules.POTION;
  if (P && P.chestChance > 0 && r.next() * 100 < P.chestChance) dropItem(A, 'potion', null, x, z);
  for (const [id, b] of Object.entries(bombTable(A))) {
    if (b.chestChance > 0 && r.next() * 100 < b.chestChance) dropItem(A, 'bomb', id, x, z, A.tune.dropSpread, undefined, b.pack);
  }
}

/**
 * Try to put an item into a player's inventory. Returns the picked name, or null if no room.
 * Shields go on the arm, never in a slot: picked up if you wear none, or if this one is rarer than
 * yours (Mega Shield over Shield): then yours drops where you stand, keeping its durability.
 * Otherwise it stays on the ground.
 */
function take(A, p, it) {
  if (it.kind === 'weapon' && isShieldId(A, it.weapon)) {
    const old = p.shield;
    if (old && rankOf(A, it.weapon) <= rankOf(A, old.id)) return null;
    equipShield(A, p, it.weapon, it.dur === undefined ? maxDurability(A, it.weapon) : it.dur);
    if (old) dropItem(A, 'weapon', old.id, p.x, p.z, 0, old.dur);
    return weaponDef(A, it.weapon)?.name ?? it.weapon;
  }
  if (it.kind === 'weapon') {
    if (p.weapons.length >= A.rules.MAX_SLOTS) return null; // a copy of a weapon you have is fine
    p.weapons.push(it.weapon);
    p.dur.push(it.dur === undefined ? maxDurability(A, it.weapon) : it.dur); // what the ground item had
    p.free.push(!!it.free); // a dropped free starting Gun stays free (never goes into a backpack)
    p.useAt.push(-Infinity); // a picked-up weapon starts fully charged (#38)
    return weaponDef(A, it.weapon)?.name ?? it.weapon;
  }
  if (it.kind === 'bomb') {
    // bombs: as many as fit under the bomb's maxCarry; the rest of a pack stays on the ground
    const room = bombMaxCarry(it.weapon, bombTable(A)) - (p.bombs?.[it.weapon] ?? 0);
    if (room <= 0) return null;
    const got = Math.min(room, it.n);
    p.bombs[it.weapon] += got;
    if (got < it.n) {
      const rest = dropItem(A, 'bomb', it.weapon, it.x, it.z, 0, undefined, it.n - got);
      rest.ignore = p.id; // not picked straight back up
    }
    const name = bombTable(A)[it.weapon]?.name ?? it.weapon;
    return got > 1 ? `${got}× ${name}` : name;
  }
  if (it.kind !== 'potion' || p.potions >= maxPotions(A)) return null; // only with fewer than MAX_POTIONS
  p.potions++;
  return A.rules.POTION?.name ?? it.kind;
}

export function tickItems(A, now) {
  const T = A.tune;
  for (const it of A.items.values()) {
    if (now > it.expires) { A.items.delete(it.id); send(A, 'all', { t: 'item-', id: it.id }); continue; }
    for (const p of A.players.values()) {
      const near = Math.hypot(p.x - it.x, p.z - it.z) <= T.pickupRadius && Math.abs(p.y - it.y) <= T.pickupHeight;
      if (it.ignore === p.id) { if (!near) delete it.ignore; continue; } // you dropped it: step away first
      if (!near) continue;
      const picked = take(A, p, it);
      if (picked === null) continue;
      A.items.delete(it.id);
      send(A, 'all', { t: 'item-', id: it.id, by: p.id });
      send(A, p.id, inventoryMsg(A, p, picked));
      break;
    }
  }
}
