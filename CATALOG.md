# Package catalog

This is the list of our reusable packages in [`packages/`](packages/). Each one is a small piece
that works on its own, so it can be used in this game **and in other games too**. Every package
follows the template in [packages/README.md](packages/README.md): an ES module with `src/index.js`,
tests with `node:test`, and a README with "What it does", "How to use" and "Determinism".

`npm run catalog:check` (also part of `npm test`) fails if a package folder is missing here
or does not follow the template.

## Who depends on whom

An arrow `A --> B` means "A uses B". Dotted arrows are only used in tests.

```mermaid
graph LR
  arena["@pvp/arena"] --> collision["@pvp/collision"]
  arena --> rules["@pvp/game-rules"]
  arena --> worldgen["@pvp/world-gen"]
  arena -.-> random["@pvp/seeded-random"]
  arena -.-> protocol["@pvp/net-protocol"]
  worldgen --> collision
  worldgen --> random
  accounts["@pvp/accounts-shop"] --> rules
  shop["@pvp/shop-catalog"] --> rules
  hud["@pvp/hud-model"] --> rules
  stickman["@pvp/stickman-3d"] --> rules
  stickman --> three(["three (outside)"])
  scene["@pvp/island-scene"] --> random
  scene --> three
  scene -.-> worldgen
  api["@pvp/api-client"]
  controls["@pvp/touch-controls"]
```

`@pvp/api-client`, `@pvp/touch-controls`, `@pvp/collision`, `@pvp/game-rules`,
`@pvp/net-protocol` and `@pvp/seeded-random` need no other package.

## All packages

| Package | What it does | Runs in | Determinism | Tests |
|---|---|---|---|---|
| `@pvp/seeded-random` | Random numbers from a seed: same seed, same numbers. | both | fully: only the seed and the calls decide | 11 |
| `@pvp/game-rules` | All the game's numbers (the boss's weapons and shields, rarities and their colors, chest weights, heals, skins, prices, limits) as frozen data. | both | fully: constant data and pure helpers | 19 |
| `@pvp/collision` | Walls, jumping, landing and ray hits in a world made of boxes. | both | fully: pure math, no random, no time | 18 |
| `@pvp/world-gen` | Builds the island of ruins (houses, towers, chests) from a seed. | both | fully: all random comes from the seed | 12 |
| `@pvp/net-protocol` | Every message between phone and server, with builders and checks. | both | fully: pure functions and frozen data | 18 |
| `@pvp/accounts-shop` | Accounts, log in, coins, buying skins and weapons, the backpack. | Node | partly: logic is pure, tokens/clock are passed in, file saving is real I/O | 27 |
| `@pvp/arena` | The fight itself: players, chests, loot, weapons, shields, shock and freeze, damage, knockouts. | both | fully: time and seeded random are passed in (replay tests) | 61 |
| `@pvp/shop-catalog` | Turns the rules and an account into the cards the shop screen shows. | both | fully: pure functions of their inputs | 9 |
| `@pvp/hud-model` | Turns your inventory and health into the in-game HUD: Durability bar of the held weapon, H.P bar, 5 slots, shield pill. | both | fully: pure functions of their inputs | 12 |
| `@pvp/api-client` | Talks to the server's account and shop API and keeps the login token. | both | fully: fetch and storage are passed in | 10 |
| `@pvp/stickman-3d` | A three.js stickman with skins, outfits, the boss's weapons and shields, frozen/shocked looks and animation. | browser (pose math also in Node) | partly: pose math is pure, how it looks depends on the renderer | 23 |
| `@pvp/island-scene` | The 3D island: sky, sun, ground, water, palms, ruins and chests. | browser (also builds in Node) | partly: all placement and colors from a seed, how it looks depends on the renderer | 8 |
| `@pvp/touch-controls` | Joystick, aim by dragging, buttons, held actions (shield), keyboard and mouse. | browser (core also in Node) | partly: the core is pure, the DOM part depends on real fingers and mice | 21 |

"Both" means Node and the browser (in the browser, `@pvp/*` imports need an import map or a bundler).

---

## `@pvp/seeded-random`

