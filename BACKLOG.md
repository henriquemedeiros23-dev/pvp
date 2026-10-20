# Backlog

The list of jobs for the game. Agents take one issue at a time, top to bottom.
The live list is on GitHub Issues: https://github.com/henriquemedeiros23-dev/pvp/issues
(issue numbers here match GitHub). Close the GitHub issue when a job is done.

**Status:** 🔲 to do · 🔨 in progress · ✅ done

## Phase 1: Set up the package workshop

| # | Status | Issue | What "done" means |
|---|---|---|---|
| 1 | ✅ | **Set up the monorepo** | npm workspaces with a `packages/` folder, `apps/` folder, `npm test` runs every package's tests (node:test). The current code moves to `apps/game/` and still starts with `npm start`. |
| 2 | ✅ | **Package `@pvp/seeded-random`** | Random numbers from a seed (same seed = same numbers). Helpers: range, pick, shuffle, chance. Tests prove it repeats exactly. |
| 3 | ✅ | **Package `@pvp/game-rules`** | Weapons, heals, skins, outfits, prices and limits as plain data, with a check that the data is valid. Taken from `shared/config.js`. |

## Phase 2: Core packages (deterministic)

| # | Status | Issue | What "done" means |
|---|---|---|---|
| 4 | ✅ | **Package `@pvp/collision`** | Spatial grid, circle-vs-box, player movement (walls, step up, jump, landing), ray vs boxes, ray vs player. Pure functions, no randomness. Taken from `shared/world.js`. |
| 5 | ✅ | **Package `@pvp/world-gen`** | Builds the island of ruins (houses, towers, pillars, walls, rocks, chests, golden spots) from a seed. Test: same seed gives the same map every time. |
| 6 | ✅ | **Package `@pvp/net-protocol`** | Every message between phone and server written down in one place, with helpers to build and check messages. Bad messages get rejected. |
| 7 | ✅ | **Package `@pvp/accounts-shop`** | Sign up, log in, coins, buy and equip skins, buy weapons into the backpack. Storage is pluggable (JSON file by default). |
| 8 | 🔲 | **Package `@pvp/arena`** | The fight itself: players join and leave, chests (same spots, back after 15 s), golden chest every 3 min, loot, damage, knockouts, dropping weapons. Runs by ticks with a clock and random numbers passed in, so tests can replay a fight exactly. |

## Phase 3: Look and feel packages

| # | Status | Issue | What "done" means |
|---|---|---|---|
| 9 | 🔲 | **Package `@pvp/stickman-3d`** | Builds a three.js stickman with color, pattern, hat, mask, back item, clothes and a weapon in hand, plus walk / crouch / slide / jump / aim / swing animation. |
| 10 | ✅ | **Package `@pvp/touch-controls`** | Joystick on the left, buttons on the right, drag to aim, plus keyboard and mouse for computers. |

## Phase 4: Make the game work

| # | Status | Issue | What "done" means |
|---|---|---|---|
| 11 | 🔲 | **Menu and shop screens** | Login, main menu (Join Arena, Shop, coins, players online), shop with tabs, death screen. This part is missing right now. |
| 12 | 🔲 | **Connect the game to the packages** | Server and phone code use the packages instead of their own copies. The game runs from start to finish. |
| 13 | 🔲 | **Automatic play test** | A browser test signs up, joins the arena, moves, opens a chest and leaves, with no errors. |
| 15 | ✅ | **Server crashes on a bad web address** | A request like `/%E0` makes the server crash. It must answer 400 instead, with a test. |
| 14 | 🔲 | **Package catalog** | `CATALOG.md` lists every package: what it does, how to use it, how deterministic it is. |

## Later ideas
- Sounds and music
- Ranking of top players
- Put the game online so friends can play from anywhere
