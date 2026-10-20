import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROTOCOL_VERSION, MAX_MESSAGE_SIZE, CLIENT_MESSAGES, SERVER_MESSAGES, SNAP, SNAP_LENGTH,
  FLAG_CROUCH, FLAG_SLIDE, FLAG_MOVING, FLAG_AIR, MAX_NUMBER,
  parseClientMessage, decodeServerMessage, encode, encodeClient, serverMessage, clientMessage,
  packSnapshotPlayer, unpackSnapshotPlayer, makeFlags, readFlags, isValid, setEncodeChecks,
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
  heal: { t: 'heal', kind: 'bandage' },
};

// One valid example per server message, shaped exactly like apps/game/server.js sends them.
const SKIN = { color: 'black', hat: 'none', face: 'none', back: 'none', shirt: 'none' };
const SERVER_EXAMPLES = {
  welcome: {
    id: 3, x: 10, z: -20,
    players: [{ id: 3, name: 'Bob', skin: SKIN }],
    chests: [1, 4], golden: null,
    items: [{ id: 9, kind: 'weapon', weapon: 'pistol', x: 1, y: 0, z: 2 }, { id: 10, kind: 'medkit', weapon: null, x: 1, y: 0.5, z: 2 }],
    mines: [{ id: 11, x: 5, z: 5, owner: 2 }],
  },
  full: {},
  left: {},
  snap: { p: [[3, 1.5, 0, -2.25, 0.5, -0.1, 5, 'pistol', 100, 1]], n: 4 },
  inv: { weapons: ['fists', 'pistol'], slot: 0, bandages: 1, medkits: 0, coins: 120, hp: 100 },
  pjoin: { id: 3, name: 'Bob', skin: SKIN },
  pleave: { id: 3 },
  pos: { x: 1, y: 0, z: 2 },
  coins: { amount: 10, total: 130 },
  chest: { id: 4, open: true },
  golden: { golden: { x: 50, z: -30 } },
  'item+': { id: 9, kind: 'weapon', weapon: 'shotgun', x: 1, y: 0, z: 2 },
  'item-': { id: 9, by: 3 },
  shot: { id: 3, w: 'shotgun', from: [1, 1.4, 2], to: [[5, 1, 9], [6, 1, 9]] },
  swing: { id: 3 },
  proj: { id: 20, kind: 'grenade', x: 1, y: 1, z: 2, vx: 0, vy: 4, vz: 14 },
  'proj-': { id: 20 },
  boom: { x: 1, y: 0.3, z: 2, r: 4 },
  'mine+': { id: 21, x: 1, y: 0, z: 2, owner: 3 },
  'mine-': { id: 21 },
  hitmark: { dead: false },
  hurt: { hp: 75, kx: 0, kz: 0, from: [3, 4] },
  ko: { id: 3, x: 1, y: 0, z: 2, victim: 'Bob', by: 'Ann', weapon: 'sniper' },
  dead: { by: null, weapon: 'mine' },
};

const rejected = (raw) => {
  let r;
  assert.doesNotThrow(() => { r = parseClientMessage(raw); });
  assert.equal(r.ok, false, `expected rejection of ${typeof raw === 'string' ? raw.slice(0, 80) : typeof raw}`);
  assert.equal(typeof r.error, 'string');
  return r.error;
};

test('constants', () => {
  assert.equal(PROTOCOL_VERSION, 1);
  assert.equal(MAX_MESSAGE_SIZE, 4096);
  assert.deepEqual([FLAG_CROUCH, FLAG_SLIDE, FLAG_MOVING, FLAG_AIR], [1, 2, 4, 8]);
  assert.equal(SNAP_LENGTH, 10);
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

test('open accepts "golden" and heal accepts medkit', () => {
  assert.deepEqual(parseClientMessage(J({ t: 'open', id: 'golden' })).msg, { t: 'open', id: 'golden' });
  assert.ok(parseClientMessage(J({ t: 'heal', kind: 'medkit' })).ok);
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
  rejected(J({ t: 'heal' }));
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
  rejected(J({ t: 'heal', kind: 'x'.repeat(1000) }));
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
  rejected(J({ t: 'heal', kind: 'potion' }));
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
  assert.ok(decodeServerMessage(encode('inv', { ...SERVER_EXAMPLES.inv, picked: 'Sniper' })).ok);
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
  assert.throws(() => encode('boom', { x: NaN, y: 0, z: 0, r: 4 }), /NaN/);
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
  const p = { id: 7, x: 12.5, y: 0.25, z: -3.75, ry: 1.57, pitch: -0.2, flags: FLAG_CROUCH | FLAG_MOVING, weapon: 'rocket', hp: 64, protected: true };
  const a = packSnapshotPlayer(p);
  assert.equal(a.length, SNAP_LENGTH);
  assert.equal(a[SNAP.ID], 7);
  assert.equal(a[SNAP.WEAPON], 'rocket');
  assert.equal(a[SNAP.PROTECTED], 1);
  assert.deepEqual(unpackSnapshotPlayer(a), p);
  assert.deepEqual(unpackSnapshotPlayer(packSnapshotPlayer({ ...p, protected: false })).protected, false);
  // rounding to 2 decimals, like the server does today
  assert.equal(packSnapshotPlayer({ ...p, x: 1.23456 })[SNAP.X], 1.23);
  // packed players fit the snap schema
  assert.ok(decodeServerMessage(encode('snap', { p: [a], n: 1 })).ok);
});

test('flags helpers', () => {
  assert.equal(makeFlags({ crouch: true, air: true }), 9);
  assert.equal(makeFlags(), 0);
  assert.deepEqual(readFlags(6), { crouch: false, slide: true, moving: true, air: false });
  for (let f = 0; f < 16; f++) assert.equal(makeFlags(readFlags(f)), f);
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
