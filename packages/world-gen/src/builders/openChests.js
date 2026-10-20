// A chest lying out in the open field.
export function buildOpenChest(ctx, playRadius) {
  const s = ctx.freeSite(2, playRadius - 8);
  if (!s) return false;
  ctx.chests.push({ x: s.x, z: s.z });
  ctx.addSite(s.x, s.z, 1);
  return true;
}
