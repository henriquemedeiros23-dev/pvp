// @pvp/hud-model: pure functions that turn the player's inventory and health into
// what the in-game HUD shows (weapon slots, the held weapon's Durability bar, the H.P bar).
// Plain ES module: works in Node and directly in the browser (import map for @pvp/game-rules).
import { RULES } from '@pvp/game-rules';

// The Healing Potion button and its drinking progress ring (#28).
export { POTION_ICON_SVG, drinkState, drinkMessage, potionView } from './potion.js';
// The bomb buttons (#32).
export { BOMB_KEYS, bombIconSvg, bombView } from './bombs.js';
// The coin from the boss's drawing (#29): menu, shop, HUD and the "+3 coins" pop-up.
export { COIN_COLORS, COIN_ICON_SVG, coinIconSvg, coinIconDataUrl, coinsToast } from './coin.js';
// Aiming with the Shootbm and the DM Gun (#37): zoom, scope ring, smaller crosshair, the AIM button.
export { AIM_TIME_MS, AIM_CAMERA, AIM_BUTTON, aimBlend, aimView, aimButtonView, aimHandKey, zoomedFov } from './aim.js';
// The "Charging 1.4s" text under the crosshair (#35) and the damage numbers above heads (#33).
export {
  chargeView, chargeStarts, damageNumber, damageFloat, READY_FLASH_MS, DAMAGE_NUMBER_MS, DAMAGE_NUMBER_RISE, DAMAGE_COLORS,
} from './feedback.js';

/** One emoji per weapon id, for slots, the kill feed and the shop (bombs too: they can knock out). */
export const WEAPON_ICONS = Object.freeze({
  gun: '🔫', shootbm: '🎯', electricsword: '⚡', icesword: '❄️', shield: '🛡️', megashield: '🛡️', supersword: '🗡️',
  dmgun: '💥', supergun: '🌟', bomb: '💣', legendarybomb: '💣',
});

/** Durability bar colors: above `good` is 'good' (green), from `low` up to `good` is 'low' (yellow), below `low` is 'critical' (red). */
export const DURABILITY_LEVELS = Object.freeze({ good: 0.5, low: 0.2 });
/** Health at or below this part of the max shows as low (red). */
export const HEALTH_LOW = 0.35;

const own = (obj, key) => (obj && Object.hasOwn(obj, key) ? obj[key] : undefined);
const clamp01 = v => Math.max(0, Math.min(1, v));
const isPosInt = v => Number.isInteger(v) && v > 0;
// A weapon that can be held in a slot (not a shield), or undefined.
const slotWeapon = (rules, id) => {
  const w = typeof id === 'string' ? own(rules.WEAPONS, id) : undefined;
  return w && w.type !== 'shield' ? w : undefined;
};

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
    const w = slotWeapon(rules, id); // shields are worn on the arm, never held
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

/**
 * Health bar view: { hp, max, ratio, percent, low, text, label }. hp is clamped to 0..max and rounded.
 * text is the hp number ('30'), label the percent the H.P bar shows ('30%').
 */
export function healthView(hp, maxHp = RULES.MAX_HP) {
  const max = isPosInt(maxHp) ? maxHp : 100;
  const value = Number.isFinite(hp) ? Math.max(0, Math.min(max, Math.round(hp))) : 0;
  const ratio = value / max;
  const percent = Math.round(ratio * 100);
  return { hp: value, max, ratio, percent, low: ratio <= HEALTH_LOW, text: String(value), label: `${percent}%` };
}

/**
 * The big Durability bar: durability of the weapon you are HOLDING (inv.slot).
 * { weapon, name, ratio, percent, level, label, infinite, empty }
 * - a weapon that can break: ratio/percent from durabilityView, label '75%'
 * - a weapon that never breaks: full bar, infinite: true, label '∞', level 'good'
 * - no weapon in hand: empty: true, ratio 0, label '–', level null
 */
export function heldDurabilityView(inv, rules = RULES) {
  const weapons = Array.isArray(inv?.weapons) ? inv.weapons : [];
  const slot = Number.isInteger(inv?.slot) ? inv.slot : 0;
  const id = weapons[slot];
  const w = slotWeapon(rules, id); // shields are worn on the arm, never held
  if (!w) return { weapon: null, name: '', ratio: 0, percent: 0, level: null, label: '–', infinite: false, empty: true };
  const dur = Array.isArray(inv.dur) ? inv.dur[slot] : undefined;
  const d = durabilityView(id, dur, rules);
  if (!d) return { weapon: id, name: w.name, ratio: 1, percent: 100, level: 'good', label: '∞', infinite: true, empty: false };
  return { weapon: id, name: w.name, ratio: d.ratio, percent: d.percent, level: d.level, label: `${d.percent}%`, infinite: false, empty: false };
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

/**
 * The small Shield bar (next to Durability and H.P): the shield worn on the other arm.
 * inv.shield is { id, dur } from the 'inv' message, or null. up: is it raised right now.
 * Returns null without a shield, else { weapon, name, icon, usesLeft, max, ratio, percent, level, label, up }.
 */
export function shieldView(inv, up = false, rules = RULES) {
  const s = inv?.shield;
  const w = s && typeof s.id === 'string' ? own(rules.WEAPONS, s.id) : undefined;
  if (!w) return null;
  const d = durabilityView(s.id, s.dur, rules);
  const base = { weapon: s.id, name: w.name, icon: own(WEAPON_ICONS, s.id) || '🛡️', up: !!up };
  if (!d) return { ...base, usesLeft: null, max: null, ratio: 1, percent: 100, level: 'good', label: '∞' };
  return { ...base, usesLeft: d.usesLeft, max: d.max, ratio: d.ratio, percent: d.percent, level: d.level, label: String(d.usesLeft) };
}

/** Toast text for a 'broke' message: 'Your Shootbm broke!'. Shields too ('Your Shield broke!'). */
export function brokeMessage(weaponId, rules = RULES) {
  const name = own(own(rules.WEAPONS, weaponId), 'name');
  return `Your ${name || 'weapon'} broke!`;
}
