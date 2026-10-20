# PvP Game: Stickman Ruins

A 3D stickman battle game for phones. Everyone joins one big arena that never stops,
on an island full of ancient ruins. Open chests for coins and weapons, buy skins in the
shop, and be the last stickman standing.

- Game design: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- How we work: [docs/HOW_WE_WORK.md](docs/HOW_WE_WORK.md)
- Jobs to do: [BACKLOG.md](BACKLOG.md)

## Run it

```
npm install
npm start
```

Then open the address it prints. Phones on the same Wi-Fi can join too.
Set `PORT` to use another port (default 3000). Run every test with `npm test`.

## Layout

- `apps/game/`: the game (server, phone/browser code, shared code). Accounts are saved in `apps/game/data/accounts.json`.
- `packages/`: reusable packages, see [packages/README.md](packages/README.md).

> Work in progress: the game is being split into reusable packages (see the backlog).