**Purpose:** random numbers you can replay. Same seed gives the same numbers, in Node and the browser.

| Export | Example |
|---|---|
| `createRandom(seed)` | `const r = createRandom(1234); // or createRandom('island-1')` |
| `r.int` / `r.range` / `r.chance` | `r.int(1, 6); r.range(-5, 5); r.chance(0.25);` |
| `r.pick` / `r.shuffle` | `r.pick(['a', 'b']); r.shuffle([1, 2, 3]); // new array` |
| `r.fork(label)` | `const loot = r.fork('loot'); // own stream, parent not moved` |
| `r.state()` / `createRandom.fromState` | `const again = createRandom.fromState(r.state());` |
| `hashString(str)` | `hashString('abc'); // 32-bit number (FNV-1a)` |

**Depends on:** nothing.
**Determinism:** fully. No `Math.random`, no time. One extra draw changes everything after it, so give each system its own `fork`.

## `@pvp/game-rules`

**Purpose:** all the game's rules as frozen plain data (limits, movement, the boss's weapons and shields with their specials, the starting weapon, rarities and their colors, chest weights and coins, heals, colors, outfits, prices), plus small helpers.

| Export | Example |
|---|---|
| `WEAPONS`, `HEALS`, `COLORS`, `OUTFITS`, `MAX_HP` | `WEAPONS.icesword.freezeMs; // 2000` |
| `STARTING_WEAPON` | `'gun'`: everyone gets it on join |
| `RARITIES`, `RARITY_COLORS`, `rarityStyle(r)` | `RARITY_COLORS.epic.color; // purple` |
| `chestChance(id)`, `CHEST_COINS`, `GOLDEN_CHEST_COINS`, `GOLDEN_CHEST_BOOST` | `chestChance('gun'); // 15 (a weight: 15 / 46.3 of chests)` |
| `isShield(id)`, `rarityRank(r)` | `isShield('megashield'); // true (worn on the arm, no slot)` |
| `droppedDurability(id, usesLeft)` | `droppedDurability('gun', 3); // 8 (half, rounded up)` |
| `RULES` | `createArena({ rules: RULES, ... }) // everything in one object` |
| `weaponPrice(id)` / `skinPrice(slot, id)` | `weaponPrice('gun'); // 3` |
| `isBuyable(kind, id)` | `isBuyable('weapon', 'supersword'); // true` |
| `weaponsByRarity(rarity)` | `weaponsByRarity('epic'); // ['electricsword', 'icesword', 'shield']` |
| `validateRules(rules)` | `validateRules(RULES); // [] means valid` |

**Depends on:** nothing.
**Determinism:** fully. Constant data and pure functions; all data is frozen.

## `@pvp/collision`

**Purpose:** collision and movement math for a world made of boxes.

| Export | Example |
|---|---|
| `createBoxGrid(boxes, opts)` | `const grid = createBoxGrid(boxes, { cellSize: 10 }); grid.near(x, z, 2);` |
| `circleHitsBox(x, z, r, box)` | `circleHitsBox(0, 0, 0.45, box); // true if they overlap` |
| `movePlayer(grid, body, dx, dz, dt, opts)` | `movePlayer(grid, body, dx, dz, dt, { radius: 0.45, height: 1.85, stepHeight: 0.55, gravity: 24 });` |
| `rayBoxes(grid, origin, dir, maxDist)` | `rayBoxes(grid, eye, dir, 120); // nearest box or ground, else Infinity` |
| `rayBox(origin, dir, box)` | `rayBox(eye, dir, box); // distance or Infinity` |
| `rayCylinder(origin, dir, cyl)` | `rayCylinder(eye, dir, { x, y, z, height: 1.85, radius: 0.55 });` |

**Depends on:** nothing.
**Determinism:** fully. Pure functions; `near()` returns boxes in input order, so walls are resolved in a fixed order.

## `@pvp/world-gen`

**Purpose:** builds the island of ruins (plaza, houses, towers, colonnades, walls, rocks, chests, golden spots) from a seed, picks spawn points and checks a map.

