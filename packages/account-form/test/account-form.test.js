import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANYWHERE, decodeWord } from '@pvp/name-filter/words';
import {
  checkLoginForm, checkSignupForm, MIN_PASSWORD, PASSWORDS_DIFFERENT_MESSAGE, MISSING_MESSAGE, PASSWORD_SHORT_MESSAGE,
} from '../src/index.js';

// A rude test name made from the (ROT13) word list, so none is written in this file.
const RUDE = `Big_${decodeWord(ANYWHERE[0])}`;

test('the messages are the kid-friendly ones', () => {
  assert.equal(PASSWORDS_DIFFERENT_MESSAGE, 'The passwords are not the same. Try again.');
  assert.equal(MIN_PASSWORD, 4);
  assert.equal(PASSWORD_SHORT_MESSAGE, 'Your password needs at least 4 characters');
});

test('log in: name and password must be typed; the name is trimmed', () => {
  assert.deepEqual(checkLoginForm({ name: '  Bob ', password: 'pw' }), { ok: true, name: 'Bob', password: 'pw' });
  assert.deepEqual(checkLoginForm({ name: ' ', password: 'secret' }), { ok: false, field: 'name', reason: 'missing', message: MISSING_MESSAGE });
  assert.equal(checkLoginForm({ name: 'Bob', password: '' }).field, 'password');
  assert.equal(checkLoginForm().ok, false);
  // an old name that would not pass today can still log in (the server decides)
  assert.equal(checkLoginForm({ name: RUDE, password: 'secret' }).ok, true);
});

test('create an account: the two passwords must be the same', () => {
  assert.deepEqual(checkSignupForm({ name: 'Stick_Kid', password: 'secret1', repeat: 'secret2' }),
    { ok: false, field: 'repeat', reason: 'passwords-different', message: 'The passwords are not the same. Try again.' });
  assert.equal(checkSignupForm({ name: 'Stick_Kid', password: 'secret1', repeat: '' }).reason, 'passwords-different');
  assert.equal(checkSignupForm({ name: 'Stick_Kid', password: 'secret1', repeat: 'Secret1' }).reason, 'passwords-different');
  assert.deepEqual(checkSignupForm({ name: ' Stick_Kid ', password: 'secret1', repeat: 'secret1' }), { ok: true, name: 'Stick_Kid', password: 'secret1' });
});

test('create an account: bad and wrong names get the name messages first', () => {
  assert.deepEqual(checkSignupForm({ name: RUDE, password: 'secret1', repeat: 'other' }),
    { ok: false, field: 'name', reason: 'bad-word', message: "You can't use that name. Please pick a new name." });
  assert.equal(checkSignupForm({ name: 'ab', password: 'secret1', repeat: 'secret1' }).reason, 'too-short');
  assert.equal(checkSignupForm({ name: 'Bob Smith', password: 'secret1', repeat: 'secret1' }).reason, 'bad-chars');
  assert.equal(checkSignupForm({ name: '', password: 'secret1', repeat: 'secret1' }).reason, 'missing');
  assert.equal(checkSignupForm({ name: 'Classic', password: 'secret1', repeat: 'secret1' }).ok, true);
});

test('create an account: the password needs 4 characters', () => {
  assert.deepEqual(checkSignupForm({ name: 'Stick_Kid', password: 'abc', repeat: 'abc' }),
    { ok: false, field: 'password', reason: 'password-short', message: PASSWORD_SHORT_MESSAGE });
  assert.equal(checkSignupForm({ name: 'Stick_Kid', password: '', repeat: '' }).reason, 'missing');
  assert.equal(checkSignupForm({ name: 'Stick_Kid', password: 'abcd', repeat: 'abcd' }).ok, true);
});

test('pure: same input, same answer', () => {
  const form = { name: 'Bob', password: 'secret', repeat: 'secret' };
  assert.deepEqual(checkSignupForm(form), checkSignupForm(form));
  assert.deepEqual(form, { name: 'Bob', password: 'secret', repeat: 'secret' }); // the input is not changed
});
