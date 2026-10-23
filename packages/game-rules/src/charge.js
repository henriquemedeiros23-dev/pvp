// Charging (#38): after a weapon is used it charges for its `rate` seconds. Each carried weapon (each slot)
// charges on its own, so you can switch to another weapon and use it right away. A weapon that is still
// charging can be used too, but it only does CHARGING_DAMAGE of its damage (and no specials).

/** Part of a weapon's damage a hit does while that weapon is still charging (0.25 = 25%). The boss can tune it. */
export const CHARGING_DAMAGE = 0.25;

/**
 * Anti-spam: a player can use a weapon at most once every MIN_FIRE_GAP_MS (ms), whatever weapon,
 * so tapping very fast cannot fire 60 times a second.
 */
export const MIN_FIRE_GAP_MS = 150;

/**
 * Damage of a hit while the weapon is still charging: dmg * factor, rounded, at least 1 when dmg is 1 or more.
 * chargingDamage(15) = 4, chargingDamage(2) = 1 (0.5 rounds to 1), chargingDamage(100) = 25.
 */
export function chargingDamage(dmg, factor = CHARGING_DAMAGE) {
  if (typeof dmg !== 'number' || !Number.isFinite(dmg) || dmg <= 0) return 0;
  const f = typeof factor === 'number' && Number.isFinite(factor) ? Math.max(0, Math.min(1, factor)) : CHARGING_DAMAGE;
  const v = Math.round(dmg * f);
  return dmg >= 1 ? Math.max(1, v) : v;
}
