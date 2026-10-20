// Every message between the phone (client) and the game server.
// Each message is one JSON object; field `t` is the message type.
// Each field is [spec, what it means]. See schema.js for the spec format.

import { deepFreeze } from './freeze.js';

/** Bump when a message changes in a way old phones or servers would not understand. */
export const PROTOCOL_VERSION = 1;

/** Longest raw message a client may send (bytes). Same as the server's WebSocket maxPayload. */
export const MAX_CLIENT_MESSAGE_SIZE = 4096;
/** Longest raw message the client accepts from the server (bytes). */
export const MAX_SERVER_MESSAGE_SIZE = 1 << 20;

/** Highest weapon slot index a client may ask for (the server still checks its own inventory). */
export const MAX_SLOT_INDEX = 31;

/** Snapshot array slots: snap.p is a list of these arrays, one per nearby player. */
export const SNAP = deepFreeze({
  ID: 0, X: 1, Y: 2, Z: 3, RY: 4, PITCH: 5, FLAGS: 6, WEAPON: 7, HP: 8, PROTECTED: 9,
});
export const SNAP_LENGTH = 10;

/** Movement flag bits used in state.f and in snapshot FLAGS. */
export const FLAG_CROUCH = 1;
export const FLAG_SLIDE = 2;
export const FLAG_MOVING = 4;
export const FLAG_AIR = 8;
export const FLAGS_MASK = FLAG_CROUCH | FLAG_SLIDE | FLAG_MOVING | FLAG_AIR;

const ITEM_KINDS = ['weapon', 'bandage', 'medkit'];
const HEAL_KINDS = ['bandage', 'medkit'];
const BIG_INT = { type: 'int', min: 0, max: 2 ** 31 - 1 };      // coins can grow past MAX_NUMBER
const FLAGS = { type: 'int', min: 0, max: 255 };
const ANGLE = { type: 'number', min: -1000, max: 1000 };          // radians, may wind up a bit

const SKIN = { obj: {
  color: 'string?', hat: 'string?', face: 'string?', back: 'string?', shirt: 'string?',
} };
const PLAYER_INFO = { obj: { id: 'uint', name: 'string', skin: SKIN } };
const DUR = { nullable: 'uint' };                                 // uses left, null = never breaks
const ITEM = { obj: {
  id: 'uint', kind: { enum: ITEM_KINDS }, weapon: { nullable: 'string' }, x: 'number', y: 'number', z: 'number',
  dur: { optional: DUR },
} };
const MINE = { obj: { id: 'uint', x: 'number', z: 'number', owner: 'uint' } };
const SNAP_PLAYER = { tuple: [
  'uint',          // ID
  'number',        // X
  'number',        // Y
  'number',        // Z
  ANGLE,           // RY
  ANGLE,           // PITCH
  FLAGS,           // FLAGS
  'string',        // WEAPON
  'int',           // HP
  { enum: [0, 1] }, // PROTECTED
] };

const m = (about, fields = {}) => ({ about, fields });

/** Messages the phone sends to the server. */
export const CLIENT_MESSAGES = deepFreeze({
  join: m('Join the fight (after logging in on the WebSocket URL with ?token=).'),
  leave: m('Leave the fight alive; weapons go back to the backpack. Server answers "left".'),
  state: m('My position and look, about 20 times a second.', {
    x: ['number', 'X position (meters)'],
    y: ['number', 'Height above the ground (meters)'],
    z: ['number', 'Z position (meters)'],
    ry: [ANGLE, 'Body turn around the up axis (radians)'],
    pitch: [ANGLE, 'Look up/down (radians)'],
    f: [FLAGS, 'Movement flags: 1 crouch, 2 slide, 4 moving, 8 in air'],
  }),
  fire: m('Use the weapon in my hand.', {
    d: ['vec3', 'Aim direction [x, y, z] (server normalizes it)'],
  }),
  slot: m('Switch to weapon slot i.', {
    i: [{ type: 'int', min: 0, max: MAX_SLOT_INDEX }, 'Slot index, 0 = basic weapon'],
  }),
  open: m('Open the chest I am standing next to.', {
    id: [{ oneOf: [{ type: 'int', min: 0, max: 100000 }, { enum: ['golden'] }] }, 'Chest index, or "golden" for the golden chest'],
  }),
  heal: m('Use a heal item.', {
    kind: [{ enum: HEAL_KINDS }, '"bandage" or "medkit"'],
  }),
});