| Export | Example |
|---|---|
| `generateIsland(opts)` | `const island = generateIsland(); // today's map (seed 20261020)` |
| `generateIsland({ seed, ... })` | `generateIsland({ seed: 'my-map', islandRadius: 100, houses: 10 });` |
| `findSpawn(island, players, random, opts)` | `findSpawn(island, players, createRandom(1), { minDistanceFromOthers: 25 });` |
| `validateIsland(island)` | `validateIsland(island); // [] when fine` |
| `DEFAULT_SEED`, `DEFAULT_OPTIONS` | `generateIsland({ ...DEFAULT_OPTIONS, rocks: 30 });` |

**Depends on:** `@pvp/seeded-random`, `@pvp/collision`.
**Determinism:** fully. All randomness comes from the seed. Changing any option changes the rest of the map (the builders share one random stream).

## `@pvp/net-protocol`

**Purpose:** every message between the phone and the server in one place ([PROTOCOL.md](packages/net-protocol/PROTOCOL.md)), with helpers to build and check them, so bad messages are rejected.

| Export | Example |
|---|---|
| `parseClientMessage(raw)` | `const r = parseClientMessage(raw); if (r.ok) handle(r.msg);` |
| `encode(type, fields)` | `ws.send(encode('coins', { amount: 10, total: 130 }));` |
| `encodeClient(type, fields)` | `ws.send(encodeClient('fire', { d: [0, 0, 1] }));` |
| `decodeServerMessage(raw)` | `const r = decodeServerMessage(event.data);` |
| `packSnapshotPlayer` / `unpackSnapshotPlayer` | `encode('snap', { p: [packSnapshotPlayer(p)], n: 1 });` |
| `makeFlags` / `readFlags` | `readFlags(flags); // crouch, slide, moving, air` |
| `makeStatus` / `readStatus` | `readStatus(snap[SNAP.STATUS]); // shieldUp, shocked, frozen` |

**Depends on:** nothing.
**Determinism:** fully. Pure functions and frozen data. The only setting is `setEncodeChecks(on)`.

## `@pvp/accounts-shop`

**Purpose:** player accounts (sign up, log in, log out), coins, the shop (buy and equip skins, buy weapons into the backpack) and the loadout taken into the arena. Storage is pluggable. Node only.

| Export | Example |
|---|---|
| `createAccounts({ store })` | `const accounts = createAccounts({ store: createMemoryStore() });` |
| `accounts.signup` / `accounts.login` | `const { token, account } = accounts.signup('Stick_Kid', 'secret');` |
| `accounts.buy` / `accounts.equip` | `accounts.buy(acc, 'hat', 'crown'); accounts.equip(acc, 'hat', 'crown');` |
| `accounts.takeLoadout` / `returnLoadout` | `const weapons = accounts.takeLoadout(acc);` |
| `createJsonFileStore(file, opts)` | `createJsonFileStore('data/accounts.json', { saveDelayMs: 1000 });` |
| `AccountError` | `catch (e) { if (e.code === 'NAME_TAKEN') ... }` |

