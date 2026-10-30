// The extras bar (#50): next to the 5-slot fast bar (hand weapons only) there is a second bar with one
// fixed space for each "extra": the shield (on the other arm), the Healing Potions and one space per bomb.
// Every space only takes its own kind of item, so an empty space can show a drawing of what goes there.
import { WEAPONS } from './weapons.js';
import { POTION, MAX_POTIONS } from './potion.js';
import { BOMBS } from './bombs.js';

const isPosInt = n => Number.isInteger(n) && n > 0;
const hasShields = weapons => Object.values(weapons ?? {}).some(w => w && w.type === 'shield');
const GAME = { WEAPONS, POTION, MAX_POTIONS, BOMBS };

/**
 * The extras spaces in screen order: [{ space, kind, id, max }]
 *   { space: 'shield', kind: 'weapon', id: null, max: 1 }        any ONE shield (Shield or Mega Shield)
 *   { space: POTION.id, kind: 'potion', id: POTION.id, max: MAX_POTIONS }
 *   { space: bombId, kind: 'bomb', id: bombId, max: maxCarry }   one space per bomb, in rules order
 * rules: { WEAPONS, POTION, MAX_POTIONS, BOMBS } (default: the game's). Missing parts give no space.
 */
export function extrasSpaces(rules = GAME) {
  const out = [];
  if (hasShields(rules.WEAPONS)) out.push({ space: 'shield', kind: 'weapon', id: null, max: 1 });
  const P = rules.POTION;
  if (P && typeof P.id === 'string' && isPosInt(rules.MAX_POTIONS)) out.push({ space: P.id, kind: 'potion', id: P.id, max: rules.MAX_POTIONS });
  for (const [id, b] of Object.entries(rules.BOMBS ?? {})) if (isPosInt(b?.maxCarry)) out.push({ space: id, kind: 'bomb', id, max: b.maxCarry });
  return out;
}

/**
 * Which extras space an item goes into: 'shield' for any shield, the potion's space, a bomb's own space,
 * or null (a hand weapon, which goes into the fast bar, or an unknown item).
 */
export function extrasSpaceOf(kind, id, rules = GAME) {
  if (typeof id !== 'string') return null;
  if (kind === 'weapon') {
    const w = rules.WEAPONS && Object.hasOwn(rules.WEAPONS, id) ? rules.WEAPONS[id] : undefined;
    return w?.type === 'shield' && extrasSpaces(rules).length ? 'shield' : null;
  }
  const s = extrasSpaces(rules).find(x => x.kind === kind && x.id === id);
  return s ? s.space : null;
}
