// The Inventory screen, the fast bar (#39) and the extras bar (#50) as plain data: what each space and each
// bar slot shows. Pure functions of the account (from the server: stash, potions, bombs, bar, extras) and the rules.
// The fast bar holds hand weapons only (swords, guns); the extras bar has one fixed space for the shield,
// the Healing Potions and each bomb (extrasSpaces in @pvp/game-rules).
import { RULES, rarityStyle, extrasSpaces } from '@pvp/game-rules';
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

const isEntry = e => e && typeof e === 'object' && typeof e.kind === 'string' && isPosInt(e.n);
/** Is this a hand weapon (sword, gun: the only things the fast bar takes)? */
export const isHandWeapon = (kind, id, rules = RULES) => kind === 'weapon' && !!own(rules.WEAPONS, id) && own(rules.WEAPONS, id).type !== 'shield';

const barOf = (account, rules) => {
  const size = isPosInt(rules.MAX_SLOTS) ? rules.MAX_SLOTS : 5;
  const bar = Array.isArray(account?.bar) ? account.bar : [];
  return Array.from({ length: Math.max(size, bar.length) }, (_, i) => {
    const e = bar[i];
    return isEntry(e) && isHandWeapon(e.kind, e.id, rules) ? e : null;
  });
};

// The extras bar entries in space order: [{ ...space, entry (or null) }]
const extrasOf = (account, rules) => {
  const ex = account?.extras && typeof account.extras === 'object' ? account.extras : {};
  return extrasSpaces(rules).map(s => {
    const e = own(ex, s.space);
    const fits = isEntry(e) && e.kind === s.kind && (s.id === null ? own(rules.WEAPONS, e.id)?.type === 'shield' : e.id === s.id);
    return { ...s, entry: fits ? e : null };
  });
};

/** Which extras space an item goes into ('shield', 'potion', a bomb id), or null (hand weapons, unknown items). */
export function extrasSpaceFor(kind, id, rules = RULES) {
  const s = extrasSpaces(rules).find(x => x.kind === kind && (x.id === null ? own(rules.WEAPONS, id)?.type === 'shield' : x.id === id));
  return s ? s.space : null;
}

// Durability shown for a weapon in a space or slot: its uses left (#51: worn weapons stay worn; dur left out = full).
const durabilityOf = (look, dur) => {
  if (look.kind !== 'weapon') return null;
  const max = look.maxDurability;
  if (max == null) return { uses: null, max: null, percent: 100, label: '∞' };
  const uses = isPosInt(dur) && dur < max ? dur : max;
  return { uses, max, percent: Math.round((uses / max) * 100), label: String(uses) };
};

// The uses left of each weapon copy in the Inventory, full ones first, then the worn ones (account.wear, best first).
function copiesOf(account, id, owned, max) {
  const list = own(account?.wear, id);
  const worn = (Array.isArray(list) ? list : []).filter(d => isPosInt(d) && max != null && d < max).sort((a, b) => b - a).slice(0, owned);
  return [...Array.from({ length: owned - worn.length }, () => null), ...worn];
}

/**
 * The Inventory grid: one card per SPACE. Every item kind gets at least MIN_SPACES (2) spaces, filled or
 * empty "ghost" spaces, and more when you own more (no limit). A weapon space holds 1 copy, a potion space up
 * to 3, a bomb space up to its maxCarry (like a bar slot). Kinds come in inventoryItemKinds order; the
 * spaces of one kind are next to each other (filled first).
 * Card: { key, kind, id, name, icon | iconSvg, rarity, rarityName, rarityColor, rarityBackground, isShield,
 *   filled, ghost, count (in this space, 0 for a ghost), label ('×3' for a stack, '' otherwise),
 *   owned (all of this item in the Inventory), inBar (how many are in the bar), durability ({ uses, max,
 *   percent, label } for a filled weapon space, else null), dur (a worn weapon copy's uses left, to send with
 *   toBar so this exact copy moves, #51; null when full or not a weapon), first (first space of its kind),
 *   place ('bar' for hand weapons, 'extras' for a shield, potions and bombs: where a tap puts it),
 *   action ('toBar' / 'toExtras' when filled, else null) }.
 * inBar counts both bars (the fast bar and the extras bar).
 */
