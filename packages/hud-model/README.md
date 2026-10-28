# @pvp/hud-model

## What it does

Pure functions that turn the player's inventory (the server's `inv` message) and health into what the in-game HUD shows (the boss's drawing, #24): a big **Durability** bar for the weapon you are holding, the **H.P** bar with its percent, always all weapon slots (empty ones too), which slot a key picks, the small **Shield** pill for the shield on your other arm (#26), the "Your Shootbm broke!" text, and the **Healing Potion button** with its count and drinking progress ring (#28), the **"Charging 1.4s"** text after a shot (#35), the **damage numbers** above heads (#33) and the **coin icon** from the boss's drawing (#29). The game only draws the result. Plain ES module, works in Node and directly in the browser (with an import map for `@pvp/game-rules`).

## How to use

```js
import { slotBar, heldDurabilityView, healthView, pickSlot, brokeMessage, shieldView, WEAPON_ICONS } from '@pvp/hud-model';

const inv = { weapons: ['gun', 'icesword'], dur: [15, 7], slot: 1, shield: { id: 'shield', dur: 45 } }; // from the 'inv' message

slotBar(inv);
// always MAX_SLOTS (5) slots:
// [{ index: 0, key: '1', weapon: 'gun', name: 'Gun', icon: '🔫', rarity: 'common', active: false, empty: false,
//    durability: { usesLeft: 15, max: 15, ratio: 1, percent: 100, level: 'good' } },  // null = never breaks: no bar
//  { index: 1, key: '2', weapon: 'icesword', name: 'Ice Sword', icon: '❄️', rarity: 'epic', active: true, empty: false,
//    durability: { usesLeft: 7, max: 50, ratio: 0.14, percent: 14, level: 'critical' } },
//  { index: 2, key: '3', weapon: null, name: '', icon: '', rarity: null, active: false, empty: true, durability: null }, …]

heldDurabilityView(inv);
// the weapon in your hand (slot 1 = the Ice Sword):
// { weapon: 'icesword', name: 'Ice Sword', ratio: 0.14, percent: 14, level: 'critical', label: '14%', infinite: false, empty: false }
heldDurabilityView({ ...inv, slot: 0 });
// the Gun, full: { weapon: 'gun', name: 'Gun', ratio: 1, percent: 100, level: 'good', label: '100%', infinite: false, empty: false }
// a weapon that never breaks (durability null): full bar, label '∞', infinite: true
// nothing in your hand: { weapon: null, …, ratio: 0, percent: 0, level: null, label: '–', infinite: false, empty: true }

healthView(30);          // { hp: 30, max: 100, ratio: 0.3, percent: 30, low: true, text: '30', label: '30%' }
pickSlot(inv, '0');      // 0  (key 1); '+' / '-' = next / previous; null for an empty or the current slot
brokeMessage('shootbm'); // 'Your Shootbm broke!'
shieldView(inv, true);   // the Shield pill (null without a shield); up = raised right now
// { weapon: 'shield', name: 'Shield', icon: '🛡️', up: true, usesLeft: 45, max: 60, ratio: 0.75, percent: 75, level: 'good', label: '45' }
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

**Charging text and damage numbers** (`src/feedback.js`, #35 and #33): time is passed in too.

```js
import { RULES } from '@pvp/game-rules';
import { chargeView, chargeStarts, damageNumber, damageFloat } from '@pvp/hud-model';

// after you shoot or swing: the held weapon's `rate` (seconds between uses), from the moment of the last shot
chargeView(RULES.WEAPONS.gun, lastFireAt, performance.now());
// 0.6 s after a Gun shot: { visible: true, charging: true, ready: false, progress: 0.3, percent: 30, secondsLeft: 1.4,
//   text: 'Charging 1.4s', hint: '25%' }   hint: a hit now does only CHARGING_DAMAGE (25%) of the damage (#38)

// #38: every weapon (slot) charges on its own. The server's 'inv' has charge = ms left per slot (0 = ready);
// chargeStarts turns it into each slot's lastFireAt (prev: the last result, so "Ready!" still flashes).
let starts = [];
starts = chargeStarts(inv, performance.now(), starts);           // on every 'inv'
chargeView(RULES.WEAPONS[inv.weapons[inv.slot]], starts[inv.slot], performance.now()); // only the HELD weapon
// right when it is ready, for READY_FLASH_MS (0.5 s): { visible: true, ready: true, progress: 1, text: 'Ready!', ... }
// after that, never shot, or no weapon: { visible: false, text: '', ... }

// the server's 'dmg' message -> what floats above that player's head
damageNumber({ t: 'dmg', id: 3, amount: 15 });               // { id: 3, text: '-15', badge: '', kind: 'hit', color: '#ff4d4d' }
damageNumber({ t: 'dmg', id: 3, amount: 1, shock: true });   // text '-1', kind 'shock' (yellow)
damageNumber({ t: 'dmg', id: 3, amount: 40, ko: true });     // text '-40', badge 'KO!', kind 'ko' (gold)
damageNumber({ t: 'dmg', id: 3, amount: 0, blocked: true }); // text 'Blocked', kind 'blocked' (blue)
damageFloat(msSinceItAppeared); // { rise (meters up), opacity, scale, done }: floats up and fades in DAMAGE_NUMBER_MS (2 s)
```

- Durability `ratio` = uses left / the weapon's `durability` in `@pvp/game-rules`. `level` is `'good'` above 50 %, `'low'` from 20 % to 50 %, `'critical'` below 20 % (`DURABILITY_LEVELS`). Weapons with `durability: null` get `durability: null`. A missing `dur` value counts as full.
- `heldDurabilityView` is the big Durability bar: it follows `inv.slot`. The game colors it red, darker red at `'low'` and `'critical'`. The slots themselves have no small bars (the `durability` field is still there, e.g. for the slot's label).
- Health is `low` at or below 35 % (`HEALTH_LOW`).
- Shields are never held: a shield id in `weapons` counts as an empty slot. The shield pill uses the same levels as the Durability bar.
- `slotBar`, `durabilityView` and `heldDurabilityView` take an optional last `rules` argument (default `RULES`), so tests or mods can use other rules.

**Bomb buttons** (`src/bombs.js`, #32): one per bomb in the rules, shown next to the shield pill.

```js
import { bombView, bombIconSvg, BOMB_KEYS } from '@pvp/hud-model';

bombView({ bombs: [{ id: 'bomb', n: 4 }] });
// [{ id: 'bomb', name: 'Bomb', count: 4, max: 5, label: '4', empty: false, full: false, key: 'B', rarity: 'common',
//    color, icon: '<svg…>', title: 'Bomb (B): 3 damage in 2x2 m, up to 7 m away (it hurts you too!) · 4/5' },
//  { id: 'legendarybomb', …, count: 0, empty: true, key: 'N' }]
bombIconSvg('#ffc531');   // the round bomb with a fuse and a spark (the Legendary Bomb is gold)
```

**Coin icon** (`src/coin.js`, #29): the coin from the boss's drawing, used everywhere a coin shows (menu, shop,
buy buttons, the HUD coin pill and the "+3 coins" pop-up). An almost square yellow coin with slightly cut corners,
a darker outline, a "P" on it and three shiny sparkle lines on its top right.

```js
import { COIN_ICON_SVG, coinIconSvg, coinIconDataUrl, coinsToast, COIN_COLORS } from '@pvp/hud-model';

el.innerHTML = COIN_ICON_SVG;                       // 64x64 viewBox; flat colors, no ids: fine to use many times
coinIconSvg({ label: 'PvP', sparkle: false });      // 'P' (default), 'PvP' or '' on it; sparkle lines on/off
document.documentElement.style.setProperty('--coin-icon', `url("${coinIconDataUrl()}")`); // for CSS backgrounds
coinsToast(3);                                      // { amount: 3, text: '+3 coins' }  (1 -> '+1 coin')
```

**Aiming** (`src/aim.js`, #37, #40): only the Shootbm and the DM Gun can aim (their `aim` in `@pvp/game-rules`). Tap the
🎯 AIM button (phone) or right click (computer) to switch aiming on, again to switch it off: the camera zooms in by
`aim.zoom` and comes closer over the shoulder, a round scope ring shows, the crosshair gets smaller and you walk at
`aim.moveMul`. Aiming switches off when the weapon in hand changes (`aimHandKey`), and is paused (no zoom) while
`blocked` (shield up, drinking, frozen). Time is passed in.

```js
import { aimView, aimBlend, aimButtonView, aimHandKey, zoomedFov, AIM_TIME_MS, AIM_CAMERA, AIM_BUTTON } from '@pvp/hud-model';

let amount = 0;                                     // how far the zoom is in, 0..1
const hand = aimHandKey(inv);                       // '1:shootbm' or null: when it changes, switch aiming off
if (hand !== lastHand) { lastHand = hand; input.setToggle('aim', false); }
const state = { on: input.aim, blocked: shieldUp || drinking || frozen }; // `held` works the same as `on`
amount = aimBlend(amount, aimView(weaponId, state).aiming, dtMs); // goes in / out over AIM_TIME_MS (160 ms)
const v = aimView(weaponId, { ...state, blend: amount });
// { canAim (show the AIM button), aiming (send the aim flag), blend, zoom (1 .. aim.zoom), moveMul,
//   cameraDistance, shoulder (camera multipliers, AIM_CAMERA), crosshairScale (1 .. 0.6), scope, scopeOpacity }
camera.fov = zoomedFov(70, v.zoom);                 // 2 = things look twice as big
aimButtonView(input.aim, { paused: !v.aiming });    // { on, paused, icon: '🎯', label: 'AIM' / 'AIM ON', title }
```

## Determinism

Fully deterministic: pure functions of their inputs. No randomness, no clock, no DOM, no I/O.
