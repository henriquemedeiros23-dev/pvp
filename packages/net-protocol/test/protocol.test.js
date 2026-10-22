import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOCOL_VERSION, MAX_MESSAGE_SIZE, CLIENT_MESSAGES, SERVER_MESSAGES, SNAP, SNAP_LENGTH,
  FLAG_CROUCH, FLAG_SLIDE, FLAG_MOVING, FLAG_AIR, MAX_NUMBER,
  parseClientMessage, decodeServerMessage, encode, encodeClient, serverMessage, clientMessage,
  packSnapshotPlayer, unpackSnapshotPlayer, makeFlags, readFlags, makeStatus, readStatus, isValid, setEncodeChecks,
  STATUS_SHIELD_UP, STATUS_SHOCKED, STATUS_FROZEN,
} from '../src/index.js';

const J = JSON.stringify;

// One valid example per client message, shaped exactly like apps/game/public/js/game.js sends them.
const CLIENT_EXAMPLES = {
  join: { t: 'join' },
  leave: { t: 'leave' },
  state: { t: 'state', x: 12.34, y: 0, z: -40.5, ry: 1.571, pitch: -0.1, f: FLAG_MOVING | FLAG_AIR },
  fire: { t: 'fire', d: [0.1, -0.2, 0.97] },
  slot: { t: 'slot', i: 2 },
  open: { t: 'open', id: 7 },
  drink: { t: 'drink' },
  shield: { t: 'shield', up: true },
  drop: { t: 'drop' },
  throw: { t: 'throw', b: 'bomb', d: [0, -0.3, 0.95] },
};

// One valid example per server message, shaped exactly like apps/game/server.js sends them.
const SKIN = { color: 'black', hat: 'none', face: 'none', back: 'none', shirt: 'none' };
const SERVER_EXAMPLES = {
  welcome: {
    id: 3, x: 10, z: -20,
    players: [{ id: 3, name: 'Bob', skin: SKIN }],
    chests: [1, 4], golden: null,
    items: [{ id: 9, kind: 'weapon', weapon: 'shootbm', x: 1, y: 0, z: 2 }, { id: 10, kind: 'potion', weapon: null, x: 1, y: 0.5, z: 2 }],
  },
  full: {},
  left: {},
  snap: { p: [[3, 1.5, 0, -2.25, 0.5, -0.1, 5, 'shootbm', 100, 1, 'shield', 5]], n: 4 },
  inv: { weapons: ['fists', 'shootbm'], dur: [null, 12], slot: 0, potions: 2, coins: 120, hp: 100, shield: { id: 'megashield', dur: 64 },
    bombs: [{ id: 'bomb', n: 4 }, { id: 'legendarybomb', n: 0 }] },
  broke: { slot: 1, weapon: 'shootbm' },
  drink: { state: 'start', ms: 5000, hp: 40 },
  pjoin: { id: 3, name: 'Bob', skin: SKIN },
  pleave: { id: 3 },
  pos: { x: 1, y: 0, z: 2 },
  coins: { amount: 10, total: 130 },
  chest: { id: 4, open: true },
  golden: { golden: { x: 50, z: -30 } },
  'item+': { id: 9, kind: 'weapon', weapon: 'icesword', x: 1, y: 0, z: 2, dur: 17 },
  'item-': { id: 9, by: 3 },
  shot: { id: 3, w: 'shootbm', from: [1, 1.4, 2], to: [[5, 1, 9]] },
  swing: { id: 3 },
  block: { id: 3, by: 4 },
  shieldbroke: { weapon: 'shield' },
  hitmark: { dead: false, blocked: true },
  dmg: { id: 3, amount: 15, ko: true },
  hurt: { hp: 75, kx: 0, kz: 0, from: [3, 4] },
  ko: { id: 3, x: 1, y: 0, z: 2, victim: 'Bob', by: 'Ann', weapon: 'supersword' },
  dead: { by: null, weapon: 'electricsword' },
  bomb: { id: 12, by: 3, b: 'bomb', from: [1, 1.5, 2], to: [4, 0, 7], fly: 700, ms: 3000, area: 2 },
  boom: { id: 12, b: 'bomb', x: 4, y: 0, z: 7, area: 2 },
};

const rejected = (raw) => {
  let r;
  assert.doesNotThrow(() => { r = parseClientMessage(raw); });
  assert.equal(r.ok, false, `expected rejection of ${typeof raw === 'string' ? raw.slice(0, 80) : typeof raw}`);
  assert.equal(typeof r.error, 'string');
  return r.error;
};

