// The Inventory screen and the fast bar (#39) as plain data: what each space and each bar slot shows.
// Pure functions of the account (from the server: stash, potions, bombs, bar) and the rules.
import { RULES, rarityStyle } from '@pvp/game-rules';
import { WEAPON_ICONS, POTION_ICON_SVG, bombIconSvg } from '@pvp/hud-model';
import { shopWeaponIds } from './index.js';

/** Every item kind shows at least this many spaces in the Inventory (the boss: "a place for at least two of everything"). */
export const MIN_SPACES = 2;

const isPosInt = n => Number.isInteger(n) && n > 0;
const own = (obj, key) => (obj && typeof key === 'string' && Object.hasOwn(obj, key) ? obj[key] : undefined);

/** Every item that can be in the Inventory, in screen order: weapons (shop order), the Healing Potion, the bombs. */
export function inventoryItemKinds(rules = RULES) {
  const out = shopWeaponIds(rules).map(id => ({ kind: 'weapon', id }));
  if (rules.POTION) out.push({ kind: 'potion', id: rules.POTION.id });
  for (const id of Object.keys(rules.BOMBS ?? {})) out.push({ kind: 'bomb', id });
  return out;
}

/** How many of an item fit in one space / bar slot: weapon 1, potions MAX_POTIONS, a bomb its maxCarry. */
export function spaceSize(kind, id, rules = RULES) {
  if (kind === 'weapon') return own(rules.WEAPONS, id) ? 1 : 0;
  if (kind === 'potion') return rules.POTION && id === rules.POTION.id && isPosInt(rules.MAX_POTIONS) ? rules.MAX_POTIONS : 0;
  if (kind === 'bomb') { const m = own(rules.BOMBS, id)?.maxCarry; return isPosInt(m) ? m : 0; }
  return 0;
}

/**
 * How an item looks (no counts): { kind, id, name, rarity, rarityName, rarityColor, rarityBackground,
 * icon (emoji, weapons) or iconSvg (potion flask, bomb), isShield, maxDurability (weapons; null = never breaks) }.
 * Unknown items give null.
 */
export function itemLook(kind, id, rules = RULES) {
  let def, out;
  if (kind === 'weapon' && (def = own(rules.WEAPONS, id))) {
    out = { icon: own(WEAPON_ICONS, id) || '❔', isShield: def.type === 'shield', maxDurability: isPosInt(def.durability) ? def.durability : null };
  } else if (kind === 'potion' && rules.POTION && id === rules.POTION.id) {
    def = rules.POTION;
    out = { iconSvg: POTION_ICON_SVG, isShield: false, maxDurability: null };
  } else if (kind === 'bomb' && (def = own(rules.BOMBS, id))) {
    out = { iconSvg: bombIconSvg(def.color), isShield: false, maxDurability: null };
  } else return null;
  const look = rarityStyle(def.rarity, rules.RARITY_COLORS);
  return {
    kind, id, name: def.name, rarity: def.rarity,
    rarityName: look ? look.name : String(def.rarity ?? ''),
    rarityColor: look ? look.color : '#888888',
    rarityBackground: look ? look.background : '#888888',
    ...out,
  };
}

/** How many of an item are in the Inventory (not in the bar). */
export function inventoryCount(account, kind, id) {
  let n = 0;
  if (kind === 'weapon') n = own(account?.stash, id);
  else if (kind === 'potion') n = account?.potions;
  else if (kind === 'bomb') n = own(account?.bombs, id);
  return isPosInt(n) ? n : 0;
}

const barOf = (account, rules) => {
  const size = isPosInt(rules.MAX_SLOTS) ? rules.MAX_SLOTS : 5;
  const bar = Array.isArray(account?.bar) ? account.bar : [];
  return Array.from({ length: Math.max(size, bar.length) }, (_, i) => {
    const e = bar[i];
    return e && typeof e === 'object' && typeof e.kind === 'string' && isPosInt(e.n) ? e : null;
  });
};

