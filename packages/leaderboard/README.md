# @pvp/leaderboard

## What it does

The ranking (#47): the top players by knockouts (most first; the same number: whoever got there first ranks higher),
players with 0 knockouts left out, and anyone's own place even outside the top 50. Also the rows the ranking screen
shows (🥇 🥈 🥉 for the top 3, your own row marked). Pure functions, no dependencies, Node and the browser.

## How to use

```js
import { rankPlayers, rankingRows, placeLabel, compareRank, RANKING_SIZE } from '@pvp/leaderboard';

const players = [
  { name: 'Ann', kills: 7, lastKillAt: 1700000000000, skinColor: 'red' }, // lastKillAt: when the last knockout happened
  { name: 'Bob', kills: 7, lastKillAt: 1700000500000 },                   // same kills, later: Ann ranks higher
  { name: 'Cat', kills: 0 },                                              // not listed
];
const ranking = rankPlayers(players, { me: 'cat' }); // size: RANKING_SIZE (50) by default; me ignores case
// { top: [{ place: 1, name: 'Ann', kills: 7, skinColor: 'red' }, { place: 2, name: 'Bob', kills: 7 }],
//   me: { place: null, name: 'Cat', kills: 0 } }   // place null: no knockouts yet

const { rows, empty } = rankingRows(ranking); // [{ place, label: '🥇', name, kills, me, below? }]
placeLabel(4); // '#4'
```

`rankPlayers` takes any iterable (an array, `map.values()`), goes through it once and keeps only the best `size`,
so thousands of players are fast. In this game `@pvp/accounts-shop` gives the list (`accounts.rankingEntries()`),
the server answers `POST /api/ranking`, and the menu's 🏆 RANKING screen draws `rankingRows`.

## Determinism

Fully deterministic: pure functions of their inputs. Ties are broken by `lastKillAt` (the time is passed in by whoever
counts the knockout) and then by name, so the order never depends on the order of the input.
