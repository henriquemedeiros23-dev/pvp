// Load check (#52): a full island (MAX_PLAYERS = 125) runs and the numbers come out.
// The full numbers: `npm run load-check` (see docs/DEPLOY.md). The tick time is only reported, not checked:
// it depends on how busy the computer running the tests is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '@pvp/game-rules';
import { loadCheck } from '../../../scripts/load-check.mjs';

test('125 players fit on the island; the load check measures tick time and data per player', t => {
  assert.equal(RULES.MAX_PLAYERS, 125);
  const r = loadCheck({ players: RULES.MAX_PLAYERS, seconds: 2 });
  assert.equal(r.stillIn, 125);
  assert.ok(r.tick.avgMs > 0 && Number.isFinite(r.tick.p95Ms));
  assert.ok(r.bytesPerPlayerPerSecond.avg > 0);
  assert.ok(r.island.chests > 0);
  t.diagnostic(`average tick ${r.tick.avgMs.toFixed(1)} ms (budget ${r.tickMs} ms), ${(r.bytesPerPlayerPerSecond.avg / 1024).toFixed(1)} KB/s per player`);
});
