// practice.html is made from index.html by scripts/build-practice.mjs, so the two never drift apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { practicePage, singleFile, artifactFile, THREE_CDN, PRACTICE_TITLE } from '../../../scripts/build-practice.mjs';
import { BOOT_SCRIPT_TAG, inlineBootScriptTag } from '@pvp/boot-guard';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const read = f => fs.readFileSync(path.join(PUBLIC, f), 'utf8');

test('practice.html is up to date with index.html (if not: npm run build:practice)', () => {
  assert.equal(read('practice.html'), practicePage(read('index.html')), 'run npm run build:practice');
});

test('practice.html starts practice.js and knows the local-server packages', () => {
  const html = read('practice.html');
  assert.ok(html.includes('<script type="module" src="/js/practice.js"></script>'));
  assert.ok(!html.includes('/js/main.js'));
  assert.ok(html.includes(`<title>${PRACTICE_TITLE}</title>`));
  for (const name of ['@pvp/local-server', '@pvp/arena', '@pvp/accounts-shop/browser']) assert.ok(html.includes(`"${name}"`), name);
});

test('the single file inlines everything; only three.js comes from the CDN', () => {
  const html = singleFile(read('practice.html'), 'console.log("</script>");', { css: 'body{}', icon: '<svg/>' });
  assert.ok(html.includes(`{"imports":{"three":"${THREE_CDN}"}}`));
  assert.ok(html.includes('<style>\nbody{}</style>'));
  assert.ok(html.includes('console.log("<\\/script>")'));
  assert.ok(!/(src|href)="\/(?!\/)/.test(html), 'no links to the game server');
  assert.ok(!html.includes('manifest.json'));
  // @pvp/boot-guard (#58): inline, before the import map and the game script
  assert.ok(!html.includes(BOOT_SCRIPT_TAG));
  assert.ok(html.includes(inlineBootScriptTag()));
  assert.ok(html.indexOf(inlineBootScriptTag()) < html.indexOf('<script type="importmap">'));
  assert.match(THREE_CDN, /^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/build\/three\.module\.min\.js$/);
});

test('the artifact version has no doctype/html/head/body of its own and starts with the title', () => {
  const single = singleFile(read('practice.html'), 'console.log(1);', { css: 'body{}', icon: '<svg/>' });
  const frag = artifactFile(single);
  assert.ok(frag.startsWith('<title>PvP Island</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + inlineBootScriptTag() + '\n<script type="importmap">'));
  assert.ok(frag.includes('id="bootError"'), 'the "could not load" box (#58)');
  assert.ok(!/<!doctype|<\/?(html|head|body)[\s>]/i.test(frag)); // (<header> is fine)
  assert.ok(frag.indexOf('<script type="module">') < frag.indexOf('id="menu"'), 'scripts before the markup');
  assert.ok(frag.includes('body { margin: 0; background: #16131f; }'));
  assert.ok(frag.includes('id="hud"') && frag.includes('id="view"'));
  const urls = [...new Set(frag.match(/https?:\/\/[^"'\s)]+/g))];
  assert.deepEqual(urls, [THREE_CDN]);
});

test('index.html loads the boot-guard first and has the "could not load" box (#58)', () => {
  const html = read('index.html');
  assert.ok(html.indexOf(BOOT_SCRIPT_TAG) > 0 && html.indexOf(BOOT_SCRIPT_TAG) < html.indexOf('<script type="importmap">'));
  assert.match(html, /<p id="bootError"[^>]* hidden><\/p>/);
  assert.ok(read('js/main.js').includes('globalThis.pvpBoot?.ready()'));
});

test('no alert/confirm/prompt in the game code (they do not work in the artifact viewer)', () => {
  for (const f of fs.readdirSync(path.join(PUBLIC, 'js'))) {
    assert.ok(!/\b(alert|confirm|prompt)\(/.test(read(path.join('js', f))), f);
  }
});
