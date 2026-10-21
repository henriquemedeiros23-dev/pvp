# @pvp/hud-model

## What it does

Pure functions that turn the player's inventory (the server's `inv` message) and health into what the in-game HUD shows: always all weapon slots (empty ones too), a durability bar per weapon (green / yellow / red), the health bar, which slot a key picks, and the "Your Pistol broke!" text. The game only draws the result. Plain ES module, works in Node and directly in the browser (with an import map for `@pvp/game-rules`).

## How to use

```js
import { slotBar, healthView, pickSlot, brokeMessage, WEAPON_ICONS } from '@pvp/hud-model';

const inv = { weapons: ['gun', 'pistol'], dur: [15, 9], slot: 1 };         // from the 'inv' message

slotBar(inv);
// always MAX_SLOTS (5) slots:
// [{ index: 0, key: '1', weapon: 'gun', name: 'Gun', icon: '🔫', rarity: 'common', active: false, empty: false,
//    durability: { usesLeft: 15, max: 15, ratio: 1, percent: 100, level: 'good' } },  // null = never breaks: no bar
//  { index: 1, key: '2', weapon: 'pistol', name: 'Pistol', icon: '🔫', rarity: 'common', active: true, empty: false,
//    durability: { usesLeft: 9, max: 60, ratio: 0.15, percent: 15, level: 'critical' } },
//  { index: 2, key: '3', weapon: null, name: '', icon: '', rarity: null, active: false, empty: true, durability: null }, …]

healthView(30);          // { hp: 30, max: 100, ratio: 0.3, percent: 30, low: true, text: '30' }
pickSlot(inv, '0');      // 0  (key 1); '+' / '-' = next / previous; null for an empty or the current slot
brokeMessage('pistol');  // 'Your Pistol broke!'
```

- Durability `ratio` = uses left / the weapon's `durability` in `@pvp/game-rules`. `level` is `'good'` above 50 %, `'low'` from 20 % to 50 %, `'critical'` below 20 % (`DURABILITY_LEVELS`). Weapons with `durability: null` get `durability: null` (no bar). A missing `dur` value counts as full.
- Health is `low` at or below 35 % (`HEALTH_LOW`).
- `slotBar` and `durabilityView` take an optional last `rules` argument (default `RULES`), so tests or mods can use other rules.

## Determinism

Fully deterministic: pure functions of their inputs. No randomness, no clock, no DOM, no I/O.
