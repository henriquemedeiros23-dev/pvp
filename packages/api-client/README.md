# @pvp/api-client

## What it does

Talks to the game server's account and shop API (sign up, log in, who am I, buy, equip, rename) and remembers the login token, with short friendly error messages. Plain ES module with no dependencies, so it works in Node and directly in the browser.

## How to use

```js
import { createApiClient } from '@pvp/api-client';

const api = createApiClient({ storage: localStorage });   // baseUrl = '' and the global fetch by default

const { account } = await api.signup('Bob', 'secret');     // or api.login(name, password); the token is saved
const { account: me, online } = await api.me();
await api.buy('hat', 'crown');       // kind: 'color' | 'hat' | 'face' | 'back' | 'shirt' | 'weapon'
await api.equip('hat', 'crown');     // each resolves { account }
await api.rename('Boss_Kid');        // { account }; a refused name throws with a kid-friendly message
api.lastName;                         // the last name used on this device ('' if none): pre-fill the log in box
api.logout();                         // forgets the token on this device (the last name stays; never the password)

try { await api.buy('weapon', 'icesword'); }
catch (e) { showError(e.message); }   // ApiError: e.message is friendly, e.status is the HTTP status (0 = no connection)
```

- The token lives in the injected `storage` (anything with `getItem/setItem/removeItem`). Every storage call is wrapped in try/catch, and if storage is blocked (private mode) the token is kept in memory instead.
- A `401` answer clears the saved token, so the app can show the login screen.
- `safeStorage(storage)` is exported too, for other small settings.

## Determinism

Fully deterministic given its inputs: no randomness and no clock. All outside effects (the network and storage) are passed in, so tests use a fake `fetch` and a fake storage.
