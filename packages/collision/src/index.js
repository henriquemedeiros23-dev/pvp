// Collision and movement math. Pure, deterministic, no dependencies.
// Works in Node and directly in the browser as an ES module.
//
// Conventions:
// - A box is { x, z, w, d, h, y }: centered on x/z, w wide (x), d deep (z),
//   from y up to y + h. Extra fields (id, kind, ...) are ignored.
// - Points and directions are { x, y, z } objects.
// - y is up. The ground is the plane y = 0.

const EPS = 1e-9;

// Internal data of each grid, kept out of the public object.
const internals = new WeakMap();

// ---------------------------------------------------------------------------
// Spatial grid
// ---------------------------------------------------------------------------

/**
 * Builds a uniform grid over the x/z plane. Each box is registered in every
 * cell its footprint touches (edges included), so boxes larger than a cell
 * are found too.
 * @param {Array<{x:number,z:number,w:number,d:number,h:number,y:number}>} boxes
 * @param {{cellSize?: number}} [opts]
 */
export function createBoxGrid(boxes, { cellSize = 10 } = {}) {
  if (!(cellSize > 0)) throw new RangeError('cellSize must be a positive number');
  const list = Array.from(boxes);
  const n = list.length;

  let minI = Infinity, maxI = -Infinity, minJ = Infinity, maxJ = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  const spans = new Array(n);
  for (let k = 0; k < n; k++) {
    const b = list[k];
    const i0 = Math.floor((b.x - b.w / 2) / cellSize), i1 = Math.floor((b.x + b.w / 2) / cellSize);
    const j0 = Math.floor((b.z - b.d / 2) / cellSize), j1 = Math.floor((b.z + b.d / 2) / cellSize);
    spans[k] = [i0, i1, j0, j1];
    if (i0 < minI) minI = i0;
    if (i1 > maxI) maxI = i1;
    if (j0 < minJ) minJ = j0;
    if (j1 > maxJ) maxJ = j1;
    if (b.y < minY) minY = b.y;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }

  const rows = n ? maxJ - minJ + 1 : 0;
  const cells = new Map(); // cell key -> array of box indices (ascending)
  for (let k = 0; k < n; k++) {
    const [i0, i1, j0, j1] = spans[k];
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = (i - minI) * rows + (j - minJ);
        let c = cells.get(key);
        if (!c) cells.set(key, (c = []));
        c.push(k);
      }
    }
  }

  // stamp[k] === mark means box k was already collected in the current query.
  const stamp = new Uint32Array(n);
  let mark = 0;
  const nextMark = () => {
    mark = (mark + 1) >>> 0;
    if (mark === 0) { stamp.fill(0); mark = 1; }
    return mark;
  };

  const data = { list, cells, cellSize, rows, minI, maxI, minJ, maxJ, minY, maxY, stamp, nextMark, empty: n === 0 };

  const grid = {
    cellSize,
    boxes: list,
    /**
     * Boxes whose cells touch the square around (x, z) with half-size r.
     * Each box at most once, in the order they were given to createBoxGrid.
     * This is a broad phase: use circleHitsBox for the exact test.
     */
    near(x, z, r = 0) {
      if (data.empty) return [];
      const i0 = Math.max(minI, Math.floor((x - r) / cellSize));
      const i1 = Math.min(maxI, Math.floor((x + r) / cellSize));
      const j0 = Math.max(minJ, Math.floor((z - r) / cellSize));
      const j1 = Math.min(maxJ, Math.floor((z + r) / cellSize));
      const m = nextMark();
      const found = [];
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const c = cells.get((i - minI) * rows + (j - minJ));
          if (!c) continue;
          for (const k of c) if (stamp[k] !== m) { stamp[k] = m; found.push(k); }
        }
      }
      found.sort((a, b) => a - b);
      return found.map(k => list[k]);
    },
  };
  internals.set(grid, data);
  return grid;
}

// ---------------------------------------------------------------------------
// Overlap
// ---------------------------------------------------------------------------

