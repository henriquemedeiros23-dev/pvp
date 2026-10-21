// Node defaults for the accounts core: scrypt password hashes and crypto.randomBytes.
import crypto from 'node:crypto';
import { createAccounts as createCore } from './core.js';

export { AccountError } from './core.js';

const scryptHex = (password, salt) => crypto.scryptSync(password, salt, 32).toString('hex');

function timingSafeHex(a, b) {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** Same as the core's createAccounts, with Node's crypto as the defaults. */
export function createAccounts(opts = {}) {
  return createCore({ randomBytes: crypto.randomBytes, hashPassword: scryptHex, sameHash: timingSafeHex, ...opts });
}
