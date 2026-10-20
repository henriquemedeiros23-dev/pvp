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
Set `PORT` to use another port (default 3000). Run every test with `npm test`. Run the browser check of the menu and shop with `npm run test:e2e` (needs Chromium for Playwright; add `SCREENSHOTS=1` to update `docs/screenshots/`).

## Layout

- `apps/game/`: the game: thin glue that connects the packages (server and phone/browser code). Accounts are saved in `apps/game/data/accounts.json` (or the file in the `DATA_FILE` environment variable; tests always use a temp file).
- `packages/`: reusable packages, see [CATALOG.md](CATALOG.md) for the list and [packages/README.md](packages/README.md) for the template.

> Work in progress: the game is being split into reusable packages (see the backlog).
