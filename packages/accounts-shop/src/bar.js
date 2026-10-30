// The fast bar (#39): the few things a player takes into the arena. Everything else stays safe in the
// Inventory (the stash, potions and bombs counters of the account).
// Pure functions on a plain account record { stash, potions, bombs, bar, lastBar } and the rules.
// No clock, no random: same record and same calls give the same result.
//
// A bar is an array of BAR_SLOTS (the rules' MAX_SLOTS, 5) slots. Each slot is null (empty) or one entry
//   { kind: 'weapon', id, n: 1 }   one weapon copy (a shield is a weapon too: at most ONE shield in the bar)
//   { kind: 'potion', id, n }      a stack of Healing Potions, n up to MAX_POTIONS (one potion slot)
//   { kind: 'bomb',   id, n }      a stack of one bomb, n up to its maxCarry (one slot per bomb)
// Things in the bar are NOT in the Inventory any more (they were moved), so nothing is ever counted twice.

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

/** How many slots the bar has: the rules' MAX_SLOTS (5), or 5. */
export function barSize(rules) {
  return isPosInt(rules?.MAX_SLOTS) ? rules.MAX_SLOTS : 5;
}

/** An empty bar. */
export const emptyBar = rules => Array.from({ length: barSize(rules) }, () => null);

const potionId = rules => (rules?.POTION && typeof rules.POTION.id === 'string' ? rules.POTION.id : undefined);
const weaponDef = (rules, id) => (typeof id === 'string' && rules?.WEAPONS && Object.hasOwn(rules.WEAPONS, id) ? rules.WEAPONS[id] : undefined);
const bombDef = (rules, id) => (typeof id === 'string' && rules?.BOMBS && Object.hasOwn(rules.BOMBS, id) ? rules.BOMBS[id] : undefined);

/** Is this a shield (a weapon worn on the other arm)? */
export const isShieldItem = (rules, kind, id) => kind === 'weapon' && weaponDef(rules, id)?.type === 'shield';

/**
 * How many of an item fit in ONE bar slot: a weapon 1, Healing Potions MAX_POTIONS (3), a bomb its
 * maxCarry (Bomb 5, Legendary Bomb 3). 0 means the item is unknown (or can't go in the bar).
 */
export function stackMax(rules, kind, id) {
  if (kind === 'weapon') return weaponDef(rules, id) ? 1 : 0;
  if (kind === 'potion') return id !== undefined && id === potionId(rules) && isPosInt(rules.MAX_POTIONS) ? rules.MAX_POTIONS : 0;
  if (kind === 'bomb') { const m = bombDef(rules, id)?.maxCarry; return isPosInt(m) ? m : 0; }
  return 0;
}

/** How many of an item are in the Inventory (not counting the bar). */
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
// Slots that may hold only one stack/copy in the whole bar: one shield, one potion stack, one stack per bomb.
const uniqueInBar = (rules, kind, id) => kind !== 'weapon' || isShieldItem(rules, kind, id);
const clashes = (rules, e, kind, id) => e != null && (isShieldItem(rules, kind, id) ? isShieldItem(rules, e.kind, e.id) : sameItem(e, kind, id));

/** A copy of a bar (safe to send). */
export const copyBar = bar => bar.map(e => (e ? { kind: e.kind, id: e.id, n: e.n } : null));

/**
 * Make a saved bar safe (on load): right size, known items only, counts capped, at most one shield,
 * one potion stack and one stack per bomb. Anything that does not fit goes back into the Inventory
 * (never lost); items no longer in the game are dropped. Changes rec.bar in place.
 */
export function cleanBar(rec, rules) {
  const size = barSize(rules);
  const old = Array.isArray(rec.bar) ? rec.bar : [];
  const bar = emptyBar(rules);
  const extra = [];
  old.forEach((e, i) => {
    if (!e || typeof e !== 'object') return;
    const { kind, id } = e;
    const max = stackMax(rules, kind, id);
    if (!max) return; // not in the game any more
    let n = isPosInt(e.n) ? e.n : (kind === 'weapon' ? 1 : 0);
    if (!n) return;
    const keep = i < size && !(uniqueInBar(rules, kind, id) && bar.some(o => clashes(rules, o, kind, id)));
    if (keep) {
      const k = Math.min(n, max);
      bar[i] = { kind, id, n: k };
      n -= k;
    }
    if (n > 0) extra.push([kind, id, n]);
  });
  rec.bar = bar;
  for (const [kind, id, n] of extra) inventoryAdd(rec, kind, id, n);
  if (rec.lastBar !== undefined && !Array.isArray(rec.lastBar)) delete rec.lastBar;
  return rec.bar;
}

