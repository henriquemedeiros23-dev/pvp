// Browser check for the 🏆 RANKING screen (issue #47).
// Skipped in a normal `npm test`. Run it with:  npm run test:e2e   (from the repo root)
// Players get knockouts through the test-only 'debugKills' message (the server runs with PVP_TEST_HOOKS=1;
// real knockouts are checked in apps/game/test/ranking.test.js). Then the phone opens RANKING and checks the
// order, the medals and the own highlighted row, also when it is outside the top 50.
// With SCREENSHOTS=1 it also saves docs/screenshots/ranking.png (phone-sized).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { RUN, SKIP, SLOW, startServer, launchBrowser, newPage } from './helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, '..', '..', '..', '..', 'docs', 'screenshots');

let server, browser;
before(async () => {
  if (!RUN) return;
  server = await startServer({ PVP_TEST_HOOKS: '1' });
  browser = await launchBrowser();
});
after(async () => {
  if (browser) await browser.close();
  if (server) await server.stop();
});

async function signup(name) {
  const res = await fetch(`${server.url}/api/signup`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password: 'secret1' }),
  });
  assert.equal(res.status, 200, `signup ${name}`);
  return (await res.json()).token;
}

// Give an account n knockouts (one 'debugKills' message over its own WebSocket), and wait until they count.
async function giveKills(token, n) {
  const ws = new WebSocket(`${server.url.replace('http', 'ws')}/?token=${token}`);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'debugKills', n }));
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`${server.url}/api/ranking`, { method: 'POST', headers: { 'x-token': token }, body: '{}' });
    if ((await res.json()).me?.kills === n) break;
    await new Promise(r => setTimeout(r, 30));
  }
  ws.close();
}

const rows = page => page.$$eval('#rankingList .rank-row', els => els.map(e => ({
  place: e.querySelector('.place').textContent,
  name: e.querySelector('.name').textContent,
  kills: e.querySelector('.kills').textContent,
  me: e.classList.contains('me'),
  below: e.classList.contains('below'),
})));

test('RANKING: top players by knockouts, medals, my row highlighted, my place below the top 50', { skip: SKIP, timeout: 300000 }, async () => {
  // knockouts in this order, so ties (Zip and Ray, 6 each) go to whoever got there first: Zip
  const others = [['Ace', 12], ['Zip', 6], ['Ray', 6], ['Kai', 9], ['Max', 1], ['Neo', 2], ['Newbie', 0]];
  for (const [name, n] of others) {
    const token = await signup(name);
    if (n) await giveKills(token, n);
  }
  const myToken = await signup('Boss_Kid');
  await giveKills(myToken, 4);

  // a phone, standing up
  const { context, page, errors } = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript(t => localStorage.setItem('pvp.token', t), myToken);
  await page.goto(`${server.url}/?debug=1`);
  await page.locator('#menu').waitFor({ state: 'visible', timeout: SLOW });
  await page.locator('#btnRanking').click();
  await page.locator('#ranking').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('#rankingList .rank-row').length > 0);
  assert.deepEqual(await rows(page), [
    { place: '🥇', name: 'Ace', kills: '12 KOs', me: false, below: false },
    { place: '🥈', name: 'Kai', kills: '9 KOs', me: false, below: false },
    { place: '🥉', name: 'Zip', kills: '6 KOs', me: false, below: false },
    { place: '#4', name: 'Ray', kills: '6 KOs', me: false, below: false },
    { place: '#5', name: 'Boss_Kid (you)', kills: '4 KOs', me: true, below: false },
    { place: '#6', name: 'Neo', kills: '2 KOs', me: false, below: false },
    { place: '#7', name: 'Max', kills: '1 KO', me: false, below: false },
  ], 'most knockouts first, Newbie (0) is not listed');
  // the own row really looks different (gold border)
  const border = await page.$eval('#rankingList .rank-row.me', e => getComputedStyle(e).borderColor);
  assert.equal(border, 'rgb(255, 197, 49)');
  // fits the phone: no sideways scrolling
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scroll');
  if (process.env.SCREENSHOTS === '1') {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'ranking.png') });
  }

  // Back to the menu
  await page.locator('#btnRankingBack').click();
  await page.locator('#menu').waitFor({ state: 'visible' });

  // 50 more players with more knockouts than me: the list shows 50, and my place (#55) at the bottom
  for (let i = 0; i < 50; i++) await giveKills(await signup(`Pro_${i}`), 5);
  await page.locator('#btnRanking').click();
  await page.waitForFunction(() => document.querySelectorAll('#rankingList .rank-row').length === 51);
  const list = await rows(page);
  assert.equal(list[0].name, 'Ace');
  assert.equal(list[49].place, '#50');
  assert.ok(list.slice(0, 50).every(r => !r.me), 'I am not in the top 50');
  assert.deepEqual(list[50], { place: '#55', name: 'Boss_Kid (you)', kills: '4 KOs', me: true, below: true });

  assert.deepEqual(errors, []);
  await context.close();
});