export function inventoryCards(account, rules = RULES, { minSpaces = MIN_SPACES } = {}) {
  const carried = [...barOf(account, rules), ...extrasOf(account, rules).map(s => s.entry)];
  const cards = [];
  for (const { kind, id } of inventoryItemKinds(rules)) {
    const look = itemLook(kind, id, rules);
    const size = spaceSize(kind, id, rules);
    if (!look || !size) continue;
    const owned = inventoryCount(account, kind, id);
    const place = isHandWeapon(kind, id, rules) ? 'bar' : 'extras';
    const inBar = carried.reduce((sum, e) => sum + (e && e.kind === kind && e.id === id ? e.n : 0), 0);
    const spaces = Math.max(minSpaces, Math.ceil(owned / size));
    const copies = kind === 'weapon' ? copiesOf(account, id, owned, look.maxDurability) : [];
    let left = owned;
    for (let i = 0; i < spaces; i++) {
      const count = Math.min(size, left);
      left -= count;
      const filled = count > 0;
      const dur = filled && kind === 'weapon' ? copies[i] : null;
      cards.push({
        key: `${kind}:${id}:${i}`, ...look, filled, ghost: !filled, count,
        label: filled && size > 1 ? `×${count}` : '',
        owned, inBar, durability: filled ? durabilityOf(look, dur) : null, dur: dur ?? null, first: i === 0,
        place, action: filled ? (place === 'bar' ? 'toBar' : 'toExtras') : null,
      });
    }
  }
  return cards;
}

/**
 * The fast bar below the Inventory, looking like the in-game HUD bar: always all slots (5), hand weapons only
 * (anything else in the data shows as empty).
 * Slot: { index, key ('1'..'5'), empty, kind, id, name, icon | iconSvg, rarity, rarityName, rarityColor,
 *   rarityBackground, isShield, count, label ('×3' for a stack), durability, action ('fromBar' or null) }.
 */
export function barSlots(account, rules = RULES) {
  return barOf(account, rules).map((e, index) => {
    const look = e ? itemLook(e.kind, e.id, rules) : null;
    if (!look) return { index, key: String(index + 1), empty: true, kind: null, id: null, name: '', count: 0, label: '', durability: null, action: null };
    return {
      index, key: String(index + 1), empty: false, ...look, count: e.n,
      label: spaceSize(e.kind, e.id, rules) > 1 ? `×${e.n}` : '', durability: durabilityOf(look, e.dur), action: 'fromBar',
    };
  });
}

// The drawing an empty extras space shows: what belongs there (#50).
const SPACE_NAMES = { shield: 'Shield', potion: 'Healing Potions', bomb: 'Bombs' };
function spaceHint(s, rules) {
  if (s.kind === 'weapon') {
    // the cheapest shield shows the drawing (the Shield, not the Mega Shield)
    const id = Object.keys(rules.WEAPONS ?? {}).filter(w => rules.WEAPONS[w]?.type === 'shield')
      .sort((a, b) => (rules.WEAPONS[a].price ?? 0) - (rules.WEAPONS[b].price ?? 0))[0];
    const look = id ? itemLook('weapon', id, rules) : null;
    return { hintName: SPACE_NAMES.shield, hintIcon: look?.icon ?? '🛡️', hintIconSvg: undefined, hintColor: look?.rarityColor ?? '#888888' };
  }
  const look = itemLook(s.kind, s.id, rules);
  const name = s.kind === 'potion' ? SPACE_NAMES.potion : (look?.name ? `${look.name}s` : SPACE_NAMES.bomb);
  return { hintName: name, hintIcon: undefined, hintIconSvg: look?.iconSvg, hintColor: look?.rarityColor ?? '#888888' };
}

