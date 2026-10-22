# @pvp/game-rules

## What it does

All the game's rules (limits, movement, weapons, the Healing Potion, loot, skin colors and outfits, prices) as deep-frozen plain data, plus small pure helpers and `validateRules()` which lists any problems in a set of rules.

It is a plain ES module with no dependencies and no build step, so it works in Node and directly in the browser.

## How to use

```js
import {
  WEAPONS, STARTING_WEAPON, RARITIES, RARITY_COLORS, MAX_HP, DEFAULT_SKIN, RULES, CHEST_COINS, GOLDEN_CHEST_COINS,
  weaponPrice, skinPrice, isBuyable, weaponsByRarity, weaponDurability, weaponWear,
  chestChance, droppedDurability, rarityStyle, isShield, rarityRank, validateRules, POTION, MAX_POTIONS, potionHeal, itemPrice,
} from '@pvp/game-rules';
// In the browser without a bundler: import from '/path/to/packages/game-rules/src/index.js'

STARTING_WEAPON;                // 'gun': everyone gets it on join (a normal weapon: it breaks, drops, is sold)
weaponPrice('gun');             // 3 (undefined for an unknown id)
skinPrice('hat', 'crown');      // 300 (slot: 'color' | 'hat' | 'face' | 'back' | 'shirt')
isBuyable('weapon', 'megashield'); // true ('weapon' or a skin slot)
weaponsByRarity('epic');        // ['electricsword', 'icesword', 'shield']
weaponDurability('shootbm');    // 20 uses before it breaks (null = never breaks; a shield: blocked hits)
weaponWear('shootbm');          // 1 = durability one use costs (the weapon's wearPerUse, default 1)
chestChance('gun');             // 15 (the Gun's chest number, a weight: see below)
isShield('megashield');         // true: worn on the other arm, never in a weapon slot
rarityRank('legendary');        // 2 (common 0 ... megalegend 3)
droppedDurability('gun', 3);    // 8: a knocked-out player's weapon with half or less left comes back at half
rarityStyle('megalegend');      // { id, name: 'Megalegend', color: '#2f6fff', color2: '#0b0b12', background: 'linear-gradient(…)' }
CHEST_COINS;                    // 3 coins from every normal chest; GOLDEN_CHEST_COINS = 10
POTION;                         // { id: 'potion', name: 'Healing Potion', healPercent: 100, drinkMs: 5000,
                                //   chestChance: 15, price: 10, rarity: 'common' }
MAX_POTIONS;                    // 3 potions carried at most (a counter, not weapon slots)
potionHeal(20, 100);            // 100: a potion gives full H.P
itemPrice('potion', 'potion');  // 10 (the shop kind and id are both 'potion')

validateRules(RULES);           // [] — empty means valid
validateRules({ ...RULES, STARTING_WEAPON: 'laser' });
// ['STARTING_WEAPON "laser" is not a weapon']
```

**Rarities** (weakest to strongest): `common` (green), `epic` (purple), `legendary` (yellow), `megalegend`
(blue + black, `twoColors: true`). `RARITY_COLORS[rarity] = { name, color, color2, twoColors? }`; use these
everywhere a rarity is shown. `LOOT_TABLE` lists the weapon ids of each rarity.

**The weapons (#26)** are exactly the boss's cards: `gun`, `shootbm` (guns), `electricsword`, `icesword`,
`supersword` (melee), `shield`, `megashield` (type `shield`). `WEAPON_TYPES` is `['melee', 'gun', 'shield']`.
Specials are plain data the arena reads: `shock: { dmg, everyMs, forMs }` (Electric Sword: 1 HP every 5 s for
15 s), `freezeMs` (Ice Sword: 2000), `knockout: true` (Supersword: any hit knocks out), `shieldWear` (what a
raised shield loses when it blocks this weapon, default 1; Supersword 5) and, on shields, `reflect` (Mega
Shield: 0.25 of the blocked damage goes back). A shield has no `dmg`/`rate`; its `durability` is blocked hits.

**Chest chances:** every weapon has `chestChance`, the number from its card ("15%"). A chest always gives
exactly one weapon, picked with these numbers as **weights**, so they do not have to add up to 100:
chance = number / sum of all numbers. Today: gun 15, shootbm 15, shield 6, electricsword 5, icesword 4,
megashield 1, supersword 0.3 (sum 46.3, so a Gun comes out of about 32 in 100 chests). The golden chest
multiplies them by `GOLDEN_CHEST_BOOST` (Epic, Legendary and Megalegend x2, Common stays).

**Durability:** every weapon has `durability` = how many uses (swing or shot; for a shield: blocked hits) it
lasts before it breaks and disappears, or `null` = never breaks. An optional `wearPerUse` (whole number,
default 1) says how much one use costs. Today: Gun 15, Shootbm 20, Electric and Ice Sword 50, Supersword 40,
Shield 60, Mega Shield 70. **Dropped weapons:** `droppedDurability(id, usesLeft)` = what a
knocked-out player's weapon has when picked up: more than half keeps it, half or less becomes half (rounded up).

**Healing Potion** (`src/potion.js`, the boss's card in #28): the **only heal** (bandages and medkits are gone).
Drinking takes `drinkMs` (5 s) and gives `healPercent` (100 % = full H.P). Moving or getting hit does not stop it;
switching to a weapon before it is done cancels it and the potion is wasted (the arena does this). Every chest,
the golden chest too, gives an extra potion `chestChance` (15 %) of the time. Shop price 10 coins, rarity Common.

`validateRules` reports a missing or bad `durability` / `wearPerUse` / `chestChance` (a number >= 0, at least one
above 0), bad specials (`shock`, `freezeMs`, `knockout`, `shieldWear`, `reflect`), a shield without durability, an
unknown rarity, bad rarity colors, a `STARTING_WEAPON` that is not a weapon (or is a shield), and a bad `POTION` /
`MAX_POTIONS`.

`validateRules` reports a missing or bad `durability` / `wearPerUse` / `chestChance`, chest chances that do not
add up to 100, an unknown rarity, bad rarity colors, a `STARTING_WEAPON` that is not a weapon, and a bad `POTION` / `MAX_POTIONS`.

Files: `src/player.js` (limits, timers, movement), `src/weapons.js` (weapons, loot), `src/potion.js` (the Healing Potion), `src/skins.js` (colors, outfits, default skin), `src/validate.js`, all re-exported from `src/index.js`.

## Determinism

Fully deterministic: only constant data and pure functions. No randomness, no clock, no I/O. All exported data is frozen, so it cannot be changed by accident.
