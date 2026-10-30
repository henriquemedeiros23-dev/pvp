#!/usr/bin/env node
// Launch-day reset (#52): wipe ALL accounts so everyone starts equal. Only when the boss asks!
//
//   npm run admin:reset-accounts -- --yes
//
// 1. copies the accounts file to accounts.json.before-reset-<time> (in the same folder, never deleted automatically)
// 2. empties the accounts file
// 3. leaves a note (accounts.json.reset-requested) so the NEXT server start empties it again. That is needed
//    when the game is running: the running server still has everyone in memory and saves them again when it
//    stops. So: run this, then restart the server (on Render: "Restart service"). The new start wipes for good.
//
// The file is DATA_FILE (like the server), or apps/game/data/accounts.json.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetFile } from '@pvp/file-backup';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(ROOT, 'apps', 'game', 'data', 'accounts.json');

if (!process.argv.includes('--yes')) {
  console.error(`This wipes EVERY account in ${file}.
A backup copy is made first. To really do it, run:

  npm run admin:reset-accounts -- --yes
`);
  process.exit(2);
}

const { backup } = resetFile(file, { now: Date.now() });
console.log(`All accounts wiped in ${file}.`);
console.log(backup ? `Backup of the old accounts: ${backup}` : 'There was no accounts file yet, so no backup was needed.');
console.log('If the game server is running now: RESTART it (on Render: "Restart service"). The new start wipes again,');
console.log('in case the old server saved everyone back while it was stopping.');
