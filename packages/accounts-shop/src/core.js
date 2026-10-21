// Player accounts, coins, the shop and the weapon backpack (stash).
// Browser-safe core: no Node imports. Hashing and random bytes are passed in
// (accounts.js gives the Node defaults: scrypt and crypto.randomBytes).
import * as gameRules from '@pvp/game-rules';

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const MIN_PASSWORD = 4;
const MAX_DEVICES = 2; // a player may stay logged in on this many devices at once

/** An error with a friendly, kid-readable `message` and a stable `code`. */
export class AccountError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AccountError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new AccountError(code, message); };

// Bytes (Uint8Array, Buffer or array of numbers 0-255) as a lower-case hex string.
const toHex = bytes => Array.from(bytes, b => (b & 255).toString(16).padStart(2, '0')).join('');

// Compare two strings without stopping at the first difference.
function sameString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const safeCoins = n => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * Create the accounts service.
 * - store: from createMemoryStore() or createJsonFileStore()
 * - rules: @pvp/game-rules (default); pass `{ ...gameRules, MAX_SLOTS: 3 }` to change something
 * - now / randomBytes: injected so tests are deterministic (randomBytes(n) gives n bytes)
 * - hashPassword(password, saltHex): the password hash as a hex string (Node: scrypt)
 * - sameHash(a, b): compares two hex hashes (Node: crypto.timingSafeEqual)
 */
