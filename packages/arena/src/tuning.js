// Arena numbers that are not in @pvp/game-rules. Same values as the old server.
// Pass `tuning: { ... }` to createArena to change any of them.

export const ARENA_DEFAULTS = Object.freeze({
  firstGoldenMs: 60000,        // first golden chest after 1 minute
  openDistance: 3.2,           // how close you must be to open a chest (m)
  // A normal chest gives CHEST_COINS coins and one weapon picked by the weapons' chestChance (game-rules).
  chestHealChance: 0,          // normal chest: chance of a heal as well (0 = off; the boss decides later)
  bandageChance: 0.75,         // heal from a chest: bandage (else medkit)
  dropSpread: 1.2,             // how far loot scatters (m)
  koDropSpread: 2,             // how far a knocked-out player's items scatter (m)
  pickupRadius: 1.5,           // auto pick up within this distance (m)
  pickupHeight: 2,             // ... and this height difference (m)
  healCooldownMs: 800,
  fireRateSlack: 0.9,          // next shot allowed after rate * 1000 * slack ms
  muzzleDrop: 0.3,             // shots start this far below the head (m)
  meleeMaxHeightDiff: 2,
  meleeFrontDot: 0.45,         // target must be in front (cos of the angle)
  meleeCloseRange: 0.6,        // closer than this counts as in front anyway
  meleeKnock: 3,               // knockback when the weapon has no `knock`
  hitRadiusExtra: 0.1,         // ray vs player radius = PLAYER_RADIUS + this
  throwLift: 4,                // thrown things get this extra upward speed
  launchOffset: 0.8,           // projectiles start this far in front (m)
  projectileMaxAgeS: 6,
  projectileStepS: 0.05 / 3,   // longest simulation step for projectiles (s)
  bounceKeep: 0.4,             // thrown things keep this much side speed on a bounce
  bounceUp: 0.35,              // ... and this much up speed
  rocketHitRadius: 0.7,
  explosionKnock: 8,
  explosionFalloff: 0.7,       // damage at the edge = dmg * (1 - falloff)
  mineArmMs: 1000,
  mineLifeMs: 180000,
  mineTriggerRadius: 1.6,
  mineTriggerHeight: 1.5,
  mineBlastLift: 0.3,
  snapshotRadius: 160,
  maxStepS: 0.25,              // a late tick never simulates more than this (s)
  teleportSlack: 1.6,          // max move = SLIDE_SPEED * dt * slack + extra
  teleportExtra: 2,
  maxFallSpeed: 25,            // max height change = speed * dt + extra
  fallExtra: 3,
  minStateDtS: 0.03,
  movingEndsProtectMs: 300,    // moving ends spawn protection this soon
});
