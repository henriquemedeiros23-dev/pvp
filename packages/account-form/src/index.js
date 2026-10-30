// @pvp/account-form: checks the Account screen forms (issue #46) before anything is sent to the server.
// "Log in" (name + password) and "Create an account" (name + password + the password again).
// Pure functions, no DOM, no storage: the page reads the inputs and shows `message` next to `field`.
// The server still decides (it checks the name again and whether someone already has it).
import { checkName } from '@pvp/name-filter';

export const MIN_PASSWORD = 4; // same as @pvp/accounts-shop
export const PASSWORDS_DIFFERENT_MESSAGE = 'The passwords are not the same. Try again.';
export const MISSING_MESSAGE = 'Type a name and a password';
export const PASSWORD_SHORT_MESSAGE = `Your password needs at least ${MIN_PASSWORD} characters`;

const no = (field, reason, message) => ({ ok: false, field, reason, message });

/**
 * The "Log in" part. Only checks that something is typed (an old name may not pass today's name rules,
 * and a wrong password is the server's answer).
 * Returns { ok: true, name, password } (name trimmed) or { ok: false, field: 'name'|'password', reason: 'missing', message }.
 */
export function checkLoginForm({ name, password } = {}) {
  const n = String(name ?? '').trim(), p = String(password ?? '');
  if (!n) return no('name', 'missing', MISSING_MESSAGE);
  if (!p) return no('password', 'missing', MISSING_MESSAGE);
  return { ok: true, name: n, password: p };
}

/**
 * The "Create an account" part: name + password + the same password again.
 * Returns { ok: true, name, password } or { ok: false, field, reason, message } where
 * field is 'name' | 'password' | 'repeat' and reason is 'missing', 'password-short', 'passwords-different'
 * or a @pvp/name-filter reason ('bad-word', 'too-short', 'too-long', 'bad-chars').
 * The name is checked first, so a rude name always gets "You can't use that name. Please pick a new name."
 */
export function checkSignupForm({ name, password, repeat } = {}) {
  const p = String(password ?? ''), r = String(repeat ?? '');
  if (!String(name ?? '').trim()) return no('name', 'missing', MISSING_MESSAGE);
  const res = checkName(name);
  if (!res.ok) return no('name', res.reason, res.message);
  if (!p) return no('password', 'missing', MISSING_MESSAGE);
  if (p.length < MIN_PASSWORD) return no('password', 'password-short', PASSWORD_SHORT_MESSAGE);
  if (p !== r) return no('repeat', 'passwords-different', PASSWORDS_DIFFERENT_MESSAGE);
  return { ok: true, name: res.name, password: p };
}
