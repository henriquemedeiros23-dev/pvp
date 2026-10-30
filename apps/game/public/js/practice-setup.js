// Practice mode, part 1 (runs before main.js): a game server inside the page (@pvp/local-server),
// with bots, so the game needs no network. main.js picks it up from globalThis.pvpInject.
// Page address options: ?seed=abc (same seed, same loot and bots), ?bots=0..5, ?debug.
import { createLocalServer } from '@pvp/local-server';

const params = new URLSearchParams(location.search);
const storage = (() => { try { return window.localStorage; } catch { return undefined; } })();
const bots = Math.max(0, Math.min(5, Number(params.get('bots') ?? 3) || 0));

const server = createLocalServer({ seed: params.get('seed') || String(Date.now()), storage, bots });
const api = server.createApi();
// Like the real game, the Account screen comes first (#46): accounts are saved in this browser only.

globalThis.pvpInject = { api, openSocket: token => server.connect(token) };
globalThis.pvpPractice = { server, api };
