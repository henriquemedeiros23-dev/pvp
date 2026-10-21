# @pvp/arena

## What it does

The fight itself as a simulation with no sockets, no clock and no `Math.random`: players join and leave,
move (with an anti-teleport check), fire weapons (melee, guns, thrown grenades, rockets, mines), open chests
and the golden chest, pick up and drop loot, get hurt and knocked out. The server calls the methods and
`tick(now)`, then sends whatever `drain()` returns. Depends on `@pvp/game-rules`, `@pvp/collision` and `@pvp/world-gen`.

## How to use

```js
import { createArena, ARENA_DEFAULTS } from '@pvp/arena';
import { generateIsland } from '@pvp/world-gen';
import { createRandom } from '@pvp/seeded-random';
import { RULES } from '@pvp/game-rules';

const arena = createArena({ island: generateIsland(), rules: RULES, random: createRandom(1234), now: Date.now() });
// optional: tuning: { snapshotRadius: 200, ... } (see src/tuning.js), snapshots: false

const r = arena.join('alice', { name: 'Alice', skin, loadout: ['rocket', 'pistol'], coins: 120 }, Date.now());
// The player gets the rules' STARTING_WEAPON (the Gun) free in slot 1, then the loadout (one of each kind).
// { ok: true, id, weapons: ['rocket', 'pistol'] (taken from the loadout: remove them from the backpack;
//   a loadout weapon not taken, e.g. a second Gun, stays in the backpack),
//   replaced: null | { id, weapons } (same key was already in: that player left alive) }
// or { ok: false, reason: 'full' } (send 'full' yourself)

arena.setState(id, { x, y, z, ry, pitch, f }, now); // false + a 'pos' correction if it moved too far
arena.fire(id, [dx, dy, dz], now);                  // or { x, y, z }
arena.selectSlot(id, i);
arena.openChest(id, 3, now);                        // chest index, or 'golden'
arena.heal(id, 'bandage', now);
arena.setCoins(id, account.coins);                  // the account's coins changed (shop): queues an 'inv'
const back = arena.leave(id, { alive: true });      // weapons to put back in the backpack ([] if not alive)

setInterval(() => {
  arena.tick(Date.now());                           // chests, golden chest, items, projectiles, mines, snaps
  for (const ev of arena.drain()) {
    if (ev.to === 'server') handle(ev);             // { kind: 'coins', playerId, playerKey, amount, total }
                                                    // { kind: 'knockedOut', playerId, playerKey, weapons, by, byId }
    else if (ev.to === 'all') for (const id of arena.playerIds()) { if (id !== ev.except) sendTo(id, ev.msg); }
    else sendTo(ev.to, ev.msg);                     // also deliver to a player id that just got knocked out ('dead')
  }
}, 50);
```

- Every `msg` is a server message of `@pvp/net-protocol` (`{ t, ...fields }`), checked in the tests with `serverMessage`.
- `now` is optional on every method; it defaults to the latest time seen. The clock never goes backwards.
- `'all'` means everyone in the arena when you drain, so drain after every call (or at least every tick).
- Also: `snapshotFor(id)`, `welcomeFor(id)` (join already queues 'welcome' + 'inv' + 'pjoin'), `playerCount()`,
  `playerIds()`, `hasPlayer(id)`, `idOf(key)`, `teleport(id, { x, y, z, ry })` (no checks), and read-only copies:
  `getPlayer(id)`, `chests()`, `golden()`, `nextGoldenAt()`, `items()`, `projectiles()`, `mines()`, `now()`.
- Weapons behave only by their `type` (`melee`, `gun`, `throw`, `rocket`, `mine`) and numbers in the rules
  (`dmg`, `range`, `rate`, `spread`, `pellets`, `knock`, `speed`, `radius`, `fuse`, `maxActive`), never by id:
  a new weapon only needs a new entry in `@pvp/game-rules`.
- **Durability** (from the rules' `durability` / `wearPerUse`, see `@pvp/game-rules`): each player weapon has
  uses left (`getPlayer(id).dur`, parallel to `weapons`; `null` = never breaks). Every fire that passes the rate
  check (swing, shot, throw, rocket, mine) costs `wearPerUse` and queues an `inv` (with `dur`) for that player.
  At 0 the weapon is removed, the player gets `{ t: 'broke', slot, weapon }` then an `inv`, and the hand stays
  on the same slot number (or the last slot if that one is gone). Its last use still fires.
  The starting Gun breaks like any weapon; a player may then have no weapons at all (firing does nothing,
  the snapshot shows `''`, picking up works). Loadout weapons and chest loot start full.
- **Knockout:** every weapon is dropped (the Gun too) with the heals. **Dropped weapons rule:** a dropped weapon
  with more than half its durability keeps it; half or less is set to half, rounded up (`droppedDurability` in
  `@pvp/game-rules`). Ground items carry `dur` and whoever picks one up gets exactly that.
- **Chests:** a normal chest gives `CHEST_COINS` (3) coins and exactly one weapon, picked with each weapon's
  `chestChance` as its weight (one draw from the seeded loot stream). Heals from normal chests are a separate
  tuning value `chestHealChance` (0 = off for now). The golden chest gives `GOLDEN_CHEST_COINS` (10) coins and
  one weapon, with the weights of Epic, Legendary and Megalegend weapons doubled (`GOLDEN_CHEST_BOOST`).
  `chestWeights(rules, { golden })` and `rollChestWeapon(A, { golden })` live in `src/loot.js`.
- **Decision (the boss can change it):** `leave(id, { alive: true })` returns plain weapon ids (not the free
  starting Gun from `join`), so weapons put back in the backpack are **full again** next time. Broken weapons are gone for good (they were taken out of
  the backpack at `join` and are not returned).
- **Coins:** the account (e.g. `@pvp/accounts-shop`) is the single source of truth. The arena only keeps a copy
  (from `join`) for the 'coins' and 'inv' messages, and only chests add to it. Whenever the coins change outside
  the arena (a shop buy, maybe from another device during a match), the host calls
  `arena.setCoins(id, account.coins)`, which sets the copy and queues an `inv` with the new total for that player
  (unknown id or a total that is not a whole number >= 0: ignored, returns `false`). After a chest's
  `{ kind: 'coins' }` server event, add the coins to the account and, if its new total differs from `ev.total`,
  call `setCoins` with the account's total so both stay equal.

Files: `src/state.js`, `src/players.js`, `src/chests.js`, `src/loot.js`, `src/combat.js`, `src/projectiles.js`,
`src/mines.js`, `src/snapshot.js`, `src/tuning.js`, all wired in `src/index.js`.

## Determinism

Fully deterministic. Time is passed in, and all randomness comes from the seeded `random` you give it
(split with `fork` into its own streams for spawns, loot, the golden chest and gun spread). No `Math.random`,
no `Date.now`, no timers. The same seed and the same calls give exactly the same outbox (there is a replay test).
