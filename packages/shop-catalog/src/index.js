// @pvp/shop-catalog: pure functions that turn the game rules and an account into
// what the shop screen shows. Plain ES module: works in Node and in the browser.
import { RULES, rarityStyle } from '@pvp/game-rules';

const TABS = Object.freeze([
  Object.freeze({ id: 'color', label: 'Colors', hint: 'Pick the color of your stickman.' }),
  Object.freeze({ id: 'hat', label: 'Hats', hint: 'Something cool for your head.' }),
  Object.freeze({ id: 'face', label: 'Masks', hint: 'Hide your face like a real hero.' }),
  Object.freeze({ id: 'back', label: 'Back', hint: 'Capes and bags for your back.' }),
  Object.freeze({ id: 'shirt', label: 'Clothes', hint: 'Dress up your stickman.' }),
  Object.freeze({
    id: 'weapon', label: 'Weapons',
    hint: 'Weapons go into your backpack and come with you into the arena. Get knocked out and you drop them!',
  }),
]);

/** Simple emoji for outfit items (weapons have their own icons in the game). */
export const OUTFIT_ICONS = Object.freeze({
  hat: Object.freeze({ none: '🚫', cap: '🧢', tophat: '🎩', wizard: '🧙', crown: '👑' }),
  face: Object.freeze({ none: '🚫', shades: '🕶️', ninja: '🥷', hero: '🦸' }),
  back: Object.freeze({ none: '🚫', redcape: '🟥', bluecape: '🟦', backpack: '🎒' }),
  shirt: Object.freeze({ none: '🚫', tshirt: '👕', vest: '🦺', armor: '🛡️' }),
});

/** The shop tabs in order: [{ id, label, hint }]. id is the item kind. */
export function shopTabs() {
  return TABS.map(t => ({ ...t }));
}

/** Weapon ids the shop sells (every weapon, the starting Gun too), sorted by rarity (rules order), then price, then id. */
export function shopWeaponIds(rules = RULES) {
  const rank = r => { const i = rules.RARITIES.indexOf(r); return i < 0 ? Infinity : i; };
  return Object.keys(rules.WEAPONS)
    .sort((a, b) => {
      const wa = rules.WEAPONS[a], wb = rules.WEAPONS[b];
      return rank(wa.rarity) - rank(wb.rarity) || wa.price - wb.price || (a < b ? -1 : a > b ? 1 : 0);
    });
}

const coinsOf = account => (account && Number.isFinite(account.coins) ? account.coins : 0);
const has = (list, x) => Array.isArray(list) && list.includes(x);
const stashOf = (account, id) => {
  const n = account && account.stash ? account.stash[id] : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * The cards for one shop tab.
 * Skin cards: { kind, id, name, price, owned, equipped, canAfford, action, icon?, color?, pattern? }
 * Weapon cards: { kind: 'weapon', id, name, price, owned, equipped: false, canAfford, action: 'buy', rarity, type, stashCount,
 *   rarityName, rarityColor, rarityBackground } (colors from RARITY_COLORS in @pvp/game-rules)
 * action is 'equipped' (wearing it), 'equip' (owned) or 'buy'.
 * Skins come in rules order; weapons by rarity, then price. Unknown tab gives [].
 */
export function shopItems(tab, account, rules = RULES) {
  const coins = coinsOf(account);
  if (tab === 'weapon') {
    return shopWeaponIds(rules).map(id => {
      const w = rules.WEAPONS[id];
      const stashCount = stashOf(account, id);
      const look = rarityStyle(w.rarity, rules.RARITY_COLORS);
      return {
        kind: 'weapon', id, name: w.name, price: w.price,
        owned: stashCount > 0, equipped: false, canAfford: coins >= w.price, action: 'buy',
        rarity: w.rarity, type: w.type, stashCount,
        rarityName: look ? look.name : String(w.rarity ?? ''),
        rarityColor: look ? look.color : '#888888',
        rarityBackground: look ? look.background : '#888888',
      };
    });
  }
  const table = tab === 'color' ? rules.COLORS : (rules.OUTFITS && Object.hasOwn(rules.OUTFITS, tab) ? rules.OUTFITS[tab] : null);
  if (!table) return [];
  return Object.keys(table).map(id => {
    const item = table[id];
    const owned = has(account && account.owned, `${tab}:${id}`);
    const equipped = owned && !!account.skin && account.skin[tab] === id;
    const card = {
      kind: tab, id, name: item.name, price: item.price,
      owned, equipped, canAfford: coins >= item.price,
      action: equipped ? 'equipped' : owned ? 'equip' : 'buy',
    };
    if (tab === 'color') {
      card.color = item.color;
      if (item.pattern) card.pattern = item.pattern;
    } else if (OUTFIT_ICONS[tab] && OUTFIT_ICONS[tab][id]) {
      card.icon = OUTFIT_ICONS[tab][id];
    }
    return card;
  });
}

/** CSS background for a color swatch (patterns get a simple gradient). */
export function swatchBackground(card) {
  if (card.pattern === 'rainbow') return 'linear-gradient(135deg, #ff3b3b, #ffb13b, #f6ff3b, #3bff6a, #3bb4ff, #9b3bff)';
  if (card.pattern === 'stripes') return 'repeating-linear-gradient(45deg, #ffffff 0 6px, #1b1b1f 6px 12px)';
  if (card.pattern === 'gold') return 'radial-gradient(circle at 35% 35%, #fff3b0, #ffc531 45%, #c88a00)';
  return card.color || '#888';
}

/**
 * One line of text about the weapons in the backpack, e.g.
 * "Backpack: 2× Pistol, 1× Sniper" or "Backpack is empty. Buy weapons in the shop!"
 * Weapons are listed in shop order.
 */
export function backpackSummary(account, rules = RULES) {
  const parts = shopWeaponIds(rules)
    .filter(id => stashOf(account, id) > 0)
    .map(id => `${stashOf(account, id)}× ${rules.WEAPONS[id].name}`);
  return parts.length ? `Backpack: ${parts.join(', ')}` : 'Backpack is empty. Buy weapons in the shop!';
}
