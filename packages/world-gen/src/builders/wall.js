// A long broken wall: 3-6 segments of 4 m, some missing.
export function buildBrokenWall(ctx, playRadius) {
  const { next, rand } = ctx;
  const s = ctx.freeSite(4, playRadius - 10);
  if (!s) return false;
  const horiz = next() < 0.5, n = 3 + Math.floor(next() * 4);
  for (let k = 0; k < n; k++) {
    if (next() < 0.2) continue;
    const off = (k - (n - 1) / 2) * 4;
    ctx.add(horiz ? s.x + off : s.x, horiz ? s.z : s.z + off, horiz ? 4 : 0.9, horiz ? 0.9 : 4, rand(1.2, 4), 'wall');
  }
  ctx.addSite(s.x, s.z, n * 2);
  return true;
}
