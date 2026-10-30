// The fast bar (#39) and the extras bar (#50): the few things a player takes into the arena. Everything
// else stays safe in the Inventory (the stash, potions and bombs counters of the account).
// Pure functions on a plain account record { stash, potions, bombs, bar, extras, lastBar, lastExtras } and
// the rules. No clock, no random: same record and same calls give the same result.
//
// The FAST BAR is an array of BAR_SLOTS (the rules' MAX_SLOTS, 5) slots for HAND WEAPONS only (swords, guns).
// Each slot is null (empty) or { kind: 'weapon', id, n: 1 }.
// The EXTRAS BAR is an object with one fixed space per extra (see extrasSpaces in @pvp/game-rules):
//   extras.shield          null or { kind: 'weapon', id, n: 1 }   ONE shield (Shield or Mega Shield)
//   extras.potion          null or { kind: 'potion', id, n }      Healing Potions, n up to MAX_POTIONS (3)
//   extras[bombId]         null or { kind: 'bomb', id, n }        that bomb, n up to its maxCarry (5 / 3)
// Things in the bars are NOT in the Inventory any more (they were moved), so nothing is ever counted twice.
import { extrasSpaces } from '@pvp/game-rules';

/** A friendly error with a stable code (core.js turns it into an AccountError). */
export class BarError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BarError';
    this.code = code;
  }
}
const fail = (code, message) => { throw new BarError(code, message); };

const isPosInt = n => Number.isInteger(n) && n > 0;

/** How many slots the fast bar has: the rules' MAX_SLOTS (5), or 5. */
export function barSize(rules) {
  return isPosInt(rules?.MAX_SLOTS) ? rules.MAX_SLOTS : 5;
}

/** An empty fast bar. */
export const emptyBar = rules => Array.from({ length: barSize(rules) }, () => null);

/** The extras spaces of these rules: [{ space, kind, id, max }] (shield, potion, one per bomb). */
export const spacesOf = rules => extrasSpaces(rules ?? {});

/** An empty extras bar: { shield: null, potion: null, bomb: null, legendarybomb: null }. */
export const emptyExtras = rules => Object.fromEntries(spacesOf(rules).map(s => [s.space, null]));

const potionId = rules => (rules?.POTION && typeof rules.POTION.id === 'string' ? rules.POTION.id : undefined);
const weaponDef = (rules, id) => (typeof id === 'string' && rules?.WEAPONS && Object.hasOwn(rules.WEAPONS, id) ? rules.WEAPONS[id] : undefined);
const bombDef = (rules, id) => (typeof id === 'string' && rules?.BOMBS && Object.hasOwn(rules.BOMBS, id) ? rules.BOMBS[id] : undefined);

/** Is this a shield (a weapon worn on the other arm)? */
export const isShieldItem = (rules, kind, id) => kind === 'weapon' && weaponDef(rules, id)?.type === 'shield';

/** Is this a hand weapon (a sword or a gun: the only things the fast bar takes)? */
export const isHandWeapon = (rules, kind, id) => kind === 'weapon' && !!weaponDef(rules, id) && !isShieldItem(rules, kind, id);

/** The extras space an item goes into ('shield', 'potion', a bomb id), or null (hand weapons, unknown items). */
export function spaceOf(rules, kind, id) {
  if (kind === 'weapon') return isShieldItem(rules, kind, id) && spacesOf(rules).some(s => s.space === 'shield') ? 'shield' : null;
  const s = spacesOf(rules).find(x => x.kind === kind && x.id === id);
  return s ? s.space : null;
}

/**
 * How many of an item fit in ONE slot or space: a weapon 1, Healing Potions MAX_POTIONS (3), a bomb its
 * maxCarry (Bomb 5, Legendary Bomb 3). 0 means the item is unknown.
 */
export function stackMax(rules, kind, id) {
  if (kind === 'weapon') return weaponDef(rules, id) ? 1 : 0;
  if (kind === 'potion') return id !== undefined && id === potionId(rules) && isPosInt(rules.MAX_POTIONS) ? rules.MAX_POTIONS : 0;
  if (kind === 'bomb') { const m = bombDef(rules, id)?.maxCarry; return isPosInt(m) ? m : 0; }
  return 0;
}

