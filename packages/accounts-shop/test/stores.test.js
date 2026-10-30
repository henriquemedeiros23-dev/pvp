import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAccounts, createJsonFileStore, createMemoryStore } from '../src/index.js';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvp-accounts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('memory store keeps a copy on save', () => {
  const store = createMemoryStore({ a: { n: 1 } });
  const data = store.load();
  data.a.n = 2;
  assert.equal(store.load().a.n, 1);
  store.save(data);
  data.a.n = 3;
  assert.equal(store.load().a.n, 2);
});

test('json file store: missing file loads empty', t => {
  const store = createJsonFileStore(path.join(tempDir(t), 'nope', 'accounts.json'));
  assert.deepEqual(store.load(), {});
});

test('json file store: writes are delayed, flush writes now, no temp file left', async t => {
  const file = path.join(tempDir(t), 'data', 'accounts.json');
  const store = createJsonFileStore(file, { saveDelayMs: 60_000 });
  const data = { bob: { coins: 1 } };
  store.save(data);
  assert.equal(fs.existsSync(file), false);
  data.bob.coins = 5; // the latest data is what gets written
  await store.flush();
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { bob: { coins: 5 } });
  assert.equal(fs.existsSync(file + '.tmp'), false);
  await store.flush(); // nothing pending: fine
});

test('json file store: the delayed write happens on its own', async t => {
  const file = path.join(tempDir(t), 'accounts.json');
  const store = createJsonFileStore(file, { saveDelayMs: 5 });
  store.save({ a: 1 });
  store.save({ a: 2 });
  await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { a: 2 });
});

test('json file store: a broken file is an error, not a silent reset', t => {
  const file = path.join(tempDir(t), 'accounts.json');
  fs.writeFileSync(file, '{ broken');
  assert.throws(() => createJsonFileStore(file).load(), SyntaxError);
});

test('accounts survive a reload from disk', async t => {
  const file = path.join(tempDir(t), 'accounts.json');
  const accounts = createAccounts({ store: createJsonFileStore(file, { saveDelayMs: 60_000 }) });
  const { token, account } = accounts.signup('Bob', 'pass');
  accounts.addCoins(account, 300);
  accounts.buy(account, 'hat', 'cap');
  accounts.buy(account, 'weapon', 'electricsword');
  accounts.buy(account, 'potion', 'potion');
  accounts.equip(account, 'hat', 'cap');
  accounts.toBar(account, 'weapon', 'electricsword', { slot: 2 }); // the fast bar is saved too (#39)
  await accounts.flush();

  const again = createAccounts({ store: createJsonFileStore(file) });
  const back = again.byToken(token);
  assert.ok(back);
  assert.deepEqual(again.publicView(back), {
    name: 'Bob', coins: 300 - 100 - 30 - 10,
    owned: ['color:black', 'hat:none', 'face:none', 'back:none', 'shirt:none', 'hat:cap'],
    skin: { color: 'black', hat: 'cap', face: 'none', back: 'none', shirt: 'none' },
    stash: {},
    potions: 1,
    bombs: { bomb: 0, legendarybomb: 0 },
    bar: [null, null, { kind: 'weapon', id: 'electricsword', n: 1 }, null, null],
  });
  assert.equal(again.login('BOB', 'pass').account, back);
});
