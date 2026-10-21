# PvP network protocol (version 1)

Phone and server talk over a WebSocket (`/?token=<login token>`). Every message is **one JSON object**.
The field `t` says what kind of message it is. A phone may send at most **4096 bytes** per message.

Types used below: `number` (finite, between -1,000,000 and 1,000,000), `int` (whole number), `uint` (whole number, 0 or more),
`string` (at most 64 characters), `bool`, `vec2` = `[x, z]`, `vec3` = `[x, y, z]`. A `?` means the field may be missing.
The exact rules live in `src/messages.js`.

## Phone → server

| `t` | Fields | Meaning |
|---|---|---|
| `join` | – | Join the fight. |
| `leave` | – | Leave alive; weapons go back to the backpack. Server answers `left`. |
| `state` | `x, y, z` number, `ry, pitch` number (radians), `f` int 0–255 | My position and look, ~20 times a second. `f` = movement flags (below). |
| `fire` | `d` vec3 | Use the weapon in my hand, aiming in direction `d`. |
| `slot` | `i` int 0–31 | Switch to weapon slot `i` (0 = the first slot; it may hold nothing if your weapons broke). |
| `open` | `id` int or `"golden"` | Open the chest next to me (chest index, or the golden chest). |
| `drink` | – | Start drinking a Healing Potion (the only heal). Takes `POTION.drinkMs` (5 s). Moving or getting hit does not stop it; switching weapon slots (`slot`) before it is done cancels it and the potion is wasted. |

## Server → phone

| `t` | Fields | Meaning |
|---|---|---|
| `welcome` | `id`, `x`, `z`, `players` [{id, name, skin}], `chests` [chest index], `golden` {x, z} or null, `items` [{id, kind, weapon, x, y, z}], `mines` [{id, x, z, owner}] | You joined. Your id, spawn spot and everything in the arena. |
| `full` | – | Arena is full. |
| `left` | – | You left (answer to `leave`). |
| `snap` | `p` [snapshot player], `n` uint | 20 times a second: players near you, and how many are in the arena. |
| `inv` | `weapons` [weapon id], `dur?` [uint or null], `slot`, `potions`, `coins`, `hp`, `picked?` string | Your inventory and health (`potions` = Healing Potions carried, max `MAX_POTIONS` (3); `picked` = name of what you just picked up). `dur` = uses left per slot, same order as `weapons`; `null` = never breaks. The max is the weapon's `durability` in `@pvp/game-rules`. |
| `drink` | `state` `"start"`/`"done"`/`"cancel"`, `ms` uint, `hp` | Potion drinking: `start` (the potion is used up now, `ms` = drinking time, show a progress ring), `done` (`hp` is full now), `cancel` (switched weapon or ended: the potion is wasted). An `inv` follows `start` and `done`. |
| `broke` | `slot` uint, `weapon` id | Your weapon in `slot` broke (durability 0) and is gone, e.g. show "Your Pistol broke!". An updated `inv` follows. |
| `pjoin` | `id`, `name`, `skin` {color, hat, face, back, shirt} | A player joined. |
| `pleave` | `id` | A player left. |
| `pos` | `x, y, z` | Server put you back here (you moved too far too fast). |
| `coins` | `amount`, `total` | You got coins. |
| `chest` | `id`, `open` bool | A chest opened (true) or came back full (false). |
| `golden` | `golden` {x, z} or null, `by?` string | Golden chest appeared, or `by` opened it. |
| `item+` | `id`, `kind` weapon/potion, `weapon` id or null, `x, y, z`, `dur?` uint or null | Item dropped on the ground. `dur` (weapons only) = uses left, it keeps them when picked up. Items in `welcome` have the same `dur?`. |
| `item-` | `id`, `by?` player id | Item gone (`by` picked it up; missing = it expired). |
| `shot` | `id` shooter, `w` weapon id, `from` vec3, `to` [vec3] | Gun fired; one `to` per bullet. |
| `swing` | `id` | Melee swing. |
| `proj` | `id`, `kind` weapon id, `x, y, z`, `vx, vy, vz` | Grenade or rocket launched. |
| `proj-` | `id` | Projectile gone (it exploded). |
| `boom` | `x, y, z`, `r` radius | Explosion. |
| `mine+` | `id`, `x, y, z`, `owner` | Mine placed. |
| `mine-` | `id` | Mine gone. |
| `hitmark` | `dead` bool | You hit someone (`dead` = you knocked them out). |
| `hurt` | `hp`, `kx, kz` knockback, `from` vec2 or null | You got hurt. |
| `ko` | `id`, `x, y, z`, `victim` name, `by` name or null, `weapon` | Someone was knocked out. |
| `dead` | `by` name or null, `weapon` | You were knocked out. |

## Snapshot player

Each item of `snap.p` is an array (constants in `SNAP`):

| Slot | Name | Meaning |
|---|---|---|
| 0 | `ID` | Player id |
| 1, 2, 3 | `X`, `Y`, `Z` | Position (2 decimals) |
| 4 | `RY` | Body turn (radians) |
| 5 | `PITCH` | Look up/down (radians) |
| 6 | `FLAGS` | Movement flags |
| 7 | `WEAPON` | Weapon id in hand |
| 8 | `HP` | Health |
| 9 | `PROTECTED` | 1 = spawn protection on, 0 = off |

## Movement flags

Bits, added together: `1` crouch (`FLAG_CROUCH`), `2` slide (`FLAG_SLIDE`), `4` moving (`FLAG_MOVING`), `8` in the air (`FLAG_AIR`).