/** How many of an item are in the Inventory (not counting the bars). */
export function inventoryCount(rec, kind, id) {
  let n = 0;
  if (kind === 'weapon') n = rec.stash?.[id];
  else if (kind === 'potion') n = rec.potions;
  else if (kind === 'bomb') n = rec.bombs?.[id];
  return isPosInt(n) ? n : 0;
}

function inventoryAdd(rec, kind, id, n) {
  if (!isPosInt(n)) return;
  if (kind === 'weapon') rec.stash[id] = (rec.stash[id] || 0) + n;
  else if (kind === 'potion') rec.potions = (rec.potions || 0) + n;
  else if (kind === 'bomb') rec.bombs[id] = (rec.bombs[id] || 0) + n;
}

function inventoryTake(rec, kind, id, n) {
  if (kind === 'weapon') { rec.stash[id] -= n; if (!rec.stash[id]) delete rec.stash[id]; }
  else if (kind === 'potion') rec.potions -= n;
  else if (kind === 'bomb') rec.bombs[id] -= n;
}

const sameItem = (e, kind, id) => e != null && e.kind === kind && e.id === id;
const copyEntry = e => (e ? { kind: e.kind, id: e.id, n: e.n } : null);

/** A copy of a fast bar (safe to send). */
export const copyBar = bar => bar.map(copyEntry);

/** A copy of an extras bar (safe to send). */
export const copyExtras = extras => Object.fromEntries(Object.entries(extras ?? {}).map(([k, e]) => [k, copyEntry(e)]));

// Put up to n of an item into its extras space (if it fits); returns how many did not fit.
function fillSpace(rec, rules, kind, id, n) {
  const space = spaceOf(rules, kind, id);
  if (!space) return n;
  const cur = rec.extras[space];
  if (cur != null && !sameItem(cur, kind, id)) return n;
  const now = cur ? cur.n : 0;
  const k = Math.min(n, stackMax(rules, kind, id) - now);
  if (k > 0) rec.extras[space] = { kind, id, n: now + k };
  return n - Math.max(0, k);
}

/**
 * Make the saved bars safe (on load): right size, known items only, counts capped, hand weapons in the
 * fast bar, each extra in its own space. Old saves (before #50) had shields, potions and bombs in fast-bar
 * slots: they MOVE into their extras space. Anything that does not fit goes back into the Inventory (never
 * lost); items no longer in the game are dropped. Changes rec.bar and rec.extras in place.
 */
export function cleanBar(rec, rules) {
  const size = barSize(rules);
  const extra = [];
  // the extras bar first (a saved one wins over old fast-bar items)
  const oldExtras = rec.extras && typeof rec.extras === 'object' && !Array.isArray(rec.extras) ? rec.extras : {};
  rec.extras = emptyExtras(rules);
  for (const s of spacesOf(rules)) {
    const e = Object.hasOwn(oldExtras, s.space) ? oldExtras[s.space] : null;
    if (!e || typeof e !== 'object') continue;
    const max = stackMax(rules, e.kind, e.id);
    if (!max) continue;
    const n = isPosInt(e.n) ? e.n : (e.kind === 'weapon' ? 1 : 0);
    if (!n) continue;
    const left = spaceOf(rules, e.kind, e.id) === s.space ? fillSpace(rec, rules, e.kind, e.id, n) : n;
    if (left > 0) extra.push([e.kind, e.id, left]);
  }
  // then the fast bar: hand weapons stay in their slot, extras move to their space
  const old = Array.isArray(rec.bar) ? rec.bar : [];
  const bar = emptyBar(rules);
  old.forEach((e, i) => {
    if (!e || typeof e !== 'object') return;
    const { kind, id } = e;
    const max = stackMax(rules, kind, id);
    if (!max) return; // not in the game any more
    let n = isPosInt(e.n) ? e.n : (kind === 'weapon' ? 1 : 0);
    if (!n) return;
    if (isHandWeapon(rules, kind, id)) {
      if (i < size) { bar[i] = { kind, id, n: 1 }; n -= 1; }
    } else n = fillSpace(rec, rules, kind, id, n);
    if (n > 0) extra.push([kind, id, n]);
  });
  rec.bar = bar;
  for (const [kind, id, n] of extra) inventoryAdd(rec, kind, id, n);
  // the remembered layouts (for refilling after a match): old extras plans move to lastExtras
  if (rec.lastBar !== undefined && !Array.isArray(rec.lastBar)) delete rec.lastBar;
  if (rec.lastExtras !== undefined && (!rec.lastExtras || typeof rec.lastExtras !== 'object' || Array.isArray(rec.lastExtras))) delete rec.lastExtras;
  if (Array.isArray(rec.lastBar)) {
    rec.lastBar = rec.lastBar.map(plan => {
      if (!plan || typeof plan !== 'object') return null;
      if (isHandWeapon(rules, plan.kind, plan.id)) return { kind: plan.kind, id: plan.id, n: 1 };
      const space = spaceOf(rules, plan.kind, plan.id);
      if (space && isPosInt(plan.n)) {
        rec.lastExtras ??= {};
        rec.lastExtras[space] ??= { kind: plan.kind, id: plan.id, n: plan.n };
      }
      return null;
    });
  }
  return rec.bar;
}

