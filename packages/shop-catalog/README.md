# @pvp/shop-catalog

## What it does

Pure functions that turn the game rules (`@pvp/game-rules`) and a player's account into what the shop screen shows (the tabs, one card per item with its buy / equip state) and what the Inventory screen shows (#39): the item spaces, at least 2 of every item, the 5-slot fast bar (hand weapons) and the extras bar (#50: shield, potions, bombs, with a drawing in each empty space). Plain ES module, works in Node and directly in the browser (with an import map for `@pvp/game-rules` and `@pvp/hud-model`, which gives the icons).

## How to use

```js
import { shopTabs, shopItems, inventorySummary, swatchBackground, OUTFIT_ICONS,
  inventoryCards, barSlots, extrasSlots, barSummary } from '@pvp/shop-catalog';

shopTabs();
// [{ id: 'color', label: 'Colors', hint: '…' }, { id: 'hat', … }, … { id: 'weapon', label: 'Weapons', … },
//  { id: 'potion', label: 'Potions', … }, { id: 'bomb', label: 'Bombs', … }]

shopItems('hat', account);
// [{ kind: 'hat', id: 'none', name: 'No Hat', price: 0, owned: true, equipped: true,
//    canAfford: true, action: 'equipped', icon: '🚫' }, { … id: 'cap', action: 'buy' }, …]

shopItems('weapon', account);
// every weapon (the starting Gun too), sorted by rarity, then price
// [{ kind: 'weapon', id: 'gun', name: 'Gun', price: 3, rarity: 'common', type: 'gun',
//    rarityName: 'Common', rarityColor: '#3cc24a', rarityBackground: '#3cc24a',
//    stashCount: 0, owned: false, equipped: false, canAfford: true, action: 'buy' }, …]
// rarity colors come from RARITY_COLORS in @pvp/game-rules (Megalegend's background is blue + black)

shopItems('bomb', account);   // (also bombCards(account)) the Bomb and the Legendary Bomb (#32):
// [{ kind: 'bomb', id: 'bomb', name: 'Bomb', price: 3, pack: 1, rarity: 'common', stashCount: 4 (in the Inventory), action: 'buy',
//    dmg: 3, area: 2, maxThrow: 7, fuseSeconds: 3, hurtsThrower: true, chestChance: 10, maxCarry: 5, … },
//  { … id: 'legendarybomb', price: 60, pack: 3 (a pack of 3), … }]

shopItems('potion', account);
// the Healing Potion card (the only heal): [{ kind: 'potion', id: 'potion', name: 'Healing Potion', price: 10,
//   rarity: 'common', rarityName: 'Common', rarityColor: '#3cc24a', stashCount: 2 (in the Inventory), action: 'buy',
//   healPercent: 100, drinkSeconds: 5, chestChance: 15, maxCarry: 3, … }]   (also potionCard(account))

inventorySummary(account);  // 'Inventory: 2× Shootbm, 1× Supersword, 2× Healing Potion' or 'Inventory is empty. Buy weapons in the shop!'
                            // (backpackSummary is the old name of the same function)

// The Inventory screen (#39): one card per SPACE. Every item kind (weapons in shop order, the Healing Potion,
// the bombs) gets at least MIN_SPACES = 2 spaces, filled or empty "ghost" ones, and more when you own more (no limit).
// A weapon space holds 1 copy, a potion space up to 3, a bomb space up to its maxCarry (like a bar slot).
inventoryCards(account);
// [{ key: 'weapon:shootbm:0', kind: 'weapon', id: 'shootbm', name: 'Shootbm', icon: '🎯', rarity: 'common',
//    rarityName, rarityColor, rarityBackground, isShield: false, filled: true, ghost: false, count: 1, label: '',
//    owned: 1, inBar: 0, durability: { uses: 20, max: 20, percent: 100, label: '20' }, first: true, place: 'bar', action: 'toBar', dur: null },
//  (a worn weapon copy, #51: durability shows its uses left and dur is sent with toBar so that copy moves)
//  (a shield, potion or bomb card: place: 'extras', action: 'toExtras'; inBar counts both bars)
//  { key: 'weapon:shootbm:1', …, filled: false, ghost: true, count: 0, action: null }, …
//  { kind: 'potion', id: 'potion', iconSvg: '<svg…', count: 3, label: '×3', … }]

// The fast bar under it, like the in-game HUD bar: always all 5 slots
barSlots(account);
// [{ index: 0, key: '1', empty: false, kind: 'weapon', id: 'dmgun', name: 'DM Gun', icon: '💥', count: 1, label: '',
//    durability, rarityColor, …, action: 'fromBar' }, { index: 1, key: '2', empty: true, action: null, … }, …]

// The extras bar (#50) under the fast bar: always 4 spaces, an empty one shows a faint drawing of what goes there
extrasSlots(account);
// [{ space: 'shield', key: 'shield', max: 1, hintName: 'Shield', hintIcon: '🛡️', hintColor, empty: true, fill: '', action: null, … },
//  { space: 'potion', max: 3, hintName: 'Healing Potions', hintIconSvg, empty: false, name: 'Healing Potion', count: 2,
//    fill: '2/3', label: '×2', action: 'fromExtras', … }, { space: 'bomb', … }, { space: 'legendarybomb', … }]
barSummary(account);        // 'Fast bar: DM Gun (4 free) · Extras: Mega Shield, 3× Healing Potion' or
                            // 'Fast bar is empty: you get the free Gun. Fill it in your Inventory!'
// helpers: inventoryItemKinds(), spaceSize(kind, id), itemLook(kind, id), inventoryCount(account, kind, id)
swatchBackground(card);     // CSS background for a color card (gradients for patterns)
```

- `account` is the server's account: `{ coins, owned: ['color:black', …], skin: { color, hat, … }, stash: { weaponId: count }, potions, bombs: { bombId: count }, bar: [null | { kind: 'weapon', id, n: 1 }, …], extras: { shield, potion, bomb, legendarybomb } }` (stash, potions and bombs are the Inventory; `bar` is the fast bar, see `@pvp/accounts-shop`).
- `action` is `'equipped'` (wearing it), `'equip'` (owned, not worn) or `'buy'`. Weapons and potions are always `'buy'`: you can buy more than one.
- Every function takes an optional last `rules` argument (defaults to `RULES` from `@pvp/game-rules`), so tests or mods can use other rules.

## Determinism

Fully deterministic: pure functions of their inputs. No randomness, no clock, no I/O. Skins keep the rules order; weapons are sorted by rarity, then price, then id; Inventory spaces keep that order (then the potion, then the bombs).
