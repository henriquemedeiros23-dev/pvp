// Which sounds a PvP Island server message makes (messages from @pvp/net-protocol). Pure: the game passes in
// what it knows (my id, who holds which weapon, where the chests are).
import { WEAPONS } from '@pvp/game-rules';

/** The shot sound of each gun. Other guns use 'gun'. */
export const GUN_SOUNDS = Object.freeze({ gun: 'gun', shootbm: 'shootbm', dmgun: 'dmgun', supergun: 'supergun' });
/** Swords with their own hit sound. Other swords use 'swordHit'. */
export const MELEE_HIT_SOUNDS = Object.freeze({ icesword: 'iceHit', electricsword: 'zapHit' });
/** Bombs with their own explosion. Other bombs use 'boom'. */
export const BOOM_SOUNDS = Object.freeze({ legendarybomb: 'bigBoom' });

const typeOf = id => (id && Object.hasOwn(WEAPONS, id) ? WEAPONS[id].type : null);

/** The sound of shooting this weapon. */
export function gunSound(weapon) {
  return Object.hasOwn(GUN_SOUNDS, weapon ?? '') ? GUN_SOUNDS[weapon] : 'gun';
}

/** The sound when you hit someone with this weapon in your hand. */
export function hitSound(weapon) {
  if (Object.hasOwn(MELEE_HIT_SOUNDS, weapon ?? '')) return MELEE_HIT_SOUNDS[weapon];
  return typeOf(weapon) === 'melee' ? 'swordHit' : 'hitmark';
}

/**
 * Sounds for one server message.
 * @param m    a decoded server message ({ t, ... })
 * @param ctx  { myId, weaponOf(id) -> weapon id in that player's hand, chestPos(i) -> { x, z }, chestOpen(i) -> bool,
 *              golden -> the golden chest spot { x, z } before this message, or null }
 * @returns [{ sound, id?, pos?, delayMs? }]: `id` = at that player (no id and no pos = my own sound, in the middle)
 */
export function soundEventsFor(m, ctx = {}) {
  if (!m || typeof m.t !== 'string') return [];
  const mine = id => id === ctx.myId;
  const at = id => (mine(id) ? {} : { id }); // my own sounds play in the middle at full loudness
  const chest = i => { const c = ctx.chestPos?.(i); return c ? { pos: [c.x, 0.5, c.z] } : {}; };
  switch (m.t) {
    case 'shot': return [{ sound: gunSound(m.w), ...(mine(m.id) ? {} : { id: m.id, pos: m.from }) }];
    case 'swing': return [{ sound: 'swing', ...at(m.id) }];
    case 'hitmark':
      if (m.blocked) return [{ sound: 'shieldBlock' }];
      if (m.head) return [{ sound: 'headshot' }];
      if (m.dead) return [{ sound: hitSound(ctx.weaponOf?.(ctx.myId)) }, { sound: 'knockout' }];
      return [{ sound: hitSound(ctx.weaponOf?.(ctx.myId)) }];
    case 'dmg':
      if (m.blocked) return [{ sound: 'shieldBlock', ...at(m.id) }];
      if (m.shock) return [{ sound: 'zap', ...at(m.id) }];
      if (m.ko) return [{ sound: 'knockout', ...at(m.id) }];
      if (mine(m.id)) return [{ sound: 'hurt' }];
      return [{ sound: m.head ? 'headshot' : 'hit', id: m.id }];
    case 'block': return [{ sound: 'shieldBlock', ...at(m.id) }];
    case 'ko': return [{ sound: 'knockout', ...(mine(m.id) ? {} : { pos: [m.x, m.y, m.z] }) }];
    case 'shieldbroke': case 'broke': return [{ sound: 'weaponBreak' }];
    case 'bomb': {
      const out = [{ sound: 'bombThrow', ...(mine(m.by) ? {} : { pos: m.from }) }];
      if (m.ms > m.fly) out.push({ sound: 'fuse', pos: m.to, delayMs: m.fly });
      return out;
    }
    case 'boom': return [{ sound: Object.hasOwn(BOOM_SOUNDS, m.b) ? BOOM_SOUNDS[m.b] : 'boom', pos: [m.x, m.y, m.z] }];
    case 'chest': return m.open && !ctx.chestOpen?.(m.id) ? [{ sound: 'chestOpen', ...chest(m.id) }] : [];
    case 'golden':
      if (m.golden && !m.quiet) return [{ sound: 'goldenAppear' }];
      if (!m.golden && m.by && ctx.golden) return [{ sound: 'goldenChest', pos: [ctx.golden.x, 0.5, ctx.golden.z] }];
      return [];
    case 'coins': return m.amount > 0 ? [{ sound: 'coins' }] : [];
    case 'drink':
      if (m.state === 'start') return [{ sound: 'drink' }];
      if (m.state === 'done') return [{ sound: 'heal' }];
      return [];
    case 'inv': return m.picked ? [{ sound: 'pickup' }] : [];
    default: return [];
  }
}
