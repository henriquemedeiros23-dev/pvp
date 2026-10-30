// @pvp/api-client: talks to the game server's account and shop API and keeps the login token.
// Plain ES module with no dependencies: works in Node and directly in the browser.

export const TOKEN_KEY = 'pvp.token';
export const LAST_NAME_KEY = 'pvp.lastName'; // the last name used on this device (#46: pre-filled, never the password)

const FRIENDLY = {
  network: "Can't reach the server. Check your internet and try again.",
  badAnswer: 'The server sent a strange answer. Please try again.',
  login: 'Please log in again',
  server: 'Something went wrong on the server. Please try again.',
};

/** Error thrown by every API call. `status` is the HTTP status (0 when the server could not be reached). */
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Wraps a localStorage-like object so it never throws (private mode, blocked storage).
 * If it can't be used at all, values are kept in memory instead.
 */
export function safeStorage(storage) {
  const memory = new Map();
  return {
    get(key) {
      try { const v = storage?.getItem(key); if (v != null) return v; } catch { /* blocked */ }
      return memory.has(key) ? memory.get(key) : null;
    },
    set(key, value) {
      memory.set(key, value);
      try { storage?.setItem(key, value); } catch { /* blocked */ }
    },
    remove(key) {
      memory.delete(key);
      try { storage?.removeItem(key); } catch { /* blocked */ }
    },
  };
}

/**
 * Creates a client for the server API.
 * @param {object} [options]
 * @param {string} [options.baseUrl] put in front of every path, e.g. 'http://localhost:3000' ('' = same site)
 * @param {Function} [options.fetch] a fetch function (defaults to the global fetch)
 * @param {object} [options.storage] localStorage-like object where the token is kept (optional)
 * @param {string} [options.tokenKey] storage key for the token
 * @param {string} [options.lastNameKey] storage key for the last name used on this device
 */
export function createApiClient({ baseUrl = '', fetch: fetchFn, storage, tokenKey = TOKEN_KEY, lastNameKey = LAST_NAME_KEY } = {}) {
  const store = safeStorage(storage);
  // Call the global fetch through a wrapper so it is never called with the wrong `this`.
  const doFetch = fetchFn || ((...args) => globalThis.fetch(...args));

  async function post(path, body, withToken) {
    const headers = { 'Content-Type': 'application/json' };
    if (withToken) {
      const token = store.get(tokenKey);
      if (!token) throw new ApiError(FRIENDLY.login, 401);
      headers['x-token'] = token;
    }
    let res;
    try {
      res = await doFetch(baseUrl + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    } catch {
      throw new ApiError(FRIENDLY.network, 0);
    }
    let data;
    try { data = await res.json(); } catch { data = null; }
    const status = res.status ?? 0;
    const ok = res.ok ?? (status >= 200 && status < 300);
    if (status === 401) {
      store.remove(tokenKey);
      throw new ApiError((data && data.error) || FRIENDLY.login, 401);
    }
    if (!ok || !data || typeof data !== 'object' || data.error) {
      if (data && typeof data.error === 'string' && data.error) throw new ApiError(data.error, status);
      throw new ApiError(status >= 500 ? FRIENDLY.server : FRIENDLY.badAnswer, status);
    }
    return data;
  }

  async function enter(path, name, password) {
    const data = await post(path, { name: String(name ?? '').trim(), password: String(password ?? '') }, false);
    if (typeof data.token !== 'string' || !data.account) throw new ApiError(FRIENDLY.badAnswer, 200);
    store.set(tokenKey, data.token);
    rememberName(data.account);
    return data;
  }

  function rememberName(account) {
    if (account && typeof account.name === 'string') store.set(lastNameKey, account.name);
  }

  return {
    /** The saved login token, or null. */
    get token() { return store.get(tokenKey); },
    /** True if a token is saved (it may still be expired; me() tells for sure). */
    hasToken() { return !!store.get(tokenKey); },
    /** New account. Resolves { token, account } and saves the token. */
    signup: (name, password) => enter('/api/signup', name, password),
    /** Log in. Resolves { token, account } and saves the token. */
    login: (name, password) => enter('/api/login', name, password),
    /** Resolves { account, online }. */
    me: () => post('/api/me', {}, true),
    /** Buy a skin item or a weapon. kind: 'color'|'hat'|'face'|'back'|'shirt'|'weapon'. Resolves { account }. */
    buy: (kind, id) => post('/api/buy', { kind, id }, true),
    /** Wear a skin item you own. Resolves { account }. */
    equip: (kind, id) => post('/api/equip', { kind, id }, true),
    /** Change your name (#41). The server checks it (no bad words, nobody has it). Resolves { account }. */
    async rename(name) {
      const data = await post('/api/rename', { name: String(name ?? '').trim() }, true);
      rememberName(data.account);
      return data;
    },
    /** The name of the last account that logged in (or signed up, or renamed) on this device, or ''. Kept after logout. */
    get lastName() { return store.get(lastNameKey) || ''; },
    /** Forget the token on this device (no server call). The last name stays. */
    logout() { store.remove(tokenKey); },
  };
}