**Depends on:** `@pvp/game-rules` (and Node's `crypto` and `fs`).
**Determinism:** partly. Shop and loadout logic is pure. Tokens, salts and timestamps come from the injected `randomBytes` and `now`, so tests are repeatable. The JSON file store writes real files on a timer.

## `@pvp/arena`

**Purpose:** the fight as a simulation with no sockets and no clock: join and leave, movement checks, weapons (melee and guns), shields on the arm (front blocks, wear, Mega Shield reflect), shock and freeze, instant knockout, chests and the golden chest (one weapon each, picked by the weapons' chest weights), loot, damage and knockouts (dropped weapons with half or less durability come back at half). Everyone joins with the starting Gun. The server calls methods and `tick(now)`, then sends what `drain()` returns.

| Export | Example |
|---|---|
| `createArena(opts)` | `const arena = createArena({ island: generateIsland(), rules: RULES, random: createRandom(1234), now: 0 });` |
| `arena.join` / `arena.leave` | `const r = arena.join('alice', { name: 'Alice', skin, loadout: ['shootbm', 'shield'] }, now);` |
| `arena.setState` / `arena.fire` | `arena.fire(id, [dx, dy, dz], now);` |
| `arena.setShield` | `arena.setShield(id, true, now); // raise the shield (no firing while up)` |
| `arena.openChest` | `arena.openChest(id, 3, now); // or 'golden'` |
| `arena.setCoins` | `arena.setCoins(id, account.coins); // the account's total wins, queues an 'inv'` |
| `arena.tick` / `arena.drain` | `arena.tick(now); for (const ev of arena.drain()) send(ev);` |
| `ARENA_DEFAULTS` | `createArena({ ..., tuning: { ...ARENA_DEFAULTS, snapshotRadius: 200 } });` |

**Depends on:** `@pvp/collision`, `@pvp/game-rules`, `@pvp/world-gen` (tests also use `@pvp/seeded-random` and `@pvp/net-protocol`).
**Determinism:** fully. Time is passed in and all randomness comes from the seeded `random` (forked per system). Same seed and same calls give the same outbox; there is a replay test.

## `@pvp/shop-catalog`

**Purpose:** pure functions that turn the rules and an account into what the shop screen shows: tabs, item cards with buy/equip state, and a backpack line.

| Export | Example |
|---|---|
| `shopTabs()` | `shopTabs(); // [{ id: 'color', label: 'Colors', hint }, ...]` |
| `shopItems(tab, account)` | `shopItems('hat', account); // cards with action 'buy' / 'equip' / 'equipped'` |
| `shopWeaponIds(rules)` | `shopWeaponIds(); // every weapon, sorted by rarity, then price` |
| `backpackSummary(account)` | `backpackSummary(account); // 'Backpack: 2× Shootbm, 1× Supersword'` |
| `swatchBackground(card)` | `el.style.background = swatchBackground(card);` |
| `OUTFIT_ICONS` | `OUTFIT_ICONS.hat.crown; // '👑'` |

**Depends on:** `@pvp/game-rules`.
**Determinism:** fully. Pure functions of their inputs; fixed sort order.

## `@pvp/hud-model`

**Purpose:** pure functions that turn the `inv` message and your health into what the in-game HUD shows (the boss's drawing): the Durability bar of the weapon you hold, the H.P bar with its percent, always all 5 weapon slots (empty ones too), the small Shield pill, and which slot a key picks.

| Export | Example |
|---|---|
| `slotBar(inv, rules)` | `slotBar(inv); // 5 slots: { index, key, weapon, name, icon, rarity, active, empty, durability }` |
| `durabilityView(id, usesLeft)` | `durabilityView('icesword', 7); // { ratio: 0.14, level: 'critical', … } or null` |
| `heldDurabilityView(inv, rules)` | `heldDurabilityView(inv); // { ratio, percent, level, label: '75%' or '∞', infinite, empty, … }` |
| `healthView(hp)` | `healthView(30); // { hp: 30, percent: 30, low: true, text: '30', label: '30%', … }` |
| `pickSlot(inv, action)` | `pickSlot(inv, '+'); // next filled slot, or null` |
| `brokeMessage(id)` | `brokeMessage('shootbm'); // 'Your Shootbm broke!'` |
| `shieldView(inv, up)` | `shieldView({ shield: { id: 'shield', dur: 45 } }); // { name: 'Shield', label: '45', percent: 75, … } or null` |
| `WEAPON_ICONS` | `WEAPON_ICONS.icesword; // '❄️'` |

**Depends on:** `@pvp/game-rules`.
**Determinism:** fully. Pure functions of their inputs; durability levels: green above 50 %, yellow 20-50 %, red below 20 %.

## `@pvp/api-client`

**Purpose:** talks to the server's account and shop API (sign up, log in, me, buy, equip) and remembers the login token, with friendly error messages.

| Export | Example |
|---|---|
| `createApiClient(opts)` | `const api = createApiClient({ storage: localStorage });` |
| `api.signup` / `api.login` | `const { account } = await api.login('Bob', 'secret');` |
| `api.me` | `const { account, online } = await api.me();` |
| `api.buy` / `api.equip` | `await api.buy('hat', 'crown');` |
| `ApiError` | `catch (e) { show(e.message); /* e.status 0 = no connection */ }` |
| `safeStorage(storage)` | `const s = safeStorage(localStorage); s.set('k', 'v');` |

**Depends on:** nothing.
**Determinism:** fully. No randomness and no clock; `fetch` and storage are passed in, so tests use fakes.

## `@pvp/stickman-3d`

**Purpose:** a three.js stickman: skin colors and patterns, outfits, a weapon in hand (models from the boss's cards), a shield on the left arm, frozen / shocked looks, and walk / crouch / slide / jump / aim / swing / shield-up animation.

| Export | Example |
|---|---|
| `Stickman` | `const sm = new Stickman({ color: 'rainbow', hat: 'crown' }); scene.add(sm.root);` |
| `sm.setWeapon` / `sm.animate` | `sm.setWeapon('icesword'); sm.animate(dt, { speed, crouch }, time);` |
| `sm.setShield` / `sm.shieldUp` | `sm.setShield('megashield'); sm.shieldUp = true;` |
| `sm.setStatus` | `sm.setStatus({ frozen: true, shocked: false }); // ice block / lightning` |
| `buildWeapon(id)` | `const loot = buildWeapon('supersword'); loot.userData.update?.(time); // a THREE.Group` |
| `computePose(state, prev, dt)` | `const pose = computePose({ speed: 3, time }, null, dt);` |
| `weaponModelKind(id)` | `weaponModelKind('shootbm'); // 'special:shootbm'` |
| `disposeObject(obj)` | `disposeObject(loot); // free geometries and materials` |

**Depends on:** `@pvp/game-rules`, and `three` (peer dependency).
**Determinism:** partly. `computePose`, `rainbowHue` and `weaponModelKind` are pure and take time as input; what shows on screen depends on the renderer.

## `@pvp/island-scene`

**Purpose:** the three.js scenery of an island from `@pvp/world-gen`: sky dome and sun, lights and shadows, ground, beach, water, grass, palms, ruins of light sandy stone, chests with a lid that opens backwards, and the golden chest.

| Export | Example |
|---|---|
| `createIslandScene(opts)` | `const isl = createIslandScene({ island: generateIsland(), mobile, random: 'island-scene' }).addTo(scene);` |
| `isl.update(dt, time, focus)` | `isl.update(dt, time, { x: me.x, z: me.z }); // sky, water and sun follow the focus` |
| `isl.chests` | `isl.chests.setOpen(3, true); isl.chests.isOpen(3); isl.chests.closeAll();` |
| `isl.golden` | `isl.golden.show(x, z); isl.golden.hide();` |
| `buildChest({ golden })` | `scene.add(buildChest()); // one chest model, lid in userData.lid` |
| `noiseTexture(random, opts)` | `noiseTexture(createRandom(1), { blocks: true, cracks: 6 });` |

**Depends on:** `@pvp/seeded-random`, and `three` (peer dependency). Tests also use `@pvp/world-gen`.
**Determinism:** partly. Every random placement, shade and texture comes from a seeded random (one fork per part), so the same seed gives the same scenery; time is passed in to `update()`. How it looks on screen depends on the renderer.

## `@pvp/touch-controls`

**Purpose:** game controls for phones and computers: joystick, drag to aim, buttons, held actions (hold Shift or the shield button to raise the shield), keyboard (WASD, arrows, keys) and mouse with pointer lock.

| Export | Example |
|---|---|
| `createInputState(config)` | `const input = createInputState({ enabled: false });` |
| `input.take()` | `const { ev, look, move, fire, shield } = input.take(); // every frame` |
| `attachTouchControls(input, els)` | `const detach = attachTouchControls(input, { canvas, stick, knob, buttons });` |
| `attachDesktopControls(input, opts)` | `attachDesktopControls(input, { canvas, target: window });` |
| `isTouchDevice(window)` | `isTouchDevice(window) ? attachTouch... : attachDesktop...` |
| `DEFAULT_CONFIG` | `createInputState({ ...DEFAULT_CONFIG, stickRadius: 70 });` |

**Depends on:** nothing.
**Determinism:** partly. The core (`createInputState`) is pure: the same events give the same result, so replays work. The DOM adapters depend on real fingers, mice and screen layout.