const byPrice = (rules, defOf) => (x, y) => (defOf(rules, y)?.price ?? 0) - (defOf(rules, x)?.price ?? 0) || (x < y ? -1 : x > y ? 1 : 0);

/**
 * For accounts saved before the bar existed: fill a bar like the old automatic pick, so the first match
 * feels the same. Up to 2 best (most expensive) weapons, the best shield, the Healing Potions (up to 3),
 * the bombs (most expensive first), then more weapons while slots are free. Weapons come first in the bar
 * (they become the arena's weapon slots in this order). The items move out of the Inventory.
 */
export function autoFillBar(rec, rules) {
  const size = barSize(rules);
  const weapons = Object.keys(rec.stash ?? {}).filter(id => inventoryCount(rec, 'weapon', id) > 0 && weaponDef(rules, id))
    .sort(byPrice(rules, weaponDef));
  const hand = [];
  for (const id of weapons.filter(id => !isShieldItem(rules, 'weapon', id))) for (let i = 0; i < inventoryCount(rec, 'weapon', id); i++) hand.push(id);
  const shield = weapons.find(id => isShieldItem(rules, 'weapon', id));
  const extras = [];
  if (shield) extras.push(['weapon', shield]);
  const pid = potionId(rules);
  if (pid && inventoryCount(rec, 'potion', pid) > 0 && stackMax(rules, 'potion', pid)) extras.push(['potion', pid]);
  const bombs = Object.keys(rules.BOMBS ?? {}).filter(id => inventoryCount(rec, 'bomb', id) > 0).sort(byPrice(rules, bombDef));
  for (const id of bombs) extras.push(['bomb', id]);

  const firstWeapons = hand.slice(0, 2);
  const others = extras.slice(0, Math.max(0, size - firstWeapons.length));
  const moreWeapons = hand.slice(2, 2 + Math.max(0, size - firstWeapons.length - others.length));
  const bar = emptyBar(rules);
  let slot = 0;
  for (const id of [...firstWeapons, ...moreWeapons]) bar[slot++] = { kind: 'weapon', id, n: 1 };
  for (const [kind, id] of others) bar[slot++] = { kind, id, n: Math.min(inventoryCount(rec, kind, id), stackMax(rules, kind, id)) };
  for (const e of bar) if (e) inventoryTake(rec, e.kind, e.id, e.n);
  rec.bar = bar;
  return bar;
}

/**
 * Move an item from the Inventory into the bar. opts.slot: the bar slot (0-based; default: the stack of the
 * same item if there is one, else the first empty slot). opts.n: how many (default: as many as fit).
 * A potion or bomb that is already in the bar always stacks onto that slot. Returns the slot used.
 * Throws BarError: UNKNOWN_ITEM, NOT_OWNED, BAD_SLOT, BAD_COUNT, SLOT_TAKEN, BAR_FULL, STACK_FULL, ONE_SHIELD.
 */
