// Fight feedback (#35, #33): the "Charging 1.4s" text and ring under the crosshair after you shoot or swing,
// and the damage numbers that float up above a player's head when they lose health.
// Pure functions: time is passed in (any clock, e.g. performance.now() in the browser).
// Charging (#38): every weapon (slot) charges on its own; a hit while charging does only CHARGING_DAMAGE (25%).

import { RULES } from '@pvp/game-rules';

const clamp01 = v => Math.max(0, Math.min(1, v));

/** How long "Ready!" shows after the charge is done (ms). */
export const READY_FLASH_MS = 500;
/** How long a damage number stays above a head (ms). */
export const DAMAGE_NUMBER_MS = 2000;
/** How high a damage number floats up in that time (meters). */
export const DAMAGE_NUMBER_RISE = 0.9;
/** Colors of the damage numbers by kind. */
export const DAMAGE_COLORS = Object.freeze({
  hit: '#ff4d4d',     // normal hit: red
  shock: '#ffe14a',   // Electric Sword shock tick: yellow
  ko: '#ffc531',      // knockout: gold
  blocked: '#7fb6ff', // a raised shield took it: blue
});

const chargingPercent = factor => Math.round(clamp01(typeof factor === 'number' && Number.isFinite(factor) ? factor : 0.25) * 100);

/**
 * The charging text and ring under the crosshair, for the HELD weapon (each weapon charges on its own, #38).
 * weaponDef: the held weapon from the rules (its `rate` = seconds between uses), lastFireAt: when that weapon
 * started charging (same clock as now; null = never: ready), opts.readyMs: how long "Ready!" shows after,
 * opts.chargingDamage: the rules' CHARGING_DAMAGE (default from @pvp/game-rules, 0.25).
 * Returns { visible, charging, ready, progress (0..1, the ring fills up), percent, secondsLeft (rounded up
 * to 0.1 s), text ('Charging 1.4s' | 'Ready!' | ''), hint ('25%' while charging: what a hit does now, else '') }.
 */
export function chargeView(weaponDef, lastFireAt, now, { readyMs = READY_FLASH_MS, chargingDamage = RULES.CHARGING_DAMAGE } = {}) {
  const rateMs = Number.isFinite(weaponDef?.rate) && weaponDef.rate > 0 ? weaponDef.rate * 1000 : 0;
  const since = Number.isFinite(lastFireAt) && Number.isFinite(now) ? now - lastFireAt : Infinity;
  if (!rateMs || since < 0 || since >= rateMs + readyMs) {
    return { visible: false, charging: false, ready: false, progress: 0, percent: 0, secondsLeft: 0, text: '', hint: '' };
  }
  if (since >= rateMs) {
    return { visible: true, charging: false, ready: true, progress: 1, percent: 100, secondsLeft: 0, text: 'Ready!', hint: '' };
  }
  const progress = clamp01(since / rateMs);
  const secondsLeft = Math.max(0.1, Math.ceil((rateMs - since) / 100) / 10);
  return {
    visible: true, charging: true, ready: false, progress, percent: Math.round(progress * 100),
    secondsLeft, text: `Charging ${secondsLeft.toFixed(1)}s`, hint: `${chargingPercent(chargingDamage)}%`,
  };
}

/**
 * When each slot started charging (for chargeView's lastFireAt), from the server's `inv.charge`
 * (ms until each slot is fully charged, 0 = ready). now: when the 'inv' arrived (your clock).
 * weapons: inv.weapons; prev: the list this returned before, so a slot that just got ready keeps its start
 * (and "Ready!" still flashes). A slot with no charge info or 0 left (and nothing to flash) is null.
 * The server counts a weapon charged a little early (lag), so the ring may fill a bit faster than `rate`.
 */
export function chargeStarts(inv, now, prev = [], rules = RULES) {
  const weapons = Array.isArray(inv?.weapons) ? inv.weapons : [];
  const left = Array.isArray(inv?.charge) ? inv.charge : [];
  return weapons.map((w, i) => {
    const def = rules?.WEAPONS && Object.hasOwn(rules.WEAPONS, w) ? rules.WEAPONS[w] : undefined;
    const rateMs = Number.isFinite(def?.rate) && def.rate > 0 ? def.rate * 1000 : 0;
    if (!rateMs || !Number.isFinite(now)) return null;
    const ms = Number.isFinite(left[i]) && left[i] > 0 ? Math.min(left[i], rateMs) : 0;
    if (ms > 0) return now + ms - rateMs;
    const p = prev?.[i];
    return Number.isFinite(p) && p + rateMs <= now ? p : null; // ready: keep the old start for the "Ready!" flash
  });
}

/**
 * What a 'dmg' message shows above the player's head: { id, text, badge, kind, color }.
 * '-15' (red), a shock tick '-1' (yellow), a knockout '-15' with badge 'KO!' (gold),
 * a blocked hit 'Blocked' (blue). null for something that is not a 'dmg' message.
 */
export function damageNumber(msg) {
  if (!msg || msg.t !== 'dmg' || !Number.isFinite(msg.id)) return null;
  const amount = Math.max(0, Math.round(Number(msg.amount) || 0));
  const kind = msg.blocked ? 'blocked' : msg.ko ? 'ko' : msg.shock ? 'shock' : 'hit';
  return {
    id: msg.id,
    text: kind === 'blocked' ? 'Blocked' : `-${amount}`,
    badge: kind === 'ko' ? 'KO!' : '',
    kind,
    color: DAMAGE_COLORS[kind],
  };
}

/**
 * Where a damage number is `age` ms after it appeared: { rise (meters above the start), opacity, scale, done }.
 * It pops in, floats up and fades out in the last part of its life.
 */
export function damageFloat(age, { ms = DAMAGE_NUMBER_MS, rise = DAMAGE_NUMBER_RISE } = {}) {
  const t = Number.isFinite(age) && ms > 0 ? age / ms : 1;
  if (t >= 1 || t < 0) return { rise, opacity: 0, scale: 1, done: t >= 1 };
  const ease = 1 - (1 - t) * (1 - t); // fast first, then slow
  const opacity = t < 0.6 ? 1 : clamp01(1 - (t - 0.6) / 0.4);
  const scale = t < 0.1 ? 0.6 + 4.5 * t : 1; // a small pop: 0.6 -> 1.05, then 1
  return { rise: rise * ease, opacity, scale, done: false };
}
