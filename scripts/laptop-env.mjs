// The settings for running the game on the family laptop (#57), as pure functions (tested in
// apps/game/test/serve-script.test.js). Used by `npm run serve` (scripts/serve.mjs) and by
// `npm run admin:reset-laptop` (scripts/reset-accounts.mjs --laptop).
//
// Where the accounts live: a folder in the user's HOME folder, not inside the game folder.
//   Mac:     /Users/<name>/pvp-island-data/accounts.json
//   Windows: C:\Users\<name>\pvp-island-data\accounts.json
// Why home and not next to the code: the accounts survive deleting or downloading the game folder again,
// and `git pull` / `git clean` can never touch them. The daily backups go into the same folder.
import path from 'node:path';

export const LAPTOP_DATA_DIR = 'pvp-island-data';
export const LAPTOP_PORT = '3000';

/** The accounts file on the laptop. home: os.homedir(). platform: 'win32' for Windows paths (default: this computer). */
export function laptopDataFile({ home, platform = process.platform } = {}) {
  if (typeof home !== 'string' || !home) throw new Error('No home folder found: set DATA_FILE to the accounts file.');
  const p = platform === 'win32' ? path.win32 : path.posix;
  return p.join(home, LAPTOP_DATA_DIR, 'accounts.json');
}

/**
 * The environment for `npm run serve`: production mode, port 3000 (or PORT), the accounts in the home
 * folder (or DATA_FILE), and TRUST_PROXY=cloudflare (always: a Cloudflare Tunnel on this laptop).
 * Throws if the test hooks are switched on: they give free coins and must never be used for real players.
 * Returns a new object; `env` is not changed.
 */
export function serveEnv(env = {}, { home, platform = process.platform } = {}) {
  if (env.PVP_TEST_HOOKS !== undefined && env.PVP_TEST_HOOKS !== '') {
    throw new Error('Refusing to start: PVP_TEST_HOOKS is only for automatic tests. Close this window, open a new one and run "npm run serve" again.');
  }
  return {
    ...env,
    NODE_ENV: 'production',
    PORT: env.PORT || LAPTOP_PORT,
    DATA_FILE: env.DATA_FILE || laptopDataFile({ home, platform }),
    TRUST_PROXY: 'cloudflare',
  };
}

/** The friendly text `npm run serve` prints before the game starts (Spanish, for the parent). */
export function serveBanner(env) {
  const p = (env.DATA_FILE.includes('\\') ? path.win32 : path.posix);
  return [
    '',
    '=== PvP Island: servidor en esta laptop ===',
    `Cuentas guardadas en: ${p.dirname(env.DATA_FILE)}`,
    '  (una copia de seguridad cada dia en la misma carpeta)',
    'Para jugar por internet, abre OTRA ventana y escribe:',
    `  cloudflared tunnel --url http://localhost:${env.PORT}`,
    'Para apagar: Ctrl+C (las cuentas se guardan).',
    '',
  ].join('\n');
}
