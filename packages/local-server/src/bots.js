// Simple bots for an arena: they wander, open chests and sometimes shoot at real players.
// They play through the arena's normal methods (join, setState, openChest, fire), like a phone would.
// Deterministic: all choices come from the seeded `random`, time is passed in to tick(now).

import { RULES } from '@pvp/game-rules';
import { movePlayer } from '@pvp/collision';
import { makeFlags } from '@pvp/net-protocol';

export const BOT_DEFAULTS = Object.freeze({
  speed: 0.8,           // part of WALK_SPEED
  chestChance: 0.6,     // when picking a new goal: go to a nearby closed chest
  chestSearch: 45,      // look for chests this far away (m)
  openAt: 2.2,          // open a chest from this close (m)
  goalTimeoutMs: 15000, // pick a new goal after this long
  shootRange: 25,       // shoot at real players this close (m)
  shootEveryMs: [1500, 3500],
  shootChance: 0.6,     // ... but only sometimes
  aimError: 0.08,       // added to each part of the aim direction
  respawnMs: 6000,      // back in the arena this long after a knockout
});

const BOT_COLORS = ['red', 'blue', 'green', 'orange', 'purple'];

/**
 * Create bots for an arena.
 * @param {object} o
 * @param {object} o.arena   from @pvp/arena createArena()
 * @param {object} o.island  the arena's island (@pvp/world-gen)
 * @param {object} o.random  a @pvp/seeded-random generator (only the bots use it)
 * @param {number} [o.count=3]
 * @param {object} [o.rules]  @pvp/game-rules RULES
 * @param {object} [o.tuning] overrides for BOT_DEFAULTS
 */
