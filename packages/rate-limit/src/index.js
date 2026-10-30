// Small limiters for a game server: how often, how many at once, how many tries.
// Every function takes the time (`now`, in ms) from the caller, so tests and replays are exact.
// All of them keep their data in a Map per key (an IP address, a name, a connection) and forget
// keys that are not needed any more (prune(now) or automatically while being used).

/**
 * A token bucket: `capacity` tokens, refilled at `perSecond` tokens a second.
 * take(now, n = 1) uses n tokens: true if there were enough, false (nothing used) if not.
 */
export function createTokenBucket({ capacity, perSecond }, now = 0) {
  checkPositive('capacity', capacity);
  checkPositive('perSecond', perSecond);
  let tokens = capacity;
  let last = now;
  const refill = t => {
    if (t > last) { tokens = Math.min(capacity, tokens + ((t - last) / 1000) * perSecond); last = t; }
  };
  return {
    take(t, n = 1) {
      refill(t);
      if (tokens < n) return false;
      tokens -= n;
      return true;
    },
    /** Tokens left right now (a fraction is possible). */
    left(t) { refill(t); return tokens; },
  };
}

/**
 * Many token buckets, one per key (e.g. one per IP address).
 * limiter.take(key, now) -> true when allowed. Full buckets are forgotten (they act like new ones).
 */
export function createRateLimiter({ capacity, perSecond, maxKeys = 100000 }) {
  checkPositive('capacity', capacity);
  checkPositive('perSecond', perSecond);
  const buckets = new Map(); // key -> bucket
  const fullAfterMs = (capacity / perSecond) * 1000;
  const lastUsed = new Map();
  const limiter = {
    take(key, now, n = 1) {
      let b = buckets.get(key);
      if (!b) {
        if (buckets.size >= maxKeys) limiter.prune(now);
        b = createTokenBucket({ capacity, perSecond }, now);
        buckets.set(key, b);
      }
      lastUsed.set(key, now);
      return b.take(now, n);
    },
    /** Forget buckets that are full again (not used for a while). */
    prune(now) {
      for (const [key, t] of lastUsed) {
        if (now - t >= fullAfterMs) { lastUsed.delete(key); buckets.delete(key); }
      }
    },
    size: () => buckets.size,
  };
  return limiter;
}

/**
 * How many things a key has open at the same time (e.g. WebSocket connections per IP).
 * open(key) -> true and counts it, or false (not counted) when the key already has `max`.
 * close(key) gives the place back.
 */
export function createConcurrencyLimit({ max }) {
  checkPositive('max', max);
  const open = new Map();
  return {
    open(key) {
      const n = open.get(key) ?? 0;
      if (n >= max) return false;
      open.set(key, n + 1);
      return true;
    },
    close(key) {
      const n = open.get(key) ?? 0;
      if (n <= 1) open.delete(key); else open.set(key, n - 1);
    },
    count: key => open.get(key) ?? 0,
    size: () => open.size,
  };
}

/**
 * At most `max` things per key in a fixed time window (e.g. 30 new accounts per IP per day).
 * The window starts at the first use and lasts `windowMs`.
 * allowed(key, now) checks without counting; add(key, now) counts one.
 */
export function createWindowQuota({ max, windowMs, maxKeys = 100000 }) {
  checkPositive('max', max);
  checkPositive('windowMs', windowMs);
  const windows = new Map(); // key -> { start, n }
  const current = (key, now) => {
    const w = windows.get(key);
    if (w && now - w.start < windowMs) return w;
    if (w) windows.delete(key);
    return null;
  };
  const quota = {
    allowed: (key, now) => (current(key, now)?.n ?? 0) < max,
    add(key, now) {
      let w = current(key, now);
      if (!w) {
        if (windows.size >= maxKeys) quota.prune(now);
        w = { start: now, n: 0 };
        windows.set(key, w);
      }
      w.n++;
      return w.n <= max;
    },
    used: (key, now) => current(key, now)?.n ?? 0,
    prune(now) { for (const [key, w] of windows) if (now - w.start >= windowMs) windows.delete(key); },
    size: () => windows.size,
  };
  return quota;
}

/**
 * Brute-force protection for logins. Counts failed tries per key (a name, an IP).
 * After `freeTries` failures inside `windowMs`, the key must wait: `baseLockMs` the first time,
 * doubling with every more failure, at most `maxLockMs`. A success (reset) forgets the key.
 *
 *   const guard = createAttemptGuard();
 *   const wait = guard.waitMs(name, now); // > 0: refuse ("Too many tries. Wait a minute.")
 *   ... wrong password: guard.fail(name, now); right: guard.reset(name)
 */
export function createAttemptGuard({ freeTries = 5, windowMs = 15 * 60_000, baseLockMs = 60_000, maxLockMs = 15 * 60_000, maxKeys = 100000 } = {}) {
  checkPositive('freeTries', freeTries);
  const keys = new Map(); // key -> { first, fails, lockedUntil }
  const fresh = (key, now) => {
    const k = keys.get(key);
    if (!k) return null;
    if (now - k.first >= windowMs && now >= k.lockedUntil) { keys.delete(key); return null; }
    return k;
  };
  const guard = {
    /** Ms this key still has to wait (0: it may try). */
    waitMs(key, now) {
      const k = fresh(key, now);
      return k ? Math.max(0, k.lockedUntil - now) : 0;
    },
    /** A failed try. Returns the ms to wait before the next try (0: still free). */
    fail(key, now) {
      let k = fresh(key, now);
      if (!k) {
        if (keys.size >= maxKeys) guard.prune(now);
        k = { first: now, fails: 0, lockedUntil: 0 };
        keys.set(key, k);
      }
      k.fails++;
      const over = k.fails - freeTries;
      if (over >= 0) {
        const lock = Math.min(maxLockMs, baseLockMs * 2 ** Math.min(over, 30));
        k.lockedUntil = now + lock;
        k.first = now; // the window restarts, so the key is remembered at least while it is locked
      }
      return Math.max(0, k.lockedUntil - now);
    },
    /** A success: forget the failures. */
    reset(key) { keys.delete(key); },
    prune(now) { for (const key of [...keys.keys()]) fresh(key, now); },
    size: () => keys.size,
  };
  return guard;
}

function checkPositive(name, v) {
  if (typeof v !== 'number' || !(v > 0)) throw new TypeError(`${name} must be a number above 0`);
}
