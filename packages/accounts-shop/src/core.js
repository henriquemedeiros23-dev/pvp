// Player accounts, coins, the shop, the Inventory (stash, potions, bombs) and the fast bar (#39).
// Browser-safe core: no Node imports. Hashing and random bytes are passed in
// (accounts.js gives the Node defaults: scrypt and crypto.randomBytes).
import * as gameRules from '@pvp/game-rules';
import { checkName, nameKey, NAME_TAKEN_MESSAGE } from '@pvp/name-filter';
import * as fastBar from './bar.js';

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
  const { WEAPONS, DEFAULT_SKIN, COLORS, OUTFITS, SKIN_SLOTS } = rules;
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
    // Healing Potions in the Inventory (older accounts have none: 0).
    rec.potions = safeCount(rec.potions);
    // Bombs in the Inventory, one count per bomb (older accounts have none: 0 each).
    rec.bombs = bombCounts(rec.bombs);
    // Knockouts for the ranking (#47; older accounts start at 0) and when the last one happened.
    rec.kills = safeCount(rec.kills);
    rec.lastKillAt = Number.isFinite(rec.lastKillAt) && rec.lastKillAt > 0 ? rec.lastKillAt : 0;
    // Weapons that are no longer in the game (e.g. the old wooden sword, or the Pistol and the others removed
    // in #26) are dropped from the Inventory.
    for (const id of Object.keys(rec.stash)) if (!Object.hasOwn(WEAPONS, id)) delete rec.stash[id];
    // The fast bar (#39). Accounts saved before it existed get a bar filled like the old automatic pick
    // (so their first match feels the same); a saved bar is checked (anything that does not fit goes back
    // into the Inventory).
    if (rec.bar === undefined) fastBar.autoFillBar(rec, rules);
    else fastBar.cleanBar(rec, rules);
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
      kills: 0,
      lastKillAt: 0,
      bar: fastBar.emptyBar(rules),
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
      bar: fastBar.copyBar(a.bar),
    };
  }

  /** The account with this name (any case, e.g. an arena player key), or null. */
  function byName(name) {
    const key = typeof name === 'string' ? name.toLowerCase() : '';
    return (key && Object.hasOwn(records, key) && records[key]) || null;
  }

  /**
   * One more knockout for the ranking (#47). `at` is when it happened (ms, default now()):
   * it breaks ties (who reached that count first ranks higher). Returns the new count.
   */
  function addKnockout(account, at = now()) {
    const a = own(account);
    a.kills = safeCount(a.kills) + 1;
    a.lastKillAt = Number.isFinite(at) && at > 0 ? at : 0;
    save();
    return a.kills;
  }

  /** Every account with knockouts, for @pvp/leaderboard's rankPlayers: [{ name, kills, lastKillAt, skinColor }]. */
  function rankingEntries() {
    const out = [];
    for (const a of Object.values(records)) {
      if (a.kills > 0) out.push({ name: a.name, kills: a.kills, lastKillAt: a.lastKillAt, skinColor: a.skin?.color });
    }
    return out;
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

  // Bar errors become AccountErrors (same friendly message and code).
  function barCall(fn) {
    try { return fn(); } catch (e) {
      if (e instanceof fastBar.BarError) fail(e.code, e.message);
      throw e;
    }
  }

  /**
   * Move an item from the Inventory into the fast bar (#39). kind: 'weapon' (shields too), 'potion' or 'bomb'.
   * opts.slot: bar slot 0..4 (default: its stack, else the first empty one); opts.n: how many (default: as many
   * as fit). Must own it; at most one shield; potions up to MAX_POTIONS, bombs up to their maxCarry in a slot.
   * Returns publicView.
   */
  function toBar(account, kind, id, opts = {}) {
    const a = own(account);
    barCall(() => fastBar.putInBar(a, rules, kind, id, opts ?? {}));
    save();
    return publicView(a);
  }

  /** Move everything in a bar slot (0..4) back into the Inventory. Returns publicView. */
  function fromBar(account, slot) {
    const a = own(account);
    barCall(() => fastBar.takeFromBar(a, slot));
    save();
    return publicView(a);
  }

  /**
   * Joining the arena: ONLY the bar's contents come along (they leave the account); the Inventory stays.
   * Returns { loadout, potions, bombs, starter } for arena.join (starter: true when the bar has no hand
   * weapon, then the arena gives the free starting Gun).
   */
  function takeBar(account) {
    const a = own(account);
    const out = fastBar.takeBar(a, rules);
    save();
    return out;
  }

  /**
   * Left the arena alive, or things the arena did not take: { weapons, potions, bombs } go back into the
   * bar slots they came from (if still empty), the rest (chest loot too) into the Inventory. Unknown ids and
   * bad counts are ignored. Knocked out: don't call it, the things are lost. opts.refill = false: all to the Inventory.
   */
  function returnFromArena(account, items, opts) {
    const a = own(account);
    fastBar.returnToAccount(a, rules, items ?? {}, opts ?? {});
    save();
    return publicView(a);
  }

  return {
    signup, login, logout, byToken, publicView, addCoins, buy, equip, rename,
    toBar, fromBar, takeBar, returnFromArena,
    byName, addKnockout, rankingEntries,
    /** Write any pending changes now (tests, shutdown). */
    flush: () => store.flush(),
  };
}