/**
 * The extras bar (#50) under the fast bar: always one space per extra, in order: Shield, Healing Potions,
 * Bombs, Legendary Bombs. An empty space shows a faint drawing of what belongs there.
 * Space: { space ('shield', 'potion', 'bomb', 'legendarybomb'), key (same as space), max (how many fit),
 *   hintName ('Shield', 'Healing Potions', 'Bombs', 'Legendary Bombs'), hintIcon (emoji) | hintIconSvg, hintColor,
 *   empty, count, fill ('2/3'; '' for the shield), label ('×2' for a stack), action ('fromExtras' or null),
 *   and when filled the item's look: kind, id, name, icon | iconSvg, rarity, rarityName, rarityColor,
 *   rarityBackground, isShield, durability }.
 */
export function extrasSlots(account, rules = RULES) {
  return extrasOf(account, rules).map(s => {
    const hint = spaceHint(s, rules);
    const look = s.entry ? itemLook(s.entry.kind, s.entry.id, rules) : null;
    const base = { space: s.space, key: s.space, max: s.max, ...hint };
    if (!look) return { ...base, empty: true, kind: s.kind, id: s.id, name: '', count: 0, fill: s.max > 1 ? `0/${s.max}` : '', label: '', durability: null, action: null };
    const count = Math.min(s.entry.n, s.max);
    return {
      ...base, ...look, empty: false, count, fill: s.max > 1 ? `${count}/${s.max}` : '',
      label: s.max > 1 ? `×${count}` : '', durability: durabilityOf(look, s.entry.dur), action: 'fromExtras',
    };
  });
}

/**
 * The trash (#53): the words of the "are you sure?" box for ONE item. A hand weapon is "this weapon" (the boss's
 * words); a shield, potion or bomb uses its name ("this Healing Potion"). count = how many are in the tapped space
 * or slot: only ONE is destroyed, the note says how many stay. Unknown items give null.
 * { kind, id, name, icon | iconSvg, rarityColor, …look, question, note, yes: 'YES', no: 'NO' }
 */
export function trashPrompt(kind, id, { count = 1 } = {}, rules = RULES) {
  const look = itemLook(kind, id, rules);
  if (!look) return null;
  const what = isHandWeapon(kind, id, rules) ? 'weapon' : look.name;
  const keep = isPosInt(count) ? count - 1 : 0;
  const note = keep > 0
    ? `Only ONE is destroyed. You keep ${keep}. No coins back.`
    : 'It will be gone forever. No coins back.';
  return { ...look, question: `Are you sure you want to destroy this ${what}?`, note, yes: 'YES', no: 'NO' };
}

/**
 * One line for the menu about what comes into the arena, e.g.
 * 'Fast bar: Shootbm (4 free) · Extras: Mega Shield, 3× Healing Potion'
 * or 'Fast bar is empty: you get the free Gun. Fill it in your Inventory!' (plus the extras, if any).
 */
export function barSummary(account, rules = RULES) {
  const slots = barSlots(account, rules);
  const full = slots.filter(s => !s.empty);
  const extras = extrasSlots(account, rules).filter(s => !s.empty).map(s => (s.count > 1 ? `${s.count}× ${s.name}` : s.name));
  const tail = extras.length ? ` · Extras: ${extras.join(', ')}` : '';
  if (!full.length) {
    const gun = own(rules.WEAPONS, rules.STARTING_WEAPON)?.name;
    return `Fast bar is empty: ${gun ? `you get the free ${gun}. ` : ''}Fill it in your Inventory!${tail}`;
  }
  const free = slots.length - full.length;
  return `Fast bar: ${full.map(s => s.name).join(', ')}${free ? ` (${free} free)` : ''}${tail}`;
}