test('constants', () => {
  assert.equal(PROTOCOL_VERSION, 4);
  assert.equal(MAX_MESSAGE_SIZE, 4096);
  assert.deepEqual([FLAG_CROUCH, FLAG_SLIDE, FLAG_MOVING, FLAG_AIR], [1, 2, 4, 8]);
  assert.equal(SNAP_LENGTH, 12);
  assert.deepEqual([STATUS_SHIELD_UP, STATUS_SHOCKED, STATUS_FROZEN], [1, 2, 4]);
  for (const gone of ['proj', 'proj-', 'mine+', 'mine-']) assert.ok(!(gone in SERVER_MESSAGES), `${gone} is gone (old explosives)`);
  assert.deepEqual(Object.keys(CLIENT_MESSAGES).sort(), Object.keys(CLIENT_EXAMPLES).sort());
  assert.deepEqual(Object.keys(SERVER_MESSAGES).sort(), Object.keys(SERVER_EXAMPLES).sort());
});

test('every message and field has a description', () => {
  for (const list of [CLIENT_MESSAGES, SERVER_MESSAGES]) {
    for (const [t, def] of Object.entries(list)) {
      assert.ok(def.about, `${t} has no description`);
      for (const [k, [, about]] of Object.entries(def.fields)) assert.ok(about, `${t}.${k} has no description`);
    }
  }
});

test('every valid client example passes and comes back equal', () => {
  for (const [t, ex] of Object.entries(CLIENT_EXAMPLES)) {
    const r = parseClientMessage(J(ex));
    assert.ok(r.ok, `${t}: ${r.error}`);
    assert.deepEqual(r.msg, ex);
  }
});

test('open accepts "golden"; drink has no fields; bandages and medkits are gone (#28)', () => {
  assert.deepEqual(parseClientMessage(J({ t: 'open', id: 'golden' })).msg, { t: 'open', id: 'golden' });
  assert.deepEqual(parseClientMessage(J({ t: 'drink' })).msg, { t: 'drink' });
  rejected(J({ t: 'heal', kind: 'medkit' }));
  rejected(J({ t: 'heal', kind: 'bandage' }));
  assert.throws(() => encode('item+', { id: 1, kind: 'medkit', weapon: null, x: 0, y: 0, z: 0 }));
  assert.throws(() => encode('drink', { state: 'half', ms: 0, hp: 1 }));
  for (const state of ['start', 'done', 'cancel']) assert.ok(decodeServerMessage(encode('drink', { state, ms: 0, hp: 100 })).ok);
});

test('client message as Buffer / Uint8Array works', () => {
  const raw = J(CLIENT_EXAMPLES.fire);
  assert.ok(parseClientMessage(Buffer.from(raw)).ok);
  assert.ok(parseClientMessage(new TextEncoder().encode(raw)).ok);
  assert.ok(parseClientMessage([Buffer.from(raw.slice(0, 5)), Buffer.from(raw.slice(5))]).ok);
});

test('unknown extra fields are dropped', () => {
  const r = parseClientMessage(J({ t: 'slot', i: 1, admin: true, __proto__x: 1, coins: 999999 }));
  assert.ok(r.ok);
  assert.deepEqual(r.msg, { t: 'slot', i: 1 });
  const r2 = parseClientMessage('{"t":"join","__proto__":{"polluted":1}}');
  assert.ok(r2.ok);
  assert.deepEqual(r2.msg, { t: 'join' });
  assert.equal({}.polluted, undefined);
});

