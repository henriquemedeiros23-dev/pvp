// @pvp/game-rules: all the game's rules as frozen plain data, plus small pure helpers.
// Plain ES module with no dependencies: works in Node and directly in the browser.
import * as player from './player.js';
import * as weapons from './weapons.js';
import * as skins from './skins.js';
import * as potion from './potion.js';
import * as bombs from './bombs.js';
import * as charge from './charge.js';
import * as headshot from './headshot.js';
import { deepFreeze } from './freeze.js';

export * from './player.js';
export {
  STARTING_WEAPON, WEAPON_TYPES, RARITIES, RARITY_COLORS, WEAPONS, LOOT_TABLE, GOLDEN_CHEST_BOOST,
  weaponsByRarity, weaponPrice, weaponDurability, weaponWear, droppedDurability, chestChance, rarityStyle,
  isShield, rarityRank, aimDef, canAim, aimMultipliers,
} from './weapons.js';
export { MAX_POTIONS, POTION, potionPrice, potionHeal } from './potion.js';
export { CHARGING_DAMAGE, MIN_FIRE_GAP_MS, chargingDamage } from './charge.js';
export { HEADSHOT_BONUS, HEAD_ZONE, isHeadshot, headshotDamage } from './headshot.js';
export { BOMBS, isBomb, bombPrice, bombMaxCarry, bombCounts, inBombArea } from './bombs.js';
export { extrasSpaces, extrasSpaceOf } from './extras.js';
export { COLORS, OUTFITS, SKIN_SLOTS, DEFAULT_SKIN, skinPrice } from './skins.js';
export { validateRules } from './validate.js';
export { deepFreeze } from './freeze.js';

/**
 * Price of anything in the shop. kind is 'weapon', 'potion', 'bomb' (the price of one pack) or a skin slot.
 * Undefined if it can't be bought.
 */
export function itemPrice(kind, id) {
  if (kind === 'weapon') return weapons.weaponPrice(id);
  if (kind === 'potion') return potion.potionPrice(id);
  if (kind === 'bomb') return bombs.bombPrice(id);
  return skins.skinPrice(kind, id);
}

/**
 * True if the shop sells this item: any known weapon, or any known skin item
 * (free skin items count, they cost 0 coins). Same rule the server's shop uses today.
 */
export function isBuyable(kind, id) {
  return itemPrice(kind, id) !== undefined;
}

const pickData = mod => Object.fromEntries(Object.entries(mod).filter(([, v]) => typeof v !== 'function'));

/** Every rule in one frozen object, handy for validateRules(RULES) or sending to a client. */
export const RULES = deepFreeze({ ...pickData(player), ...pickData(weapons), ...pickData(potion), ...pickData(bombs), ...pickData(charge), ...pickData(headshot), ...pickData(skins) });
