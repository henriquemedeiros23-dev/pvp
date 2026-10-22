// Pure animation math: turns a movement state into a pose (numbers only, no three.js).
// Same inputs always give the same pose, so it can be unit-tested and replayed.

/** Hip heights for the main stances. */
export const STAND_HIP_Y = 0.95;
export const CROUCH_HIP_Y = 0.62;
export const SLIDE_HIP_Y = 0.45;

/** Weapon types that hold the arms forward to aim (melee swings). */
export const AIM_TYPES = Object.freeze(['gun']);

/** The left arm while the shield is raised: forward, holding it in front of the chest (the face stays visible). */
export const SHIELD_ARM = Object.freeze({ x: -1.2, z: 0.2 });

/** The pose of a stickman before any animation has run. */
export function restPose() {
  return {
    walk: 0,
    hipY: STAND_HIP_Y,
    lean: 0,
    legL: 0,
    legR: 0,
    headX: 0,
    armL: { x: 0, z: -0.12 },
    armR: { x: -0.3, z: 0.12 },
    cape: 0.15,
  };
}

/**
 * Compute the next pose.
 * state: { speed, crouch, slide, air, pitch, time, weaponType, swing, recoil, shield }
 *   speed            horizontal speed (units/s)
 *   crouch/slide/air booleans
 *   pitch            look up/down angle (radians)
 *   time             seconds, passed in (idle breathing and cape flutter)
 *   weaponType       'melee' | 'gun' | null
 *   shield           how far the shield is raised, 0 (down) -> 1 (up in front of you)
 *   swing            melee swing progress, 1 (just started) -> 0
 *   recoil           gun recoil, 1 -> 0
 * prev: the previous pose (null/undefined starts from restPose()). It is not changed.
 * dt:   seconds since the previous pose.
 * Angles are rotations around x (negative = forward) in radians; hipY is in world units.
 */
export function computePose(state = {}, prev, dt = 0) {
  const {
    speed = 0, crouch = false, slide = false, air = false, pitch = 0, time = 0,
    weaponType = null, swing = 0, recoil = 0, shield = 0,
  } = state;
  const p = prev || restPose();

  const moving = speed > 0.3;
  const walk = p.walk + dt * (moving ? 2.2 + speed * 0.9 : 0);
  const swingAmt = moving && !air ? Math.min(1, speed / 6) * 0.8 : 0;
  const s = Math.sin(walk);

  let hipY = STAND_HIP_Y, lean = 0;
  let legL = s * swingAmt, legR = -s * swingAmt;
  if (crouch) { hipY = CROUCH_HIP_Y; legL = legL * 0.5 + 0.9; legR = legR * 0.5 - 0.3; lean = 0.25; }
  if (slide) { hipY = SLIDE_HIP_Y; legL = -1.3; legR = -1.1; lean = -0.5; }
  if (air && !slide) { legL = 0.5; legR = -0.3; }
  if (!moving && !crouch && !slide && !air) hipY += Math.sin(time * 2) * 0.01;

  // body parts ease towards their target
  const k = Math.min(1, Math.max(0, dt) * 14);
  const ease = (from, to) => from + (to - from) * k;

  let armL, armR;
  if (AIM_TYPES.includes(weaponType)) {
    // aim: arms point forward along the look direction
    const aim = -Math.PI / 2 - pitch + recoil * 0.3;
    armR = { x: aim, z: 0 };
    armL = { x: aim + 0.1, z: -0.35 };
  } else {
    const sw = swing > 0 ? Math.sin((1 - swing) * Math.PI) : 0;
    armR = { x: -s * swingAmt * 0.8 - 0.3 - sw * 2.2, z: 0.12 };
    armL = { x: s * swingAmt * 0.8, z: -0.12 };
  }
  // shield raised: the left arm holds it straight out in front
  const sh = Math.min(1, Math.max(0, shield));
  if (sh > 0) armL = { x: armL.x + (SHIELD_ARM.x - armL.x) * sh, z: armL.z + (SHIELD_ARM.z - armL.z) * sh };

  return {
    walk,
    hipY: ease(p.hipY, hipY),
    lean: ease(p.lean, lean),
    legL: ease(p.legL, legL),
    legR: ease(p.legR, legR),
    headX: -pitch * 0.4,
    armL,
    armR,
    cape: 0.15 + Math.min(1, speed / 8) * 0.9 + Math.sin(time * 6) * 0.05,
  };
}

/** Hue (0..1) of the rainbow skin at a time in seconds. */
export function rainbowHue(time) {
  return (((time * 0.15) % 1) + 1) % 1;
}
