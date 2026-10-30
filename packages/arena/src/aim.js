// Aiming (#37): the client sets the aim bit in its movement flags (state.f) while aiming is switched on
// (the AIM button or Shift toggles it, #40, #49). Only weapons with an `aim` in the rules (the Shootbm and the DM Gun)
// can aim: their shots are more accurate (spread * aim.spreadMul) and walking is slower (aim.moveMul,
// the client moves the player; the server tells it the multiplier). Aiming is ignored with any other weapon,
// while the shield is raised, while drinking a potion and while frozen.

import { aimDef } from '@pvp/game-rules';
import { weaponDef } from './state.js';
import { isFrozen } from './effects.js';

/** The aim bit in the movement flags (same as FLAG_AIM in @pvp/net-protocol). */
export const AIM_FLAG = 16;

const NOT_AIMING = Object.freeze({ aiming: false, zoom: 1, spreadMul: 1, moveMul: 1 });

/**
 * Is player p aiming right now, and with what numbers? { aiming, zoom, spreadMul, moveMul }
 * (all 1 when not aiming). Pure: reads the arena state only.
 */
export function aimState(A, p) {
  if (!p || !((p.flags | 0) & AIM_FLAG)) return NOT_AIMING;
  if (p.shieldUp || p.drink || isFrozen(A, p)) return NOT_AIMING;
  const a = aimDef(weaponDef(A, p.weapons[p.slot]));
  if (!a) return NOT_AIMING;
  return { aiming: true, zoom: a.zoom, spreadMul: a.spreadMul, moveMul: a.moveMul };
}

/** True if player p is aiming right now (see aimState). */
export const isAiming = (A, p) => aimState(A, p).aiming;

/** The movement flags others see: the aim bit only while really aiming (see aimState). */
export const shownFlags = (A, p) => (isAiming(A, p) ? (p.flags | 0) : (p.flags | 0) & ~AIM_FLAG);
