// The bomb buttons (#32): how many of each bomb you carry, and the round bomb icon from the boss's card.
// Pure functions of the 'inv' message and the rules.
import { RULES } from '@pvp/game-rules';

/** Keyboard key that throws each bomb (the game's controls use the same letters). */
export const BOMB_KEYS = Object.freeze({ bomb: 'B', legendarybomb: 'N' });

/**
 * A round bomb with a fuse and a spark, like the boss's card, as a small SVG (64x64 viewBox).
 * color: the bomb's body (the Bomb is black, the Legendary Bomb gold). Used for the HUD buttons and the shop.
 */
export function bombIconSvg(color = '#1b1b1f') {
  const c = /^#[0-9a-fA-F]{3,8}$/.test(String(color)) ? color : '#1b1b1f';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">'
    + '<path d="M38 16 Q44 6 52 9" fill="none" stroke="#8a6a3c" stroke-width="3.2" stroke-linecap="round"/>' // fuse
    + '<rect x="32" y="13" width="11" height="8" rx="2" transform="rotate(35 37 17)" fill="#4a4f5a" stroke="#1d2330" stroke-width="2"/>' // cap
    + `<circle cx="29" cy="38" r="20" fill="${c}" stroke="#1d2330" stroke-width="2.6"/>` // body
    + '<path d="M17 33 Q20 24 28 22" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="3" stroke-linecap="round"/>' // shine
    + '<path class="spark" d="M53 3 L55 8 L60 7 L56 11 L59 15 L54 13 L51 17 L51 12 L46 11 L51 9 Z" fill="#ffcf3a" stroke="#ff6a1a" stroke-width="1.2"/>' // spark
    + '</svg>';
}

/**
 * One view per bomb in the rules (in rules order), for the bomb buttons next to the potion button.
 * inv: the 'inv' message ({ bombs: [{ id, n }] }); missing is fine (all 0).
 * Each: { id, name, count, max, label, empty, full, key, rarity, color, title, icon }.
 */
export function bombView(inv, { keys = BOMB_KEYS } = {}, rules = RULES) {
  const carried = new Map();
  for (const e of Array.isArray(inv?.bombs) ? inv.bombs : []) {
    if (e && typeof e.id === 'string' && Number.isFinite(e.n)) carried.set(e.id, e.n);
  }
  return Object.entries(rules.BOMBS ?? {}).map(([id, b]) => {
    const max = Number.isInteger(b.maxCarry) && b.maxCarry > 0 ? b.maxCarry : 0;
    const count = Math.max(0, Math.min(max, Math.floor(carried.get(id) ?? 0)));
    const key = keys?.[id] ?? '';
    const color = b.color || '#1b1b1f';
    const hurts = b.hurtsThrower ? ' (it hurts you too!)' : '';
    return {
      id, name: b.name, count, max, label: String(count), empty: count === 0, full: count >= max, key,
      rarity: b.rarity, color,
      title: `${b.name}${key ? ` (${key})` : ''}: ${b.dmg} damage in ${b.area}x${b.area} m, up to ${b.maxThrow} m away${hurts} · ${count}/${max}`,
      icon: bombIconSvg(color),
    };
  });
}
