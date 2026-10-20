// Snapshot players are sent as short arrays to save bandwidth.
// Slot order (see SNAP): [id, x, y, z, ry, pitch, flags, weapon, hp, protected]

import { SNAP, SNAP_LENGTH, FLAG_CROUCH, FLAG_SLIDE, FLAG_MOVING, FLAG_AIR } from './messages.js';

const r2 = v => Math.round(v * 100) / 100;

/**
 * Pack a player into a snapshot array. Positions and angles are rounded to 2 decimals.
 * p: { id, x, y, z, ry, pitch, flags, weapon, hp, protected (boolean) }
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
  return a;
}

/** Turn a snapshot array back into { id, x, y, z, ry, pitch, flags, weapon, hp, protected }. */
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
  };
}

/** Build movement flags from { crouch, slide, moving, air } booleans. */
export function makeFlags({ crouch = false, slide = false, moving = false, air = false } = {}) {
  return (crouch ? FLAG_CROUCH : 0) | (slide ? FLAG_SLIDE : 0) | (moving ? FLAG_MOVING : 0) | (air ? FLAG_AIR : 0);
}

/** Read movement flags into { crouch, slide, moving, air } booleans. */
export function readFlags(f) {
  return { crouch: !!(f & FLAG_CROUCH), slide: !!(f & FLAG_SLIDE), moving: !!(f & FLAG_MOVING), air: !!(f & FLAG_AIR) };
}
