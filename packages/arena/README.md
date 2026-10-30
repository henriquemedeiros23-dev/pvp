# @pvp/arena

## What it does

The fight itself as a simulation with no sockets, no clock and no `Math.random`: players join and leave,
move (with an anti-teleport check), fire weapons (melee and guns), raise shields, get shocked or frozen, open
chests and the golden chest, pick up and drop loot, drink Healing Potions, throw bombs, get hurt and knocked out. The server calls the methods and
`tick(now)`, then sends whatever `drain()` returns. Depends on `@pvp/game-rules`, `@pvp/collision` and `@pvp/world-gen`.

## How to use

```js
import { createArena, ARENA_DEFAULTS } from '@pvp/arena';
import { generateIsland } from '@pvp/world-gen';
import { createRandom } from '@pvp/seeded-random';
import { RULES } from '@pvp/game-rules';

const arena = createArena({ island: generateIsland(), rules: RULES, random: createRandom(1234), now: Date.now() });
// optional: tuning: { snapshotRadius: 200, ... } (see src/tuning.js), snapshots: false

const r = arena.join('alice', { name: 'Alice', skin, loadout: ['icesword', 'shootbm', 'shield'], coins: 120, potions: 2,
  bombs: { bomb: 4, legendarybomb: 3 } }, Date.now());
// The player gets the rules' STARTING_WEAPON (the Gun) free in slot 1 (unless `starter: false`, used when the
// player's fast bar already has weapons, #39), then the loadout in its order
// (copies of the same weapon too, each with its own durability). The first shield goes on the left arm.
// { ok: true, id, weapons: ['icesword', 'shootbm', 'shield'] (taken from the loadout: remove them from the
//   backpack; loadout weapons that do not fit in MAX_SLOTS, and extra shields, are not taken),
//   potions: 2 (Healing Potions taken, at most MAX_POTIONS = 3: give the rest back to the backpack),
//   bombs: { bomb: 4, legendarybomb: 3 } (taken, each at most its maxCarry: give the rest back),
//   replaced: null | { id, weapons, potions, bombs } (same key was already in: that player left alive) }
// or { ok: false, reason: 'full' } (send 'full' yourself)

arena.setState(id, { x, y, z, ry, pitch, f }, now); // false + a 'pos' correction if it moved too far
arena.fire(id, [dx, dy, dz], now);                  // or { x, y, z }
arena.selectSlot(id, i);
arena.dropWeapon(id, now);                          // drop the weapon in hand (#34): exact durability, returns the item id
arena.setShield(id, true, now);                     // raise the shield (Shift / shield button), false lowers it
arena.openChest(id, 3, now);                        // chest index, or 'golden'
arena.drink(id, now);                               // start drinking a Healing Potion (full H.P after 5 s)
arena.throwBomb(id, 'bomb', [dx, dy, dz], now);     // throw a bomb (#32): returns its id or null
arena.setCoins(id, account.coins);                  // the account's coins changed (shop): queues an 'inv'
const { potions, bombs } = arena.getPlayer(id);    // unused potions and bombs go back to the backpack too
const back = arena.leave(id, { alive: true });      // weapons to put back: 'icesword' (full) or { id, dur } (worn, #51); [] if not alive

setInterval(() => {
  arena.tick(Date.now());                           // potions, chests, golden chest, items, shock damage, snaps
  for (const ev of arena.drain()) {
    if (ev.to === 'server') handle(ev);             // { kind: 'coins', playerId, playerKey, amount, total }
                                                    // { kind: 'knockedOut', playerId, playerKey, weapons, by, byId, byKey }
                                                    // byKey: the attacker's player key, also after it left (bombs,
                                                    // shock); null for your own bomb or no attacker (ranking, #47)
    else if (ev.to === 'all') for (const id of arena.playerIds()) { if (id !== ev.except) sendTo(id, ev.msg); }
    else if (Array.isArray(ev.to)) for (const id of ev.to) sendTo(id, ev.msg); // players near someone ('dmg')
    else sendTo(ev.to, ev.msg);                     // also deliver to a player id that just got knocked out ('dead')
  }
}, 50);
```

