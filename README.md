# PvP Game: Stickman Ruins

A 3D stickman battle game for phones. Everyone joins one big arena that never stops,
on an island full of ancient ruins. Open chests for coins and weapons, buy skins in the
shop, and be the last stickman standing.

- Game design: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- How we work: [docs/HOW_WE_WORK.md](docs/HOW_WE_WORK.md)
- Jobs to do: [BACKLOG.md](BACKLOG.md)
- Package catalog (every reusable package, for this game and others): [CATALOG.md](CATALOG.md)

## Run it

```
npm install
npm start
```

Then open the address it prints. Phones on the same Wi-Fi can join too.
Set `PORT` to use another port (default 3000). Run every test with `npm test`.

### Browser tests

`npm run test:e2e` (from the repo root) starts the real server and plays the game in Chromium:
sign up, shop, join, walk, open a chest, pick up loot, leave, two players seeing each other,
phone layout, and more (`apps/game/test/e2e/`). No console errors are allowed.

- Needs Chromium for Playwright: it is found in `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`),
  or set `CHROMIUM_PATH` to a Chrome/Chromium binary.
- WebGL runs in software (swiftshader), so the game draws only a few frames a second; the tests wait for that.
- Every test server uses a temp accounts file, never the real one.
- The play test starts its server with `PVP_TEST_HOOKS=1`, which lets the test jump a player close to a chest
  (`debugTeleport`). Never set it for real players: without it the server ignores that message.
- Add `SCREENSHOTS=1` to update `docs/screenshots/`.

## Layout

- `apps/game/`: the game: thin glue that connects the packages (server and phone/browser code). Accounts are saved in `apps/game/data/accounts.json` (or the file in the `DATA_FILE` environment variable; tests always use a temp file).
- `packages/`: reusable packages, see [CATALOG.md](CATALOG.md) for the list and [packages/README.md](packages/README.md) for the template.

> Work in progress: the game is being split into reusable packages (see the backlog).
