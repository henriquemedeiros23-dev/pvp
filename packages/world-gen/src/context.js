// Shared state for one generation run. Builders only talk to the world
// through this object, so the order of random draws stays easy to follow.

/**
 * @param {() => number} next  seeded random in [0, 1)
 * @param {{ plazaClearRadius: number }} opts
 */
export function createContext(next, { plazaClearRadius }) {
  const ctx = {
    next,
    rand: (a, b) => a + next() * (b - a),
    boxes: [],
    chests: [],
    goldenSpots: [],
    sites: [], // taken places: { x, z, size }

    /** Adds a box { x, z, w, d, h, y, kind } centered on x/z. */
    add(x, z, w, d, h, kind = 'stone', y = 0) {
      ctx.boxes.push({ x, z, w, d, h, y, kind });
    },

    /**
     * Finds a random free spot within maxR of the center, more than
     * minDist + site.size away from every taken site. null if none found.
     */
    freeSite(minDist, maxR) {
      for (let tries = 0; tries < 200; tries++) {
        const a = next() * Math.PI * 2;
        const dist = Math.sqrt(next()) * maxR;
        const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
        if (Math.hypot(x, z) < plazaClearRadius) continue; // keep the central plaza open
        if (ctx.sites.every(s => Math.hypot(s.x - x, s.z - z) > minDist + s.size)) return { x, z };
      }
      return null;
    },

    addSite(x, z, size) {
      ctx.sites.push({ x, z, size });
    },
  };
  return ctx;
}
