# PvP Island

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

### Put it online

[docs/DEPLOY.md](docs/DEPLOY.md) is the step-by-step guide (for a grown-up, no programming needed): Render with
`render.yaml` (always-on service, a disk for the accounts, health check `/healthz`), or Railway / any Docker host
with the `Dockerfile`. Online the server runs with `NODE_ENV=production`, `TRUST_PROXY=1` and `DATA_FILE` on the
disk; it has limits (125 players, connections, messages, login tries, new accounts), security headers, daily
backups of the accounts, and saves everything (players get their bar things back) when it is stopped.
All settings are in the table at the end of DEPLOY.md.

- `npm run load-check`: a fake full island (125 players) and how much work and data that is.
- `npm run admin:reset-accounts -- --yes`: the launch-day reset (wipes ALL accounts after a backup). Only when the boss asks.

### Practice mode (one file, no server)

`npm run build:practice` makes `dist/practice/pvp-island.html`: the whole game in ONE html file that runs
without the game server (`@pvp/local-server` runs the arena, accounts and a few bots inside the page; coins and
shop are saved in the browser; like the real game it starts on the Account screen). Only three.js is loaded, from jsdelivr (`three@0.170.0/build/three.module.min.js`). It also refreshes
`apps/game/public/practice.html` (made from `index.html`; try it at `http://localhost:3000/practice.html`).
Page options: `?seed=abc`, `?bots=0` to `?bots=5`.
It also makes `dist/practice/pvp-island.artifact.html`, the same game for publishing as a Claude artifact
(no doctype/html/head/body of its own, because the artifact viewer adds those).

### Browser tests

`npm run test:e2e` (from the repo root) starts the real server and plays the game in Chromium:
sign up, shop, join, walk, open a chest, pick up loot, leave, two players seeing each other,
phone layout, and more (`apps/game/test/e2e/`). No console errors are allowed.

- Needs Chromium for Playwright: it is found in `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`),
  or set `CHROMIUM_PATH` to a Chrome/Chromium binary.
- WebGL runs in software (swiftshader), so the game draws only a few frames a second; the tests wait for that.
- Every test server uses a temp accounts file, never the real one. The page runs under the real Content-Security-Policy, so a blocked script shows up as a console error.
- The play test starts its server with `PVP_TEST_HOOKS=1`, which lets the test jump a player close to a chest
  (`debugTeleport`), give coins (`debugCoins`) or knockouts for the ranking (`debugKills`). Never set it for real players: without it the server ignores that message.
- Add `SCREENSHOTS=1` to update `docs/screenshots/`.

## Layout

- `apps/game/`: the game: thin glue that connects the packages (server and phone/browser code). Accounts are saved in `apps/game/data/accounts.json` (or the file in the `DATA_FILE` environment variable; tests always use a temp file).
- `packages/`: reusable packages, see [CATALOG.md](CATALOG.md) for the list and [packages/README.md](packages/README.md) for the template.

> Work in progress: the game is being split into reusable packages (see the backlog).
