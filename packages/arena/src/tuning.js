// Arena numbers that are not in @pvp/game-rules. Same values as the old server.
// Pass `tuning: { ... }` to createArena to change any of them.

export const ARENA_DEFAULTS = Object.freeze({
  firstGoldenMs: 60000,        // first golden chest after 1 minute
  openDistance: 3.2,           // how close you must be to open a chest (m)
  // A normal chest gives CHEST_COINS coins and one weapon picked by the weapons' chestChance (game-rules).
  // Every chest (golden too) also gives an extra Healing Potion POTION.chestChance % of the time (game-rules).
  dropSpread: 1.2,             // how far loot scatters (m)
  koDropSpread: 2,             // how far a knocked-out player's items scatter (m)
  pickupRadius: 1.5,           // auto pick up within this distance (m)
  pickupHeight: 2,             // ... and this height difference (m)
  fireRateSlack: 0.9,          // next shot allowed after rate * 1000 * slack ms
  muzzleDrop: 0.3,             // shots start this far below the head (m)
  meleeMaxHeightDiff: 2,
  meleeFrontDot: 0.45,         // target must be in front (cos of the angle)
  meleeCloseRange: 0.6,        // closer than this counts as in front anyway
  meleeKnock: 3,               // knockback when the weapon has no `knock`
  hitRadiusExtra: 0.1,         // ray vs player radius = PLAYER_RADIUS + this
  shieldFrontDot: 0,           // a raised shield blocks hits from the front half (cos of the angle to the attacker)
  frozenSlack: 0.05,           // a frozen player may not move more than this (m); more gets a 'pos' back
  snapshotRadius: 160,
  teleportSlack: 1.6,          // max move = SLIDE_SPEED * dt * slack + extra
  teleportExtra: 2,
  maxFallSpeed: 25,            // max height change = speed * dt + extra
  fallExtra: 3,
  minStateDtS: 0.03,
  movingEndsProtectMs: 300,    // moving ends spawn protection this soon
  // Bombs (#32): the numbers of each bomb (damage, area, max throw, fuse) are in @pvp/game-rules BOMBS.
  bombThrowCooldownMs: 500,    // a player may throw one bomb every this many ms
  bombFlyMs: 350,              // flight time of a bomb: this ...
  bombFlyMsPerM: 45,           // ... plus this per meter thrown (never longer than the fuse)
  bombWallBack: 0.4,           // a bomb aimed at a wall lands this far in front of it (m)
  bombHitHeight: 2.5,          // players more than this above or below the bomb are not hurt (m)
  bombKnock: 4,                // how hard an explosion pushes players away from its middle
});
