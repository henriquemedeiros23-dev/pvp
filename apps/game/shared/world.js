// The island of ruins. Generated from a fixed seed so the server and every
// player build exactly the same map. Also holds the collision helpers.

import { PLAYER_RADIUS, STEP_HEIGHT, GRAVITY } from './config.js';

export const ISLAND_RADIUS = 210;
export const PLAY_RADIUS = 195;
const SEED = 20261020;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A box is { x, z, w, d, h, y, kind } — centered on x/z, from y to y + h.
export function generateWorld() {
  const r = rng(SEED);
  const rand = (a, b) => a + r() * (b - a);
  const boxes = [];
  const chests = [];
  const goldenSpots = [];
  const sites = [];

  const add = (x, z, w, d, h, kind = 'stone', y = 0) => boxes.push({ x, z, w, d, h, y, kind });

  const freeSite = (minDist, maxR) => {
    for (let tries = 0; tries < 200; tries++) {
      const a = r() * Math.PI * 2;
      const dist = Math.sqrt(r()) * maxR;
      const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (Math.hypot(x, z) < 18) continue; // keep the central plaza open
      if (sites.every(s => Math.hypot(s.x - x, s.z - z) > minDist + s.size)) return { x, z };
    }
    return null;
  };

  // Central plaza: broken ring of pillars, golden chest spot in the middle.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const h = r() < 0.35 ? rand(1, 2) : rand(5, 7);
    add(Math.cos(a) * 12, Math.sin(a) * 12, 1.3, 1.3, h, 'pillar');
  }
  goldenSpots.push({ x: 0, z: 0 });
  sites.push({ x: 0, z: 0, size: 16 });

  // Ruined houses
  for (let i = 0; i < 38; i++) {
    const s = freeSite(8, PLAY_RADIUS - 15);
    if (!s) break;
    const w = rand(8, 14), d = rand(8, 14), t = 0.8;
    const sides = [
      { x: s.x, z: s.z - d / 2, len: w, horiz: true },
      { x: s.x, z: s.z + d / 2, len: w, horiz: true },
      { x: s.x - w / 2, z: s.z, len: d, horiz: false },
      { x: s.x + w / 2, z: s.z, len: d, horiz: false },
    ];
    const door = Math.floor(r() * 4);
    sides.forEach((side, k) => {
      if (k !== door && r() < 0.12) return; // wall fell down completely
      const h = r() < 0.3 ? rand(1.0, 1.5) : rand(3, 5);
      const gap = k === door || r() < 0.4 ? 2.4 : 0;
      const seg = (side.len - gap) / 2;
      for (const sign of gap ? [-1, 1] : [0]) {
        const off = gap ? sign * (gap / 2 + seg / 2) : 0;
        const len = gap ? seg : side.len + t;
        const hh = r() < 0.25 ? h * rand(0.4, 0.7) : h;
        if (side.horiz) add(side.x + off, side.z, len, t, hh, 'wall');
        else add(side.x, side.z + off, t, len, hh, 'wall');
      }
    });
    // rubble inside
    if (r() < 0.6) add(s.x + rand(-w / 4, w / 4), s.z + rand(-d / 4, d / 4), rand(1, 2), rand(1, 2), rand(0.5, 1.1), 'rubble');
    chests.push({ x: s.x + rand(-1.5, 1.5), z: s.z + rand(-1.5, 1.5) });
    sites.push({ x: s.x, z: s.z, size: Math.max(w, d) / 2 + 2 });
  }

  // Towers
  for (let i = 0; i < 16; i++) {
    const s = freeSite(6, PLAY_RADIUS - 10);
    if (!s) break;
    const w = rand(4, 6.5);
    add(s.x, s.z, w, w, rand(10, 20), 'tower');
    add(s.x + w / 2 + 1.2, s.z + rand(-1, 1), 1.4, 1.4, rand(0.6, 1.2), 'rubble');
    chests.push({ x: s.x - w / 2 - 1.6, z: s.z });
    if (i % 3 === 0) goldenSpots.push({ x: s.x, z: s.z + w / 2 + 3 });
    sites.push({ x: s.x, z: s.z, size: w / 2 + 3 });
  }

  // Colonnades (rows of old pillars, some fallen)
  for (let i = 0; i < 14; i++) {
    const s = freeSite(6, PLAY_RADIUS - 12);
    if (!s) break;
    const horiz = r() < 0.5, n = 4 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 3.5;
      const x = horiz ? s.x + off : s.x, z = horiz ? s.z : s.z + off;
      if (r() < 0.25) add(x + (horiz ? 0 : 1.6), z + (horiz ? 1.6 : 0), horiz ? 1 : 3.4, horiz ? 3.4 : 1, 0.9, 'pillar');
      else add(x, z, 1.1, 1.1, rand(3.5, 6.5), 'pillar');
    }
    chests.push({ x: s.x + (horiz ? 0 : 2.5), z: s.z + (horiz ? 2.5 : 0) });
    sites.push({ x: s.x, z: s.z, size: n * 1.8 });
  }

  // Long broken walls
  for (let i = 0; i < 18; i++) {
    const s = freeSite(4, PLAY_RADIUS - 10);
    if (!s) break;
    const horiz = r() < 0.5, n = 3 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      if (r() < 0.2) continue;
      const off = (k - (n - 1) / 2) * 4;
      add(horiz ? s.x + off : s.x, horiz ? s.z : s.z + off, horiz ? 4 : 0.9, horiz ? 0.9 : 4, rand(1.2, 4), 'wall');
    }
    sites.push({ x: s.x, z: s.z, size: n * 2 });
  }

  // Small rocks / low cover everywhere
  for (let i = 0; i < 90; i++) {
    const s = freeSite(1, PLAY_RADIUS - 5);
    if (!s) break;
    add(s.x, s.z, rand(1, 2.2), rand(1, 2.2), rand(0.6, 1.3), 'rubble');
    sites.push({ x: s.x, z: s.z, size: 1.5 });
  }

  // A few open-field chests
  for (let i = 0; i < 16; i++) {
    const s = freeSite(2, PLAY_RADIUS - 8);
    if (!s) break;
    chests.push({ x: s.x, z: s.z });
    sites.push({ x: s.x, z: s.z, size: 1 });
  }

  boxes.forEach((b, i) => (b.id = i));
  chests.forEach((c, i) => (c.id = i));
  const grid = buildGrid(boxes);
  // Drop any chest that ended up inside a wall.
  const okChests = chests.filter(c => ![...nearbyBoxes(grid, c.x, c.z, 0.8)].some(b => circleHitsBox(c.x, c.z, 0.8, b)));
  okChests.forEach((c, i) => (c.id = i));
  return { boxes, chests: okChests, goldenSpots, grid };
}

