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
  packSnapshotPlayer, unpackSnapshotPlayer, SNAP, FLAG_CROUCH, readFlags, readStatus,
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
const p = packSnapshotPlayer({ id: 1, x, y, z, ry, pitch, flags, weapon: 'shootbm', hp: 100, protected: false,
  shield: 'megashield', shieldUp: true, shocked: false, frozen: false });
ws.send(encode('snap', { p: [p], n: 1 }));

// Phone: send and receive.
ws.send(encodeClient('fire', { d: [0, 0, 1] }));
const r = decodeServerMessage(event.data);
if (r.ok && r.msg.t === 'snap') for (const a of r.msg.p) unpackSnapshotPlayer(a); // { id, x, ..., protected, shield, shieldUp, shocked, frozen }
ws.send(encodeClient('shield', { up: true }));          // hold Shift / the shield button: raise the shield
```

Shields and status effects (#26, protocol version 2): the client message `shield` (`{ up }`), `inv.shield`
(`{ id, dur }` or `null`), the snapshot slots `SHIELD` (shield id on the arm, `''` = none) and `STATUS`
(bits `STATUS_SHIELD_UP` 1, `STATUS_SHOCKED` 2, `STATUS_FROZEN` 4; `makeStatus` / `readStatus`), and the server
messages `block` (a raised shield blocked a hit), `shieldbroke`, and `hitmark.blocked`. The explosive messages
(`proj`, `boom`, `mine+` ...) are gone with the explosives.

Bombs (#32, protocol version 3): the client message `throw` (`{ b, d }`), the server messages `bomb` (thrown: flight and fuse)
and `boom` (exploded), `inv.bombs` (`[{ id, n }]`), `welcome.bombs` (bombs not exploded yet) and bomb ground items
(`kind: 'bomb'`, the bomb id in `weapon`, how many in `n`). The new fields are optional, so older messages stay valid.

Weapon durability: `inv.dur` (uses left per slot, `null` = never breaks), `dur` on ground items (`item+`, `welcome.items`)
and the `broke` message (`{ t: 'broke', slot, weapon }`). The `dur` fields are optional, so older messages stay valid.

Also exported: `CLIENT_MESSAGES` / `SERVER_MESSAGES` (each type with a description and `[spec, description]` per field),
`serverMessage` / `clientMessage` (checked objects instead of strings), `makeFlags` / `readFlags`, `makeStatus` / `readStatus`, `isValid(spec, value)`,
`setEncodeChecks(false)` (skip encode checks if they ever cost too much), and the limits `MAX_NUMBER`, `MAX_STRING`, `MAX_ARRAY`,
`MAX_SERVER_MESSAGE_SIZE`, `MAX_SLOT_INDEX`.

Files: `src/schema.js` (the tiny schema checker and its spec format), `src/messages.js` (all messages, snapshot slots, flags, status bits),
`src/snapshot.js` (pack/unpack, flags, status), `src/index.js` (parse/encode, re-exports everything).

## Determinism

Fully deterministic: pure functions and constant, frozen data. No randomness, no clock, no I/O.
The only setting is `setEncodeChecks`, which is off/on by hand.
