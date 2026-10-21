#!/usr/bin/env node
// Builds practice mode (issue #30): the whole game in ONE html file that needs no game server.
//   npm run build:practice   ->  dist/practice/pvp-island.html
//
// 1. apps/game/public/practice.html is made from index.html (so the two never drift apart):
//    same page, but it starts js/practice.js (a game server inside the page, @pvp/local-server).
// 2. esbuild bundles js/practice.js with every @pvp package (three.js stays outside).
// 3. The stylesheet, the icon and the bundle are put inside the html. three.js comes from cdnjs
//    with an exact version, through an import map. No other outside requests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'apps', 'game', 'public');
const OUT_DIR = path.join(ROOT, 'dist', 'practice');
export const OUT_FILE = path.join(OUT_DIR, 'pvp-island.html');
export const THREE_VERSION = '0.170.0'; // must match apps/game/package.json
export const THREE_CDN = `https://cdnjs.cloudflare.com/ajax/libs/three.js/${THREE_VERSION}/three.module.min.js`;
const MAX_BYTES = 5 * 1024 * 1024;
export const PRACTICE_TITLE = 'PvP Island (Practice)'; // the boss named the game PvP Island

// Extra import map entries the practice page needs (served by the game server from packages/).
const PRACTICE_IMPORTS = {
  '@pvp/arena': '/packages/arena/src/index.js',
  '@pvp/accounts-shop/browser': '/packages/accounts-shop/src/browser.js',
  '@pvp/local-server': '/packages/local-server/src/index.js',
};

const replaceOnce = (text, find, by, what) => {
  const i = text.indexOf(find);
  if (i < 0) throw new Error(`build-practice: could not find ${what} in the page`);
  return text.slice(0, i) + by + text.slice(i + find.length);
};

const IMPORT_MAP_RE = /<script type="importmap">([\s\S]*?)<\/script>/;

/** index.html -> practice.html (still uses the game server's files; for trying it on the dev server). */
export function practicePage(indexHtml) {
  let html = indexHtml;
  if (!/<title>[^<]*<\/title>/.test(html)) throw new Error('build-practice: no <title> in index.html');
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${PRACTICE_TITLE}</title>`);
  const m = IMPORT_MAP_RE.exec(html);
  if (!m) throw new Error('build-practice: no import map in index.html');
  const map = JSON.parse(m[1]);
  Object.assign(map.imports, PRACTICE_IMPORTS);
  html = html.replace(IMPORT_MAP_RE, () => `<script type="importmap">\n    ${JSON.stringify(map, null, 2).replace(/\n/g, '\n    ')}\n  </script>`);
  html = replaceOnce(html, '<script type="module" src="/js/main.js"></script>', '<script type="module" src="/js/practice.js"></script>', 'the main.js script tag');
  return '<!-- Made by scripts/build-practice.mjs from index.html: do not edit, run npm run build:practice -->\n' + html;
}

/** Bundle js/practice.js and everything it imports, except three.js itself. */
export async function bundle() {
  const esbuild = await import('esbuild');
  const keepThreeOutside = {
    name: 'three-outside',
    setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: 'three', external: true })); },
  };
  const r = await esbuild.build({
    entryPoints: [path.join(PUBLIC, 'js', 'practice.js')],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    minify: true, legalComments: 'none', write: false, logLevel: 'silent',
    plugins: [keepThreeOutside], // three/addons/... (BufferGeometryUtils) are bundled in
  });
  const js = r.outputFiles[0].text;
  const outside = [...js.matchAll(/(?:\bfrom|\bimport)\s*["']([^"']+)["']/g)].map(x => x[1]).filter(s => s !== 'three');
  if (outside.length) throw new Error(`build-practice: the bundle still imports ${outside.join(', ')}`);
  return js;
}

/** practice.html + bundle -> one self-contained html file. */
export function singleFile(practiceHtml, js, { css, icon }) {
  let html = practiceHtml.replace(/^<!--[^\n]*-->\n/, '');
  html = replaceOnce(html, '<link rel="manifest" href="/manifest.json">\n', '', 'the manifest link');
  html = html.replace(/<link rel="icon" href="\/icon.svg"[^>]*>/, () => `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}" type="image/svg+xml">`);
  html = replaceOnce(html, '<link rel="stylesheet" href="/style.css">', `<style>\n${css}</style>`, 'the stylesheet link');
  const map = { imports: { three: THREE_CDN } };
  html = html.replace(IMPORT_MAP_RE, () => `<script type="importmap">${JSON.stringify(map)}</script>`);
  // "</script" inside the code would end the script tag early.
  const safe = js.replace(/<\/script/gi, '<\\/script');
  html = replaceOnce(html, '<script type="module" src="/js/practice.js"></script>', `<script type="module">\n${safe}</script>`, 'the practice.js script tag');
  return html;
}

async function checkCdn() {
  try {
    const res = await fetch(THREE_CDN, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (!res.ok) console.warn(`WARNING: ${THREE_CDN} answered ${res.status}`);
    else console.log(`three.js on the CDN: ok (${THREE_CDN})`);
  } catch (e) {
    console.warn(`Note: could not reach ${THREE_CDN} from here (${e.cause?.code || e.message}); not checked.`);
  }
}

export async function build({ check = true } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'game', 'package.json'), 'utf8'));
  if (pkg.dependencies.three !== THREE_VERSION) throw new Error(`build-practice: the game uses three ${pkg.dependencies.three}, the build ${THREE_VERSION}`);

  const practice = practicePage(fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8'));
  fs.writeFileSync(path.join(PUBLIC, 'practice.html'), practice);

  const js = await bundle();
  const html = singleFile(practice, js, {
    css: fs.readFileSync(path.join(PUBLIC, 'style.css'), 'utf8'),
    icon: fs.readFileSync(path.join(PUBLIC, 'icon.svg')),
  });
  const bytes = Buffer.byteLength(html);
  if (bytes > MAX_BYTES) throw new Error(`build-practice: ${bytes} bytes is over 5 MB`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html);
  console.log(`Practice page: ${path.relative(ROOT, OUT_FILE)} (${(bytes / 1024).toFixed(0)} KB)`);
  if (check) await checkCdn();
  return { file: OUT_FILE, bytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  build({ check: !process.argv.includes('--no-check') }).catch(e => { console.error(e.message); process.exit(1); });
}