// ---- spatial grid ----
const CELL = 10;
export function buildGrid(boxes) {
  const cells = new Map();
  for (const b of boxes) {
    const x0 = Math.floor((b.x - b.w / 2) / CELL), x1 = Math.floor((b.x + b.w / 2) / CELL);
    const z0 = Math.floor((b.z - b.d / 2) / CELL), z1 = Math.floor((b.z + b.d / 2) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const k = i + ',' + j;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(b);
    }
  }
  return cells;
}

export function nearbyBoxes(grid, x, z, r) {
  const out = new Set();
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    const c = grid.get(i + ',' + j);
    if (c) for (const b of c) out.add(b);
  }
  return out;
}

export function circleHitsBox(x, z, r, b) {
  const cx = Math.max(b.x - b.w / 2, Math.min(x, b.x + b.w / 2));
  const cz = Math.max(b.z - b.d / 2, Math.min(z, b.z + b.d / 2));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

// Moves a player by (dx, dz) and handles walls, stepping up and landing.
// p: { x, y, z, vy, onGround }, height: current body height.
export function movePlayer(world, p, dx, dz, dt, height) {
  const R = PLAYER_RADIUS;
  // horizontal, in small steps so fast slides can't tunnel through thin walls
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.3));
  for (let s = 0; s < steps; s++) {
    p.x += dx / steps;
    p.z += dz / steps;
    for (const b of nearbyBoxes(world.grid, p.x, p.z, R + 1)) {
      const top = b.y + b.h;
      if (top <= p.y + STEP_HEIGHT || b.y >= p.y + height) continue;
      if (!circleHitsBox(p.x, p.z, R, b)) continue;
      // push out along the shortest axis
      const left = p.x - (b.x - b.w / 2 - R), right = (b.x + b.w / 2 + R) - p.x;
      const back = p.z - (b.z - b.d / 2 - R), front = (b.z + b.d / 2 + R) - p.z;
      const m = Math.min(left, right, back, front);
      if (m === left) p.x -= left; else if (m === right) p.x += right;
      else if (m === back) p.z -= back; else p.z += front;
    }
  }
  const d = Math.hypot(p.x, p.z);
  if (d > PLAY_RADIUS) { p.x *= PLAY_RADIUS / d; p.z *= PLAY_RADIUS / d; }

  // vertical
  let ground = 0;
  for (const b of nearbyBoxes(world.grid, p.x, p.z, R)) {
    const top = b.y + b.h;
    if (top <= p.y + STEP_HEIGHT && circleHitsBox(p.x, p.z, R * 0.7, b)) ground = Math.max(ground, top);
  }
  p.vy -= GRAVITY * dt;
  p.y += p.vy * dt;
  if (p.y <= ground) {
    if (ground - p.y < STEP_HEIGHT + 0.05 || p.vy <= 0) { p.y = ground; p.vy = 0; p.onGround = true; }
  } else {
    p.onGround = false;
  }
}

