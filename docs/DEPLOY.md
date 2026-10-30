# Putting PvP Island online

This guide is for a parent or another grown-up. You do **not** need to be a programmer.
At the end the game has its own web address (like `https://pvp-island.onrender.com`) that anyone can open on a
phone or computer, and it stays on all day and night.

You need:

- the GitHub account that has the `pvp` repository (the game's code),
- an email address and a payment card for the hosting company (an always-on game with saved accounts is not free).

We use **Render** (render.com). The repository already has a file called `render.yaml` that tells Render
everything: how to start the game, the health check, and a small disk where the accounts are saved.
There is a shorter section for **Railway** at the end, if you like that one better.

---

## 1. Create the game on Render

1. Go to **render.com** and click **Get Started**. Sign up (choosing **"Sign up with GitHub"** is easiest).
2. In the Render dashboard click **New +** (top right) and choose **Blueprint**.
3. Click **Connect GitHub** (if Render asks) and allow Render to see the **pvp** repository.
   You can allow only that one repository.
4. Pick the **pvp** repository from the list and click **Connect**.
5. Render reads `render.yaml` and shows one service called **pvp-island** with a disk called **pvp-data**.
   - Give the Blueprint any name, for example `pvp-island`.
   - The plan is set to **Starter**. A paid plan is needed, because free services fall asleep when nobody plays
     and cannot have a disk (without a disk, every account would be lost at each update).
     **Check the current prices on render.com/pricing** before you continue; the disk is billed a little extra.
     You can pick a bigger plan here if you want (see "How big a server?" below).
6. Click **Apply** (or **Create**). Render now downloads the code and builds the game. This takes a few minutes.
7. Open the **pvp-island** service. Wait until the status at the top says **Live** (green).
8. Near the top you see the address, like `https://pvp-island.onrender.com`. Click it: the game opens.
   Make an account and try it.
9. Share that address with the players. On phones they can use **"Add to Home Screen"** to get an app icon.

That's it! The game is online.

> The address ends in `.onrender.com`. If you ever want your own name (like `pvpisland.com`), you can buy one and
> add it in the service under **Settings → Custom Domains**. Not needed.

## 2. Updates (automatic)

When new code is pushed to the **main** branch on GitHub, Render builds and starts the new version by itself
(`autoDeploy` in `render.yaml`). Players in a match are sent back to the menu for a moment
("The island is restarting for an update"), and **nothing is lost**: before stopping, the server gives everyone
the things from their bars back and saves all accounts.

You can see every update under **Events** in the service. To start one by hand: **Manual Deploy → Deploy latest commit**.

## 3. Logs (what the server says)

Open the service and click **Logs**. You see lines like:

- `PvP Island is running!`: it started.
- `Backup of the accounts saved: ...`: the daily copy of the accounts (the last 7 are kept, on the disk).
- `Connection refused (too many) for ...` or `Signup limit reached for ...`: someone hit a limit (see below).
- `API error:` or `Message error:`: something went wrong in the code. Copy the lines and send them to the boss's team.

## 4. Launch-day reset (wipe all accounts)

The boss may want everybody to **start equal** on launch day: all accounts (coins, skins, weapons, rankings) are
deleted, and everyone makes a new account. **Only do this when the boss asks for it.**
A backup copy is made first, so it can be undone by a grown-up who knows how.

1. Open the **pvp-island** service on Render and click **Shell** (on the left).
2. Type this and press Enter:

   ```
   npm run admin:reset-accounts -- --yes
   ```

   It answers `All accounts wiped ...` and the name of the backup file.
   (Without `--yes` it only explains what it would do and changes nothing.)
3. Now restart the game: at the top right of the service, open the menu and choose **Restart service**
   (if you cannot find it: **Manual Deploy → Deploy latest commit** also restarts it).
   This step matters: the running game still remembers everyone and saves them once more while stopping; the new
   start sees the reset note and wipes again, for good.
4. Open the game and check: logging in with an old account says the name or password is wrong.

The backup is in `/var/data/` and is called `accounts.json.before-reset-<date and time>`. It is never deleted
automatically.

## 5. Stopping it (to stop paying)

- **Pause for a while:** in the service, **Settings → Suspend Service**. The game goes offline. Check Render's
  pricing page for what a suspended service and its disk still cost. **Resume Service** turns it back on, accounts kept.
- **Stop for good:** **Settings → Delete Service** (and delete the Blueprint/disk if Render lists it separately).
  **This deletes all accounts forever.** Afterwards check **Billing** to see that nothing is running any more.

## 6. How big a server? (125 players)

The boss set the island to hold **125 players** at the same time. We measured it (`npm run load-check`, a fake
match with 125 players running, shooting and opening chests):

| | 125 players | 30 players |
|---|---|---|
| Server work per tick (budget 50 ms) | about 11 ms on average, 18 ms for the slowest 5% | about 1 ms |
| Data sent to each player | about 60 KB per second (95%: 84 KB/s) | about 16 KB per second |
| Data sent in total | about 7.4 MB per second (about 26 GB per hour when full) | about 0.5 MB per second |

That was on a fast 4-core computer with nothing else running. When the same computer was very busy with other work,
the 125-player tick went up to 40-57 ms, right at the 50 ms limit (then the game starts to lag). A small hosting plan
has much less CPU (often a part of one shared core), so:

- **Start with the Starter plan.** For a few dozen players at the same time it is plenty.
- If the game gets **laggy when the island is full** (players jump, the logs are slow), pick a plan with **at least
  1 full CPU** in **Settings → Instance Type** (on Render: Standard or bigger). Nothing else needs to change.
- **Bandwidth:** a full island sends a lot of data. Hosting plans include some outgoing data per month and charge for
  more; check the current numbers on the pricing page and look at **Metrics → Bandwidth** after the first busy week.
  (A future job could make this smaller by sending far-away players less often.)
- You can lower the number of players without changing the code: set the environment variable `MAX_PLAYERS`
  (service → **Environment**), for example to `60`, and save (the game restarts).

The island itself is fine for 125: there are 72 chests (about one for every two players; an opened chest comes back
after 2 minutes) and about 950 m² for each player. Spawns stay 25 m apart for the first ~98 players; after that some
players appear closer to others (they have a few seconds of spawn protection).

## 7. Safety, for parents

- **No chat.** Players cannot send each other messages. The only text other players see is their names and the
  knockout list ("Ann knocked out Bob").
- **Name filter.** Names are 3 to 16 letters, numbers or `_`, and swear words and slurs are blocked (also tricky
  spellings), and nobody can copy someone else's name with look-alike letters.
- **Passwords are hashed** (scrypt with a salt): nobody, not even the server owner, can read them.
- **What is stored:** for each account only the name, the hashed password, coins, the things bought or found,
  the outfit, knockouts for the ranking and login tokens. **No email, no real name, no age, no location, no tracking,
  no ads.** The address (IP) of a player is only kept in memory for a short time for the limits below, never saved.
- **Limits against cheating and attacks:** too many wrong passwords (5 for one name, 30 from one address) means
  "Too many tries. Wait a minute." (the wait grows if it goes on); at most 30 new accounts from one address per day;
  at most 20 game connections from one address (a school or a house shares one address, so this is not 1); too many
  messages per second are dropped; big requests are refused.
- **The connection is encrypted** (https and wss, Render does this automatically), and the page sends strict security
  headers (it only loads its own code and three.js from cdn.jsdelivr.net, and cannot be put inside another site).
- **Test helpers are locked.** The test-only helpers (`PVP_TEST_HOOKS`) cannot be switched on online: the server
  refuses to start if someone tries it with `NODE_ENV=production`.

---

## Railway (another host)

Railway (railway.app) can run the game from the `Dockerfile` in the repository.

1. Sign up at railway.app with GitHub. **New Project → Deploy from GitHub repo → pvp**. Railway finds the `Dockerfile`.
2. In the service: **Settings → Networking → Generate Domain** to get a web address.
3. Add a **Volume** (right-click the service or **+ New → Volume**) and set its mount path to **`/data`**.
   The game saves accounts to `/data/accounts.json` (already set in the Dockerfile).
4. In **Variables** add `TRUST_PROXY` = `1` and `RAILWAY_RUN_UID` = `0`
   (Railway volumes belong to the root user; the game runs as a normal user, and this lets it write to the volume).
5. In **Settings → Deploy** set the **Healthcheck Path** to `/healthz`.
6. Pick a paid plan so it stays on (check the current prices on railway.app).
   Updates are automatic when main changes. Logs: the **Deployments** tab → **View Logs**.
   Launch-day reset: open the service's shell (Railway CLI: `railway ssh`) and run
   `cd /app && npm run admin:reset-accounts -- --yes`, then **Restart** the service.
   To stop paying: **Settings → Delete Service** (this deletes the accounts too).

---

## For programmers: settings and files

| Environment variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port for the page, the API and the WebSocket (one address for all). |
| `DATA_FILE` | `apps/game/data/accounts.json` | The accounts file. **Online: on the persistent disk** (`/var/data/accounts.json` on Render, `/data/accounts.json` in Docker). Saved safely (temp file + rename). Daily backups (`accounts.json.backup-<time>`, last `BACKUPS_TO_KEEP`) are kept next to it. |
| `NODE_ENV` | (unset) | `production` online. With `PVP_TEST_HOOKS=1` the server refuses to start. |
| `TRUST_PROXY` | `0` | How many proxies are in front (Render/Railway: `1`). Only then `X-Forwarded-For` / `X-Forwarded-Proto` are believed. If the logs show every player with the same address, try `2`. |
| `MAX_PLAYERS` | `125` (`RULES.MAX_PLAYERS`) | Players in the arena at once; the next one sees "The island is full, try again soon!". |
| `MAX_CONNECTIONS` | `3 × MAX_PLAYERS` | Game connections in total. |
| `MAX_CONNECTIONS_PER_IP` | `20` | Game connections from one address (close code 4029). |
| `MAX_MESSAGES_PER_SECOND` | `60` | Per connection (bursts up to twice that); more are dropped, a flood closes the connection (4008). |
| `MAX_API_PER_SECOND` | `20` | `/api` requests per address (bursts up to 3×), then 429 "Too many tries. Wait a minute." |
| `MAX_SIGNUPS_PER_IP_PER_DAY` | `30` | New accounts from one address in 24 hours. |
| `LOGIN_FREE_TRIES_PER_NAME` / `LOGIN_FREE_TRIES_PER_IP` | `5` / `30` | Wrong passwords before a 1 minute wait (doubling, at most 15 minutes). |
| `MAX_BODY_BYTES` | `10000` | Biggest `/api` request (413). |
| `BACKUPS_TO_KEEP` | `7` | Daily accounts backups kept. |
| `ARENA_SEED` | the time | Seed for the arena's random numbers. |
| `PVP_TEST_HOOKS` | (unset) | `1` only for automatic tests. Never online. |

- `GET /healthz` answers `200 ok`.
- On SIGTERM the server turns away new requests, makes every player in the arena leave alive (their bar things go
  back into their accounts), closes sockets with code 1012, saves the accounts and exits.
- `npm run admin:reset-accounts -- --yes` (`scripts/reset-accounts.mjs`, uses `DATA_FILE`): backup, empty file,
  and a `accounts.json.reset-requested` note that makes the next server start wipe again.
- `npm run load-check` (`scripts/load-check.mjs`, `--players 200 --seconds 20 --json`): the numbers in section 6.
- Files: `render.yaml` (Render Blueprint, native Node runtime, disk at `/var/data`), `Dockerfile` +
  `.dockerignore` (Node 22 slim, `npm ci --omit=dev --workspace=@pvp/game`, runs as user `node`, HEALTHCHECK on `/healthz`).
