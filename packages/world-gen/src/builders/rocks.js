// One small rock / piece of low cover.
export function buildRock(ctx, playRadius) {
  const { rand } = ctx;
  const s = ctx.freeSite(1, playRadius - 5);
  if (!s) return false;
  ctx.add(s.x, s.z, rand(1, 2.2), rand(1, 2.2), rand(0.6, 1.3), 'rubble');
  ctx.addSite(s.x, s.z, 1.5);
  return true;
}
