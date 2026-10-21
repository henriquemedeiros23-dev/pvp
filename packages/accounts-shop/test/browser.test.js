import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAccounts, createWebStorageStore, createMemoryStore, AccountError } from '../src/browser.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m };
}
const counterBytes = () => { let n = 0; return size => new Uint8Array(size).fill(++n % 256); };
const toyHash = (pw, salt) => Buffer.from(`${salt}:${pw}`).toString('hex');
const make = store => createAccounts({ store, randomBytes: counterBytes(), hashPassword: toyHash, now: () => 1 });

test('the browser entry and its files have no Node imports', () => {
  for (const f of ['browser.js', 'core.js', 'web-stores.js']) {
    const text = fs.readFileSync(path.join(SRC, f), 'utf8');
    assert.ok(!/from 'node:|Buffer\./.test(text), `${f} must work in a browser`);
  }
});

test('core needs randomBytes and hashPassword', () => {
  assert.throws(() => createAccounts({ store: createMemoryStore(), hashPassword: toyHash }), /randomBytes/);
  assert.throws(() => createAccounts({ store: createMemoryStore(), randomBytes: counterBytes() }), /hashPassword/);
});

test('sign up, log in and coins survive in a localStorage-like store', () => {
  const storage = fakeStorage();
  const a = make(createWebStorageStore(storage, 'k'));
  const { account } = a.signup('Stick_Kid', 'pass1');
  a.addCoins(account, 7);
  assert.ok(storage.map.get('k').includes('Stick_Kid'));

  const b = make(createWebStorageStore(storage, 'k'));
  const { account: again } = b.login('stick_kid', 'pass1');
  assert.equal(again.coins, 7);
  assert.throws(() => b.login('Stick_Kid', 'nope'), e => e instanceof AccountError && e.code === 'WRONG_LOGIN');
});

test('a blocked or broken storage falls back to memory', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const a = make(createWebStorageStore(blocked));
  const { token, account } = a.signup('Bob_1', 'pass1');
  a.addCoins(account, 3);
  assert.equal(a.byToken(token).coins, 3);

  const broken = fakeStorage();
  broken.setItem('pvp.accounts', '{not json');
  assert.doesNotThrow(() => make(createWebStorageStore(broken)).signup('Ann_1', 'pass1'));
  assert.doesNotThrow(() => make(createWebStorageStore(undefined)).signup('Ann_2', 'pass1'));
});

test('rename keeps the login and checks the name', () => {
  const a = make(createMemoryStore());
  const { token, account } = a.signup('Player_1', 'pass1');
  a.signup('Taken_1', 'pass1');
  assert.equal(a.rename(account, 'Hero_2').name, 'Hero_2');
  assert.equal(a.byToken(token).name, 'Hero_2');
  assert.equal(a.login('hero_2', 'pass1').account, account);
  assert.throws(() => a.login('Player_1', 'pass1'), /Wrong/);
  assert.throws(() => a.rename(account, 'taken_1'), e => e.code === 'NAME_TAKEN');
  assert.throws(() => a.rename(account, 'x'), e => e.code === 'BAD_NAME');
  assert.equal(a.rename(account, 'HERO_2').name, 'HERO_2'); // same name, other letters: fine
});
