# @pvp/local-server

## What it does

Runs the game server's glue inside the page, so the game works with no network (practice mode):
an island from `@pvp/world-gen`, one `@pvp/arena` with a seeded random, accounts and the shop from
`@pvp/accounts-shop` saved in `localStorage` (memory if it is blocked), and the 50 ms tick. The game talks to it
through a fake WebSocket that speaks exactly the `@pvp/net-protocol` messages, and through a `fetch` for
`@pvp/api-client`. Optional simple bots (`Bot 1`, `Bot 2`, …) wander, open chests and sometimes shoot at you.

## How to use

```js
import { createLocalServer } from '@pvp/local-server';

const server = createLocalServer({ seed: 'abc', storage: localStorage, bots: 3 });
// options: now (clock), timer ({ setInterval, clearInterval }), autoStart, defer, randomBytes, island, storagePrefix

const api = server.createApi();          // an @pvp/api-client: signup/login/me/buy/equip/inventory/toBar/fromBar, token in storage
server.ensurePlayer();                   // no login screen: a local 'Player_1234' right away (kept on reload)
const ws = server.connect(api.token);    // like new WebSocket(url): send, close, readyState, onopen/onmessage/onclose
ws.onopen = () => ws.send(encodeClient('join'));
ws.onmessage = e => decodeServerMessage(e.data);

server.rename(api.token, 'Boss_Kid');    // change the name (not while in the arena)
server.teleport(api.token, 10, 20);      // practice/test helper, like the server's debugTeleport

// tests: createLocalServer({ autoStart: false, now: () => t }) and call server.tick() yourself
```

- The game (`apps/game/public/js/practice.js`) passes `api` and `openSocket: token => server.connect(token)`
  to the normal game code; nothing else changes.
- Same glue as `apps/game/server.js`: client messages are checked with `parseClientMessage` (bad ones are dropped),
  the arena's outbox goes out as JSON, chest coins are added to the account, the account's coin total wins,
  joining takes ONLY the fast bar (#39: weapons, shield, potions, bombs; an empty bar gets the free Gun), the rest of
  the Inventory stays in the account; knocked out = the bar is lost, leaving alive = what survived goes back into its
  bar slots (chest loot into the Inventory). The `throw` message throws a bomb (#32). `/api/inventory`, `/api/bar/put`
  and `/api/bar/take` work like on the server.
- The ranking (#47): a knockout gives the attacker's local account +1 (`accounts.addKnockout`, time from `now`);
  `/api/ranking` answers `rankPlayers` from `@pvp/leaderboard`. Bots are no accounts, so they are never in it.
- Passwords of local accounts use `practiceHash` (FNV based, **not secure**): the accounts never leave this browser.
- `createBots({ arena, island, random, count })` (`src/bots.js`) works with any arena: call `bots.tick(now)` before
  `arena.tick(now)`. Bots only use the arena's normal methods (join, setState, openChest, fire).
- `createFakeSocket` (`src/socket.js`) is the WebSocket-like object; everything is delivered a moment later
  (a microtask by default), like on a network.

Files: `src/server.js`, `src/socket.js`, `src/bots.js`, all exported from `src/index.js`.

## Determinism

Partly deterministic. The arena and the bots use seeded randoms (`seed`), and time comes from the injected
`now` and `timer`, so with `autoStart: false` and a fake clock a test replays exactly (there is a test that two
servers with the same seed move their bots the same way). Login tokens and salts use `crypto.getRandomValues`
unless `randomBytes` is passed in, and `localStorage` is real browser storage.
