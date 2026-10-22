import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '@pvp/game-rules';
import { bombView, bombIconSvg, BOMB_KEYS, WEAPON_ICONS } from '../src/index.js';

test('bomb buttons (#32): one per bomb in the rules, count capped at its max, key and title', () => {
  const [bomb, legend] = bombView({ bombs: [{ id: 'bomb', n: 4 }, { id: 'legendarybomb', n: 9 }] });
  assert.deepEqual({ ...bomb, icon: undefined }, {
    id: 'bomb', name: 'Bomb', count: 4, max: 5, label: '4', empty: false, full: false, key: 'B',
    rarity: 'common', color: RULES.BOMBS.bomb.color, icon: undefined,
    title: 'Bomb (B): 3 damage in 2x2 m, up to 7 m away (it hurts you too!) · 4/5',
  });
  assert.equal(legend.count, 3, 'never more than maxCarry');
  assert.equal(legend.full, true);
  assert.equal(legend.key, 'N');
  assert.equal(legend.title, 'Legendary Bomb (N): 10 damage in 5x5 m, up to 15 m away · 3/3');
  assert.match(legend.icon, /^<svg/);
  assert.ok(legend.icon.includes(RULES.BOMBS.legendarybomb.color), 'gold body');
});

test('bomb buttons: missing or bad input means 0', () => {
  for (const inv of [null, {}, { bombs: 'x' }, { bombs: [{ id: 'bomb', n: 'x' }, null, { id: 'rocket', n: 3 }] }]) {
    assert.deepEqual(bombView(inv).map(v => [v.id, v.count, v.empty]), [['bomb', 0, true], ['legendarybomb', 0, true]]);
  }
  assert.deepEqual(bombView({}, { keys: {} }).map(v => v.key), ['', '']);
  assert.equal(bombView({}, {}, { BOMBS: {} }).length, 0);
  assert.deepEqual(BOMB_KEYS, { bomb: 'B', legendarybomb: 'N' });
});

test('the bomb icon: a round body in the bomb\'s color, a fuse and a spark; bad colors fall back to black', () => {
  const svg = bombIconSvg('#ffc531');
  assert.match(svg, /<circle [^>]*fill="#ffc531"/);
  assert.match(svg, /class="spark"/);
  assert.match(bombIconSvg('red;"><script>'), /fill="#1b1b1f"/);
  assert.equal(bombIconSvg(), bombIconSvg('#1b1b1f'));
});

test('icons for the new weapons and the bombs (kill feed)', () => {
  for (const id of ['dmgun', 'supergun', 'bomb', 'legendarybomb']) assert.ok(WEAPON_ICONS[id], id);
  for (const id of Object.keys(RULES.WEAPONS)) assert.ok(WEAPON_ICONS[id], `${id} has an icon`);
});
