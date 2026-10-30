import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, safeStorage, ApiError, TOKEN_KEY, LAST_NAME_KEY } from '../src/index.js';

// A fake fetch that records calls and answers from a list of { status, body } (body may be a string = bad JSON).
function fakeFetch(...answers) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    const a = answers.shift();
    if (a instanceof Error) throw a;
    return {
      status: a.status, ok: a.status >= 200 && a.status < 300,
      json: async () => (typeof a.body === 'string' ? JSON.parse(a.body) : a.body),
    };
  };
  fn.calls = calls;
  return fn;
}

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
}

const ACCOUNT = { name: 'Bob', coins: 0, owned: ['color:black'], skin: { color: 'black' }, stash: {} };

test('signup posts name and password, saves the token', async () => {
  const fetch = fakeFetch({ status: 200, body: { token: 'abc', account: ACCOUNT } });
  const storage = memoryStorage();
  const api = createApiClient({ fetch, storage, baseUrl: 'http://x' });
  const res = await api.signup('  Bob ', 'pass');
  assert.deepEqual(res.account, ACCOUNT);
  assert.equal(fetch.calls[0].url, 'http://x/api/signup');
  assert.equal(fetch.calls[0].opts.method, 'POST');
  assert.deepEqual(fetch.calls[0].body, { name: 'Bob', password: 'pass' });
  assert.equal(fetch.calls[0].opts.headers['x-token'], undefined);
  assert.equal(storage.getItem(TOKEN_KEY), 'abc');
  assert.equal(api.token, 'abc');
  assert.equal(api.hasToken(), true);
});

test('login, then me/buy/equip send the token header and the right body', async () => {
  const fetch = fakeFetch(
    { status: 200, body: { token: 't1', account: ACCOUNT } },
    { status: 200, body: { account: ACCOUNT, online: 3 } },
    { status: 200, body: { account: { ...ACCOUNT, coins: 0 } } },
    { status: 200, body: { account: ACCOUNT } },
  );
  const api = createApiClient({ fetch });
  await api.login('Bob', 'pass');
  assert.equal(fetch.calls[0].url, '/api/login');
  const me = await api.me();
  assert.equal(me.online, 3);
  await api.buy('hat', 'cap');
  await api.equip('color', 'black');
  assert.deepEqual(fetch.calls.slice(1).map(c => [c.url, c.opts.headers['x-token'], c.body]), [
    ['/api/me', 't1', {}],
    ['/api/buy', 't1', { kind: 'hat', id: 'cap' }],
    ['/api/equip', 't1', { kind: 'color', id: 'black' }],
  ]);
});

test('rename sends the trimmed name with the token; a refused name keeps the token', async () => {
  const fetch = fakeFetch(
    { status: 400, body: { error: "You can't use that name. Please pick a new name." } },
    { status: 200, body: { account: { ...ACCOUNT, name: 'Hero_7' } } },
  );
  const storage = memoryStorage();
  storage.setItem(TOKEN_KEY, 't9');
  const api = createApiClient({ fetch, storage });
  await assert.rejects(api.rename('bad'), e => e.status === 400 && e.message === "You can't use that name. Please pick a new name.");
  assert.equal(api.token, 't9');
  const res = await api.rename('  Hero_7 ');
  assert.equal(res.account.name, 'Hero_7');
  assert.deepEqual(fetch.calls.map(c => [c.url, c.opts.headers['x-token'], c.body]), [
    ['/api/rename', 't9', { name: 'bad' }],
    ['/api/rename', 't9', { name: 'Hero_7' }],
  ]);
});

test('server errors become ApiError with the server message', async () => {
  const fetch = fakeFetch({ status: 400, body: { error: 'That name is taken' } });
  const api = createApiClient({ fetch });
  await assert.rejects(api.signup('Bob', 'pass'), e => e instanceof ApiError && e.message === 'That name is taken' && e.status === 400);
  assert.equal(api.token, null);
});

