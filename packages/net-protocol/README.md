# @pvp/net-protocol

## What it does

Every message between the phone and the game server, written down in one place (see [PROTOCOL.md](PROTOCOL.md)),
with helpers to build and check them, so a bad or malicious message is rejected before the game logic sees it.
JSON over WebSocket, one object per message, field `t` = type.

It is a plain ES module with no dependencies and no build step, so it works in Node and directly in the browser.

## How to use

```js
import {
  parseClientMessage, encode, decodeServerMessage, encodeClient,
  packSnapshotPlayer, unpackSnapshotPlayer, SNAP, FLAG_CROUCH, readFlags,
  MAX_MESSAGE_SIZE, PROTOCOL_VERSION,
} from '@pvp/net-protocol';
// In the browser without a bundler: import from '/path/to/packages/net-protocol/src/index.js'

// Server: check what a phone sent. Never throws.
ws.on('message', raw => {
  const r = parseClientMessage(raw);      // string, Buffer or Uint8Array
  if (!r.ok) return;                       // r.error says why, e.g. 'state.x: expected a number, got string'
  handle(r.msg);                           // clean copy, unknown fields dropped
});

// Server: build a message. Throws if a field is missing, wrong or unknown (a bug in our code).
ws.send(encode('coins', { amount: 10, total: 130 }));   // '{"t":"coins","amount":10,"total":130}'
const p = packSnapshotPlayer({ id: 1, x, y, z, ry, pitch, flags, weapon: 'pistol', hp: 100, protected: false });
ws.send(encode('snap', { p: [p], n: 1 }));

// Phone: send and receive.
ws.send(encodeClient('fire', { d: [0, 0, 1] }));
const r = decodeServerMessage(event.data);
if (r.ok && r.msg.t === 'snap') for (const a of r.msg.p) unpackSnapshotPlayer(a); // { id, x, ..., protected }
```

Also exported: `CLIENT_MESSAGES` / `SERVER_MESSAGES` (each type with a description and `[spec, description]` per field),
`serverMessage` / `clientMessage` (checked objects instead of strings), `makeFlags` / `readFlags`, `isValid(spec, value)`,
`setEncodeChecks(false)` (skip encode checks if they ever cost too much), and the limits `MAX_NUMBER`, `MAX_STRING`, `MAX_ARRAY`,
`MAX_SERVER_MESSAGE_SIZE`, `MAX_SLOT_INDEX`.

Files: `src/schema.js` (the tiny schema checker and its spec format), `src/messages.js` (all messages, snapshot slots, flags),
`src/snapshot.js` (pack/unpack, flags), `src/index.js` (parse/encode, re-exports everything).

## Determinism

Fully deterministic: pure functions and constant, frozen data. No randomness, no clock, no I/O.
The only setting is `setEncodeChecks`, which is off/on by hand.
