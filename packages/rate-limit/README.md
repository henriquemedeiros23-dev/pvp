# @pvp/rate-limit

## What it does

Small limiters for a game server that is online for everyone: a token bucket (how often), many buckets by key
(e.g. per IP address), how many things a key has open at once (connections per IP), a quota per time window
(new accounts per IP per day), and brute-force protection for logins (free tries, then a wait that doubles).
No dependencies, Node and the browser.

## How to use

```js
import { createTokenBucket, createRateLimiter, createConcurrencyLimit, createWindowQuota, createAttemptGuard } from '@pvp/rate-limit';

// one connection: at most 60 messages a second, bursts up to 120
const bucket = createTokenBucket({ capacity: 120, perSecond: 60 }, Date.now());
if (!bucket.take(Date.now())) return; // too fast: drop it

const api = createRateLimiter({ capacity: 60, perSecond: 20 });       // one bucket per key
api.take(ip, now);                                                    // true: go ahead

const conns = createConcurrencyLimit({ max: 20 });
if (!conns.open(ip)) ws.close(4029); else ws.on('close', () => conns.close(ip));

const signups = createWindowQuota({ max: 30, windowMs: 24 * 3600_000 });
if (signups.allowed(ip, now)) { /* make the account */ signups.add(ip, now); }

const logins = createAttemptGuard({ freeTries: 5, baseLockMs: 60_000 });
if (logins.waitMs(name, now) > 0) return 'Too many tries. Wait a minute.';
// wrong password: logins.fail(name, now); right: logins.reset(name)

// every minute or so, forget keys that are not needed any more:
api.prune(now); signups.prune(now); logins.prune(now);
```

In this game `apps/game/server.js` uses all five (limits can be changed with environment variables, see docs/DEPLOY.md).

## Determinism

Fully deterministic: the time (`now`, in ms) is always passed in, there is no random and no timer inside,
so the same calls give the same answers (tests use made-up times).
