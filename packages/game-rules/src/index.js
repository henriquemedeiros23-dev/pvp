// @pvp/game-rules: all the game's rules as frozen plain data, plus small pure helpers.
// Plain ES module with no dependencies: works in Node and directly in the browser.
import * as player from './player.js';
import * as weapons from './weapons.js';
import * as skins from './skins.js';
import { deepFreeze } from './freeze.js';

export * from './player.js';
export {
  BASIC_WEAPON, WEAPON_TYPES, RARITIES, WEAPONS, HEALS, LOOT_TABLE,
  weaponsByRarity, weaponPrice,
} from './weapons.js';
export { COLORS, OUTFITS, SKIN_SLOTS, DEFAULT_SKIN, skinPrice } from './skins.js';
export { validateRules } from './validate.js';
export { deepFreeze } from './freeze.js';

/** Price of anything in the shop. kind is 'weapon' or a skin slot. Undefined if it can't be bought. */
export function itemPrice(kind, id) {
  return kind === 'weapon' ? weapons.weaponPrice(id) : skins.skinPrice(kind, id);
}

/**
 * True if the shop sells this item: any known non-basic weapon, or any known skin item
 * (free skin items count, they cost 0 coins). Same rule the server's shop uses today.
 */
export function isBuyable(kind, id) {
  return itemPrice(kind, id) !== undefined;
}

const pickData = mod => Object.fromEntries(Object.entries(mod).filter(([, v]) => typeof v !== 'function'));

/** Every rule in one frozen object, handy for validateRules(RULES) or sending to a client. */
export const RULES = deepFreeze({ ...pickData(player), ...pickData(weapons), ...pickData(skins) });
