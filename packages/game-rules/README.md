# @pvp/game-rules

## What it does

All the game's rules (limits, movement, weapons, the Healing Potion, loot, skin colors and outfits, prices) as deep-frozen plain data, plus small pure helpers and `validateRules()` which lists any problems in a set of rules.

It is a plain ES module with no dependencies and no build step, so it works in Node and directly in the browser.

## How to use

```js
import {
  WEAPONS, STARTING_WEAPON, RARITIES, RARITY_COLORS, MAX_HP, DEFAULT_SKIN, RULES, CHEST_COINS, GOLDEN_CHEST_COINS,
  weaponPrice, skinPrice, isBuyable, weaponsByRarity, weaponDurability, weaponWear,
  chestChance, droppedDurability, rarityStyle, validateRules, POTION, MAX_POTIONS, potionHeal, itemPrice,
} from '@pvp/game-rules';
// In the browser without a bundler: import from '/path/to/packages/game-rules/src/index.js'

STARTING_WEAPON;                // 'gun': everyone gets it on join (a normal weapon: it breaks, drops, is sold)
weaponPrice('gun');             // 3 (undefined for an unknown id)
skinPrice('hat', 'crown');      // 300 (slot: 'color' | 'hat' | 'face' | 'back' | 'shirt')
isBuyable('weapon', 'rocket');  // true ('weapon' or a skin slot)
weaponsByRarity('legendary');   // ['sniper', 'rocket', 'mine']
weaponDurability('sniper');     // 12 uses before it breaks (null = never breaks)
weaponWear('sniper');           // 1 = durability one use costs (the weapon's wearPerUse, default 1)
chestChance('gun');             // 15 (percent of normal chests that give a Gun)
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

**Chest chances:** every weapon has `chestChance` (percent). All weapons together must add up to 100, so
the number is exactly the chance that a normal chest gives that weapon (a chest gives one weapon, picked with
the numbers as weights). The golden chest multiplies them by `GOLDEN_CHEST_BOOST` (Epic, Legendary and
Megalegend x2, Common stays). Today: gun 15, sword 18, bat 18, pistol 17, spear 5, axe 5, shotgun 6, rifle 5,
grenade 6, sniper 2, rocket 1, mine 2.

**Durability:** every weapon has `durability` = how many uses (swing, shot, throw, rocket, mine) it lasts
before it breaks and disappears, or `null` = never breaks. An optional `wearPerUse` (whole number, default 1)
says how much one use costs. Today: Gun 15, melee 40-60, pistol 60, shotgun 25, rifle 150, sniper 12,
grenades 5, rocket launcher 6, mines 5. **Dropped weapons:** `droppedDurability(id, usesLeft)` = what a
knocked-out player's weapon has when picked up: more than half keeps it, half or less becomes half (rounded up).

**Healing Potion** (`src/potion.js`, the boss's card in #28): the **only heal** (bandages and medkits are gone).
Drinking takes `drinkMs` (5 s) and gives `healPercent` (100 % = full H.P). Moving or getting hit does not stop it;
switching to a weapon before it is done cancels it and the potion is wasted (the arena does this). Every chest,
the golden chest too, gives an extra potion `chestChance` (15 %) of the time. Shop price 10 coins, rarity Common.

`validateRules` reports a missing or bad `durability` / `wearPerUse` / `chestChance`, chest chances that do not
add up to 100, an unknown rarity, bad rarity colors, a `STARTING_WEAPON` that is not a weapon, and a bad `POTION` / `MAX_POTIONS`.

Files: `src/player.js` (limits, timers, movement), `src/weapons.js` (weapons, loot), `src/potion.js` (the Healing Potion), `src/skins.js` (colors, outfits, default skin), `src/validate.js`, all re-exported from `src/index.js`.

## Determinism

Fully deterministic: only constant data and pure functions. No randomness, no clock, no I/O. All exported data is frozen, so it cannot be changed by accident.
