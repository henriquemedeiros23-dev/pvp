// @pvp/boot-guard (Node side): where the early page script is and its text, so a build can put it inside a page.
// The browser side is src/boot.js, a classic (non-module) script; see the README.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The file of the early page script. */
export const BOOT_SCRIPT_FILE = fileURLToPath(new URL('./boot.js', import.meta.url));

/** Where a server that serves /packages/<name>/src/ puts it. */
export const BOOT_SCRIPT_URL = '/packages/boot-guard/src/boot.js';

/** The <script> tag a page puts in its <head>, before the import map. */
export const BOOT_SCRIPT_TAG = `<script src="${BOOT_SCRIPT_URL}"></script>`;

/** The message the page shows when its game code could not load. */
export const BOOT_MESSAGE = 'The game could not load. Check your internet and reload the page.';

/** The text of the early page script (to inline it, e.g. in a single-file build). */
export function bootScriptSource() {
  return fs.readFileSync(BOOT_SCRIPT_FILE, 'utf8');
}

/** An inline <script> tag with the early page script (a classic script). */
export function inlineBootScriptTag() {
  return `<script>\n${bootScriptSource().replace(/<\/script/gi, '<\\/script')}</script>`;
}