test('bad messages are rejected without throwing', () => {
  // bad JSON / not an object / no type
  rejected('{"t":"join"');
  rejected('hello');
  rejected('');
  rejected('null');
  rejected('42');
  rejected('"join"');
  rejected('[{"t":"join"}]');
  rejected('{}');
  rejected(J({ t: 5 }));
  // not text at all
  rejected(undefined);
  rejected(null);
  rejected(12);
  rejected({ t: 'join' });
  // unknown type, including names that exist on Object.prototype
  rejected(J({ t: 'teleport' }));
  rejected(J({ t: 'constructor' }));
  rejected(J({ t: '__proto__' }));
  rejected(J({ t: 'toString' }));
  rejected(J({ t: 'welcome' })); // server-only message
  // missing field
  assert.match(rejected(J({ t: 'state', x: 1, y: 0, z: 1, ry: 0, pitch: 0 })), /state\.f: missing/);
  rejected(J({ t: 'fire' }));
  rejected(J({ t: 'drink', extra: 'x'.repeat(5000) }));
  // string instead of number
  assert.match(rejected(J({ ...CLIENT_EXAMPLES.state, x: '12' })), /state\.x: expected a number/);
  // NaN / Infinity (JSON cannot hold them, they turn into null or are invalid JSON)
  rejected(J({ ...CLIENT_EXAMPLES.state, y: NaN }));
  rejected('{"t":"state","x":NaN,"y":0,"z":0,"ry":0,"pitch":0,"f":0}');
  rejected('{"t":"state","x":Infinity,"y":0,"z":0,"ry":0,"pitch":0,"f":0}');
  rejected('{"t":"state","x":1e400,"y":0,"z":0,"ry":0,"pitch":0,"f":0}'); // parses to Infinity
  // absurdly large numbers and strings
  rejected(J({ ...CLIENT_EXAMPLES.state, z: MAX_NUMBER * 10 }));
  rejected(J({ ...CLIENT_EXAMPLES.state, f: 1 << 20 }));
  rejected(J({ t: 'open', id: 1e9 }));
  // huge arrays and messages
  rejected(J({ t: 'fire', d: new Array(1000).fill(0) }));
  rejected(J({ t: 'fire', d: new Array(100000).fill(0) }));
  rejected(J({ t: 'join', pad: 'x'.repeat(MAX_MESSAGE_SIZE) }));
  rejected('é'.repeat(MAX_MESSAGE_SIZE)); // short in chars, too big in bytes
  // wrong slot index type
  rejected(J({ t: 'slot', i: '1' }));
  rejected(J({ t: 'slot', i: 1.5 }));
  rejected(J({ t: 'slot', i: -1 }));
  rejected(J({ t: 'slot', i: [1] }));
  rejected(J({ t: 'slot', i: null }));
  // vector of wrong length or type
  rejected(J({ t: 'fire', d: [1, 0] }));
  rejected(J({ t: 'fire', d: [1, 0, 0, 0] }));
  rejected(J({ t: 'fire', d: [1, '0', 0] }));
  rejected(J({ t: 'fire', d: { 0: 1, 1: 0, 2: 0, length: 3 } }));
  // bad enum / union values
  rejected(J({ t: 'heal', kind: 'potion' }));  // no 'heal' message any more: it is 'drink'
  rejected(J({ t: 'open', id: 'silver' }));
  rejected(J({ t: 'open', id: true }));
  // deep nesting is fine to parse but still wrong
  rejected(J({ t: 'fire', d: [[[[[1]]]], 0, 0] }));
});

test('every valid server example encodes and decodes back', () => {
  for (const [t, fields] of Object.entries(SERVER_EXAMPLES)) {
    const s = encode(t, fields);
    const r = decodeServerMessage(s);
    assert.ok(r.ok, `${t}: ${r.error}`);
    assert.deepEqual(r.msg, { t, ...fields });
  }
});

test('golden "opened" form and expired item decode', () => {
  assert.ok(decodeServerMessage(encode('golden', { golden: null, by: 'Ann' })).ok);
  assert.deepEqual(decodeServerMessage(encode('item-', { id: 4 })).msg, { t: 'item-', id: 4 });
  assert.ok(decodeServerMessage(encode('inv', { ...SERVER_EXAMPLES.inv, picked: 'Supersword' })).ok);
  assert.ok(decodeServerMessage(encode('hurt', { hp: 0, kx: 3, kz: -3, from: null })).ok);
});

test('decodeServerMessage rejects bad server messages without throwing', () => {
  for (const raw of ['nope', '{"t":"join"}', J({ t: 'snap', p: [[1, 2, 3]], n: 1 }), J({ t: 'chest', id: 1, open: 'yes' })]) {
    let r;
    assert.doesNotThrow(() => { r = decodeServerMessage(raw); });
    assert.equal(r.ok, false);
  }
});

