# @pvp/accounts-shop

## What it does

Player accounts (sign up, log in on up to 2 devices, log out), coins, the shop (buy and equip skins, buy weapons, Healing Potions and bombs into the Inventory: `stash`, `potions`, `bombs`) and the fast bar (#39): 5 slots the player fills from the Inventory. Only the fast bar goes into the arena; everything else stays safe in the Inventory. Storage is pluggable: in memory, one JSON file, or `localStorage`. The main entry is for Node (uses `node:crypto` and `node:fs`); `@pvp/accounts-shop/browser` works in the browser. Prices and limits come from `@pvp/game-rules`.

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
accounts.buy(acc, 'weapon', 'icesword');    // into the Inventory: stash { icesword: 1 }
accounts.buy(acc, 'potion', 'potion');      // Healing Potions (10 coins) stack too: account.potions
accounts.buy(acc, 'bomb', 'legendarybomb'); // bombs (#32): one pack (Bomb 1 for 3 coins, Legendary Bomb 3 for 60): account.bombs
accounts.equip(acc, 'hat', 'crown');        // must own it

// The fast bar (#39): 5 slots (the rules' MAX_SLOTS). A slot is null or { kind, id, n }:
// one weapon copy (a shield too, at most ONE shield), a stack of Healing Potions (up to MAX_POTIONS = 3)
// or a stack of one bomb (up to its maxCarry: Bomb 5, Legendary Bomb 3). Bar items are moved OUT of the Inventory.
accounts.toBar(acc, 'weapon', 'icesword');                // first free slot; returns publicView (with .bar)
accounts.toBar(acc, 'potion', 'potion', { slot: 2, n: 2 }); // into slot 3 (0-based 2), 2 potions (default: as many as fit)
accounts.fromBar(acc, 0);                                 // slot 1 back into the Inventory
// errors: NOT_OWNED, BAR_FULL, SLOT_TAKEN, STACK_FULL, ONE_SHIELD, BAD_SLOT, BAD_COUNT, EMPTY_SLOT, UNKNOWN_ITEM

const { loadout, potions, bombs, starter } = accounts.takeBar(acc); // joining: ONLY the bar, it leaves the account
arena.join(key, { loadout, potions, bombs, starter, ... });         // starter: true when no hand weapon in the bar
                                                                    // (then the free starting Gun comes)
accounts.returnFromArena(acc, { weapons, potions, bombs });         // left alive (or not taken by the arena):
                                                                    // back into the same bar slots, loot into the Inventory
// knocked out: just don't call returnFromArena, the bar's things are lost; the Inventory never is

accounts.rename(acc, 'New_Name');        // same name rules; tokens stay logged in
accounts.logout(token);
await accounts.flush();                     // on shutdown
```

Every weapon can be bought (the starting Gun too: it goes into the Inventory like the others). An Inventory weapon
that is no longer in the rules (like the old wooden sword, or the Pistol, Rocket and the other weapons removed in #26)
is dropped when the accounts are loaded, so old saved accounts still load.
The Inventory also counts Healing Potions (`potions`, any number) and bombs (`bombs: { bomb, legendarybomb }`, any
number); older saved accounts without them load with 0. There is no limit on how many you keep.

**The fast bar** (`account.bar`, the pure logic is in `src/bar.js`): accounts saved before the bar existed get a bar
filled like the old automatic pick, so their first match feels the same (the 2 best weapons, the best shield, up to 3
potions, the bombs, then more weapons while slots are free). A new account starts with an empty bar. A broken saved bar
is cleaned on load: anything that does not fit (a second shield, too many potions) goes back into the Inventory.

Error codes: `BAD_NAME`, `BAD_PASSWORD`, `NAME_TAKEN`, `WRONG_LOGIN`, `UNKNOWN_ITEM`, `ALREADY_OWNED`, `NOT_ENOUGH_COINS`, `NOT_OWNED`, and for the bar `BAR_FULL`, `SLOT_TAKEN`, `STACK_FULL`, `ONE_SHIELD`, `BAD_SLOT`, `BAD_COUNT`, `EMPTY_SLOT` (all `AccountError`). Passing an account object that didn't come from this service throws a `TypeError`.

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

Partly deterministic. All shop, Inventory and fast bar logic is deterministic (pure functions, fixed order). Tokens and salts come from `randomBytes` and timestamps from `now`, both injected, so tests with a fake clock and fake random are fully repeatable. The JSON file store does real file I/O on a timer (`flush()` makes it happen right away).
