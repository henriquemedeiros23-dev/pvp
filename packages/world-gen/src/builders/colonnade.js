// A row of 4-7 old pillars (some fallen over) with a chest next to it.
export function buildColonnade(ctx, playRadius) {
  const { next, rand } = ctx;
  const s = ctx.freeSite(6, playRadius - 12);
  if (!s) return false;
  const horiz = next() < 0.5, n = 4 + Math.floor(next() * 4);
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * 3.5;
    const x = horiz ? s.x + off : s.x, z = horiz ? s.z : s.z + off;
    if (next() < 0.25) {
      ctx.add(x + (horiz ? 0 : 1.6), z + (horiz ? 1.6 : 0), horiz ? 1 : 3.4, horiz ? 3.4 : 1, 0.9, 'pillar');
    } else {
      ctx.add(x, z, 1.1, 1.1, rand(3.5, 6.5), 'pillar');
    }
  }
  ctx.chests.push({ x: s.x + (horiz ? 0 : 2.5), z: s.z + (horiz ? 2.5 : 0) });
  ctx.addSite(s.x, s.z, n * 1.8);
  return true;
}