test('encode throws on mistakes in our own code', () => {
  assert.throws(() => encode('coins', { amount: 5 }), /coins\.total: missing/);
  assert.throws(() => encode('coins', { amount: 5, total: '10' }), /expected a number/);
  assert.throws(() => encode('pos', { x: NaN, y: 0, z: 0 }), /NaN/);
  assert.throws(() => encode('nope', {}), /unknown server message type/);
  assert.throws(() => encode('pleave', { id: 1, idd: 2 }), /unknown field "idd"/);
  assert.throws(() => encode('join', {}), /unknown server message type/); // client-only
  assert.throws(() => encodeClient('fire', { d: [1, 0] }), /exactly 3/);
  assert.equal(encodeClient('fire', { d: [0, 0, 1] }), '{"t":"fire","d":[0,0,1]}');
  assert.deepEqual(clientMessage('join'), { t: 'join' });
  assert.deepEqual(serverMessage('full'), { t: 'full' });
});

test('encode checks can be switched off', () => {
  setEncodeChecks(false);
  try {
    assert.equal(encode('coins', { amount: 5 }), '{"t":"coins","amount":5}');
  } finally {
    setEncodeChecks(true);
  }
  assert.throws(() => encode('coins', { amount: 5 }));
});

test('snapshot pack / unpack round-trip', () => {
  const p = {
    id: 7, x: 12.5, y: 0.25, z: -3.75, ry: 1.57, pitch: -0.2, flags: FLAG_CROUCH | FLAG_MOVING, weapon: 'supersword', hp: 64, protected: true,
    shield: 'megashield', shieldUp: true, shocked: false, frozen: true,
  };
  const a = packSnapshotPlayer(p);
  assert.equal(a.length, SNAP_LENGTH);
  assert.equal(a[SNAP.ID], 7);
  assert.equal(a[SNAP.WEAPON], 'supersword');
  assert.equal(a[SNAP.PROTECTED], 1);
  assert.equal(a[SNAP.SHIELD], 'megashield');
  assert.equal(a[SNAP.STATUS], STATUS_SHIELD_UP | STATUS_FROZEN);
  assert.deepEqual(unpackSnapshotPlayer(a), p);
  assert.deepEqual(unpackSnapshotPlayer(packSnapshotPlayer({ ...p, protected: false })).protected, false);
  // rounding to 2 decimals, like the server does today
  assert.equal(packSnapshotPlayer({ ...p, x: 1.23456 })[SNAP.X], 1.23);
  // packed players fit the snap schema
  assert.ok(decodeServerMessage(encode('snap', { p: [a], n: 1 })).ok);
});

test('status helpers and the shield fields', () => {
  assert.equal(makeStatus({ shieldUp: true, shocked: true }), 3);
  assert.equal(makeStatus(), 0);
  for (let f = 0; f < 8; f++) assert.equal(makeStatus(readStatus(f)), f);
  const none = unpackSnapshotPlayer(packSnapshotPlayer({ id: 1, x: 0, y: 0, z: 0, ry: 0, pitch: 0, flags: 0, weapon: '', hp: 5 }));
  assert.deepEqual([none.shield, none.shieldUp, none.shocked, none.frozen], ['', false, false, false]);
  // inv: no shield (null) or missing are both fine; a bad shield is rejected
  const { shield, ...noShield } = SERVER_EXAMPLES.inv;
  assert.ok(decodeServerMessage(encode('inv', noShield)).ok);
  assert.ok(decodeServerMessage(encode('inv', { ...noShield, shield: null })).ok);
  assert.equal(decodeServerMessage(J({ t: 'inv', ...noShield, shield: { id: 'shield', dur: -1 } })).ok, false);
  assert.equal(parseClientMessage(J({ t: 'shield', up: 'yes' })).ok, false);
  assert.equal(parseClientMessage(J({ t: 'shield' })).ok, false);
  assert.deepEqual(decodeServerMessage(encode('hitmark', { dead: true })).msg, { t: 'hitmark', dead: true });
});

test('flags helpers', () => {
  assert.equal(makeFlags({ crouch: true, air: true }), 9);
  assert.equal(makeFlags(), 0);
  assert.deepEqual(readFlags(6), { crouch: false, slide: true, moving: true, air: false });
  for (let f = 0; f < 16; f++) assert.equal(makeFlags(readFlags(f)), f);
});

