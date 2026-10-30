import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankPlayers, compareRank, placeLabel, rankingRows, RANKING_SIZE } from '../src/index.js';

const P = (name, kills, lastKillAt = 0, extra = {}) => ({ name, kills, lastKillAt, ...extra });

test('top by knockouts, most first; 0 knockouts are not listed', () => {
  const r = rankPlayers([P('Ann', 3, 10), P('Bob', 0), P('Cat', 7, 20), P('Dan', 1, 5)]);
  assert.deepEqual(r.top, [
    { place: 1, name: 'Cat', kills: 7 },
    { place: 2, name: 'Ann', kills: 3 },
    { place: 3, name: 'Dan', kills: 1 },
  ]);
  assert.equal(r.me, null);
});

test('ties: whoever reached that count first ranks higher, then by name; input order does not matter', () => {
  const list = [P('Zed', 5, 300), P('amy', 5, 100), P('Bob', 5, 100), P('Cy', 6, 999)];
  const want = ['Cy', 'amy', 'Bob', 'Zed'];
  assert.deepEqual(rankPlayers(list).top.map(r => r.name), want);
  assert.deepEqual(rankPlayers([...list].reverse()).top.map(r => r.name), want);
  assert.ok(compareRank(P('a', 2, 5), P('b', 2, 6)) < 0);
  assert.ok(compareRank(P('a', 1, 5), P('b', 2, 6)) > 0);
  assert.equal(compareRank(P('A', 1, 5), P('a', 1, 5)), 0);
});

test('only the top 50 (or size), and skinColor comes along', () => {
  const many = Array.from({ length: 120 }, (_, i) => P(`P${i}`, i, 1000 - i, { skinColor: 'red' }));
  const r = rankPlayers(many);
  assert.equal(RANKING_SIZE, 50);
  assert.equal(r.top.length, 50);
  assert.deepEqual(r.top[0], { place: 1, name: 'P119', kills: 119, skinColor: 'red' });
  assert.equal(r.top[49].name, 'P70');
  assert.deepEqual(rankPlayers(many, { size: 3 }).top.map(x => x.kills), [119, 118, 117]);
  assert.deepEqual(rankPlayers(many, { size: 0 }).top, []);
});

test('my place: in the top, outside the top, or not ranked with 0 knockouts; name ignores case', () => {
  const many = Array.from({ length: 80 }, (_, i) => P(`P${i}`, i + 1, i));
  assert.deepEqual(rankPlayers(many, { me: 'p79' }).me, { place: 1, name: 'P79', kills: 80 });
  assert.deepEqual(rankPlayers(many, { me: 'P0' }).me, { place: 80, name: 'P0', kills: 1 });
  assert.deepEqual(rankPlayers([...many, P('New', 0)], { me: 'new' }).me, { place: null, name: 'New', kills: 0 });
  assert.equal(rankPlayers(many, { me: 'Nobody' }).me, null);
  // me as a player object: counts even when the list leaves it out (e.g. a list of only players with knockouts)
  assert.deepEqual(rankPlayers(many, { me: { name: 'Zero', kills: 0 } }).me, { place: null, name: 'Zero', kills: 0 });
  assert.deepEqual(rankPlayers(many, { me: { name: 'Mid', kills: 40, lastKillAt: 1 } }).me, { place: 41, name: 'Mid', kills: 40 });
  assert.deepEqual(rankPlayers(many, { me: { name: 'p79', kills: 0 } }).me, { place: 1, name: 'P79', kills: 80 }, 'the list wins');
});

test('bad data is cleaned: missing or broken kills and times count as 0', () => {
  const r = rankPlayers([{ name: 'A', kills: -2 }, { name: 'B', kills: 2.5 }, { name: 'C', kills: 2, lastKillAt: NaN }, null]);
  assert.deepEqual(r.top, [{ place: 1, name: 'C', kills: 2 }]);
  assert.deepEqual(rankPlayers(null), { top: [], me: null });
});

test('works with any iterable and is fast for thousands of players', () => {
  const map = new Map();
  for (let i = 0; i < 20000; i++) map.set(i, P(`P${i}`, (i * 7919) % 500, (i * 104729) % 100000));
  const t0 = performance.now();
  const r = rankPlayers(map.values(), { me: 'P12345' });
  assert.ok(performance.now() - t0 < 500, 'well under half a second');
  const sorted = [...map.values()].filter(p => p.kills > 0).sort(compareRank);
  assert.deepEqual(r.top.map(x => x.name), sorted.slice(0, 50).map(x => x.name));
  assert.equal(r.me.place, sorted.findIndex(p => p.name === 'P12345') + 1);
});

test('placeLabel: medals for the top 3', () => {
  assert.deepEqual([1, 2, 3, 4, 57].map(placeLabel), ['🥇', '🥈', '🥉', '#4', '#57']);
  assert.equal(placeLabel(null), '');
  assert.equal(placeLabel(0), '');
});

test('rankingRows: my row highlighted in the list, or added at the bottom when outside the top', () => {
  const top = [{ place: 1, name: 'Ann', kills: 9 }, { place: 2, name: 'Bob', kills: 4 }];
  const inList = rankingRows({ top, me: { place: 2, name: 'bob', kills: 4 } });
  assert.deepEqual(inList.rows.map(r => [r.label, r.name, r.me]), [['🥇', 'Ann', false], ['🥈', 'Bob', true]]);
  assert.equal(inList.empty, false);
  const outside = rankingRows({ top, me: { place: 77, name: 'Zoe', kills: 1 } });
  assert.deepEqual(outside.rows.at(-1), { place: 77, label: '#77', name: 'Zoe', kills: 1, me: true, below: true });
  const unranked = rankingRows({ top, me: { place: null, name: 'New', kills: 0 } });
  assert.equal(unranked.rows.length, 2);
  assert.deepEqual(rankingRows({ top: [], me: null }), { rows: [], empty: true });
});
