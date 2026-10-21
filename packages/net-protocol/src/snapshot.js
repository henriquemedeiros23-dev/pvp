// Snapshot players are sent as short arrays to save bandwidth.
// Slot order (see SNAP): [id, x, y, z, ry, pitch, flags, weapon, hp, protected, shield, status]

import {
  SNAP, SNAP_LENGTH, FLAG_CROUCH, FLAG_SLIDE, FLAG_MOVING, FLAG_AIR, STATUS_SHIELD_UP, STATUS_SHOCKED, STATUS_FROZEN,
} from './messages.js';

const r2 = v => Math.round(v * 100) / 100;

/**
 * Pack a player into a snapshot array. Positions and angles are rounded to 2 decimals.
 * p: { id, x, y, z, ry, pitch, flags, weapon, hp, protected, shield ('' or id), shieldUp, shocked, frozen }
 */
export function packSnapshotPlayer(p) {
  const a = new Array(SNAP_LENGTH);
  a[SNAP.ID] = p.id;
  a[SNAP.X] = r2(p.x);
  a[SNAP.Y] = r2(p.y);
  a[SNAP.Z] = r2(p.z);
  a[SNAP.RY] = r2(p.ry);
  a[SNAP.PITCH] = r2(p.pitch);
  a[SNAP.FLAGS] = p.flags | 0;
  a[SNAP.WEAPON] = p.weapon;
  a[SNAP.HP] = p.hp;
  a[SNAP.PROTECTED] = p.protected ? 1 : 0;
  a[SNAP.SHIELD] = p.shield || '';
  a[SNAP.STATUS] = makeStatus(p);
  return a;
}

/** Turn a snapshot array back into { id, x, y, z, ry, pitch, flags, weapon, hp, protected, shield, shieldUp, shocked, frozen }. */
export function unpackSnapshotPlayer(a) {
  return {
    id: a[SNAP.ID],
    x: a[SNAP.X],
    y: a[SNAP.Y],
    z: a[SNAP.Z],
    ry: a[SNAP.RY],
    pitch: a[SNAP.PITCH],
    flags: a[SNAP.FLAGS],
    weapon: a[SNAP.WEAPON],
    hp: a[SNAP.HP],
    protected: a[SNAP.PROTECTED] === 1,
    shield: a[SNAP.SHIELD] || '',
    ...readStatus(a[SNAP.STATUS]),
  };
}

/** Build snapshot status bits from { shieldUp, shocked, frozen } booleans. */
export function makeStatus({ shieldUp = false, shocked = false, frozen = false } = {}) {
  return (shieldUp ? STATUS_SHIELD_UP : 0) | (shocked ? STATUS_SHOCKED : 0) | (frozen ? STATUS_FROZEN : 0);
}

/** Read snapshot status bits into { shieldUp, shocked, frozen } booleans. */
export function readStatus(s) {
  return { shieldUp: !!(s & STATUS_SHIELD_UP), shocked: !!(s & STATUS_SHOCKED), frozen: !!(s & STATUS_FROZEN) };
}

/** Build movement flags from { crouch, slide, moving, air } booleans. */
export function makeFlags({ crouch = false, slide = false, moving = false, air = false } = {}) {
  return (crouch ? FLAG_CROUCH : 0) | (slide ? FLAG_SLIDE : 0) | (moving ? FLAG_MOVING : 0) | (air ? FLAG_AIR : 0);
}

/** Read movement flags into { crouch, slide, moving, air } booleans. */
export function readFlags(f) {
  return { crouch: !!(f & FLAG_CROUCH), slide: !!(f & FLAG_SLIDE), moving: !!(f & FLAG_MOVING), air: !!(f & FLAG_AIR) };
}