- Every `msg` is a server message of `@pvp/net-protocol` (`{ t, ...fields }`), checked in the tests with `serverMessage`.
- `now` is optional on every method; it defaults to the latest time seen. The clock never goes backwards.
- `'all'` means everyone in the arena when you drain, so drain after every call (or at least every tick).
- A list in `to` (player ids) means "the players near someone": everyone within the snapshot radius
  (tuning `snapshotRadius`) of that player, the player too. Used for the damage numbers (#33).
- **Damage numbers (#33):** whenever a player loses health, everyone near them gets
  `{ t: 'dmg', id, amount }` (the health really lost) with `ko: true` for a knockout and `shock: true` for a shock
  tick; a hit a raised shield blocks gives `{ t: 'dmg', id, amount: 0, blocked: true }`. It is queued before the
  knockout's `ko`, and the knocked-out player gets it too. No number when nothing was lost (spawn protection).
- Also: `snapshotFor(id)`, `welcomeFor(id)` (join already queues 'welcome' + 'inv' + 'pjoin'), `playerCount()`,
  `playerIds()`, `hasPlayer(id)`, `idOf(key)`, `teleport(id, { x, y, z, ry })` (no checks), `isFrozen(id)`,
  `isShocked(id)`, and read-only copies: `getPlayer(id)`, `chests()`, `golden()`, `nextGoldenAt()`, `items()`, `now()`.
- Weapons behave only by their `type` (`melee`, `gun`, `shield`) and data in the rules (`dmg`, `range`, `rate`,
  `spread`, `pellets`, `knock`, `shock`, `freezeMs`, `knockout`, `shieldWear`, `reflect`), never by id:
  a new weapon only needs a new entry in `@pvp/game-rules`. (Explosives were removed in #26.)
- **Aiming** (`src/aim.js`, #37): while `state.f` has the aim bit 16 (`AIM_FLAG`, the same as `FLAG_AIM` in
  `@pvp/net-protocol`) and the weapon in hand has an `aim` in the rules (Shootbm, DM Gun), shots use
  `spread * aim.spreadMul` (more accurate). Ignored with any other weapon, with the shield raised, while drinking and
  while frozen. `aimState(id)` = `{ aiming, zoom, spreadMul, moveMul }` (all 1 when not aiming); the client walks at
  `moveMul` (movement is the client's; the light anti-teleport check is not made stricter, so lag never snaps you back).
  Snapshots show the aim bit only while really aiming.
- **Shields** (`src/effects.js`): worn on the left arm (`getPlayer(id).shield = { id, dur }`), never in a slot;
  `inv` carries `shield`. `setShield(id, up)` raises/lowers it (not while frozen). While raised the player cannot
  fire, and hits from the **front half** (tuning `shieldFrontDot`, 0) do 0 damage and no effects: the shield loses
  the weapon's `shieldWear` (default 1, Supersword 5), everyone gets `block`, the attacker a `hitmark` with
  `blocked: true`; a shield with `reflect` (Mega Shield 0.25) hurts the attacker by that part of the weapon's
  `dmg` (credited to the holder, weapon = the shield id). At 0 the shield is gone (`shieldbroke`, then `inv`).
  **One shield at a time:** walking over a shield picks it up if you wear none, or if it is rarer than yours
  (then yours drops at your feet with its durability); otherwise it stays on the ground. Leaving alive returns
  it with the weapons; a knockout drops it like a weapon (same half-durability rule).
- **Shock** (`shock: { dmg, everyMs, forMs }`): after a hit that lands, `dmg` every `everyMs` until `forMs`
  (Electric Sword: 1 HP at +5 s, +10 s, +15 s), applied in `tick(now)`; a new hit starts it over; the attacker
  is credited (also after leaving). **Freeze** (`freezeMs`): the target cannot move (a `pos` puts it back), turn,
  fire, switch slots or raise its shield, and a raised shield drops. **Knockout** (`knockout: true`): the hit
  takes all HP that is left. The snapshot shows the shield id and status bits (1 shield up, 2 shocked, 4 frozen).
- **Durability** (from the rules' `durability` / `wearPerUse`, see `@pvp/game-rules`): each player weapon has
  uses left (`getPlayer(id).dur`, parallel to `weapons`; `null` = never breaks). Every use costs `wearPerUse`
  and queues an `inv` (with `dur` and `charge`) for that player: every shot, but a melee swing only when it hits
  a player or a raised shield (a swing at the air is free, #34). A weak hit while charging wears it the same.
- **Charging (#38):** every carried weapon charges on its **own** (per slot, `getPlayer(id).useAt`, parallel to
  `weapons`: when that slot last started charging, `-Infinity` = ready). A weapon is charged `rate * 1000 *
  fireRateSlack` ms (tuning, 0.9: 10% early for lag) after its last use, so you can switch to another weapon
  and use it right away; copies of the same weapon charge separately. A weapon that is still charging can be
  used too: a hit then does only `chargingDamage(dmg, CHARGING_DAMAGE)` (rules, 0.25 = 25%, rounded, at least 1)
  and **no specials** (no knockout, no shock, no freeze; a Supersword hit does 25). Every shot, and a melee
  swing that hits someone (a player or a raised shield), starts that weapon's charge over; a swing at the air
  does not. A blocked weak hit still costs the shield its `shieldWear`; a Mega Shield sends back its part of the
  weak damage. A weapon dropped (or picked up) loses its charge: picked up it is ready; a broken weapon's charge
  goes with it. `inv.charge` = ms left per slot (0 = ready), so the phone can show the held weapon's charge.
- **Headshots (#45):** a gun bullet whose hit point (`rayCylinderHit` from `@pvp/collision`) is in the top
  `HEAD_ZONE` meters (rules, 0.35) of the target's body (standing `PLAYER_HEIGHT`, crouching `CROUCH_HEIGHT`) does
  `HEADSHOT_BONUS` (rules, 3) more: `headshotDamage(dmg)`, added after the charging cut (a charging DM Gun: 4 + 3 = 7).
  The 'dmg' message and the shooter's 'hitmark' get `head: true`. Melee, bombs and shock ticks never headshot.
  A raised shield blocks a headshot like any hit; a Mega Shield reflects its part of the normal damage (no bonus).
  Rules without these numbers use the defaults.
  **Anti-spam:** at most one use every `MIN_FIRE_GAP_MS` (rules, 150 ms) per player, whatever the weapon;
  faster fires are refused (`false`) and cost nothing.
- **Drop (#34):** `dropWeapon(id)` puts the weapon in hand on the ground with exactly its durability (the half rule
  is only for knockouts). The dropper picks it up again only after stepping out of pickup range once; a dropped
  free starting Gun stays free (never goes into a backpack). Not while frozen.
  At 0 the weapon is removed, the player gets `{ t: 'broke', slot, weapon }` then an `inv`, and the hand stays
  on the same slot number (or the last slot if that one is gone). Its last use still fires.
  The starting Gun breaks like any weapon; a player may then have no weapons at all (firing does nothing,
  the snapshot shows `''`, picking up works). Loadout weapons and chest loot start full.
- **Copies:** a player may carry the same weapon more than once (e.g. 2 Guns in 2 slots), each copy with its
  own durability. Picking up a weapon only needs a free slot. On leave only the free starting Gun stays behind
  (`getPlayer(id).free` marks it per slot); every other copy goes back.
- **Knockout:** every weapon is dropped (the Gun and the shield too) and every Healing Potion (one ground item each). **Dropped weapons rule:** a dropped weapon
  with more than half its durability keeps it; half or less is set to half, rounded up (`droppedDurability` in
  `@pvp/game-rules`). Ground items carry `dur` and whoever picks one up gets exactly that.
- **Chests:** a normal chest gives `CHEST_COINS` (3) coins and exactly one weapon (shields included), picked with
  each weapon's `chestChance` as its weight: chance = weight / sum of weights, so the card numbers (they add up
  to 54.8) do not have to make 100 (one draw from the seeded loot stream). The golden chest gives
  `GOLDEN_CHEST_COINS` (10) coins and one weapon, with the weights of Epic, Legendary and Megalegend weapons
  doubled (`GOLDEN_CHEST_BOOST`). **Every chest (the golden one too) also drops an extra Healing Potion**
  `POTION.chestChance` (15) % of the time, next to the weapon (seeded draws in a fixed order: weapon, its spot,
  potion chance, potion spot). An opened normal chest comes back full after `CHEST_RESPAWN_MS` (2 minutes).
  `chestWeights(rules, { golden })` and `rollChestWeapon(A, { golden })` live in `src/loot.js`.
- **Healing Potion** (the only heal, numbers in `POTION` / `MAX_POTIONS` of `@pvp/game-rules`): a player carries
  0-3 potions (`getPlayer(id).potions`, the `inv` message's `potions`). Nobody gets free potions: they come from
  the backpack (`join`'s `potions`), chests and knocked-out players. A potion on the ground is picked up only with
  fewer than 3. `drink(id, now)` uses one up right away and starts drinking (`{ t: 'drink', state: 'start', ms: 5000 }`);
  the first `tick` at or after start + `drinkMs` sets full health (`state: 'done'` + `inv`). Moving and getting hit
  do not stop it. Switching to another slot before that cancels it (`state: 'cancel'`): the potion is wasted.
  Leaving or being knocked out also ends it (that potion is gone). **Decisions:** drinking is refused at full health,
  with no potion or while already drinking; you cannot fire while drinking (switch slots to stop).
- **Durability is kept (#51):** `leave(id, { alive: true })` returns every carried weapon (not the free starting Gun
  from `join`): a full one as its id, a worn one as `{ id, dur }` (uses left). A `join` loadout entry may be the same
  `{ id, dur }`: the weapon (or shield) starts with those uses left, so going to the menu and back never makes a
  weapon full again. Broken weapons are gone for good (they were taken out of the backpack at `join` and are not returned).
- **Coins:** the account (e.g. `@pvp/accounts-shop`) is the single source of truth. The arena only keeps a copy
  (from `join`) for the 'coins' and 'inv' messages, and only chests add to it. Whenever the coins change outside
  the arena (a shop buy, maybe from another device during a match), the host calls
  `arena.setCoins(id, account.coins)`, which sets the copy and queues an `inv` with the new total for that player
  (unknown id or a total that is not a whole number >= 0: ignored, returns `false`). After a chest's
  `{ kind: 'coins' }` server event, add the coins to the account and, if its new total differs from `ev.total`,
  call `setCoins` with the account's total so both stay equal.

- **Bombs** (#32, `src/bombs.js`, numbers in the rules' `BOMBS`): a counter per bomb (`getPlayer(id).bombs`, `inv.bombs`),
  never a slot. `throwBomb(id, bombId, dir, now)` takes one away and sends `bomb` to everyone. It lands where the aim ray
  from the hand first meets the ground, a roof or a wall (then `bombWallBack` in front of it), but never farther than the
  bomb's `maxThrow` (measured flat; farther aims land at `maxThrow` in that direction). It flies `bombFlyMs` +
  `bombFlyMsPerM` per meter. The first `tick` at or after throw + `fuseMs` explodes it (`boom`): everyone whose spot is
  inside the `area` x `area` square (the edge counts, at most `bombHitHeight` above or below) gets `dmg` through the normal
  damage path (spawn protection counts, a raised shield does **not** block, knocked a little away from the middle).
  `hurtsThrower: false` (Legendary Bomb) never hurts its thrower; a Bomb does. The thrower gets the credit (also after
  leaving; your own bomb: nobody). Refused (null): unknown bomb, none left, shield raised, frozen, drinking, or within
  `bombThrowCooldownMs`. Throwing ends spawn protection. Every chest also drops one pack of each bomb its `chestChance` %
  of the time (seeded draws after the potion's). A bomb item is picked up as far as `maxCarry` allows; the rest of the
  pack stays on the ground. A knockout drops all bombs (one item per kind). `welcome.bombs` lists the live bombs and
  `arena.bombs()` gives a copy.

Files: `src/state.js`, `src/players.js` (also the potion drinking), `src/chests.js`, `src/loot.js`, `src/combat.js`, `src/bombs.js`, `src/effects.js`
(shields, shock, freeze), `src/snapshot.js`, `src/tuning.js`, all wired in `src/index.js`.

## Determinism

Fully deterministic. Time is passed in, and all randomness comes from the seeded `random` you give it
(split with `fork` into its own streams for spawns, loot, the golden chest and gun spread). No `Math.random`,
no `Date.now`, no timers: shock ticks and freeze end at times computed from the `now` you pass in. The same
seed and the same calls give exactly the same outbox (there are replay tests, with shields, shock and freeze).
