# @pvp/accounts-shop

## What it does

Player accounts (sign up, log in on up to 2 devices, log out), coins, the shop (buy and equip skins, buy weapons and Healing Potions into the backpack/"stash") and the loadout a player carries into the arena. Storage is pluggable: in memory, one JSON file, or `localStorage`. The main entry is for Node (uses `node:crypto` and `node:fs`); `@pvp/accounts-shop/browser` works in the browser. Prices and limits come from `@pvp/game-rules`.

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
accounts.buy(acc, 'weapon', 'icesword');    // weapons stack in the stash: { icesword: 1 }
accounts.buy(acc, 'potion', 'potion');      // Healing Potions (10 coins) stack too: account.potions
accounts.equip(acc, 'hat', 'crown');        // must own it

const weapons = accounts.takeLoadout(acc);  // most expensive stashed weapons first, copies too
                                            // (2 Ice Swords = 2 slots), up to MAX_SLOTS - 1
                                            // (the arena gives the free starting Gun in slot 1 itself)
                                            // + the best shield at the end (shields take no slot)
accounts.returnLoadout(acc, weapons);       // left the arena alive: back into the stash
// knocked out: just don't call returnLoadout, the weapons are lost

const potions = accounts.takePotions(acc);  // up to MAX_POTIONS (3) Healing Potions leave the backpack
accounts.returnPotions(acc, 2);             // left alive: unused potions go back (knocked out: they are lost)

accounts.rename(acc, 'New_Name');        // same name rules; tokens stay logged in
accounts.logout(token);
await accounts.flush();                     // on shutdown
```

Every weapon can be bought (the starting Gun too: it goes into the backpack like the others). A backpack weapon
that is no longer in the rules (like the old wooden sword, or the Pistol, Rocket and the other weapons removed in #26)
is dropped when the accounts are loaded, so old saved accounts still load.
The backpack also counts Healing Potions (`potions`, any number; only 3 go into the arena). Older saved
accounts without it load with 0 potions.

Error codes: `BAD_NAME`, `BAD_PASSWORD`, `NAME_TAKEN`, `WRONG_LOGIN`, `UNKNOWN_ITEM`, `ALREADY_OWNED`, `NOT_ENOUGH_COINS`, `NOT_OWNED` (all `AccountError`). Passing an account object that didn't come from this service throws a `TypeError`.

A store is any object with `load()` (all records), `save(data)` (may be delayed) and `flush()` (Promise). The JSON file store writes to `<file>.tmp`, then renames it over the file, so a crash can't leave half a file. A broken file throws on load instead of silently starting empty.

Rules: names are 3-16 letters, numbers or `_`, unique ignoring case. Passwords need 4+ characters and are stored as scrypt hashes with a random salt. Logging in makes a new token; only the 2 newest tokens work.

**In the browser** (practice mode, `@pvp/local-server`): no Node imports, so pass the hashing and random bytes in.

```js
import { createAccounts, createWebStorageStore } from '@pvp/accounts-shop/browser';
const accounts = createAccounts({
  store: createWebStorageStore(localStorage, 'pvp.accounts'), // try/catch inside: memory if storage is blocked
  randomBytes: n => crypto.getRandomValues(new Uint8Array(n)),
  hashPassword: (password, saltHex) => myHexHash(password, saltHex),
});
```

## Determinism

Partly deterministic. All shop and loadout logic is deterministic. Tokens and salts come from `randomBytes` and timestamps from `now`, both injected, so tests with a fake clock and fake random are fully repeatable. The JSON file store does real file I/O on a timer (`flush()` makes it happen right away).
