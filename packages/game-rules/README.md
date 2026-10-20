# @pvp/game-rules

## What it does

All the game's rules (limits, movement, weapons, heals, loot, skin colors and outfits, prices) as deep-frozen plain data, plus small pure helpers and `validateRules()` which lists any problems in a set of rules.

It is a plain ES module with no dependencies and no build step, so it works in Node and directly in the browser.

## How to use

```js
import {
  WEAPONS, BASIC_WEAPON, MAX_HP, DEFAULT_SKIN, RULES,
  weaponPrice, skinPrice, isBuyable, weaponsByRarity, validateRules,
} from '@pvp/game-rules';
// In the browser without a bundler: import from '/path/to/packages/game-rules/src/index.js'

weaponPrice('sniper');          // 200 (undefined for the basic weapon or an unknown id)
skinPrice('hat', 'crown');      // 300 (slot: 'color' | 'hat' | 'face' | 'back' | 'shirt')
isBuyable('weapon', 'rocket');  // true ('weapon' or a skin slot)
weaponsByRarity('legendary');   // ['sniper', 'rocket', 'mine']
weaponDurability('sniper');     // 12 uses before it breaks (null = never breaks, e.g. the basic weapon)
weaponWear('sniper');           // 1 = durability one use costs (the weapon's wearPerUse, default 1)

validateRules(RULES);           // [] — empty means valid
validateRules({ ...RULES, BASIC_WEAPON: 'sword' });
// ['BASIC_WEAPON "sword" is not the basic weapon']
```

**Durability:** every weapon has `durability` = how many uses (swing, shot, throw, rocket, mine) it lasts
before it breaks and disappears, or `null` = never breaks. An optional `wearPerUse` (whole number, default 1)
says how much one use costs. "Never breaks" is a setting on the weapon, not a special case for the basic weapon.
Today: melee 40-60, pistol 60, shotgun 25, rifle 150, sniper 12, grenades 5, rocket launcher 6, mines 5,
wooden sword `null`. `validateRules` reports a missing or bad `durability` / `wearPerUse`.

Files: `src/player.js` (limits, timers, movement), `src/weapons.js` (weapons, heals, loot), `src/skins.js` (colors, outfits, default skin), `src/validate.js`, all re-exported from `src/index.js`.

## Determinism

Fully deterministic: only constant data and pure functions. No randomness, no clock, no I/O. All exported data is frozen, so it cannot be changed by accident.
