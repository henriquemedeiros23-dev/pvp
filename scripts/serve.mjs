#!/usr/bin/env node
// `npm run serve`: start the game on the family laptop (#57), for Windows and Mac alike.
// Production mode, port 3000, accounts in <home>/pvp-island-data/, ready for a Cloudflare Tunnel
// (see docs/SERVIDOR-LAPTOP.md). `npm start` stays the plain developer start.
import os from 'node:os';
import { serveEnv, serveBanner } from './laptop-env.mjs';

let env;
try {
  env = serveEnv(process.env, { home: os.homedir() });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
Object.assign(process.env, env);
console.log(serveBanner(env));
// The server reads process.env when it loads, prints the Wi-Fi addresses, and saves the accounts on Ctrl+C.
await import('../apps/game/server.js');
