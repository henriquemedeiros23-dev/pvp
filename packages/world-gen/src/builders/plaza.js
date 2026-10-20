// Central plaza: broken ring of 12 pillars, golden chest spot in the middle.
export function buildPlaza(ctx) {
  const { next, rand } = ctx;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const h = next() < 0.35 ? rand(1, 2) : rand(5, 7);
    ctx.add(Math.cos(a) * 12, Math.sin(a) * 12, 1.3, 1.3, h, 'pillar');
  }
  ctx.goldenSpots.push({ x: 0, z: 0 });
  ctx.addSite(0, 0, 16);
}
