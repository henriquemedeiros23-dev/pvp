// The Healing Potion button (#28): how many potions you carry and the drinking progress ring.
// Pure functions: time is passed in (any clock, e.g. performance.now() in the browser).
import { RULES } from '@pvp/game-rules';

const clamp01 = v => Math.max(0, Math.min(1, v));

/**
 * The flask from the boss's drawing as a small SVG (64x64 viewBox): narrow neck with a cork on top,
 * wide cone-shaped bottom, filled with red liquid. Used for the HUD button and the shop card.
 */
export const POTION_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">'
  + '<rect class="cork" x="26" y="3" width="12" height="9" rx="2.5" fill="#b9814a" stroke="#5a3a1c" stroke-width="2"/>' // cork
  + '<path d="M27.5 12 H36.5 V27 L52.5 55 Q54 59 49.5 59 H14.5 Q10 59 11.5 55 L27.5 27 Z" fill="rgba(215,238,255,0.35)"/>' // glass
  + '<path class="liquid" d="M22.2 36 H41.8 L52.5 55 Q54 59 49.5 59 H14.5 Q10 59 11.5 55 Z" fill="#e3262f"/>' // red liquid
  + '<path d="M22.2 36 H41.8 L43.4 38.8 H20.6 Z" fill="#ff6b6b"/>' // liquid surface
  + '<path d="M17 54 L24.5 41" stroke="rgba(255,255,255,0.55)" stroke-width="2.5" stroke-linecap="round"/>' // shine
  + '<path d="M27.5 12 H36.5 V27 L52.5 55 Q54 59 49.5 59 H14.5 Q10 59 11.5 55 L27.5 27 Z" fill="none" stroke="#1d2330" stroke-width="2.6" stroke-linejoin="round"/>'
  + '</svg>';

/**
 * Follow the server's 'drink' messages: returns the drinking in progress ({ startedAt, ms }) or null.
 * 'start' starts it at `now` (your clock) for msg.ms; 'done' and 'cancel' end it. Other messages keep `prev`.
 */
export function drinkState(prev, msg, now) {
  if (!msg || msg.t !== 'drink') return prev ?? null;
  if (msg.state === 'start' && Number.isFinite(msg.ms) && msg.ms > 0 && Number.isFinite(now)) return { startedAt: now, ms: msg.ms };
  return null;
}

/** Short toast text for a 'drink' message: '' for start, 'Full H.P!' when done, 'Potion wasted!' when cancelled. */
export function drinkMessage(msg) {
  if (!msg || msg.t !== 'drink') return '';
  return msg.state === 'done' ? 'Full H.P!' : msg.state === 'cancel' ? 'Potion wasted!' : '';
}

/**
 * The potion button next to the H.P bar.
 * inv: the 'inv' message ({ potions, hp }); opts: { drink (from drinkState), now, hp (overrides inv.hp), key }.
 * Returns { count, max, label, empty, full, canDrink, drinking, progress, percent, secondsLeft, text, title, key }.
 * - progress 0..1 while drinking (the ring fills up), percent the same in %, secondsLeft rounded up to 0.1 s
 * - canDrink: you have a potion, are not drinking and are not at full health
 */
export function potionView(inv, { drink = null, now = 0, hp, key = 'Q' } = {}, rules = RULES) {
  const max = Number.isInteger(rules.MAX_POTIONS) ? rules.MAX_POTIONS : 3;
  const maxHp = Number.isInteger(rules.MAX_HP) && rules.MAX_HP > 0 ? rules.MAX_HP : 100;
  const n = Number(inv?.potions);
  const count = Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
  const health = Number.isFinite(hp) ? hp : Number.isFinite(inv?.hp) ? inv.hp : maxHp;
  const drinking = !!(drink && Number.isFinite(drink.startedAt) && drink.ms > 0);
  const progress = drinking ? clamp01((now - drink.startedAt) / drink.ms) : 0;
  const secondsLeft = drinking ? Math.max(0, Math.ceil(((1 - progress) * drink.ms) / 100) / 10) : 0;
  const name = rules.POTION?.name ?? 'Healing Potion';
  const secs = rules.POTION?.drinkMs ? rules.POTION.drinkMs / 1000 : 5;
  return {
    count, max, label: String(count), empty: count === 0, full: count >= max,
    canDrink: count > 0 && !drinking && health < maxHp,
    drinking, progress, percent: Math.round(progress * 100), secondsLeft,
    text: drinking ? `Drinking… ${secondsLeft.toFixed(1)} s` : '',
    title: `${name} (${key}): full H.P in ${secs} s · ${count}/${max}`,
    key,
  };
}
