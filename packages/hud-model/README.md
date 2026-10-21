# @pvp/hud-model

## What it does

Pure functions that turn the player's inventory (the server's `inv` message) and health into what the in-game HUD shows (the boss's drawing, #24): a big **Durability** bar for the weapon you are holding, the **H.P** bar with its percent, always all weapon slots (empty ones too), which slot a key picks, the "Your Pistol broke!" text, and the **Healing Potion button** with its count and drinking progress ring (#28). The game only draws the result. Plain ES module, works in Node and directly in the browser (with an import map for `@pvp/game-rules`).

## How to use

```js
import { slotBar, heldDurabilityView, healthView, pickSlot, brokeMessage, WEAPON_ICONS } from '@pvp/hud-model';

const inv = { weapons: ['gun', 'pistol'], dur: [15, 9], slot: 1 };         // from the 'inv' message

slotBar(inv);
// always MAX_SLOTS (5) slots:
// [{ index: 0, key: '1', weapon: 'gun', name: 'Gun', icon: '🔫', rarity: 'common', active: false, empty: false,
//    durability: { usesLeft: 15, max: 15, ratio: 1, percent: 100, level: 'good' } },  // null = never breaks: no bar
//  { index: 1, key: '2', weapon: 'pistol', name: 'Pistol', icon: '🔫', rarity: 'common', active: true, empty: false,
//    durability: { usesLeft: 9, max: 60, ratio: 0.15, percent: 15, level: 'critical' } },
//  { index: 2, key: '3', weapon: null, name: '', icon: '', rarity: null, active: false, empty: true, durability: null }, …]

heldDurabilityView(inv);
// the weapon in your hand (slot 1 = the pistol):
// { weapon: 'pistol', name: 'Pistol', ratio: 0.15, percent: 15, level: 'critical', label: '15%', infinite: false, empty: false }
heldDurabilityView({ ...inv, slot: 0 });
// the Gun, full: { weapon: 'gun', name: 'Gun', ratio: 1, percent: 100, level: 'good', label: '100%', infinite: false, empty: false }
// a weapon that never breaks (durability null): full bar, label '∞', infinite: true
// nothing in your hand: { weapon: null, …, ratio: 0, percent: 0, level: null, label: '–', infinite: false, empty: true }

healthView(30);          // { hp: 30, max: 100, ratio: 0.3, percent: 30, low: true, text: '30', label: '30%' }
pickSlot(inv, '0');      // 0  (key 1); '+' / '-' = next / previous; null for an empty or the current slot
brokeMessage('pistol');  // 'Your Pistol broke!'
```

**Healing Potion button** (`src/potion.js`): time is passed in (your own clock, e.g. `performance.now()`).

```js
import { potionView, drinkState, drinkMessage, POTION_ICON_SVG } from '@pvp/hud-model';

let drink = null;                                   // the drinking in progress, from the server's 'drink' messages
drink = drinkState(drink, msg, performance.now());  // 'start' -> { startedAt, ms }, 'done' / 'cancel' -> null
drinkMessage(msg);                                  // '' | 'Full H.P!' | 'Potion wasted!'

potionView({ potions: 2, hp: 40 });
// { count: 2, max: 3, label: '2', empty: false, full: false, canDrink: true, drinking: false,
//   progress: 0, percent: 0, secondsLeft: 0, text: '', title: 'Healing Potion (Q): full H.P in 5 s · 2/3', key: 'Q' }
potionView(inv, { drink, now: performance.now(), hp: myHp, key: 'tap' });
// while drinking: drinking: true, progress 0..1 (fill the ring), secondsLeft 2.5, text 'Drinking… 2.5 s'
button.innerHTML = POTION_ICON_SVG;                 // the flask from the boss's drawing (cork, neck, cone, red liquid)
```

- Durability `ratio` = uses left / the weapon's `durability` in `@pvp/game-rules`. `level` is `'good'` above 50 %, `'low'` from 20 % to 50 %, `'critical'` below 20 % (`DURABILITY_LEVELS`). Weapons with `durability: null` get `durability: null`. A missing `dur` value counts as full.
- `heldDurabilityView` is the big Durability bar: it follows `inv.slot`. The game colors it red, darker red at `'low'` and `'critical'`. The slots themselves have no small bars (the `durability` field is still there, e.g. for the slot's label).
- Health is `low` at or below 35 % (`HEALTH_LOW`).
- `slotBar`, `durabilityView` and `heldDurabilityView` take an optional last `rules` argument (default `RULES`), so tests or mods can use other rules.

## Determinism

Fully deterministic: pure functions of their inputs. No randomness, no clock, no DOM, no I/O.