const byPrice = (rules, defOf) => (x, y) => (defOf(rules, y)?.price ?? 0) - (defOf(rules, x)?.price ?? 0) || (x < y ? -1 : x > y ? 1 : 0);

/**
 * For accounts saved before the bar existed: fill the bars like the old automatic pick, so the first match
 * feels the same. Fast bar: the best (most expensive) hand weapons. Extras: the best shield, the Healing
 * Potions (up to 3) and each bomb (up to its maxCarry). The items move out of the Inventory.
 */
export function autoFillBar(rec, rules) {
  const size = barSize(rules);
  rec.extras = emptyExtras(rules);
  const weapons = Object.keys(rec.stash ?? {}).filter(id => inventoryCount(rec, 'weapon', id) > 0 && weaponDef(rules, id))
    .sort(byPrice(rules, weaponDef));
  const hand = [];
  for (const id of weapons.filter(id => isHandWeapon(rules, 'weapon', id))) for (let i = 0; i < inventoryCount(rec, 'weapon', id); i++) hand.push(id);
  const bar = emptyBar(rules);
  hand.slice(0, size).forEach((id, i) => { bar[i] = { kind: 'weapon', id, n: 1 }; inventoryTake(rec, 'weapon', id, 1); });
  rec.bar = bar;
  const shield = weapons.find(id => isShieldItem(rules, 'weapon', id));
  const extras = [];
  if (shield) extras.push(['weapon', shield]);
  const pid = potionId(rules);
  if (pid) extras.push(['potion', pid]);
  for (const id of Object.keys(rules.BOMBS ?? {})) extras.push(['bomb', id]);
  for (const [kind, id] of extras) {
    const have = inventoryCount(rec, kind, id);
    if (!have || !spaceOf(rules, kind, id)) continue;
    const want = Math.min(have, stackMax(rules, kind, id));
    const put = want - fillSpace(rec, rules, kind, id, want);
    if (put > 0) inventoryTake(rec, kind, id, put);
  }
  return bar;
}

function checkCount(n) {
  if (n !== undefined && n !== null && !isPosInt(n)) fail('BAD_COUNT', 'Pick how many (1 or more)');
}

/**
 * Move an item from the Inventory into its bar: a hand weapon into the fast bar, a shield, potion or bomb
 * into its extras space (putInExtras). Hand weapons: opts.slot = the fast-bar slot (0-based; default the
 * first empty one). Returns the fast-bar slot (a number) or the extras space (a string).
 * Throws BarError: UNKNOWN_ITEM, NOT_OWNED, BAD_SLOT, SLOT_TAKEN, BAR_FULL (and putInExtras' errors).
 */