export function putInBar(rec, rules, kind, id, { slot, n } = {}) {
  const max = stackMax(rules, kind, id);
  if (!max) fail('UNKNOWN_ITEM', 'That item is not in the game');
  const have = inventoryCount(rec, kind, id);
  if (have < 1) fail('NOT_OWNED', "You don't have that in your Inventory");
  const bar = rec.bar;
  if (slot !== undefined && slot !== null && !(Number.isInteger(slot) && slot >= 0 && slot < bar.length)) fail('BAD_SLOT', 'That bar slot does not exist');
  if (n !== undefined && n !== null && !isPosInt(n)) fail('BAD_COUNT', 'Pick how many (1 or more)');

  let target = Number.isInteger(slot) ? slot : -1;
  if (isShieldItem(rules, kind, id)) {
    const other = bar.findIndex(e => isShieldItem(rules, e?.kind, e?.id));
    if (other >= 0 && other !== target) fail('ONE_SHIELD', 'Only one shield fits on your arm');
  } else if (uniqueInBar(rules, kind, id)) {
    const stack = bar.findIndex(e => sameItem(e, kind, id));
    if (stack >= 0) target = stack; // potions and bombs: always one stack
  }
  if (target < 0) {
    target = bar.findIndex(e => e == null);
    if (target < 0) fail('BAR_FULL', 'Your bar is full. Tap a bar slot to put it back first');
  }
  const cur = bar[target];
  if (cur != null && !sameItem(cur, kind, id)) fail('SLOT_TAKEN', 'That bar slot is taken. Tap it to empty it first');
  const now = cur ? cur.n : 0;
  const room = max - now;
  if (room <= 0) fail('STACK_FULL', max === 1 ? 'That bar slot is taken. Tap it to empty it first' : `Only ${max} fit in one slot`);
  const want = isPosInt(n) ? n : Math.min(have, room);
  if (want > have) fail('NOT_OWNED', `You only have ${have}`);
  if (want > room) fail('STACK_FULL', `Only ${max} fit in one slot`);
  inventoryTake(rec, kind, id, want);
  bar[target] = { kind, id, n: now + want };
  return target;
}

/** Move a bar slot back into the Inventory (all of it). Throws BarError BAD_SLOT or EMPTY_SLOT. */
export function takeFromBar(rec, slot) {
  const bar = rec.bar;
  if (!(Number.isInteger(slot) && slot >= 0 && slot < bar.length)) fail('BAD_SLOT', 'That bar slot does not exist');
  const e = bar[slot];
  if (!e) fail('EMPTY_SLOT', 'That bar slot is empty');
  bar[slot] = null;
  inventoryAdd(rec, e.kind, e.id, e.n);
  return e;
}

/**
 * Joining the arena: everything in the bar goes along, nothing else. The bar is emptied (the layout is
 * remembered in rec.lastBar, so what survives can go back into the same slots).
 * Returns { loadout, potions, bombs, starter }:
 *   loadout  weapon ids in bar order (hand weapons, then the shield), for arena.join
 *   potions  how many Healing Potions; bombs { bombId: count } (every bomb of the rules)
 *   starter  true when the bar has no hand weapon: then the free starting Gun comes like before
 */
export function takeBar(rec, rules) {
  const bar = rec.bar;
  const hand = [], shields = [];
  let potions = 0;
  const bombs = Object.fromEntries(Object.keys(rules.BOMBS ?? {}).map(id => [id, 0]));
  for (const e of bar) {
    if (!e) continue;
    if (e.kind === 'weapon') (isShieldItem(rules, e.kind, e.id) ? shields : hand).push(e.id);
    else if (e.kind === 'potion') potions += e.n;
    else if (e.kind === 'bomb') bombs[e.id] = (bombs[e.id] || 0) + e.n;
  }
  rec.lastBar = copyBar(bar);
  rec.bar = emptyBar(rules);
  return { loadout: [...hand, ...shields], potions, bombs, starter: hand.length === 0 };
}

/**
 * Back from the arena (left alive), or things the arena did not take: they go back into the bar slots they
 * came from (when those are still empty: see rec.lastBar), the rest into the Inventory (loot from chests too).
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

  if (refill && Array.isArray(rec.lastBar)) {
    rec.lastBar.forEach((plan, i) => {
      if (!plan || i >= rec.bar.length || rec.bar[i] != null) return;
      const { kind, id } = plan;
      if (uniqueInBar(rules, kind, id) && rec.bar.some(e => clashes(rules, e, kind, id))) return;
      let n = 0;
      if (kind === 'weapon') { const j = left.indexOf(id); if (j >= 0) { left.splice(j, 1); n = 1; } }
      else if (kind === 'potion' && id === pid) { n = Math.min(pots, plan.n, stackMax(rules, kind, id)); pots -= n; }
      else if (kind === 'bomb' && Object.hasOwn(bombsLeft, id)) { n = Math.min(bombsLeft[id], plan.n, stackMax(rules, kind, id)); bombsLeft[id] -= n; }
      if (n > 0) rec.bar[i] = { kind, id, n };
    });
  }
  for (const id of left) inventoryAdd(rec, 'weapon', id, 1);
  if (pots) inventoryAdd(rec, 'potion', pid, pots);
  for (const [id, n] of Object.entries(bombsLeft)) inventoryAdd(rec, 'bomb', id, n);
}
