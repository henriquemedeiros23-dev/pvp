// Browser check for player names (issue #41) with the real server.
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
//
// On a phone screen: a name with a swear word is refused at sign up (with the kid-friendly message), a look-alike
// copy of a name someone has ("B0B" for "Bob") is refused too, and the ✏️ button next to the name changes it:
// a bad name shows the message in red and keeps the panel open (name unchanged), a good name changes it.
// With SCREENSHOTS=1 it also saves docs/screenshots/rename.png (the rename panel with the red message).
// No rude words are written here: the test name comes from @pvp/name-filter's (ROT13) word list.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANYWHERE, decodeWord } from '@pvp/name-filter/words';
import { SKIP, RUN, startServer, launchBrowser, newPage, signUpForm, SLOW } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const BAD = "You can't use that name. Please pick a new name.";
const TAKEN = 'Someone already has that name. Please pick a new name.';
const RUDE = `Big_${decodeWord(ANYWHERE[0])}`;

let server, browser;

before(async () => {
  if (!RUN) return;
  server = await startServer();
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

const signupApi = (name, password = 'secret1') => fetch(`${server.url}/api/signup`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password }),
});

test('names: no swear words, no look-alike copies; the ✏️ button changes the name', { skip: SKIP, timeout: 240000 }, async () => {
  const { context, page, errors } = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const id = Date.now().toString(36).slice(-6);
    const bob = `Bob_${id}`;
    assert.equal((await signupApi(bob)).status, 200); // someone else already has this name

    await page.goto(`${server.url}/?debug=1`);
    await page.locator('#login').waitFor({ state: 'visible', timeout: SLOW });

    // sign up with a swear word: the message, no account
    await signUpForm(page, RUDE);
    await page.waitForFunction(() => document.querySelector('#login .error:not(:empty)'));
    assert.equal(await page.locator('#login .error:not(:empty)').first().textContent(), BAD);
    assert.equal(await page.locator('#menu').isVisible(), false);

    // a look-alike of a name someone has: "Someone already has that name"
    await signUpForm(page, bob.toUpperCase().replace(/O/g, '0'));
    await page.waitForFunction(m => [...document.querySelectorAll('#login .error')].some(e => e.textContent === m), TAKEN);
    assert.equal(await page.locator('#menu').isVisible(), false);

    // a good name works
    const me = `Kid_${id}`;
    await signUpForm(page, me);
    await page.locator('#menu').waitFor({ state: 'visible' });
    assert.equal(await page.textContent('#menuName'), me);

    // ✏️ -> the small panel with the name in it
    await page.click('#btnRename');
    await page.locator('#renamePanel').waitFor({ state: 'visible' });
    assert.equal(await page.inputValue('#renameInput'), me);

    // a bad name: the message in red, the panel stays open, the name is unchanged
    await page.fill('#renameInput', RUDE);
    await page.click('#btnRenameOk');
    await page.waitForFunction(m => document.getElementById('renameError').textContent === m, BAD);
    assert.equal(await page.locator('#renamePanel').isVisible(), true);
    assert.equal(await page.textContent('#menuName'), me);
    const red = await page.$eval('#renameError', e => getComputedStyle(e).color);
    assert.equal(red, 'rgb(255, 77, 94)'); // --bad
    if (process.env.SCREENSHOTS === '1') {
      await page.fill('#renameInput', ''); // the picture is for kids: no rude word in it, only the message
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.waitForTimeout(1000); // let the 3D preview draw a frame
      await page.screenshot({ path: path.join(SHOTS, 'rename.png') });
    }

    // a look-alike of someone else's name: taken, unchanged
    await page.fill('#renameInput', bob.replace(/o/g, '0'));
    await page.press('#renameInput', 'Enter');
    await page.waitForFunction(m => document.getElementById('renameError').textContent === m, TAKEN);
    assert.equal(await page.textContent('#menuName'), me);

    // Cancel closes it; a good name changes it (and the server keeps it)
    await page.click('#btnRenameCancel');
    assert.equal(await page.locator('#renamePanel').isVisible(), false);
    await page.click('#btnRename');
    const fresh = `Hero_${id}`;
    await page.fill('#renameInput', fresh);
    await page.click('#btnRenameOk');
    await page.waitForFunction(n => document.getElementById('menuName').textContent === n, fresh);
    assert.equal(await page.locator('#renamePanel').isVisible(), false);
    // the old name is free again, the new one is taken
    assert.equal((await signupApi(fresh.toLowerCase())).status, 400);

    // only the expected "no" answers from the server
    assert.deepEqual(errors.filter(e => !/^400 \/api\/(signup|rename)$/.test(e)), []);
  } finally {
    await context.close();
  }
});