export function createBots({ arena, island, random, count = 3, rules = RULES, tuning = {} } = {}) {
  if (!arena || !island || !random) throw new TypeError('createBots needs arena, island and random');
  const T = { ...BOT_DEFAULTS, ...tuning };
  const moveOpts = {
    radius: rules.PLAYER_RADIUS, height: rules.PLAYER_HEIGHT, stepHeight: rules.STEP_HEIGHT,
    gravity: rules.GRAVITY, boundsRadius: island.playRadius,
  };
  const bots = Array.from({ length: count }, (_, i) => ({
    n: i + 1, key: `bot:${i + 1}`, name: `Bot ${i + 1}`,
    skin: { ...rules.DEFAULT_SKIN, color: BOT_COLORS[i % BOT_COLORS.length] },
    id: null, respawnAt: 0, body: null, goal: null, goalUntil: 0, nextFire: 0, ry: 0,
    checkAt: 0, checkX: 0, checkZ: 0,
  }));
  const byId = new Map();
  let last = null;

  function join(b, now) {
    const r = arena.join(b.key, { name: b.name, skin: b.skin, loadout: [], coins: 0 }, now);
    if (!r.ok) { b.respawnAt = now + T.respawnMs; return; }
    b.id = r.id;
    byId.set(r.id, b);
    const p = arena.getPlayer(r.id);
    b.body = { x: p.x, y: p.y, z: p.z, vy: 0, onGround: true };
    b.goal = null;
    b.nextFire = now + random.range(...T.shootEveryMs);
    b.checkAt = now + 1000; b.checkX = p.x; b.checkZ = p.z;
  }

  function newGoal(b, now) {
    const { x, z } = b.body;
    let goal = null;
    if (random.chance(T.chestChance)) {
      let best = T.chestSearch;
      for (const c of arena.chests()) {
        if (c.open) continue;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < best) { best = d; goal = { x: c.x, z: c.z, chest: c.id }; }
      }
    }
    if (!goal) {
      const a = random.range(0, Math.PI * 2), r = random.range(10, island.playRadius * 0.85);
      goal = { x: Math.cos(a) * r, z: Math.sin(a) * r, chest: null };
    }
    b.goal = goal;
    b.goalUntil = now + T.goalTimeoutMs;
  }

  // The nearest real (not bot) player in shooting range, or null.
  function nearestHuman(b) {
    let best = null, bestD = T.shootRange;
    for (const id of arena.playerIds()) {
      if (byId.has(id)) continue;
      const p = arena.getPlayer(id);
      const d = Math.hypot(p.x - b.body.x, p.z - b.body.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  // Hold a gun if there is one (melee from far away does nothing).
  function holdGun(b) {
    const p = arena.getPlayer(b.id);
    const isGun = w => rules.WEAPONS[w]?.type === 'gun';
    if (isGun(p.weapons[p.slot])) return true;
    const i = p.weapons.findIndex(isGun);
    if (i < 0) return false;
    arena.selectSlot(b.id, i);
    return true;
  }

  function step(b, now, dt) {
    const p = arena.getPlayer(b.id);
    Object.assign(b.body, { x: p.x, y: p.y, z: p.z }); // the arena has the last word (e.g. a 'pos' correction)
    if (!b.goal || now >= b.goalUntil) newGoal(b, now);

    const g = b.goal;
    let dx = g.x - b.body.x, dz = g.z - b.body.z;
    const dist = Math.hypot(dx, dz);
    if (g.chest != null && dist < T.openAt) { arena.openChest(b.id, g.chest, now); b.goal = null; }
    else if (g.chest == null && dist < 1.5) b.goal = null;

    let moving = false;
    if (b.goal && dist > 0.01) {
      const v = rules.WALK_SPEED * T.speed * dt;
      dx = (dx / dist) * Math.min(v, dist); dz = (dz / dist) * Math.min(v, dist);
      movePlayer(island.grid, b.body, dx, dz, dt, moveOpts);
      b.ry = Math.atan2(dx, dz);
      moving = true;
    }
    // Stuck behind a wall? Every second, check that we got somewhere.
    if (now >= b.checkAt) {
      if (b.goal && Math.hypot(b.body.x - b.checkX, b.body.z - b.checkZ) < 0.5) newGoal(b, now);
      b.checkAt = now + 1000; b.checkX = b.body.x; b.checkZ = b.body.z;
    }

    const target = nearestHuman(b);
    let pitch = 0;
    if (target) {
      const tx = target.x - b.body.x, tz = target.z - b.body.z;
      b.ry = Math.atan2(tx, tz);
      if (now >= b.nextFire) {
        b.nextFire = now + random.range(...T.shootEveryMs);
        if (random.chance(T.shootChance) && holdGun(b)) {
          const ty = target.y + 1.2 - (b.body.y + rules.PLAYER_HEIGHT - 0.3);
          const len = Math.hypot(tx, ty, tz) || 1;
          const e = () => random.range(-T.aimError, T.aimError);
          const d = [tx / len + e(), ty / len + e(), tz / len + e()];
          const dl = Math.hypot(...d) || 1;
          pitch = Math.asin(Math.max(-1, Math.min(1, d[1] / dl)));
          arena.fire(b.id, d.map(c => c / dl), now);
        }
      }
    }
    const r2 = n => Math.round(n * 100) / 100;
    arena.setState(b.id, {
      x: r2(b.body.x), y: r2(b.body.y), z: r2(b.body.z),
      ry: Math.round(b.ry * 1000) / 1000, pitch: r2(pitch),
      f: makeFlags({ moving, air: !b.body.onGround }),
    }, now);
  }

  return {
    count,
    /** Ids of the bots in the arena right now. */
    ids: () => bots.filter(b => b.id != null).map(b => b.id),
    isBot: id => byId.has(id),
    /** Run the bots up to `now` (ms): join or rejoin, walk, open chests, shoot. Call before arena.tick(now). */
    tick(now) {
      const dt = last == null ? 0 : Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;
      for (const b of bots) {
        if (b.id != null && !arena.hasPlayer(b.id)) { byId.delete(b.id); b.id = null; b.respawnAt = now + T.respawnMs; }
        if (b.id == null) { if (now >= b.respawnAt) join(b, now); continue; }
        if (dt > 0) step(b, now, dt);
      }
    },
    /** A bot was knocked out (the arena's 'knockedOut' event): it comes back after respawnMs. */
    knockedOut(id, now) {
      const b = byId.get(id);
      if (!b) return false;
      byId.delete(id);
      b.id = null;
      b.respawnAt = now + T.respawnMs;
      return true;
    },
    /** Take every bot out of the arena. */
    removeAll() {
      for (const b of bots) if (b.id != null) { arena.leave(b.id, { alive: false }); byId.delete(b.id); b.id = null; }
    },
  };
}
