// Player accounts, coins, the shop and the weapon backpack (stash).
import crypto from 'node:crypto';
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

const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 32);

const safeCoins = n => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * Create the accounts service.
 * - store: from createMemoryStore() or createJsonFileStore()
 * - rules: @pvp/game-rules (default); pass `{ ...gameRules, MAX_SLOTS: 3 }` to change something
 * - now / randomBytes: injected so tests are deterministic
 */
export function createAccounts({
  store,
  rules = gameRules,
  now = Date.now,
  randomBytes = crypto.randomBytes,
} = {}) {
  if (!store) throw new TypeError('createAccounts needs a store');
  const { BASIC_WEAPON, WEAPONS, MAX_SLOTS, DEFAULT_SKIN, COLORS, OUTFITS, SKIN_SLOTS } = rules;
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
    const token = Buffer.from(randomBytes(24)).toString('hex');
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
    const salt = Buffer.from(randomBytes(16)).toString('hex');
    records[key] = {
      name,
      salt,
      hash: hashPassword(password, salt).toString('hex'),
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
    const want = rec ? Buffer.from(rec.hash, 'hex') : Buffer.alloc(got.length);
    if (!rec || want.length !== got.length || !crypto.timingSafeEqual(got, want)) wrong();
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

  /**
   * Weapons to carry into the arena: the basic weapon first, then the most expensive
   * stashed weapons (one of each kind) until MAX_SLOTS is full. They leave the stash.
   */
  function takeLoadout(account) {
    const a = own(account);
    const weapons = [BASIC_WEAPON];
    const best = Object.keys(a.stash)
      .filter(id => a.stash[id] > 0 && Object.hasOwn(WEAPONS, id) && id !== BASIC_WEAPON)
      .sort((x, y) => WEAPONS[y].price - WEAPONS[x].price || (x < y ? -1 : x > y ? 1 : 0));
    for (const id of best) {
      if (weapons.length >= MAX_SLOTS) break;
      weapons.push(id);
      a.stash[id]--;
      if (!a.stash[id]) delete a.stash[id];
    }
    save();
    return weapons;
  }

  /** Left the arena alive: carried weapons go back into the stash (not the basic weapon). */
  function returnLoadout(account, weapons) {
    const a = own(account);
    for (const id of weapons ?? []) {
      if (id === BASIC_WEAPON || typeof id !== 'string' || !Object.hasOwn(WEAPONS, id)) continue;
      a.stash[id] = (a.stash[id] || 0) + 1;
    }
    save();
    return publicView(a);
  }

  return {
    signup, login, logout, byToken, publicView, addCoins, buy, equip, takeLoadout, returnLoadout,
    /** Write any pending changes now (tests, shutdown). */
    flush: () => store.flush(),
  };
}
