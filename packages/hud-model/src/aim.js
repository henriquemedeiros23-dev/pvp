// Aiming (#37): the AIM button (phone) / right mouse button (computer) for the weapons that can aim
// (the Shootbm and the DM Gun: their `aim` in @pvp/game-rules). While aiming the camera zooms in and comes
// closer over the shoulder, a round scope ring shows and the crosshair gets smaller.
// Pure functions: time is passed in (any clock, e.g. performance.now() in the browser).

import { RULES, aimDef } from '@pvp/game-rules';

const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a * (1 - t) + b * t; // exact at t = 0 and t = 1
const ease = t => t * t * (3 - 2 * t); // smooth start and end

/** How long the zoom takes to go fully in (or out), in ms. */
export const AIM_TIME_MS = 160;

/**
 * How the third-person camera changes when fully aimed: its distance behind you and the shoulder offset
 * are multiplied by these (closer, a bit more behind the head), the crosshair is scaled by `crosshair`.
 */
export const AIM_CAMERA = Object.freeze({ distance: 0.45, shoulder: 0.75, crosshair: 0.6 });

/** The aim button's look: icon, label and title. */
export const AIM_BUTTON = Object.freeze({ icon: '🎯', label: 'AIM', title: 'Hold to aim' });

/**
 * Move the zoom amount (0 = not aimed, 1 = fully aimed) toward `on` over AIM_TIME_MS.
 * prev: the last amount, dtMs: time since then. Returns the new amount (0..1).
 */
export function aimBlend(prev, on, dtMs, timeMs = AIM_TIME_MS) {
  const p = clamp01(Number.isFinite(prev) ? prev : 0);
  const step = timeMs > 0 ? Math.max(0, Number.isFinite(dtMs) ? dtMs : 0) / timeMs : 1;
  return on ? Math.min(1, p + step) : Math.max(0, p - step);
}

/** The field of view (degrees) that zooms a camera with `fovDeg` in by `zoom` (2 = things look twice as big). */
export function zoomedFov(fovDeg, zoom) {
  if (!(zoom > 0) || !Number.isFinite(zoom)) return fovDeg;
  return (2 * Math.atan(Math.tan((fovDeg * Math.PI) / 360) / zoom) * 180) / Math.PI;
}

/**
 * The aim view for the weapon in your hand (an id or the weapon's rules object).
 * state: { held (the aim button / right mouse is down), blocked (shield raised, drinking or frozen: no aiming),
 *          blend (the zoom amount 0..1 from aimBlend; default 1 when aiming, else 0) }.
 * Returns {
 *   canAim:  the weapon can aim (show the AIM button),
 *   aiming:  aiming right now (tell the server: the aim flag; walk slower),
 *   blend:   the zoom amount used (0..1, 0 for a weapon that cannot aim),
 *   zoom:    the camera zoom now (1 = none ... the weapon's aim.zoom),
 *   moveMul: walking speed multiplier now (aim.moveMul while aiming, else 1),
 *   cameraDistance, shoulder: multipliers for the camera distance and shoulder offset (1 = normal),
 *   crosshairScale: 1 = normal ... AIM_CAMERA.crosshair, scope: show the round scope ring, scopeOpacity 0..1
 * }
 */
export function aimView(weapon, { held = false, blocked = false, blend } = {}, rules = RULES) {
  const a = aimDef(weapon, rules.WEAPONS);
  const aiming = !!a && !!held && !blocked;
  const b = a ? clamp01(Number.isFinite(blend) ? blend : aiming ? 1 : 0) : 0;
  const e = ease(b);
  return {
    canAim: !!a,
    aiming,
    blend: b,
    zoom: a ? lerp(1, a.zoom, e) : 1,
    moveMul: aiming ? a.moveMul : 1,
    cameraDistance: lerp(1, AIM_CAMERA.distance, e),
    shoulder: lerp(1, AIM_CAMERA.shoulder, e),
    crosshairScale: lerp(1, AIM_CAMERA.crosshair, e),
    scope: e > 0.02,
    scopeOpacity: e,
  };
}
