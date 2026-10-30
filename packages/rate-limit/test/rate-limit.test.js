import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTokenBucket, createRateLimiter, createConcurrencyLimit, createWindowQuota, createAttemptGuard } from '../src/index.js';

test('token bucket: uses tokens, refills with time', () => {
  const b = createTokenBucket({ capacity: 3, perSecond: 2 }, 0);
  assert.equal(b.take(0), true);
  assert.equal(b.take(0), true);
  assert.equal(b.take(0), true);
  assert.equal(b.take(0), false);
  assert.equal(b.take(400), false); // 0.8 tokens
  assert.equal(b.take(500), true);  // 1 token after 0.5 s
  assert.equal(b.left(10_000), 3);  // never more than capacity
  assert.equal(b.take(10_000, 4), false);
});

test('token bucket: time going backwards does not add tokens', () => {
  const b = createTokenBucket({ capacity: 1, perSecond: 1 }, 1000);
  assert.equal(b.take(1000), true);
  assert.equal(b.take(0), false);
});

test('token bucket: bad options throw', () => {
  assert.throws(() => createTokenBucket({ capacity: 0, perSecond: 1 }), TypeError);
  assert.throws(() => createTokenBucket({ capacity: 1 }), TypeError);
});

test('rate limiter: one bucket per key, forgets full ones', () => {
  const l = createRateLimiter({ capacity: 2, perSecond: 1 });
  assert.equal(l.take('a', 0), true);
  assert.equal(l.take('a', 0), true);
  assert.equal(l.take('a', 0), false);
  assert.equal(l.take('b', 0), true); // another key has its own bucket
  assert.equal(l.size(), 2);
  l.prune(1000);
  assert.equal(l.size(), 2); // not full yet
  l.prune(2000);
  assert.equal(l.size(), 0);
  assert.equal(l.take('a', 2000), true);
});

test('rate limiter: prunes by itself when it holds too many keys', () => {
  const l = createRateLimiter({ capacity: 1, perSecond: 1, maxKeys: 2 });
  l.take('a', 0); l.take('b', 0);
  l.take('c', 5000);
  assert.equal(l.size(), 1);
});

test('concurrency limit: at most max open per key', () => {
  const c = createConcurrencyLimit({ max: 2 });
  assert.equal(c.open('ip'), true);
  assert.equal(c.open('ip'), true);
  assert.equal(c.open('ip'), false);
  assert.equal(c.count('ip'), 2);
  c.close('ip');
  assert.equal(c.open('ip'), true);
  c.close('ip'); c.close('ip'); c.close('ip'); // closing too often does not go below 0
  assert.equal(c.count('ip'), 0);
  assert.equal(c.size(), 0);
});

test('window quota: max per window, then a new window', () => {
  const day = 86_400_000;
  const q = createWindowQuota({ max: 2, windowMs: day });
  assert.equal(q.allowed('ip', 0), true);
  assert.equal(q.add('ip', 0), true);
  assert.equal(q.add('ip', 10), true);
  assert.equal(q.allowed('ip', 20), false);
  assert.equal(q.used('ip', 20), 2);
  assert.equal(q.allowed('other', 20), true);
  assert.equal(q.allowed('ip', day), true); // the window is over
  assert.equal(q.used('ip', day), 0);
  q.add('x', 0);
  q.prune(day);
  assert.equal(q.size(), 0);
});

test('attempt guard: free tries, then a lock that doubles, success resets', () => {
  const g = createAttemptGuard({ freeTries: 3, baseLockMs: 1000, maxLockMs: 3000, windowMs: 60_000 });
  assert.equal(g.fail('ann', 0), 0);
  assert.equal(g.fail('ann', 0), 0);
  assert.equal(g.waitMs('ann', 0), 0);
  assert.equal(g.fail('ann', 0), 1000); // 3rd failure: locked 1 s
  assert.equal(g.waitMs('ann', 500), 500);
  assert.equal(g.waitMs('ann', 1000), 0);
  assert.equal(g.fail('ann', 1000), 2000); // doubles
  assert.equal(g.fail('ann', 3000), 3000); // at most maxLockMs
  assert.equal(g.waitMs('bob', 3000), 0); // other keys are free
  g.reset('ann');
  assert.equal(g.waitMs('ann', 3000), 0);
  assert.equal(g.size(), 0);
});

test('attempt guard: failures are forgotten after the window', () => {
  const g = createAttemptGuard({ freeTries: 2, baseLockMs: 1000, windowMs: 10_000 });
  g.fail('k', 0);
  assert.equal(g.fail('k', 10_000), 0); // the first one is too old
  assert.equal(g.fail('k', 10_001), 1000);
  g.prune(100_000);
  assert.equal(g.size(), 0);
});
