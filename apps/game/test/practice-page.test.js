// practice.html is made from index.html by scripts/build-practice.mjs, so the two never drift apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { practicePage, singleFile, THREE_CDN, PRACTICE_TITLE } from '../../../scripts/build-practice.mjs';

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
  assert.match(THREE_CDN, /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/0\.170\.0\/three\.module\.min\.js$/);
});
