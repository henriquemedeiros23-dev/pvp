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
| 8 | ✅ | **Package `@pvp/arena`** | The fight itself: players join and leave, chests (same spots, back after 15 s), golden chest every 3 min, loot, damage, knockouts, dropping weapons. Runs by ticks with a clock and random numbers passed in, so tests can replay a fight exactly. |

## Phase 3: Look and feel packages

| # | Status | Issue | What "done" means |
|---|---|---|---|
| 9 | ✅ | **Package `@pvp/stickman-3d`** | Builds a three.js stickman with color, pattern, hat, mask, back item, clothes and a weapon in hand, plus walk / crouch / slide / jump / aim / swing animation. |
| 10 | ✅ | **Package `@pvp/touch-controls`** | Joystick on the left, buttons on the right, drag to aim, plus keyboard and mouse for computers. |

## Phase 4: Make the game work

| # | Status | Issue | What "done" means |
|---|---|---|---|
| 11 | ✅ | **Menu and shop screens** | Login, main menu (Join Arena, Shop, coins, players online), shop with tabs, death screen. This part is missing right now. |
| 12 | ✅ | **Connect the game to the packages** | Server and phone code use the packages instead of their own copies. The game runs from start to finish. |
| 13 | ✅ | **Automatic play test** | A browser test signs up, joins the arena, moves, opens a chest and leaves, with no errors. |
| 15 | ✅ | **Server crashes on a bad web address** | A request like `/%E0` makes the server crash. It must answer 400 instead, with a test. |
| 14 | ✅ | **Package catalog** | `CATALOG.md` lists every package: what it does, how to use it, how deterministic it is. |

## Phase 5: Polish (found while testing)

| # | Status | Issue | What "done" means |
|---|---|---|---|
| 16 | ✅ | **Menu: stickman preview hidden behind buttons** | You can see your skin next to the menu buttons, also on a phone. |
| 17 | ✅ | **Black triangle on the horizon, ruins too dark** | No black shapes in the sky; ruins look like light stone. |
| 18 | ✅ | **Joining/leaving: no timeout, backpack text late** | Join gives up with a message after a few seconds; backpack text is right after leaving. |
| 19 | ✅ | **Tests use a separate data file** | Tests never create accounts in the real data file. |
| 21 | ✅ | **Weapon durability** | Weapons wear out with use; at 0 they break and disappear. |
| 22 | ✅ | **Arena HUD: 5 slots with durability bars** | 5 slots always shown, health bar above, durability bar per weapon. |
| 23 | ✅ | **In-game coin count can be out of date** | Coins shown in the arena always match the account. |
| 20 | ✅ | **Chest lid turned the wrong way** | The lid sits along the chest, opens like a real lid, and the lock is on the front. |

## Phase 6: The boss's designs

| # | Status | Issue | What "done" means |
|---|---|---|---|
| 24 | ✅ | **HUD like the boss's drawing** | Durability bar + H.P bar with % on the left, 5 slots on the right, polished (docs/design/hud-sketch.jpg). |
| 25 | ✅ | **Starting weapon: the Gun** | Gun from the boss's card (docs/design/weapon-card-gun.jpg) replaces the wooden sword. |
| 26 | ✅ | **Weapons from the boss's cards** | Every weapon card becomes a real weapon (stats, model, chest chance, price, rarity). |
| 27 | ✅ | **One browser test sometimes fails** | The browser tests pass every time. |
| 28 | ✅ | **Healing Potion (the only heal)** | Potion: full H.P after 5 s of drinking, 15% extra in chests, 10 coins in the shop; no bandages/medkits. |
| 29 | ✅ | **Coins look like the boss's drawing** | Square-ish yellow coin with sparkle everywhere coins are shown (docs/design/coin.jpg). |
| 30 | ✅ | **Practice mode you can open from a link** | One HTML page runs the whole game alone in the browser; published as a link. |
| 31 | ✅ | **Rename the game to PvP Island** | The game is called PvP Island everywhere players see it. |
| 32 | ✅ | **More weapons from the boss's cards (batch 2)** | Bomb and the next cards become real items. |
| 33 | ✅ | **Damage numbers above the head** | '-15' floats above a hurt player's head for 2 s, visible to everyone. |
| 34 | ✅ | **Sword misses keep durability + drop weapon button** | Missing with a melee weapon costs nothing; a button drops the weapon in your hand. |
| 35 | ✅ | **Show 'Charging' with the time left** | After shooting, 'Charging 1.4s' counts down near the crosshair. |
| 36 | ✅ | **Chests come back after 2 minutes** | An opened chest refills after 2 min instead of 15 s. |
| 37 | ✅ | **Aim button for the Shootbm and DM Gun** | Hold AIM to zoom in through the sight for better aim. |
| 38 | ✅ | **New charging rules** | Charge per weapon; sword misses don't charge; attacking while charging does 25% damage. |
| 39 | ✅ | **Inventory screen and fast bar** | Menu Inventory with your bought items (space for 2 of each); pick what goes in your 5-slot bar for the arena. |
| 40 | ✅ | **Aim button stays on** | Tap AIM once to keep aiming, tap again to stop. |
| 41 | ✅ | **Change name + no swear words** | A name button in the menu; names with bad words are refused: pick a new name. |
| 42 | ✅ | **Demon Horns hat** | Red demon horns in the shop for 50 coins. |
| 43 | ✅ | **Greener, more realistic island** | Lush grass, plants, soil paths, wet sand, nicer water and light; still fast on phones. |
| 44 | ✅ | **Cheaper special colors** | Rainbow 100, Shiny Gold 75, Zebra 50 coins. |
| 45 | ✅ | **Headshots +3 damage** | A bullet in the head does 3 more damage, with a HEADSHOT sign. |
| 46 | ✅ | **Login every time + password twice** | The Account screen always shows before the menu; Create account asks for the password twice. |
| 47 | ✅ | **Ranking top 50** | A RANKING button in the menu: the 50 players with the most knockouts. |
| 48 | ✅ | **Get back your old practice player** | Old practice players (no password) can be claimed by creating an account with that name, keeping everything. |
| 49 | 🔲 | **Right mouse = shield, Shift = aim** | Swap the computer controls for shield and aim. |
| 50 | 🔲 | **Extras bar** | Shield, potions, Bombs and Legendary Bombs get their own bar with drawings; the fast bar is weapons only. |
| 51 | 🔲 | **Bug: durability resets** | Weapons came back at full durability after going to the menu; keep it saved. |

## Later ideas
- Sounds and music
- Ranking of top players
- Put the game online so friends can play from anywhere