test('401 clears the saved token', async () => {
  const storage = memoryStorage();
  storage.setItem(TOKEN_KEY, 'old');
  const fetch = fakeFetch({ status: 401, body: { error: 'Please log in again' } });
  const api = createApiClient({ fetch, storage });
  await assert.rejects(api.me(), e => e.status === 401 && e.message === 'Please log in again');
  assert.equal(storage.getItem(TOKEN_KEY), null);
  assert.equal(api.hasToken(), false);
});

test('calls that need a token fail without calling the server when there is none', async () => {
  const fetch = fakeFetch();
  const api = createApiClient({ fetch });
  await assert.rejects(api.buy('hat', 'cap'), e => e.status === 401);
  assert.equal(fetch.calls.length, 0);
});

test('network failure and strange answers get friendly messages', async () => {
  const fetch = fakeFetch(
    new TypeError('Failed to fetch'),
    { status: 200, body: 'not json{' },
    { status: 500, body: 'oops' },
    { status: 200, body: { account: ACCOUNT } }, // login answer without a token
  );
  const api = createApiClient({ fetch, storage: memoryStorage() });
  api.logout();
  await assert.rejects(api.login('Bob', 'pass'), e => e.status === 0 && /reach the server/.test(e.message));
  await assert.rejects(api.login('Bob', 'pass'), e => /strange answer/.test(e.message));
  await assert.rejects(api.login('Bob', 'pass'), e => e.status === 500 && /server/.test(e.message));
  await assert.rejects(api.login('Bob', 'pass'), e => /strange answer/.test(e.message));
  assert.equal(api.token, null);
});

test('logout forgets the token locally', async () => {
  const storage = memoryStorage();
  const api = createApiClient({ fetch: fakeFetch({ status: 200, body: { token: 'z', account: ACCOUNT } }), storage });
  await api.login('Bob', 'pass');
  api.logout();
  assert.equal(api.token, null);
  assert.equal(storage.getItem(TOKEN_KEY), null);
});

test('lastName: remembers the last name used on this device (not the password), kept after logout', async () => {
  const storage = memoryStorage();
  const fetch = fakeFetch(
    { status: 200, body: { token: 'z', account: ACCOUNT } },
    { status: 400, body: { error: 'Wrong name or password' } },
    { status: 200, body: { token: 'y', account: { ...ACCOUNT, name: 'Hero_7' } } },
    { status: 200, body: { account: { ...ACCOUNT, name: 'Hero_8' } } },
  );
  const api = createApiClient({ fetch, storage });
  assert.equal(api.lastName, '');
  await api.signup('Bob', 'pass');
  assert.equal(api.lastName, 'Bob');
  await assert.rejects(api.login('Other', 'nope'));
  assert.equal(api.lastName, 'Bob'); // a failed log in does not change it
  await api.login('hero_7', 'pass');
  assert.equal(api.lastName, 'Hero_7'); // the account's real spelling
  await api.rename('Hero_8');
  assert.equal(api.lastName, 'Hero_8');
  api.logout();
  assert.equal(api.lastName, 'Hero_8');
  assert.equal(storage.getItem(LAST_NAME_KEY), 'Hero_8');
  assert.ok(![...storage.m.values()].includes('pass'), 'the password is never saved');
});

test('safeStorage survives storage that throws (private mode) by keeping values in memory', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const s = safeStorage(broken);
  assert.equal(s.get('a'), null);
  s.set('a', '1');
  assert.equal(s.get('a'), '1');
  s.remove('a');
  assert.equal(s.get('a'), null);
  const none = safeStorage(undefined);
  none.set('b', '2');
  assert.equal(none.get('b'), '2');
});

test('a client with throwing storage still logs in', async () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  const fetch = fakeFetch({ status: 200, body: { token: 'tt', account: ACCOUNT } }, { status: 200, body: { account: ACCOUNT, online: 0 } });
  const api = createApiClient({ fetch, storage: broken });
  await api.login('Bob', 'pass');
  await api.me();
  assert.equal(fetch.calls[1].opts.headers['x-token'], 'tt');
});

test('the default fetch is the global fetch, called later', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = fakeFetch({ status: 200, body: { token: 'g', account: ACCOUNT } });
  try {
    const api = createApiClient();
    await api.login('Bob', 'pass');
    assert.equal(api.token, 'g');
  } finally {
    globalThis.fetch = saved;
  }
});
