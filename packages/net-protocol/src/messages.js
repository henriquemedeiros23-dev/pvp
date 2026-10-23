// Every message between the phone (client) and the game server.
// Each message is one JSON object; field `t` is the message type.
// Each field is [spec, what it means]. See schema.js for the spec format.

import { deepFreeze } from './freeze.js';

/** Bump when a message changes in a way old phones or servers would not understand. */
export const PROTOCOL_VERSION = 5; // 2: shields and status effects (#26), explosives removed; 3: 'dmg' damage numbers (#33); 4: bombs (#32); 5: inv.charge per slot (#38)

/** Longest raw message a client may send (bytes). Same as the server's WebSocket maxPayload. */
export const MAX_CLIENT_MESSAGE_SIZE = 4096;
/** Longest raw message the client accepts from the server (bytes). */
export const MAX_SERVER_MESSAGE_SIZE = 1 << 20;

/** Highest weapon slot index a client may ask for (the server still checks its own inventory). */
export const MAX_SLOT_INDEX = 31;

/** Snapshot array slots: snap.p is a list of these arrays, one per nearby player. */
export const SNAP = deepFreeze({
  ID: 0, X: 1, Y: 2, Z: 3, RY: 4, PITCH: 5, FLAGS: 6, WEAPON: 7, HP: 8, PROTECTED: 9, SHIELD: 10, STATUS: 11,
});
export const SNAP_LENGTH = 12;

/** Status bits in snapshot STATUS: shield raised, shocked (losing HP over time), frozen (stuck). */
export const STATUS_SHIELD_UP = 1;
export const STATUS_SHOCKED = 2;
export const STATUS_FROZEN = 4;

/** Movement flag bits used in state.f and in snapshot FLAGS. */
export const FLAG_CROUCH = 1;
export const FLAG_SLIDE = 2;
export const FLAG_MOVING = 4;
export const FLAG_AIR = 8;
export const FLAGS_MASK = FLAG_CROUCH | FLAG_SLIDE | FLAG_MOVING | FLAG_AIR;

