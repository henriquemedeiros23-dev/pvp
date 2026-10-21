# PvP network protocol (version 2)

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
| `heal` | `kind` `"bandage"` or `"medkit"` | Use a heal item. |
| `drop` | – | Drop the weapon in my hand on the ground, with exactly the durability it has (#34). Anyone can pick it up. |
| `shield` | `up` bool | Raise (`true`, Shift / the shield button held) or lower my shield. Ignored without a shield or while frozen. |

## Server → phone

| `t` | Fields | Meaning |
|---|---|---|
| `welcome` | `id`, `x`, `z`, `players` [{id, name, skin}], `chests` [chest index], `golden` {x, z} or null, `items` [{id, kind, weapon, x, y, z}] | You joined. Your id, spawn spot and everything in the arena. |
| `full` | – | Arena is full. |
| `left` | – | You left (answer to `leave`). |
| `snap` | `p` [snapshot player], `n` uint | 20 times a second: players near you, and how many are in the arena. |
| `inv` | `weapons` [weapon id], `dur?` [uint or null], `slot`, `bandages`, `medkits`, `coins`, `hp`, `shield?` {id, dur} or null, `picked?` string | Your inventory and health (`picked` = name of what you just picked up). `dur` = uses left per slot, same order as `weapons`; `null` = never breaks. The max is the weapon's `durability` in `@pvp/game-rules`. `shield` = the shield on your other arm and the blocks it has left (never in a slot). |
| `broke` | `slot` uint, `weapon` id | Your weapon in `slot` broke (durability 0) and is gone, e.g. show "Your Shootbm broke!". An updated `inv` follows. |
| `shieldbroke` | `weapon` id | Your shield broke (no blocks left) and is gone. An updated `inv` follows. |
| `pjoin` | `id`, `name`, `skin` {color, hat, face, back, shirt} | A player joined. |
| `pleave` | `id` | A player left. |
| `pos` | `x, y, z` | Server put you back here (you moved too far too fast). |
| `coins` | `amount`, `total` | You got coins. |
| `chest` | `id`, `open` bool | A chest opened (true) or came back full (false). |
| `golden` | `golden` {x, z} or null, `by?` string | Golden chest appeared, or `by` opened it. |
| `item+` | `id`, `kind` weapon/bandage/medkit, `weapon` id or null, `x, y, z`, `dur?` uint or null | Item dropped on the ground. `dur` (weapons only) = uses left, it keeps them when picked up. Items in `welcome` have the same `dur?`. |
| `item-` | `id`, `by?` player id | Item gone (`by` picked it up; missing = it expired). |
| `shot` | `id` shooter, `w` weapon id, `from` vec3, `to` [vec3] | Gun fired; one `to` per bullet. |
| `swing` | `id` | Melee swing. |
| `block` | `id` defender, `by` attacker | A raised shield blocked a hit (draw a flash in front of `id`). |
| `hitmark` | `dead` bool, `blocked?` bool | You hit someone (`dead` = you knocked them out, `blocked` = their shield stopped it). |
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
| 10 | `SHIELD` | Shield id worn on the left arm, `''` = none |
| 11 | `STATUS` | Bits: `1` shield raised (`STATUS_SHIELD_UP`), `2` shocked (`STATUS_SHOCKED`), `4` frozen (`STATUS_FROZEN`) |

## Movement flags

Bits, added together: `1` crouch (`FLAG_CROUCH`), `2` slide (`FLAG_SLIDE`), `4` moving (`FLAG_MOVING`), `8` in the air (`FLAG_AIR`).
