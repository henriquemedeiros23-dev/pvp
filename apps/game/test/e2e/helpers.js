// Shared helpers for the browser tests (not a test file itself).
// - startServer(): the real game server on a free port with a temp DATA_FILE (never the real accounts)
// - launchBrowser(): Chromium from PLAYWRIGHT_BROWSERS_PATH (or /opt/pw-browsers, or CHROMIUM_PATH)
//   with software WebGL (swiftshader)
// - newPage(): a page that records console errors, page crashes and bad HTTP answers
// - signedIn() / openAndLogIn() / logInForm() / signUpForm(): the Account screen (#46)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, '..', '..', 'server.js');

export const RUN = process.env.E2E === '1';
export const SKIP = !RUN && 'set E2E=1 to run (npm run test:e2e)';

// How long a step may take before we call it stuck. Software WebGL draws only ~1-3 frames a second
// (less when the machine is busy), so loading, joining and clicking can be slow but still correct.
// Tests always wait for a condition (never a fixed sleep), so a long limit costs nothing when all is well.
export const SLOW = 60000;

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

// Find a Chromium binary: CHROMIUM_PATH, or the newest chromium-* under PLAYWRIGHT_BROWSERS_PATH.
export function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = path.join(root, d, sub);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { /* none */ }
  return undefined; // let Playwright decide
}

/** Start the game server. env: extra environment (e.g. PVP_TEST_HOOKS, ARENA_SEED). Returns { port, url, stop }. */
export async function startServer(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvp-test-'));
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, ...env, PORT: String(port), DATA_FILE: path.join(dataDir, 'accounts.json') },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 10000);
    child.stdout.on('data', d => { if (String(d).includes('running')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`server exited (${code})`)); });
  });
  child.stdout.resume();
  // stop the server (it saves accounts on SIGTERM), then remove the temp data
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
  return { port, url: `http://127.0.0.1:${port}`, stop };
}

export async function launchBrowser() {
  const { chromium } = await import('playwright');
  return chromium.launch({
    executablePath: chromiumPath(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

/**
 * A new browser context + page that records console errors, page crashes and HTTP answers >= 400
 * into `errors`. With { hooks: true } the game's WebSocket goes through the test, so
 * toServer(text) can send test-only messages (the server must run with PVP_TEST_HOOKS=1),
 * and `received` lists the type of every message the server sent the page.
 */
export async function newPage(browser, contextOptions = { viewport: { width: 1100, height: 700 } }, { hooks = false } = {}) {
  const context = await browser.newContext(contextOptions);
  context.setDefaultTimeout(SLOW);
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  const out = { context, page, errors, received: [], toServer: null };
  if (hooks) {
    await page.routeWebSocket(/\/\?token=/, ws => {
      const server = ws.connectToServer();
      out.toServer = text => server.send(text);
      server.onMessage(m => {
        try { out.received.push(JSON.parse(String(m))); } catch { /* not JSON */ }
        ws.send(m);
      });
    });
  }
  return out;
}

/**
 * Sign up through the API, open the game (?debug) and log in through the Account screen (#46: it always comes
 * first, a saved token does not skip it). Waits for the menu. Returns the name.
 */
export async function signedIn(page, baseUrl, prefix) {
  const name = prefix + Date.now().toString(36).slice(-7);
  const res = await fetch(`${baseUrl}/api/signup`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password: 'secret1' }),
  });
  if (res.status !== 200) throw new Error(`signup failed: ${res.status}`);
  await openAndLogIn(page, baseUrl, name);
  return name;
}

/** Open the game (?debug), log in with the Account screen's "Log in" part and wait for the menu. */
export async function openAndLogIn(page, baseUrl, name, password = 'secret1') {
  await page.goto(`${baseUrl}/?debug=1`);
  await page.locator('#login').waitFor({ state: 'visible', timeout: SLOW });
  await logInForm(page, name, password);
  await page.locator('#menu').waitFor({ state: 'visible', timeout: SLOW });
}

/** Fill the "Log in" part of the Account screen and press Log in. Does not wait for the menu. */
export async function logInForm(page, name, password = 'secret1') {
  await page.fill('#loginName', name);
  await page.fill('#loginPass', password);
  await page.click('#btnLogin');
}

/** Fill the "Create an account" part (password typed twice; `repeat` defaults to the same). Does not wait for the menu. */
export async function signUpForm(page, name, password = 'secret1', repeat = password) {
  await page.fill('#signupName', name);
  await page.fill('#signupPass', password);
  await page.fill('#signupPass2', repeat);
  await page.click('#btnSignup');
}

/** The game's read-only debug view (needs ?debug in the page address). */
export const debug = page => page.evaluate(() => window.pvpDebug());

/** Wait until fn(debugState) is truthy; returns that state. Polls (the game draws only a few frames a second). */
export async function waitDebug(page, fn, { timeout = 30000, what = 'debug condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const s = await debug(page);
    if (fn(s)) return s;
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what}: ${JSON.stringify({ mode: s.mode, me: s.me, others: s.others, nearChest: s.nearChest })}`);
    await page.waitForTimeout(100);
  }
}
