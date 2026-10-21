# @pvp/accounts-shop

## What it does

Player accounts (sign up, log in on up to 2 devices, log out), coins, the shop (buy and equip skins, buy weapons into the backpack/"stash") and the loadout a player carries into the arena. Storage is pluggable: in memory, or one JSON file. Node only (uses `node:crypto` and `node:fs`). Prices and limits come from `@pvp/game-rules`.

## How to use

```js
import { createAccounts, createJsonFileStore, createMemoryStore } from '@pvp/accounts-shop';

const store = createJsonFileStore('data/accounts.json', { saveDelayMs: 1000 }); // or createMemoryStore()
const accounts = createAccounts({ store }); // optional: rules, now, randomBytes

try {
  const { token, account } = accounts.signup('Stick_Kid', 'secret'); // or accounts.login(name, pw)
  send({ token, account: accounts.publicView(account) });             // never send `account` itself
} catch (err) {
  send({ error: err.message }); // kid-friendly text, e.g. "That name is taken"; err.code e.g. 'NAME_TAKEN'
}

const acc = accounts.byToken(token);        // null if not logged in
accounts.addCoins(acc, 25);                 // from a chest; never below 0, NaN throws
accounts.buy(acc, 'hat', 'crown');          // kind: 'weapon' or a skin slot; returns publicView
accounts.buy(acc, 'weapon', 'sniper');      // weapons stack in the stash: { sniper: 1 }
accounts.equip(acc, 'hat', 'crown');        // must own it

const weapons = accounts.takeLoadout(acc);  // most expensive stashed weapons first, copies too
                                            // (2 Shotguns = 2 slots), up to MAX_SLOTS - 1
                                            // (the arena gives the free starting Gun in slot 1 itself)
accounts.returnLoadout(acc, weapons);       // left the arena alive: back into the stash
// knocked out: just don't call returnLoadout, the weapons are lost

accounts.logout(token);
await accounts.flush();                     // on shutdown
```

Every weapon can be bought (the starting Gun too: it goes into the backpack like the others). A backpack weapon
that is no longer in the rules (like the old wooden sword) is dropped when the accounts are loaded.

Error codes: `BAD_NAME`, `BAD_PASSWORD`, `NAME_TAKEN`, `WRONG_LOGIN`, `UNKNOWN_ITEM`, `ALREADY_OWNED`, `NOT_ENOUGH_COINS`, `NOT_OWNED` (all `AccountError`). Passing an account object that didn't come from this service throws a `TypeError`.

A store is any object with `load()` (all records), `save(data)` (may be delayed) and `flush()` (Promise). The JSON file store writes to `<file>.tmp`, then renames it over the file, so a crash can't leave half a file. A broken file throws on load instead of silently starting empty.

Rules: names are 3-16 letters, numbers or `_`, unique ignoring case. Passwords need 4+ characters and are stored as scrypt hashes with a random salt. Logging in makes a new token; only the 2 newest tokens work.

## Determinism

Partly deterministic. All shop and loadout logic is deterministic. Tokens and salts come from `randomBytes` and timestamps from `now`, both injected, so tests with a fake clock and fake random are fully repeatable. The JSON file store does real file I/O on a timer (`flush()` makes it happen right away).
