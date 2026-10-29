// Headshots (#45): a gun bullet that hits the top HEAD_ZONE meters of a player does HEADSHOT_BONUS more damage.
// Swords (melee), bombs and shock ticks never headshot. The zone is measured from the top of the player's
// body (PLAYER_HEIGHT standing, CROUCH_HEIGHT crouching), so it moves down with a crouching head.

/** Extra damage of a gun headshot (added after the 25% charging cut, see headshotDamage). The boss can tune it. */
export const HEADSHOT_BONUS = 3;

/**
 * Height of the head zone (meters from the top of the body). 0.35 m is the stickman's head
 * (a 0.44 m ball whose top is near PLAYER_HEIGHT) without the chin and neck; it fits a crouching player too.
 */
export const HEAD_ZONE = 0.35;

const num = v => typeof v === 'number' && Number.isFinite(v);

/**
 * Is a hit `hitHeight` meters above the feet of a body `bodyHeight` tall a headshot?
 * True when it is in the top `zone` meters (the edges count). isHeadshot(1.7, 1.85) = true, isHeadshot(1.0, 1.85) = false.
 */
export function isHeadshot(hitHeight, bodyHeight, zone = HEAD_ZONE) {
  if (!num(hitHeight) || !num(bodyHeight) || !num(zone) || zone <= 0) return false;
  const eps = 1e-9;
  return hitHeight >= bodyHeight - zone - eps && hitHeight <= bodyHeight + eps;
}

/**
 * Damage of a headshot: the normal damage (or the weak charging damage) plus the bonus.
 * headshotDamage(2) = 5 (Gun), headshotDamage(4) = 7 (a charging DM Gun: 25% of 15 = 4, plus 3).
 * A bad or negative bonus counts as 0; a bad base as 0.
 */
export function headshotDamage(base, bonus = HEADSHOT_BONUS) {
  const b = num(base) && base > 0 ? base : 0;
  const x = num(bonus) && bonus > 0 ? bonus : 0;
  return b + x;
}
