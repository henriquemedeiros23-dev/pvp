# @pvp/shop-catalog

## What it does

Pure functions that turn the game rules (`@pvp/game-rules`) and a player's account into what the shop screen shows: the tabs, one card per item with its buy / equip state, and a short backpack text. Plain ES module, works in Node and directly in the browser (with an import map for `@pvp/game-rules`).

## How to use

```js
import { shopTabs, shopItems, backpackSummary, swatchBackground, OUTFIT_ICONS } from '@pvp/shop-catalog';

shopTabs();
// [{ id: 'color', label: 'Colors', hint: '…' }, { id: 'hat', … }, … { id: 'weapon', label: 'Weapons', … }]

shopItems('hat', account);
// [{ kind: 'hat', id: 'none', name: 'No Hat', price: 0, owned: true, equipped: true,
//    canAfford: true, action: 'equipped', icon: '🚫' }, { … id: 'cap', action: 'buy' }, …]

shopItems('weapon', account);
// every weapon (the starting Gun too), sorted by rarity, then price
// [{ kind: 'weapon', id: 'gun', name: 'Gun', price: 3, rarity: 'common', type: 'gun',
//    rarityName: 'Common', rarityColor: '#3cc24a', rarityBackground: '#3cc24a',
//    stashCount: 0, owned: false, equipped: false, canAfford: true, action: 'buy' }, …]
// rarity colors come from RARITY_COLORS in @pvp/game-rules (Megalegend's background is blue + black)

backpackSummary(account);   // 'Backpack: 2× Pistol, 1× Sniper' or 'Backpack is empty. Buy weapons in the shop!'
swatchBackground(card);     // CSS background for a color card (gradients for patterns)
```

- `account` is the server's account: `{ coins, owned: ['color:black', …], skin: { color, hat, … }, stash: { weaponId: count } }`.
- `action` is `'equipped'` (wearing it), `'equip'` (owned, not worn) or `'buy'`. Weapons are always `'buy'`: you can buy more than one.
- Every function takes an optional last `rules` argument (defaults to `RULES` from `@pvp/game-rules`), so tests or mods can use other rules.

## Determinism

Fully deterministic: pure functions of their inputs. No randomness, no clock, no I/O. Skins keep the rules order; weapons are sorted by rarity, then price, then id.