// Durability shown for a weapon in a space or slot: the Inventory keeps no wear, so it is always full.
const durabilityOf = look => (look.kind === 'weapon'
  ? { uses: look.maxDurability, max: look.maxDurability, percent: 100, label: look.maxDurability == null ? '∞' : String(look.maxDurability) }
  : null);

/**
 * The Inventory grid: one card per SPACE. Every item kind gets at least MIN_SPACES (2) spaces, filled or
 * empty "ghost" spaces, and more when you own more (no limit). A weapon space holds 1 copy, a potion space up
 * to 3, a bomb space up to its maxCarry (like a bar slot). Kinds come in inventoryItemKinds order; the
 * spaces of one kind are next to each other (filled first).
 * Card: { key, kind, id, name, icon | iconSvg, rarity, rarityName, rarityColor, rarityBackground, isShield,
 *   filled, ghost, count (in this space, 0 for a ghost), label ('×3' for a stack, '' otherwise),
 *   owned (all of this item in the Inventory), inBar (how many are in the bar), durability ({ uses, max,
 *   percent, label } for a filled weapon space, else null), first (first space of its kind), action ('toBar' or null) }.
 */
export function inventoryCards(account, rules = RULES, { minSpaces = MIN_SPACES } = {}) {
  const bar = barOf(account, rules);
  const cards = [];
  for (const { kind, id } of inventoryItemKinds(rules)) {
    const look = itemLook(kind, id, rules);
    const size = spaceSize(kind, id, rules);
    if (!look || !size) continue;
    const owned = inventoryCount(account, kind, id);
    const inBar = bar.reduce((sum, e) => sum + (e && e.kind === kind && e.id === id ? e.n : 0), 0);
    const spaces = Math.max(minSpaces, Math.ceil(owned / size));
    let left = owned;
    for (let i = 0; i < spaces; i++) {
      const count = Math.min(size, left);
      left -= count;
      const filled = count > 0;
      cards.push({
        key: `${kind}:${id}:${i}`, ...look, filled, ghost: !filled, count,
        label: filled && size > 1 ? `×${count}` : '',
        owned, inBar, durability: filled ? durabilityOf(look) : null, first: i === 0,
        action: filled ? 'toBar' : null,
      });
    }
  }
  return cards;
}

/**
 * The fast bar below the Inventory, looking like the in-game HUD bar: always all slots (5).
 * Slot: { index, key ('1'..'5'), empty, kind, id, name, icon | iconSvg, rarity, rarityName, rarityColor,
 *   rarityBackground, isShield, count, label ('×3' for a stack), durability, action ('fromBar' or null) }.
 */
export function barSlots(account, rules = RULES) {
  return barOf(account, rules).map((e, index) => {
    const look = e ? itemLook(e.kind, e.id, rules) : null;
    if (!look) return { index, key: String(index + 1), empty: true, kind: null, id: null, name: '', count: 0, label: '', durability: null, action: null };
    return {
      index, key: String(index + 1), empty: false, ...look, count: e.n,
      label: spaceSize(e.kind, e.id, rules) > 1 ? `×${e.n}` : '', durability: durabilityOf(look), action: 'fromBar',
    };
  });
}

/**
 * One line for the menu about the fast bar, e.g. 'Fast bar: Shootbm, Mega Shield, 3× Healing Potion (2 free)'
 * or 'Fast bar is empty: you get the free Gun. Fill it in your Inventory!'
 */
export function barSummary(account, rules = RULES) {
  const slots = barSlots(account, rules);
  const full = slots.filter(s => !s.empty);
  if (!full.length) {
    const gun = own(rules.WEAPONS, rules.STARTING_WEAPON)?.name;
    return `Fast bar is empty: ${gun ? `you get the free ${gun}. ` : ''}Fill it in your Inventory!`;
  }
  const free = slots.length - full.length;
  const parts = full.map(s => (s.count > 1 ? `${s.count}× ${s.name}` : s.name));
  return `Fast bar: ${parts.join(', ')}${free ? ` (${free} free)` : ''}`;
}