// Ray vs boxes: returns distance to the first wall hit, or Infinity.
export function rayWorld(world, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  if (dy < 0) best = Math.min(best, -oy / dy); // ground
  // walk the grid cells along the ray
  const checked = new Set();
  const stepLen = 5;
  for (let t = 0; t < best + stepLen; t += stepLen) {
    const x = ox + dx * t, z = oz + dz * t;
    for (const b of nearbyBoxes(world.grid, x, z, stepLen)) {
      if (checked.has(b)) continue;
      checked.add(b);
      const hit = rayBox(ox, oy, oz, dx, dy, dz, b);
      if (hit < best) best = hit;
    }
  }
  return best;
}

function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const axes = [
    [ox, dx, b.x - b.w / 2, b.x + b.w / 2],
    [oy, dy, b.y, b.y + b.h],
    [oz, dz, b.z - b.d / 2, b.z + b.d / 2],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Ray vs a standing player (vertical cylinder). Returns distance or Infinity.
export function rayPlayer(ox, oy, oz, dx, dy, dz, px, py, pz, height, radius = PLAYER_RADIUS + 0.1) {
  const fx = ox - px, fz = oz - pz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return Infinity;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
    if (t < 0) continue;
    const y = oy + dy * t;
    if (y >= py && y <= py + height) return t;
  }
  return Infinity;
}

export function findSpawn(world, players, rand = Math.random) {
  for (let tries = 0; tries < 100; tries++) {
    const a = rand() * Math.PI * 2, d = 20 + Math.sqrt(rand()) * (PLAY_RADIUS - 30);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if ([...nearbyBoxes(world.grid, x, z, 2)].some(b => circleHitsBox(x, z, 1.5, b))) continue;
    if (players.some(p => Math.hypot(p.x - x, p.z - z) < 25) && tries < 80) continue;
    return { x, z };
  }
  return { x: 30, z: 30 };
}