/** True when the circle (x, z, r) overlaps the box footprint (touching is not overlap). */
export function circleHitsBox(x, z, r, box) {
  const cx = Math.max(box.x - box.w / 2, Math.min(x, box.x + box.w / 2));
  const cz = Math.max(box.z - box.d / 2, Math.min(z, box.z + box.d / 2));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function requireNumber(opts, name) {
  const v = opts[name];
  if (typeof v !== 'number' || Number.isNaN(v)) throw new TypeError(`movePlayer: opts.${name} must be a number`);
  return v;
}

/**
 * Moves a body by (dx, dz) and applies gravity for dt seconds. Mutates body.
 * Walls stop it (pushed out along the shortest axis), ledges up to stepHeight
 * are stepped onto, and it lands on box tops or the ground (y = 0).
 * The horizontal move is cut into sub-steps of at most 0.3 so a fast move
 * cannot pass through thin walls.
 * @param {ReturnType<typeof createBoxGrid>} grid
 * @param {{x:number,y:number,z:number,vy:number,onGround?:boolean}} body
 * @param {number} dx
 * @param {number} dz
 * @param {number} dt seconds
 * @param {{radius:number,height:number,stepHeight:number,gravity:number,boundsRadius?:number}} opts
 * @returns the same body
 */
export function movePlayer(grid, body, dx, dz, dt, opts) {
  const R = requireNumber(opts, 'radius');
  const height = requireNumber(opts, 'height');
  const stepHeight = requireNumber(opts, 'stepHeight');
  const gravity = requireNumber(opts, 'gravity');
  const boundsRadius = opts.boundsRadius;
  const p = body;

  // horizontal, in small steps so fast slides can't tunnel through thin walls
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.3));
  for (let s = 0; s < steps; s++) {
    p.x += dx / steps;
    p.z += dz / steps;
    for (const b of grid.near(p.x, p.z, R + 1)) {
      const top = b.y + b.h;
      if (top <= p.y + stepHeight || b.y >= p.y + height) continue;
      if (!circleHitsBox(p.x, p.z, R, b)) continue;
      // push out along the shortest axis
      const left = p.x - (b.x - b.w / 2 - R), right = (b.x + b.w / 2 + R) - p.x;
      const back = p.z - (b.z - b.d / 2 - R), front = (b.z + b.d / 2 + R) - p.z;
      const m = Math.min(left, right, back, front);
      if (m === left) p.x -= left;
      else if (m === right) p.x += right;
      else if (m === back) p.z -= back;
      else p.z += front;
    }
  }
  if (typeof boundsRadius === 'number') {
    const d = Math.hypot(p.x, p.z);
    if (d > boundsRadius) { p.x *= boundsRadius / d; p.z *= boundsRadius / d; }
  }

  // vertical
  let ground = 0;
  for (const b of grid.near(p.x, p.z, R)) {
    const top = b.y + b.h;
    if (top <= p.y + stepHeight && circleHitsBox(p.x, p.z, R * 0.7, b)) ground = Math.max(ground, top);
  }
  p.vy -= gravity * dt;
  p.y += p.vy * dt;
  if (p.y <= ground) {
    if (ground - p.y < stepHeight + 0.05 || p.vy <= 0) { p.y = ground; p.vy = 0; p.onGround = true; }
  } else {
    p.onGround = false;
  }
  return p;
}

// ---------------------------------------------------------------------------
// Rays
// ---------------------------------------------------------------------------

/**
 * Ray vs one box (slab test). Returns the distance along dir to the entry
 * point, 0 if the origin is inside, or Infinity on a miss.
 * Distances are in units of dir: pass a unit dir to get meters.
 */
