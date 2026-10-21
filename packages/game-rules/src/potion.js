// The Healing Potion: the only heal in the game (the boss's potion card, #28).
import { deepFreeze } from './freeze.js';

/** How many potions a player can carry in the arena (a counter, not weapon slots). */
export const MAX_POTIONS = 3;

// id: item kind on the ground and the shop item id.
// healPercent: how much of MAX_HP one potion gives back (100 = full H.P).
// drinkMs: drinking time. Moving or getting hit does not stop it; switching to a weapon (slot change)
//   before it is done cancels it and the potion is wasted.
// chestChance: percent chance that a chest (normal and golden) gives an extra potion next to its weapon.
// price: coins in the shop. rarity: like weapons (Common = green).
export const POTION = deepFreeze({
  id: 'potion',
  name: 'Healing Potion',
  healPercent: 100,
  drinkMs: 5000,
  chestChance: 15,
  price: 10,
  rarity: 'common',
});

/** Shop price of a potion item; undefined for anything else. */
export function potionPrice(id, potion = POTION) {
  return potion && id === potion.id ? potion.price : undefined;
}

/** Health after drinking a potion (never above maxHp). */
export function potionHeal(hp, maxHp, potion = POTION) {
  const add = Math.round((maxHp * potion.healPercent) / 100);
  return Math.min(maxHp, Math.max(0, hp) + add);
}
