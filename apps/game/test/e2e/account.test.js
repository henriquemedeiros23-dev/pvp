// Browser check for the Account screen (issue #46) with the real server.
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
//
// On a phone: the Account screen always comes first (also after a reload with a saved login), "Create an account"
// needs the password twice (different -> red message, no account; same -> the menu), Log out goes back to the
// Account screen with an empty password, and logging in again brings the menu with the coins kept.
// It also fits a phone in landscape. With SCREENSHOTS=1 it saves docs/screenshots/login.png (phone portrait).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { SKIP, RUN, startServer, launchBrowser, newPage, signUpForm, logInForm, SLOW } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');
const DIFFERENT = 'The passwords are not the same. Try again.';

let server, browser;

before(async () => {
  if (!RUN) return;
  server = await startServer({ PVP_TEST_HOOKS: '1' });
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.stop();
});

const api = async (url, body, token) => {
  const res = await fetch(`${server.url}${url}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-token': token } : {}) }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

// Give an account coins with the test-only 'debugCoins' message (the server runs with PVP_TEST_HOOKS=1).
async function giveCoins(token, n) {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/?token=${encodeURIComponent(token)}`);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'debugCoins', n }));
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 30));
    if ((await api('/api/me', {}, token)).body.account.coins >= n) break;
  }
  ws.close();
}

test('Account screen: always first, password twice, log out and log in again with the coins kept', { skip: SKIP, timeout: 240000 }, async () => {
  const { context, page, errors } = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${server.url}/?debug=1`);
    await page.locator('#login').waitFor({ state: 'visible', timeout: SLOW });
    // both parts are there
    for (const id of ['loginName', 'loginPass', 'btnLogin', 'signupName', 'signupPass', 'signupPass2', 'btnSignup']) {
      assert.equal(await page.locator(`#${id}`).isVisible(), true, id);
    }
    if (process.env.SCREENSHOTS === '1') {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, 'login.png') });
    }

    // the two passwords are different: the red message, no account
    const name = 'acc_' + Date.now().toString(36).slice(-7);
    await signUpForm(page, name, 'secret1', 'secret2');
    await page.waitForFunction(m => document.getElementById('signupError').textContent === m, DIFFERENT);
    assert.equal(await page.$eval('#signupError', e => getComputedStyle(e).color), 'rgb(255, 77, 94)'); // --bad
    assert.equal(await page.locator('#menu').isVisible(), false);
    assert.equal((await api('/api/login', { name, password: 'secret1' })).status, 400, 'no account was made');

    // the same password twice: the menu
    await signUpForm(page, name, 'secret1', 'secret1');
    await page.locator('#menu').waitFor({ state: 'visible' });
    assert.equal(await page.textContent('#menuName'), name);
    assert.equal(await page.textContent('#menuCoins'), '0');

    // reload: the Account screen again, even with a saved login; the name is filled in, never the password
    await page.reload();
    await page.locator('#login').waitFor({ state: 'visible', timeout: SLOW });
    assert.equal(await page.locator('#menu').isVisible(), false);
    assert.equal(await page.inputValue('#loginName'), name);
    assert.equal(await page.inputValue('#loginPass'), '');

    // a wrong password: no menu
    await logInForm(page, name, 'wrong1');
    await page.waitForFunction(() => document.getElementById('loginError').textContent === 'Wrong name or password');

    // the right one: the menu. Then this account gets 7 coins.
    await logInForm(page, name, 'secret1');
    await page.locator('#menu').waitFor({ state: 'visible' });
    const token = await page.evaluate(() => localStorage.getItem('pvp.token'));
    await giveCoins(token, 7);

    // Log out: the Account screen with an empty password
    await page.click('#btnLogout');
    await page.locator('#login').waitFor({ state: 'visible' });
    assert.equal(await page.inputValue('#loginPass'), '');
    assert.equal(await page.inputValue('#signupPass'), '');
    assert.equal(await page.inputValue('#signupPass2'), '');

    // log in again: the menu, with the coins kept
    await logInForm(page, name, 'secret1');
    await page.locator('#menu').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.getElementById('menuCoins').textContent === '7');
    assert.equal(await page.textContent('#menuName'), name);

    assert.deepEqual(errors.filter(e => e !== '400 /api/login'), [], 'only the wrong-password answer');
  } finally {
    await context.close();
  }
});

test('Account screen fits a phone in landscape (both parts, no scrolling needed to reach the buttons)', { skip: SKIP, timeout: 120000 }, async () => {
  const { context, page, errors } = await newPage(browser, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(`${server.url}/`);
    await page.locator('#login').waitFor({ state: 'visible', timeout: SLOW });
    for (const id of ['btnLogin', 'btnSignup']) {
      const box = await page.locator(`#${id}`).boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= 390 && box.x >= 0 && box.x + box.width <= 844, `${id} is on the screen: ${JSON.stringify(box)}`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