export function rayBox(origin, dir, box) {
  let tmin = 0, tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    let o, d, lo, hi;
    if (a === 0) { o = origin.x; d = dir.x; lo = box.x - box.w / 2; hi = box.x + box.w / 2; }
    else if (a === 1) { o = origin.y; d = dir.y; lo = box.y; hi = box.y + box.h; }
    else { o = origin.z; d = dir.z; lo = box.z - box.d / 2; hi = box.z + box.d / 2; }
    if (Math.abs(d) < EPS) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

/**
 * Ray vs every box in the grid and the ground plane y = 0.
 * Returns the distance to the nearest hit within maxDist, or Infinity.
 * Walks the grid cells the ray crosses in order (2D DDA) and stops as soon as
 * no later cell can hold a nearer hit, so no box along the ray is missed.
 * Distances are in units of dir: pass a unit dir to get meters.
 */
export function rayBoxes(grid, origin, dir, maxDist = Infinity) {
  const data = internals.get(grid);
  if (!data) throw new TypeError('rayBoxes: grid must come from createBoxGrid');
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const dx = dir.x, dy = dir.y, dz = dir.z;

  let best = Infinity;
  // ground
  if (dy < -EPS && oy >= 0) {
    const t = -oy / dy;
    if (t <= maxDist) best = t;
  }
  if (data.empty) return best;

  let tEnd = Math.min(best, maxDist);
  let tStart = 0;

  // Clip to the height band the boxes occupy.
  if (Math.abs(dy) < EPS) {
    if (oy < data.minY || oy > data.maxY) return best;
  } else {
    let t1 = (data.minY - oy) / dy, t2 = (data.maxY - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tStart) tStart = t1;
    if (t2 < tEnd) tEnd = t2;
  }

  // Clip to the x/z extent of the grid.
  const { cellSize: cs, minI, maxI, minJ, maxJ, rows, cells, list, stamp } = data;
  const slabs = [[ox, dx, minI * cs, (maxI + 1) * cs], [oz, dz, minJ * cs, (maxJ + 1) * cs]];
  for (const [o, d, lo, hi] of slabs) {
    if (Math.abs(d) < EPS) { if (o < lo || o > hi) return best; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tStart) tStart = t1;
    if (t2 < tEnd) tEnd = t2;
  }
  if (tStart > tEnd) return best;

  // 2D DDA over the cells, starting where the ray enters the grid.
  const clampI = v => Math.min(maxI, Math.max(minI, v));
  const clampJ = v => Math.min(maxJ, Math.max(minJ, v));
  let i = clampI(Math.floor((ox + dx * tStart) / cs));
  let j = clampJ(Math.floor((oz + dz * tStart) / cs));
  const useX = Math.abs(dx) >= EPS, useZ = Math.abs(dz) >= EPS;
  const stepI = dx > 0 ? 1 : -1, stepJ = dz > 0 ? 1 : -1;
  let tMaxX = useX ? ((dx > 0 ? (i + 1) * cs : i * cs) - ox) / dx : Infinity;
  let tMaxZ = useZ ? ((dz > 0 ? (j + 1) * cs : j * cs) - oz) / dz : Infinity;
  const tDeltaX = useX ? cs / Math.abs(dx) : Infinity;
  const tDeltaZ = useZ ? cs / Math.abs(dz) : Infinity;

  const m = data.nextMark();
  for (;;) {
    const c = cells.get((i - minI) * rows + (j - minJ));
    if (c) {
      for (const k of c) {
        if (stamp[k] === m) continue;
        stamp[k] = m;
        const t = rayBox(origin, dir, list[k]);
        if (t < best && t <= maxDist) { best = t; if (t < tEnd) tEnd = t; }
      }
    }
    // Any hit beyond this cell's exit lies in a later cell; stop when none can be nearer.
    const cellExit = Math.min(tMaxX, tMaxZ);
    if (cellExit >= tEnd) break;
    if (tMaxX < tMaxZ) { i += stepI; tMaxX += tDeltaX; if (i < minI || i > maxI) break; }
    else { j += stepJ; tMaxZ += tDeltaZ; if (j < minJ || j > maxJ) break; }
  }
  return best;
}

/**
 * Ray vs the side of a vertical cylinder standing from y to y + height
 * (a standing player). Returns the distance to the hit or Infinity.
 * Only the side wall counts: a perfectly vertical ray never hits, and a ray
 * passing over the top (above y + height) misses.
 * Distances are in units of dir: pass a unit dir to get meters.
 */
export function rayCylinder(origin, dir, cyl) {
  const hit = rayCylinderHit(origin, dir, cyl);
  return hit ? hit.t : Infinity;
}

/**
 * Same test as rayCylinder, but also says WHERE on the cylinder the ray hit:
 * { t (distance, in units of dir), y (world height of the hit point), h (height of the hit
 * above the cylinder's bottom, 0..height) }, or null on a miss.
 * E.g. a player's feet are at cyl.y, so h tells head (near height) from legs (near 0).
 */
export function rayCylinderHit(origin, dir, cyl) {
  const fx = origin.x - cyl.x, fz = origin.z - cyl.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < EPS) return null;
  const b = 2 * (fx * dir.x + fz * dir.z);
  const c = fx * fx + fz * fz - cyl.radius * cyl.radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const ts = [(-b - sq) / (2 * a), (-b + sq) / (2 * a)];
  for (const t of ts) {
    if (t < 0) continue;
    const y = origin.y + dir.y * t;
    if (y >= cyl.y && y <= cyl.y + cyl.height) return { t, y, h: y - cyl.y };
  }
  return null;
}