const ITEM_KINDS = ['weapon', 'potion', 'bomb'];
const DRINK_STATES = ['start', 'done', 'cancel'];
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
  dur: { optional: DUR }, n: 'uint?',
} };
// Bombs carried (#32): one entry per bomb id, e.g. [{ id: 'bomb', n: 4 }, { id: 'legendarybomb', n: 0 }].
const BOMB_COUNTS = { list: { obj: { id: 'string', n: 'uint' } }, max: 16 };
// A bomb in the air or on the ground, waiting to explode.
const LIVE_BOMB = { obj: {
  id: 'uint', by: 'uint', b: 'string', from: 'vec3', to: 'vec3', fly: 'uint', ms: 'uint', area: 'number',
} };
// The shield you wear: its weapon id and the blocked hits it has left.
const SHIELD = { obj: { id: 'string', dur: 'uint' } };
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
  'string',        // SHIELD: shield id worn on the left arm, '' = none
  { type: 'int', min: 0, max: 255 }, // STATUS bits
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
    i: [{ type: 'int', min: 0, max: MAX_SLOT_INDEX }, 'Slot index, 0 = the first slot'],
  }),
  open: m('Open the chest I am standing next to.', {
    id: [{ oneOf: [{ type: 'int', min: 0, max: 100000 }, { enum: ['golden'] }] }, 'Chest index, or "golden" for the golden chest'],
  }),
  drop: m('Drop the weapon in my hand on the ground (it keeps its durability; anyone can pick it up).'),
  shield: m('Raise (up: true) or lower my shield. Ignored without a shield or while frozen.', {
    up: ['bool', 'true = raise the shield, false = lower it'],
  }),
  drink: m('Start drinking a Healing Potion (takes a few seconds; switching weapon slots cancels it).'),
  throw: m('Throw one bomb (#32). Where it lands follows the aim, at most the bomb\'s maxThrow meters away.', {
    b: ['string', 'Bomb id, e.g. "bomb" or "legendarybomb"'],
    d: ['vec3', 'Aim direction [x, y, z] (server normalizes it)'],
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
    bombs: [{ optional: { list: LIVE_BOMB, max: 1000 } }, 'Bombs that have not exploded yet (same fields as "bomb")'],
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
    charge: [{ optional: { list: 'uint', max: 32 } }, 'Ms until each slot\'s weapon is fully charged, same order as weapons (0 = ready); a hit while charging does CHARGING_DAMAGE (25%) (#38)'],
    slot: ['uint', 'Slot in hand'],
    potions: ['uint', 'Healing Potions carried (max MAX_POTIONS in the rules)'],
    coins: [BIG_INT, 'Your coins'],
    hp: ['int', 'Your health'],
    shield: [{ optional: { nullable: SHIELD } }, 'The shield on your arm { id, dur } (dur = blocked hits left), or null'],
    bombs: [{ optional: BOMB_COUNTS }, 'Bombs carried: [{ id, n }] (max is each bomb\'s maxCarry in the rules)'],
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
    id: ['uint', 'Item id'], kind: [{ enum: ITEM_KINDS }, '"weapon", "potion" or "bomb"'],
    weapon: [{ nullable: 'string' }, 'Weapon id when kind is "weapon", bomb id when kind is "bomb", else null'],
    x: ['number', 'X'], y: ['number', 'Height'], z: ['number', 'Z'],
    dur: [{ optional: DUR }, 'Weapon only: uses left (null = never breaks)'],
    n: ['uint?', 'Bomb only: how many bombs (a Legendary Bomb pack is 3)'],
  }),
  bomb: m('Someone threw a bomb (to everyone): it flies along an arc to its landing spot, then the red area shows until it explodes.', {
    id: ['uint', 'Bomb id (the "boom" has the same id)'],
    by: ['uint', 'Thrower id'],
    b: ['string', 'Bomb id in the rules, e.g. "bomb"'],
    from: ['vec3', 'Where it leaves the hand'],
    to: ['vec3', 'Where it lands'],
    fly: ['uint', 'Flight time in ms (it lands, and the red outline shows, after this)'],
    ms: ['uint', 'Time left until it explodes, in ms (the whole fuse when just thrown)'],
    area: ['number', 'Side of the square area on the ground, in meters'],
  }),
  boom: m('A bomb exploded (to everyone). Hurt players get "hurt" as usual.', {
    id: ['uint', 'Bomb id'], b: ['string', 'Bomb id in the rules'],
    x: ['number', 'X'], y: ['number', 'Height'], z: ['number', 'Z'],
    area: ['number', 'Side of the square area, in meters'],
  }),
  drink: m('Your potion drinking started, finished (full health) or was cancelled (potion wasted).', {
    state: [{ enum: DRINK_STATES }, '"start", "done" or "cancel"'],
    ms: ['uint', 'Drinking time left in ms (the whole time on "start", 0 when done or cancelled)'],
    hp: ['int', 'Your health now'],
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
  block: m('A raised shield blocked a hit (to everyone, for the spark).', {
    id: ['uint', 'Player whose shield blocked'], by: ['uint', 'Attacker id'],
  }),
  shieldbroke: m('Your shield broke (durability 0) and is gone. An "inv" follows.', {
    weapon: ['string', 'Shield id'],
  }),
  hitmark: m('You hit someone.', {
    dead: ['bool', 'true if that hit knocked them out'],
    blocked: ['bool?', 'true if their shield blocked it'],
  }),
  dmg: m('A player near you lost health (or a shield blocked the hit): show the number above their head.', {
    id: ['uint', 'Player who got hurt (can be you)'],
    amount: ['uint', 'Health lost (0 when blocked)'],
    ko: ['bool?', 'true if it knocked them out'],
    blocked: ['bool?', 'true if their raised shield blocked it (amount 0)'],
    shock: ['bool?', 'true for a shock tick (Electric Sword)'],
  }),
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