/** Messages the server sends to phones. */
export const SERVER_MESSAGES = deepFreeze({
  welcome: m('You joined. Everything you need to draw the arena.', {
    id: ['uint', 'Your player id'],
    x: ['number', 'Spawn X'],
    z: ['number', 'Spawn Z'],
    players: [{ list: PLAYER_INFO, max: 1000 }, 'Everyone in the arena: { id, name, skin }'],
    chests: [{ list: 'uint', max: 10000 }, 'Indexes of chests that are open right now'],
    golden: [{ nullable: { obj: { x: 'number', z: 'number' } } }, 'Golden chest spot { x, z }, or null'],
    items: [{ list: ITEM, max: 10000 }, 'Items on the ground: { id, kind, weapon, x, y, z }'],
    mines: [{ list: MINE, max: 10000 }, 'Mines on the ground: { id, x, z, owner }'],
  }),
  full: m('The arena is full, try again later.'),
  left: m('You left the fight (answer to "leave").'),
  snap: m('Snapshot, 20 times a second: players near you, packed as arrays (see SNAP).', {
    p: [{ list: SNAP_PLAYER, max: 1000 }, 'One array per nearby player (you included)'],
    n: ['uint', 'How many players are in the whole arena'],
  }),
  inv: m('Your inventory and health.', {
    weapons: [{ list: 'string', max: 32 }, 'Weapon ids, one per slot'],
    dur: [{ optional: { list: DUR, max: 32 } }, 'Uses left per slot, same order as weapons (null = never breaks); max is the weapon\'s durability in the rules'],
    slot: ['uint', 'Slot in hand'],
    bandages: ['uint', 'Bandages carried'],
    medkits: ['uint', 'Medkits carried'],
    coins: [BIG_INT, 'Your coins'],
    hp: ['int', 'Your health'],
    picked: ['string?', 'Name of what you just picked up, if anything'],
  }),
  pjoin: m('A player joined.', {
    id: ['uint', 'Player id'], name: ['string', 'Player name'], skin: [SKIN, 'Skin { color, hat, face, back, shirt }'],
  }),
  pleave: m('A player left or was removed.', { id: ['uint', 'Player id'] }),
  pos: m('Server put you back here (you moved too far too fast).', {
    x: ['number', 'X'], y: ['number', 'Height'], z: ['number', 'Z'],
  }),
  coins: m('You got coins.', { amount: ['int', 'Coins just gained'], total: [BIG_INT, 'Coins in total'] }),
  chest: m('A chest opened or came back.', { id: ['uint', 'Chest index'], open: ['bool', 'true = open (empty), false = closed (full again)'] }),
  golden: m('Golden chest appeared, or someone opened it.', {
    golden: [{ nullable: { obj: { x: 'number', z: 'number' } } }, 'Spot { x, z }, or null when it is gone'],
    by: ['string?', 'Name of who opened it (only when gone)'],
  }),
  'item+': m('An item dropped on the ground.', {
    id: ['uint', 'Item id'], kind: [{ enum: ITEM_KINDS }, '"weapon", "bandage" or "medkit"'],
    weapon: [{ nullable: 'string' }, 'Weapon id when kind is "weapon", else null'],
    x: ['number', 'X'], y: ['number', 'Height'], z: ['number', 'Z'],
    dur: [{ optional: DUR }, 'Weapon only: uses left (null = never breaks)'],
  }),
  broke: m('Your weapon broke (durability 0) and is gone. An "inv" follows.', {
    slot: ['uint', 'Slot it was in'], weapon: ['string', 'Weapon id'],
  }),
  'item-': m('An item is gone (picked up or expired).', {
    id: ['uint', 'Item id'], by: ['uint?', 'Player who picked it up, missing if it expired'],
  }),
  shot: m('Someone fired a gun.', {
    id: ['uint', 'Shooter id'], w: ['string', 'Weapon id'],
    from: ['vec3', 'Muzzle position'], to: [{ list: 'vec3', max: 64 }, 'End point of each bullet'],
  }),
  swing: m('Someone swung a melee weapon.', { id: ['uint', 'Player id'] }),
  proj: m('A grenade or rocket was launched.', {
    id: ['uint', 'Projectile id'], kind: ['string', 'Weapon id ("grenade", "rocket")'],
    x: ['number', 'Start X'], y: ['number', 'Start height'], z: ['number', 'Start Z'],
    vx: ['number', 'Speed X'], vy: ['number', 'Speed up'], vz: ['number', 'Speed Z'],
  }),
  'proj-': m('A projectile is gone (it exploded).', { id: ['uint', 'Projectile id'] }),
  boom: m('Explosion.', { x: ['number', 'X'], y: ['number', 'Height'], z: ['number', 'Z'], r: ['number', 'Radius'] }),
  'mine+': m('A mine was placed.', {
    id: ['uint', 'Mine id'], x: ['number', 'X'], y: ['number', 'Height'], z: ['number', 'Z'], owner: ['uint', 'Owner player id'],
  }),
  'mine-': m('A mine is gone (exploded, replaced or expired).', { id: ['uint', 'Mine id'] }),
  hitmark: m('You hit someone.', { dead: ['bool', 'true if that hit knocked them out'] }),
  hurt: m('You got hurt.', {
    hp: ['int', 'Your health now'], kx: ['number', 'Knockback X'], kz: ['number', 'Knockback Z'],
    from: [{ nullable: 'vec2' }, 'Attacker position [x, z], or null'],
  }),
  ko: m('Someone was knocked out (to everyone).', {
    id: ['uint', 'Player id'], x: ['number', 'X'], y: ['number', 'Height'], z: ['number', 'Z'],
    victim: ['string', 'Name of who was knocked out'], by: [{ nullable: 'string' }, 'Name of who did it, or null'],
    weapon: ['string', 'Weapon id used'],
  }),
  dead: m('You were knocked out; back to the menu.', {
    by: [{ nullable: 'string' }, 'Name of who did it, or null'], weapon: ['string', 'Weapon id used'],
  }),
});

// Plain { name: spec } per type, used by the checker.
const specsOf = list => Object.fromEntries(Object.entries(list).map(([t, def]) =>
  [t, Object.fromEntries(Object.entries(def.fields).map(([k, [spec]]) => [k, spec]))]));
export const CLIENT_SPECS = deepFreeze(specsOf(CLIENT_MESSAGES));
export const SERVER_SPECS = deepFreeze(specsOf(SERVER_MESSAGES));