test('durability fields: optional (old messages still work), null = never breaks, bad values rejected', () => {
  const { dur, ...oldInv } = SERVER_EXAMPLES.inv;
  assert.deepEqual(decodeServerMessage(encode('inv', oldInv)).msg, { t: 'inv', ...oldInv });
  assert.ok(decodeServerMessage(encode('item+', { id: 1, kind: 'weapon', weapon: 'gun', x: 0, y: 0, z: 0, dur: null })).ok);
  assert.ok(decodeServerMessage(encode('item+', { id: 1, kind: 'potion', weapon: null, x: 0, y: 0, z: 0 })).ok);
  const welcome = { ...SERVER_EXAMPLES.welcome, items: [{ id: 9, kind: 'weapon', weapon: 'shootbm', x: 1, y: 0, z: 2, dur: 3 }] };
  assert.deepEqual(decodeServerMessage(encode('welcome', welcome)).msg.items[0].dur, 3);
  for (const bad of [[-1], [1.5], ['5']]) {
    assert.equal(decodeServerMessage(J({ t: 'inv', ...oldInv, dur: bad })).ok, false, J(bad));
  }
  assert.equal(decodeServerMessage(J({ t: 'broke', slot: 1 })).ok, false);
  assert.deepEqual(decodeServerMessage(encode('broke', { slot: 2, weapon: 'shootbm' })).msg, { t: 'broke', slot: 2, weapon: 'shootbm' });
});

test('isValid helper', () => {
  assert.equal(isValid('vec3', [1, 2, 3]), true);
  assert.equal(isValid('vec3', [1, 2]), false);
  assert.equal(isValid({ nullable: 'string' }, null), true);
});

test('same input gives the same result every time', () => {
  const raw = J({ ...CLIENT_EXAMPLES.state, extra: 1 });
  assert.deepEqual(parseClientMessage(raw), parseClientMessage(raw));
  assert.deepEqual(parseClientMessage('{bad'), parseClientMessage('{bad'));
});

test('bombs (#32): throw, bomb, boom, bomb items and the bombs counter', () => {
  assert.deepEqual(parseClientMessage(J({ t: 'throw', b: 'legendarybomb', d: [0, 0, 1], x: 5 })).msg, { t: 'throw', b: 'legendarybomb', d: [0, 0, 1] });
  rejected(J({ t: 'throw', d: [0, 0, 1] }));             // which bomb?
  rejected(J({ t: 'throw', b: 'bomb' }));                 // no aim
  rejected(J({ t: 'throw', b: 'bomb', d: [0, 0] }));
  rejected(J({ t: 'throw', b: 'x'.repeat(100), d: [0, 0, 1] }));
  const item = { id: 3, kind: 'bomb', weapon: 'legendarybomb', x: 1, y: 0, z: 2, n: 3 };
  assert.deepEqual(decodeServerMessage(encode('item+', item)).msg, { t: 'item+', ...item });
  assert.equal(decodeServerMessage(J({ t: 'item+', ...item, n: -1 })).ok, false);
  const live = { ...SERVER_EXAMPLES.bomb };
  assert.deepEqual(decodeServerMessage(encode('welcome', { ...SERVER_EXAMPLES.welcome, bombs: [live] })).msg.bombs, [live]);
  assert.ok(decodeServerMessage(encode('welcome', SERVER_EXAMPLES.welcome)).ok, 'bombs in welcome are optional');
  const { bombs, ...oldInv } = SERVER_EXAMPLES.inv;
  assert.ok(decodeServerMessage(encode('inv', oldInv)).ok, 'bombs in inv are optional');
  assert.equal(decodeServerMessage(J({ t: 'inv', ...oldInv, bombs: [{ id: 'bomb', n: 1.5 }] })).ok, false);
  assert.throws(() => encode('boom', { id: 1, b: 'bomb', x: 0, y: 0, z: 0 }), /area/);
  assert.throws(() => encode('bomb', { ...SERVER_EXAMPLES.bomb, fly: -5 }));
});

test('dmg: damage numbers for everyone nearby (#33)', () => {
  for (const f of [{ id: 3, amount: 15 }, { id: 3, amount: 1, shock: true }, { id: 3, amount: 40, ko: true }, { id: 3, amount: 0, blocked: true }]) {
    const r = decodeServerMessage(encode('dmg', f));
    assert.ok(r.ok, r.error);
    assert.deepEqual(r.msg, { t: 'dmg', ...f });
  }
  assert.throws(() => encode('dmg', { id: 3, amount: -5 }));
  assert.throws(() => encode('dmg', { id: 3 }));
  assert.equal(decodeServerMessage('{"t":"dmg","id":3,"amount":1.5}').ok, false);
});