export function createAccounts({
  store,
  rules = gameRules,
  now = Date.now,
  randomBytes,
  hashPassword,
  sameHash = sameString,
} = {}) {
  if (!store) throw new TypeError('createAccounts needs a store');
  if (typeof randomBytes !== 'function') throw new TypeError('createAccounts needs randomBytes');
  if (typeof hashPassword !== 'function') throw new TypeError('createAccounts needs hashPassword');
  const { STARTING_WEAPON, WEAPONS, MAX_SLOTS, DEFAULT_SKIN, COLORS, OUTFITS, SKIN_SLOTS } = rules;
  const itemPrice = rules.itemPrice ?? gameRules.itemPrice;

  // Records keyed by lower-case name. No prototype, so a name like "__proto__" is just a name.
  const records = Object.assign(Object.create(null), store.load());
  const tokens = new Map(); // token -> record

  for (const rec of Object.values(records)) {
    // Older data kept one `token`; now each account keeps a list.
    if (!Array.isArray(rec.tokens)) rec.tokens = rec.token ? [rec.token] : [];
    delete rec.token;
    rec.coins = safeCoins(rec.coins);
    rec.owned ??= freeItems();
    rec.skin ??= { ...DEFAULT_SKIN };
    rec.stash ??= {};
    // Weapons that are no longer in the game (e.g. the old wooden sword) are dropped from the backpack.
    for (const id of Object.keys(rec.stash)) if (!Object.hasOwn(WEAPONS, id)) delete rec.stash[id];
    for (const t of rec.tokens) tokens.set(t, rec);
  }

  const save = () => store.save(records);

  function freeItems() {
    const owned = [];
    for (const slot of SKIN_SLOTS) {
      const table = slot === 'color' ? COLORS : OUTFITS[slot];
      for (const [id, item] of Object.entries(table)) if (item.price === 0) owned.push(`${slot}:${id}`);
    }
    return owned;
  }

  function own(account) {
    const key = typeof account?.name === 'string' ? account.name.toLowerCase() : undefined;
    if (!key || !Object.hasOwn(records, key) || records[key] !== account) throw new TypeError('Not an account from this service');
    return account;
  }

  function checkCredentials(name, password) {
    name = String(name ?? '').trim();
    password = String(password ?? '');
    if (!NAME_RE.test(name)) fail('BAD_NAME', 'Your name must be 3 to 16 letters, numbers or _');
    if (password.length < MIN_PASSWORD) fail('BAD_PASSWORD', `Your password needs at least ${MIN_PASSWORD} characters`);
    return { name, password };
  }

  function newToken(rec) {
    const token = toHex(randomBytes(24));
    rec.tokens.push(token);
    tokens.set(token, rec);
    while (rec.tokens.length > MAX_DEVICES) tokens.delete(rec.tokens.shift());
    rec.lastLogin = now();
    save();
    return { token, account: rec };
  }

  function signup(name, password) {
    ({ name, password } = checkCredentials(name, password));
    const key = name.toLowerCase();
    if (Object.hasOwn(records, key)) fail('NAME_TAKEN', 'That name is taken');
    const salt = toHex(randomBytes(16));
    records[key] = {
      name,
      salt,
      hash: hashPassword(password, salt),
      coins: 0,
      owned: freeItems(),
      skin: { ...DEFAULT_SKIN },
      stash: {},
      tokens: [],
      createdAt: now(),
    };
    return newToken(records[key]);
  }

  function login(name, password) {
    const wrong = () => fail('WRONG_LOGIN', 'Wrong name or password');
    let creds;
    try { creds = checkCredentials(name, password); } catch { wrong(); }
    const key = creds.name.toLowerCase();
    const rec = Object.hasOwn(records, key) ? records[key] : undefined;
    // Hash even for unknown names so both cases take about the same time.
    const salt = rec ? rec.salt : '0000000000000000';
    const got = hashPassword(creds.password, salt);
    const want = rec ? rec.hash : '0'.repeat(got.length);
    if (!rec || !sameHash(got, want)) wrong();
    return newToken(rec);
  }

  /** Log out one device. Returns true if the token was logged in. */
  function logout(token) {
    const rec = typeof token === 'string' ? tokens.get(token) : undefined;
    if (!rec) return false;
    tokens.delete(token);
    rec.tokens = rec.tokens.filter(t => t !== token);
    save();
    return true;
  }

  function byToken(token) {
    return (typeof token === 'string' && tokens.get(token)) || null;
  }

  /** Safe to send to the player: no password hash, salt or tokens. */
  function publicView(account) {
    const a = own(account);
    return {
      name: a.name,
      coins: a.coins,
      owned: [...a.owned],
      skin: { ...a.skin },
      stash: { ...a.stash },
    };
  }

  /** Add (or with a negative n, take away) coins. Never goes below 0. Returns the new total. */
  function addCoins(account, n) {
    const a = own(account);
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new TypeError('addCoins needs a finite number');
    a.coins = safeCoins(a.coins + Math.trunc(n));
    save();
    return a.coins;
  }

  function buy(account, kind, id) {
    const a = own(account);
    const price = typeof kind === 'string' && typeof id === 'string' ? itemPrice(kind, id) : undefined;
    if (price === undefined) fail('UNKNOWN_ITEM', 'That item is not in the shop');
    if (kind !== 'weapon' && a.owned.includes(`${kind}:${id}`)) fail('ALREADY_OWNED', 'You already have that');
    if (a.coins < price) fail('NOT_ENOUGH_COINS', 'Not enough coins');
    a.coins = safeCoins(a.coins - price);
    if (kind === 'weapon') a.stash[id] = (a.stash[id] || 0) + 1;
    else a.owned.push(`${kind}:${id}`);
    save();
    return publicView(a);
  }

  function equip(account, kind, id) {
    const a = own(account);
    if (!SKIN_SLOTS.includes(kind)) fail('UNKNOWN_ITEM', 'That item is not in the shop');
    if (!a.owned.includes(`${kind}:${id}`)) fail('NOT_OWNED', 'Buy it first');
    a.skin[kind] = id;
    save();
    return publicView(a);
  }

  /** Change the account's name (same rules as at sign up; the tokens stay logged in). Returns publicView. */
  function rename(account, newName) {
    const a = own(account);
    const name = String(newName ?? '').trim();
    if (!NAME_RE.test(name)) fail('BAD_NAME', 'Your name must be 3 to 16 letters, numbers or _');
    const oldKey = a.name.toLowerCase(), key = name.toLowerCase();
    if (key !== oldKey && Object.hasOwn(records, key)) fail('NAME_TAKEN', 'That name is taken');
    delete records[oldKey];
    a.name = name;
    records[key] = a;
    save();
    return publicView(a);
  }

  /**
   * Weapons to carry into the arena from the backpack: the most expensive stashed weapons first,
   * every copy counts (2 Shotguns take 2 slots), until the slots are full. They leave the stash.
   * The arena gives the free starting weapon itself, so one slot is kept for it (when the rules have one).
   */
  function takeLoadout(account) {
    const a = own(account);
    const weapons = [];
    const room = MAX_SLOTS - (STARTING_WEAPON && Object.hasOwn(WEAPONS, STARTING_WEAPON) ? 1 : 0);
    const best = Object.keys(a.stash)
      .filter(id => a.stash[id] > 0 && Object.hasOwn(WEAPONS, id))
      .sort((x, y) => WEAPONS[y].price - WEAPONS[x].price || (x < y ? -1 : x > y ? 1 : 0));
    for (const id of best) {
      while (weapons.length < room && a.stash[id] > 0) {
        weapons.push(id);
        a.stash[id]--;
      }
      if (!a.stash[id]) delete a.stash[id];
    }
    save();
    return weapons;
  }

  /** Left the arena alive (or the arena did not take them): weapons go back into the stash. Unknown ids are ignored. */
  function returnLoadout(account, weapons) {
    const a = own(account);
    for (const id of weapons ?? []) {
      if (typeof id !== 'string' || !Object.hasOwn(WEAPONS, id)) continue;
      a.stash[id] = (a.stash[id] || 0) + 1;
    }
    save();
    return publicView(a);
  }

  return {
    signup, login, logout, byToken, publicView, addCoins, buy, equip, rename, takeLoadout, returnLoadout,
    /** Write any pending changes now (tests, shutdown). */
    flush: () => store.flush(),
  };
}
