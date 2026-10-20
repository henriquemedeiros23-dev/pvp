// A ruined house: four walls (one with a door, some broken or fallen),
// maybe rubble inside, and a chest in the middle. Returns false if no room.
export function buildHouse(ctx, playRadius) {
  const { next, rand } = ctx;
  const s = ctx.freeSite(8, playRadius - 15);
  if (!s) return false;
  const w = rand(8, 14), d = rand(8, 14), t = 0.8;
  const sides = [
    { x: s.x, z: s.z - d / 2, len: w, horiz: true },
    { x: s.x, z: s.z + d / 2, len: w, horiz: true },
    { x: s.x - w / 2, z: s.z, len: d, horiz: false },
    { x: s.x + w / 2, z: s.z, len: d, horiz: false },
  ];
  const door = Math.floor(next() * 4);
  sides.forEach((side, k) => {
    if (k !== door && next() < 0.12) return; // wall fell down completely
    const h = next() < 0.3 ? rand(1.0, 1.5) : rand(3, 5);
    const gap = k === door || next() < 0.4 ? 2.4 : 0;
    const seg = (side.len - gap) / 2;
    for (const sign of gap ? [-1, 1] : [0]) {
      const off = gap ? sign * (gap / 2 + seg / 2) : 0;
      const len = gap ? seg : side.len + t;
      const hh = next() < 0.25 ? h * rand(0.4, 0.7) : h;
      if (side.horiz) ctx.add(side.x + off, side.z, len, t, hh, 'wall');
      else ctx.add(side.x, side.z + off, t, len, hh, 'wall');
    }
  });
  if (next() < 0.6) {
    ctx.add(s.x + rand(-w / 4, w / 4), s.z + rand(-d / 4, d / 4), rand(1, 2), rand(1, 2), rand(0.5, 1.1), 'rubble');
  }
  ctx.chests.push({ x: s.x + rand(-1.5, 1.5), z: s.z + rand(-1.5, 1.5) });
  ctx.addSite(s.x, s.z, Math.max(w, d) / 2 + 2);
  return true;
}
