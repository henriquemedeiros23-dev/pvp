// @pvp/hud-model: pure functions that turn the player's inventory and health into
// what the in-game HUD shows (weapon slots with durability bars, the health bar).
// Plain ES module: works in Node and directly in the browser (import map for @pvp/game-rules).
import { RULES } from '@pvp/game-rules';

/** One emoji per weapon id, for slots, the kill feed and the shop. */
export const WEAPON_ICONS = Object.freeze({
  woodsword: '🗡️', sword: '⚔️', bat: '🏏', spear: '🔱', axe: '🪓', pistol: '🔫', shotgun: '💥',
  rifle: '🎯', sniper: '🔭', grenade: '💣', rocket: '🚀', mine: '🧨',
});

/** Durability bar colors: above `good` is 'good' (green), from `low` up to `good` is 'low' (yellow), below `low` is 'critical' (red). */
export const DURABILITY_LEVELS = Object.freeze({ good: 0.5, low: 0.2 });
/** Health at or below this part of the max shows as low (red). */
export const HEALTH_LOW = 0.35;

const own = (obj, key) => (obj && Object.hasOwn(obj, key) ? obj[key] : undefined);
const clamp01 = v => Math.max(0, Math.min(1, v));
const isPosInt = v => Number.isInteger(v) && v > 0;

/**
 * Durability view for one weapon: { usesLeft, max, ratio, percent, level } or null if it never breaks.
 * usesLeft = uses left (the 'inv' message's dur); null/undefined means "full" for a weapon that can break.
 */
export function durabilityView(weaponId, usesLeft, rules = RULES) {
  const max = own(own(rules.WEAPONS, weaponId), 'durability');
  if (!isPosInt(max)) return null;
  const left = Number.isFinite(usesLeft) ? Math.max(0, Math.min(max, Math.round(usesLeft))) : max;
  const ratio = clamp01(left / max);
  const level = ratio > DURABILITY_LEVELS.good ? 'good' : ratio >= DURABILITY_LEVELS.low ? 'low' : 'critical';
  return { usesLeft: left, max, ratio, percent: Math.round(ratio * 100), level };
}

/**
 * The weapon bar: always MAX_SLOTS slot view-models, empty slots included.
 * inv is the 'inv' message ({ weapons, dur?, slot }); missing or partial is fine.
 * Each slot: { index, key, weapon, name, icon, rarity, active, empty, durability }.
 */
export function slotBar(inv, rules = RULES) {
  const n = isPosInt(rules.MAX_SLOTS) ? rules.MAX_SLOTS : 5;
  const weapons = Array.isArray(inv?.weapons) ? inv.weapons : [];
  const dur = Array.isArray(inv?.dur) ? inv.dur : [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const id = weapons[i];
    const w = typeof id === 'string' ? own(rules.WEAPONS, id) : undefined;
    const base = { index: i, key: String(i + 1) };
    if (!w) {
      out.push({ ...base, weapon: null, name: '', icon: '', rarity: null, active: false, empty: true, durability: null });
      continue;
    }
    out.push({
      ...base,
      weapon: id,
      name: w.name,
      icon: own(WEAPON_ICONS, id) || '❔',
      rarity: w.rarity,
      active: inv.slot === i,
      empty: false,
      durability: durabilityView(id, dur[i], rules),
    });
  }
  return out;
}

/** Health bar view: { hp, max, ratio, percent, low, text }. hp is clamped to 0..max and rounded. */
export function healthView(hp, maxHp = RULES.MAX_HP) {
  const max = isPosInt(maxHp) ? maxHp : 100;
  const value = Number.isFinite(hp) ? Math.max(0, Math.min(max, Math.round(hp))) : 0;
  const ratio = value / max;
  return { hp: value, max, ratio, percent: Math.round(ratio * 100), low: ratio <= HEALTH_LOW, text: String(value) };
}

/**
 * Which slot a slot action picks: '0'..'4' (keys 1-5), '+' (next), '-' (previous), or a number.
 * Only slots that hold a weapon can be picked. Returns the index, or null if nothing changes.
 */
export function pickSlot(inv, action) {
  const count = Array.isArray(inv?.weapons) ? inv.weapons.length : 0;
  if (count === 0) return null;
  const cur = Number.isInteger(inv.slot) ? inv.slot : 0;
  const a = String(action);
  const i = a === '+' ? (cur + 1) % count : a === '-' ? (cur + count - 1) % count : a.trim() === '' ? NaN : Number(a);
  return Number.isInteger(i) && i >= 0 && i < count && i !== cur ? i : null;
}

/** Toast text for a 'broke' message: 'Your Pistol broke!'. */
export function brokeMessage(weaponId, rules = RULES) {
  const name = own(own(rules.WEAPONS, weaponId), 'name');
  return `Your ${name || 'weapon'} broke!`;
}
