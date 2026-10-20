// A tall square tower with rubble at its foot and a chest beside it.
// Every third tower (index 0, 3, 6, ...) also gets a golden chest spot.
export function buildTower(ctx, playRadius, index) {
  const { rand } = ctx;
  const s = ctx.freeSite(6, playRadius - 10);
  if (!s) return false;
  const w = rand(4, 6.5);
  ctx.add(s.x, s.z, w, w, rand(10, 20), 'tower');
  ctx.add(s.x + w / 2 + 1.2, s.z + rand(-1, 1), 1.4, 1.4, rand(0.6, 1.2), 'rubble');
  ctx.chests.push({ x: s.x - w / 2 - 1.6, z: s.z });
  if (index % 3 === 0) ctx.goldenSpots.push({ x: s.x, z: s.z + w / 2 + 3 });
  ctx.addSite(s.x, s.z, w / 2 + 3);
  return true;
}