export function putInBar(rec, rules, kind, id, opts = {}) {
  if (!stackMax(rules, kind, id)) fail('UNKNOWN_ITEM', 'That item is not in the game');
  if (!isHandWeapon(rules, kind, id)) return putInExtras(rec, rules, kind, id, opts);
  const { slot, n } = opts ?? {};
  checkCount(n);
  if (inventoryCount(rec, kind, id) < 1) fail('NOT_OWNED', "You don't have that in your Inventory");
  const bar = rec.bar;
  if (slot !== undefined && slot !== null && !(Number.isInteger(slot) && slot >= 0 && slot < bar.length)) fail('BAD_SLOT', 'That bar slot does not exist');
  if (isPosInt(n) && n > 1) fail('STACK_FULL', 'Only 1 weapon fits in one slot');
  let target = Number.isInteger(slot) ? slot : bar.findIndex(e => e == null);
  if (target < 0) fail('BAR_FULL', 'Your bar is full. Tap a bar slot to put it back first');
  if (bar[target] != null) fail('SLOT_TAKEN', 'That bar slot is taken. Tap it to empty it first');
  inventoryTake(rec, kind, id, 1);
  bar[target] = { kind, id, n: 1 };
  return target;
}

/**
 * Move a shield, Healing Potions or a bomb from the Inventory into its extras space. opts.n: how many
 * (default: as many as fit, so one tap fills the space). Returns the space ('shield', 'potion', a bomb id).
 * Throws BarError: UNKNOWN_ITEM, NOT_EXTRA (a hand weapon), NOT_OWNED, BAD_COUNT, ONE_SHIELD, STACK_FULL.
 */
export function putInExtras(rec, rules, kind, id, { n } = {}) {
  const max = stackMax(rules, kind, id);
  if (!max) fail('UNKNOWN_ITEM', 'That item is not in the game');
  const space = spaceOf(rules, kind, id);
  if (!space) fail('NOT_EXTRA', 'Weapons go in the fast bar');
  checkCount(n);
  const have = inventoryCount(rec, kind, id);
  if (have < 1) fail('NOT_OWNED', "You don't have that in your Inventory");
  const cur = rec.extras[space];
  if (cur != null && !sameItem(cur, kind, id)) fail('ONE_SHIELD', 'Only one shield fits on your arm. Tap it to put it back first');
  const now = cur ? cur.n : 0;
  const room = max - now;
  if (room <= 0) fail('STACK_FULL', max === 1 ? 'Your shield space is full. Tap it to put it back first' : `Only ${max} fit in that space`);
  const want = isPosInt(n) ? n : Math.min(have, room);
  if (want > have) fail('NOT_OWNED', `You only have ${have}`);
  if (want > room) fail('STACK_FULL', `Only ${max} fit in that space`);
  inventoryTake(rec, kind, id, want);
  rec.extras[space] = { kind, id, n: now + want };
  return space;
}

/** Move a fast-bar slot back into the Inventory. Throws BarError BAD_SLOT or EMPTY_SLOT. */
export function takeFromBar(rec, slot) {
  const bar = rec.bar;
  if (!(Number.isInteger(slot) && slot >= 0 && slot < bar.length)) fail('BAD_SLOT', 'That bar slot does not exist');
  const e = bar[slot];
  if (!e) fail('EMPTY_SLOT', 'That bar slot is empty');
  bar[slot] = null;
  inventoryAdd(rec, e.kind, e.id, e.n);
  return e;
}

/** Move an extras space ('shield', 'potion', a bomb id) back into the Inventory (all of it). Throws BAD_SPACE or EMPTY_SLOT. */
export function takeFromExtras(rec, space) {
  if (typeof space !== 'string' || !rec.extras || !Object.hasOwn(rec.extras, space)) fail('BAD_SPACE', 'That extras space does not exist');
  const e = rec.extras[space];
  if (!e) fail('EMPTY_SLOT', 'That space is empty');
  rec.extras[space] = null;
  inventoryAdd(rec, e.kind, e.id, e.n);
  return e;
}

