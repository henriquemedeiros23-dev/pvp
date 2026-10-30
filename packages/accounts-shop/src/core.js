// Player accounts, coins, the shop and the weapon backpack (stash).
// Browser-safe core: no Node imports. Hashing and random bytes are passed in
// (accounts.js gives the Node defaults: scrypt and crypto.randomBytes).
import * as gameRules from '@pvp/game-rules';
import { checkName, nameKey, NAME_TAKEN_MESSAGE } from '@pvp/name-filter';

const MIN_PASSWORD = 4;
const CODES = { 'bad-word': 'BAD_WORD', taken: 'NAME_TAKEN' }; // @pvp/name-filter reason -> AccountError code
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
const safeCount = n => (Number.isInteger(n) && n > 0 ? n : 0);

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
  const MAX_POTIONS = Number.isInteger(rules.MAX_POTIONS) ? rules.MAX_POTIONS : 0;
  const itemPrice = rules.itemPrice ?? gameRules.itemPrice;
  // Bombs (#32): { bombId: { pack, maxCarry, ... } } ({} for rules without bombs)
  const BOMBS = rules.BOMBS && typeof rules.BOMBS === 'object' ? rules.BOMBS : {};
  const bombCounts = (value, opts) => gameRules.bombCounts(value, opts, BOMBS);

  // Records keyed by lower-case name. No prototype, so a name like "__proto__" is just a name.
  const records = Object.assign(Object.create(null), store.load());
  const tokens = new Map(); // token -> record
  // Look-alike index (#41): nameKey ("B0b" and "b_o_b" -> "bob") -> lower-case names that have it.
  // Old accounts that already clash all stay in their set and keep working.
  const lookAlikes = new Map();
  const indexName = (name, add) => {
    const k = nameKey(name), key = name.toLowerCase();
    let set = lookAlikes.get(k);
    if (add) { if (!set) lookAlikes.set(k, set = new Set()); set.add(key); }
    else if (set) { set.delete(key); if (!set.size) lookAlikes.delete(k); }
  };

  for (const rec of Object.values(records)) {
    // Older data kept one `token`; now each account keeps a list.
    if (!Array.isArray(rec.tokens)) rec.tokens = rec.token ? [rec.token] : [];
    delete rec.token;
    rec.coins = safeCoins(rec.coins);
    rec.owned ??= freeItems();
    rec.skin ??= { ...DEFAULT_SKIN };
    rec.stash ??= {};
    // Healing Potions in the backpack (older accounts have none: 0).
    rec.potions = safeCount(rec.potions);
    // Bombs in the backpack, one count per bomb (older accounts have none: 0 each).
    rec.bombs = bombCounts(rec.bombs);
    // Weapons that are no longer in the game (e.g. the old wooden sword, or the Pistol and the others removed
    // in #26) are dropped from the backpack.
    for (const id of Object.keys(rec.stash)) if (!Object.hasOwn(WEAPONS, id)) delete rec.stash[id];
    for (const t of rec.tokens) tokens.set(t, rec);
    if (typeof rec.name === 'string') indexName(rec.name, true);
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

  // A new name (sign up, rename): format, no bad words (@pvp/name-filter), and nobody has it or a look-alike of it.
  // `self` is the lower-case name of the account being renamed (its own old name is not in the way).
  function checkNewName(name, self) {
    const isTaken = k => [...(lookAlikes.get(k) ?? [])].some(other => other !== self);
    const res = checkName(name, { isTaken });
    if (!res.ok) fail(CODES[res.reason] ?? 'BAD_NAME', res.message);
    const key = res.name.toLowerCase();
    if (Object.hasOwn(records, key) && key !== self) fail('NAME_TAKEN', NAME_TAKEN_MESSAGE);
    return res.name;
  }

  // Log in: only the format, so an old account whose name would not pass today still logs in.
  function checkCredentials(name, password) {
    const res = checkName(name, { badWords: false });
    password = String(password ?? '');
    if (!res.ok) fail('BAD_NAME', res.message);
    name = res.name;
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
    name = checkNewName(name);
    ({ password } = checkCredentials(name, password));
    const key = name.toLowerCase();
    const salt = toHex(randomBytes(16));
    records[key] = {
      name,
      salt,
      hash: hashPassword(password, salt),
      coins: 0,
      owned: freeItems(),
      skin: { ...DEFAULT_SKIN },
      stash: {},
      potions: 0,
      bombs: bombCounts(null),
      tokens: [],
      createdAt: now(),
    };
    indexName(name, true);
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
      potions: a.potions,
      bombs: { ...a.bombs },
      // An old name that would not be allowed today (#41): the menu asks for a new one. Missing when the name is fine.
      ...(checkName(a.name).ok ? {} : { mustRename: true }),
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
    const stackable = kind === 'weapon' || kind === 'potion' || kind === 'bomb'; // can be bought again and again
    if (!stackable && a.owned.includes(`${kind}:${id}`)) fail('ALREADY_OWNED', 'You already have that');
    if (a.coins < price) fail('NOT_ENOUGH_COINS', 'Not enough coins');
    a.coins = safeCoins(a.coins - price);
    if (kind === 'weapon') a.stash[id] = (a.stash[id] || 0) + 1;
    else if (kind === 'potion') a.potions++;
    else if (kind === 'bomb') a.bombs[id] = (a.bombs[id] || 0) + (BOMBS[id]?.pack || 1); // one pack (Legendary Bomb: 3)
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
   * Change the account's name (same rules as at sign up: no bad words, nobody else has it or a look-alike;
   * the tokens stay logged in). Returns publicView.
   */
  function rename(account, newName) {
    const a = own(account);
    const oldKey = a.name.toLowerCase();
    const name = checkNewName(newName, oldKey);
    const key = name.toLowerCase();
    indexName(a.name, false);
    delete records[oldKey];
    a.name = name;
    records[key] = a;
    indexName(name, true);
    save();
    return publicView(a);
  }

  /**
   * Weapons to carry into the arena from the backpack: the most expensive stashed weapons first,
   * every copy counts (2 Ice Swords take 2 slots), until the slots are full. They leave the stash.
   * The arena gives the free starting weapon itself, so one slot is kept for it (when the rules have one).
   * Shields never take a slot: the best (most expensive) shield in the backpack comes along too, at the
   * end of the list, to be worn on the other arm. Other shields stay in the backpack.
   */
  function takeLoadout(account) {
    const a = own(account);
    const weapons = [];
    const isShield = id => WEAPONS[id].type === 'shield';
    const room = MAX_SLOTS - (STARTING_WEAPON && Object.hasOwn(WEAPONS, STARTING_WEAPON) ? 1 : 0);
    const best = Object.keys(a.stash)
      .filter(id => a.stash[id] > 0 && Object.hasOwn(WEAPONS, id))
      .sort((x, y) => WEAPONS[y].price - WEAPONS[x].price || (x < y ? -1 : x > y ? 1 : 0));
    const take = id => { weapons.push(id); a.stash[id]--; if (!a.stash[id]) delete a.stash[id]; };
    for (const id of best.filter(id => !isShield(id))) {
      while (weapons.length < room && a.stash[id] > 0) take(id);
    }
    const shield = best.find(isShield);
    if (shield) take(shield);
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

  /**
   * Healing Potions to carry into the arena: as many as the backpack has, at most MAX_POTIONS (3).
   * They leave the backpack. Returns how many.
   */
  function takePotions(account) {
    const a = own(account);
    const n = Math.min(a.potions, MAX_POTIONS);
    a.potions -= n;
    save();
    return n;
  }

  /** Left the arena alive (or the arena did not take them): unused potions go back. Bad counts are ignored. */
  function returnPotions(account, n) {
    const a = own(account);
    a.potions += safeCount(n);
    save();
    return publicView(a);
  }

  /**
   * Bombs to carry into the arena (#32): of every bomb, as many as the backpack has, at most its maxCarry
   * (Bomb 5, Legendary Bomb 3). They leave the backpack. Returns { bombId: count }.
   */
  function takeBombs(account) {
    const a = own(account);
    const out = bombCounts(a.bombs, { cap: true });
    for (const id of Object.keys(out)) a.bombs[id] -= out[id];
    save();
    return out;
  }

  /** Left the arena alive (or the arena did not take them): unused bombs go back. Bad counts and ids are ignored. */
  function returnBombs(account, bombs) {
    const a = own(account);
    const back = bombCounts(bombs);
    for (const id of Object.keys(back)) a.bombs[id] = (a.bombs[id] || 0) + back[id];
    save();
    return publicView(a);
  }

  return {
    signup, login, logout, byToken, publicView, addCoins, buy, equip, rename, takeLoadout, returnLoadout,
    takePotions, returnPotions, takeBombs, returnBombs,
    /** Write any pending changes now (tests, shutdown). */
    flush: () => store.flush(),
  };
}
