// Load check (#52): a full island (MAX_PLAYERS = 125) runs inside the tick budget.
// The full numbers: `npm run load-check` (see docs/DEPLOY.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '@pvp/game-rules';
import { loadCheck } from '../../../scripts/load-check.mjs';

test('125 players fit on the island and a tick stays well inside its 50 ms', () => {
  assert.equal(RULES.MAX_PLAYERS, 125);
  const r = loadCheck({ players: RULES.MAX_PLAYERS, seconds: 2 });
  assert.equal(r.stillIn, 125);
  assert.ok(r.tick.avgMs < r.tickMs, `average tick ${r.tick.avgMs.toFixed(1)} ms`);
  assert.ok(r.bytesPerPlayerPerSecond.avg > 0);
  assert.ok(r.island.chests > 0);
});