/**
 * Joining the arena: everything in the fast bar and the extras bar goes along, nothing else. Both are
 * emptied (the layouts are remembered in rec.lastBar / rec.lastExtras, so what survives can go back).
 * Returns { loadout, potions, bombs, starter }:
 *   loadout  weapon ids: the hand weapons in bar order, then the shield, for arena.join
 *   potions  how many Healing Potions; bombs { bombId: count } (every bomb of the rules)
 *   starter  true when the fast bar has no hand weapon: then the free starting Gun comes like before
 */
export function takeBar(rec, rules) {
  const hand = rec.bar.filter(e => e && isHandWeapon(rules, e.kind, e.id)).map(e => e.id);
  const ex = rec.extras ?? {};
  let potions = 0;
  const bombs = Object.fromEntries(Object.keys(rules.BOMBS ?? {}).map(id => [id, 0]));
  const loadout = [...hand];
  for (const e of Object.values(ex)) {
    if (!e) continue;
    if (e.kind === 'weapon') loadout.push(e.id);
    else if (e.kind === 'potion') potions += e.n;
    else if (e.kind === 'bomb') bombs[e.id] = (bombs[e.id] || 0) + e.n;
  }
  rec.lastBar = copyBar(rec.bar);
  rec.lastExtras = copyExtras(ex);
  rec.bar = emptyBar(rules);
  rec.extras = emptyExtras(rules);
  return { loadout, potions, bombs, starter: hand.length === 0 };
}

/**
 * Back from the arena (left alive), or things the arena did not take: they go back into the fast-bar slots
 * and extras spaces they came from (when those are still empty: see rec.lastBar / rec.lastExtras), the rest
 * into the Inventory (loot from chests too).
 * items: { weapons: [ids], potions: n, bombs: { id: n } }; unknown ids and bad counts are ignored.
 * opts.refill = false puts everything into the Inventory.
 */
export function returnToAccount(rec, rules, { weapons = [], potions = 0, bombs = {} } = {}, { refill = true } = {}) {
  const left = [];
  for (const id of Array.isArray(weapons) ? weapons : []) if (weaponDef(rules, id)) left.push(id);
  const pid = potionId(rules);
  let pots = pid && isPosInt(potions) ? potions : 0;
  const bombsLeft = {};
  for (const id of Object.keys(rules.BOMBS ?? {})) { const n = bombs?.[id]; bombsLeft[id] = isPosInt(n) ? n : 0; }
  const takeWeapon = id => { const j = left.indexOf(id); if (j < 0) return 0; left.splice(j, 1); return 1; };

  if (refill && Array.isArray(rec.lastBar)) {
    rec.lastBar.forEach((plan, i) => {
      if (!plan || i >= rec.bar.length || rec.bar[i] != null || !isHandWeapon(rules, plan.kind, plan.id)) return;
      if (takeWeapon(plan.id)) rec.bar[i] = { kind: 'weapon', id: plan.id, n: 1 };
    });
  }
  if (refill && rec.lastExtras && typeof rec.lastExtras === 'object') {
    for (const [space, plan] of Object.entries(rec.lastExtras)) {
      if (!plan || !Object.hasOwn(rec.extras, space) || rec.extras[space] != null || spaceOf(rules, plan.kind, plan.id) !== space) continue;
      let n = 0;
      const cap = Math.min(isPosInt(plan.n) ? plan.n : 1, stackMax(rules, plan.kind, plan.id));
      if (plan.kind === 'weapon') n = takeWeapon(plan.id);
      else if (plan.kind === 'potion' && plan.id === pid) { n = Math.min(pots, cap); pots -= n; }
      else if (plan.kind === 'bomb' && Object.hasOwn(bombsLeft, plan.id)) { n = Math.min(bombsLeft[plan.id], cap); bombsLeft[plan.id] -= n; }
      if (n > 0) rec.extras[space] = { kind: plan.kind, id: plan.id, n };
    }
  }
  for (const id of left) inventoryAdd(rec, 'weapon', id, 1);
  if (pots) inventoryAdd(rec, 'potion', pid, pots);
  for (const [id, n] of Object.entries(bombsLeft)) inventoryAdd(rec, 'bomb', id, n);
}
