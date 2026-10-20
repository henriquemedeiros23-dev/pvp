// @pvp/net-protocol: every message between phone and server, plus helpers to
// build and check them. JSON over WebSocket, one object per message, `t` = type.

import { check, checkFields, SchemaError } from './schema.js';
import {
  CLIENT_SPECS, SERVER_SPECS, MAX_CLIENT_MESSAGE_SIZE, MAX_SERVER_MESSAGE_SIZE,
} from './messages.js';

export {
  PROTOCOL_VERSION, MAX_CLIENT_MESSAGE_SIZE, MAX_SERVER_MESSAGE_SIZE, MAX_SLOT_INDEX,
  CLIENT_MESSAGES, SERVER_MESSAGES, CLIENT_SPECS, SERVER_SPECS,
  SNAP, SNAP_LENGTH, FLAG_CROUCH, FLAG_SLIDE, FLAG_MOVING, FLAG_AIR, FLAGS_MASK,
} from './messages.js';
export { MAX_NUMBER, MAX_STRING, MAX_ARRAY, check } from './schema.js';
export { packSnapshotPlayer, unpackSnapshotPlayer, makeFlags, readFlags } from './snapshot.js';

/** Short alias: the most a client may send in one message (bytes). */
export const MAX_MESSAGE_SIZE = MAX_CLIENT_MESSAGE_SIZE;

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
let decoder = null;

// Turn a raw WebSocket payload (string, Buffer, Uint8Array, ArrayBuffer) into
// text, refusing anything bigger than maxBytes. Returns null when refused.
function toText(raw, maxBytes) {
  if (typeof raw === 'string') {
    // A JS string char is at most 3 UTF-8 bytes; cheap check first, exact one only if needed.
    if (raw.length > maxBytes) return null;
    if (raw.length * 3 > maxBytes && new TextEncoder().encode(raw).length > maxBytes) return null;
    return raw;
  }
  let bytes = null;
  if (raw instanceof ArrayBuffer) bytes = new Uint8Array(raw);
  else if (ArrayBuffer.isView(raw)) bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  else if (Array.isArray(raw) && raw.every(b => ArrayBuffer.isView(b))) { // ws fragments
    const len = raw.reduce((n, b) => n + b.byteLength, 0);
    if (len > maxBytes) return null;
    bytes = new Uint8Array(len);
    let o = 0;
    for (const b of raw) { bytes.set(new Uint8Array(b.buffer, b.byteOffset, b.byteLength), o); o += b.byteLength; }
  }
  if (!bytes || bytes.byteLength > maxBytes) return null;
  decoder ??= new TextDecoder('utf-8', { fatal: true });
  try { return decoder.decode(bytes); } catch { return null; }
}

function parseWith(specs, raw, maxBytes) {
  try {
    const text = toText(raw, maxBytes);
    if (text === null) return { ok: false, error: `message is not text or bigger than ${maxBytes} bytes` };
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, error: 'not valid JSON' }; }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'message must be a JSON object' };
    const t = data.t;
    if (typeof t !== 'string') return { ok: false, error: 'missing message type "t"' };
    if (!has(specs, t)) return { ok: false, error: `unknown message type "${t.slice(0, 32)}"` };
    const fields = checkFields(specs[t], data, t);
    return { ok: true, msg: { t, ...fields } };
  } catch (e) {
    return { ok: false, error: e instanceof SchemaError ? e.message : 'bad message' };
  }
}

/**
 * Check a raw message from a phone. Never throws.
 * Returns { ok: true, msg } (a clean copy, unknown extra fields dropped) or { ok: false, error }.
 */
export function parseClientMessage(raw) {
  return parseWith(CLIENT_SPECS, raw, MAX_CLIENT_MESSAGE_SIZE);
}

/** Check a raw message from the server (used on the phone). Never throws. Same result shape. */
export function decodeServerMessage(raw) {
  return parseWith(SERVER_SPECS, raw, MAX_SERVER_MESSAGE_SIZE);
}

let checks = true;
/** Turn encode checks on/off (default on). Switch off only if profiling shows they cost too much. */
export function setEncodeChecks(on) { checks = !!on; }

function build(specs, side, type, fields = {}) {
  if (!checks) return { t: type, ...fields };
  if (typeof type !== 'string' || !has(specs, type)) throw new Error(`net-protocol: unknown ${side} message type "${type}"`);
  const spec = specs[type];
  for (const k of Object.keys(fields)) {
    if (k !== 't' && !has(spec, k)) throw new Error(`net-protocol: ${side} message "${type}" has unknown field "${k}"`);
  }
  try {
    return { t: type, ...checkFields(spec, fields, type) };
  } catch (e) {
    if (e instanceof SchemaError) throw new Error(`net-protocol: bad ${side} message: ${e.message}`);
    throw e;
  }
}

/** Build a checked server message object { t, ...fields }. Throws on a mistake. */
export function serverMessage(type, fields) { return build(SERVER_SPECS, 'server', type, fields); }
/** Build a checked client message object { t, ...fields }. Throws on a mistake. */
export function clientMessage(type, fields) { return build(CLIENT_SPECS, 'client', type, fields); }

/** Server side: build, check and turn into the JSON string to send. Throws on a mistake. */
export function encode(type, fields) { return JSON.stringify(serverMessage(type, fields)); }
/** Phone side: build, check and turn into the JSON string to send. Throws on a mistake. */
export function encodeClient(type, fields) { return JSON.stringify(clientMessage(type, fields)); }

/** Is this value valid for spec? Never throws. Handy for one-off checks. */
export function isValid(spec, value) {
  try { check(spec, value); return true; } catch { return false; }
}
