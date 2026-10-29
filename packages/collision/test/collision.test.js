import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBoxGrid, circleHitsBox, movePlayer, rayBoxes, rayBox, rayCylinder, rayCylinderHit,
} from '../src/index.js';

const OPTS = { radius: 0.45, height: 1.85, stepHeight: 0.55, gravity: 24 };
const box = (x, z, w, d, h, y = 0) => ({ x, z, w, d, h, y });
const body = (x, z, y = 0) => ({ x, y, z, vy: 0, onGround: true });
const run = (grid, p, dx, dz, frames, dt = 1 / 60, opts = OPTS) => {
  for (let i = 0; i < frames; i++) movePlayer(grid, p, dx, dz, dt, opts);
  return p;
};

// Small deterministic pseudo-random for test data (no Math.random).
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// ---- grid ----

test('near() returns each box once, in input order', () => {
  const big = box(0, 0, 35, 35, 2); // spans many cells
  const small = box(3, 3, 1, 1, 1);
  const edge = box(10, 0, 2, 2, 1); // straddles a cell boundary
  const grid = createBoxGrid([small, big, edge]);
  const got = grid.near(0, 0, 15);
  assert.deepEqual(got, [small, big, edge]);
  assert.equal(new Set(got).size, got.length);
});

test('near() finds nothing far away and handles an empty grid', () => {
  const grid = createBoxGrid([box(0, 0, 2, 2, 2)]);
  assert.deepEqual(grid.near(100, 100, 2), []);
  assert.deepEqual(createBoxGrid([]).near(0, 0, 50), []);
});

test('near() respects cellSize', () => {
  const b = box(7, 0, 1, 1, 1);
  assert.deepEqual(createBoxGrid([b], { cellSize: 5 }).near(0, 0, 1), []);
  assert.deepEqual(createBoxGrid([b], { cellSize: 10 }).near(0, 0, 1), [b]);
  assert.throws(() => createBoxGrid([b], { cellSize: 0 }), RangeError);
});

// ---- circle vs box ----

test('circleHitsBox edge cases', () => {
  const b = box(0, 0, 2, 2, 1); // footprint -1..1
  assert.equal(circleHitsBox(0, 0, 0.1, b), true, 'center inside');
  assert.equal(circleHitsBox(1.4, 0, 0.5, b), true, 'overlaps side');
  assert.equal(circleHitsBox(1.5, 0, 0.5, b), false, 'exactly touching is not a hit');
  assert.equal(circleHitsBox(1.6, 0, 0.5, b), false, 'just outside');
  // corner: distance to corner (1,1) is sqrt(0.32) ~ 0.566
  assert.equal(circleHitsBox(1.4, 1.4, 0.5, b), false, 'near corner but outside');
  assert.equal(circleHitsBox(1.3, 1.3, 0.5, b), true, 'over the corner');
  assert.equal(circleHitsBox(5, 5, 0, b), false, 'zero radius outside');
});

// ---- movement ----

test('walking into a wall stops at the wall', () => {
  const wall = box(5, 0, 1, 10, 3); // face at x = 4.5
  const grid = createBoxGrid([wall]);
  const p = run(grid, body(0, 0), 0.1, 0, 120);
  assert.ok(Math.abs(p.x - (4.5 - OPTS.radius)) < 1e-9, `x=${p.x}`);
  assert.equal(p.y, 0);
});

test('a very fast move does not tunnel through a thin 0.8 m wall', () => {
  const wall = box(5, 0, 0.8, 10, 3);
  const grid = createBoxGrid([wall]);
  const p = movePlayer(grid, body(0, 0), 50, 0, 1 / 60, OPTS);
  assert.ok(p.x < 5 - 0.4, `went through: x=${p.x}`);
  const q = movePlayer(grid, body(10, 0), -50, 0, 1 / 60, OPTS);
  assert.ok(q.x > 5 + 0.4, `went through backwards: x=${q.x}`);
});

test('steps up onto a 0.4 m ledge but not a 1.5 m wall', () => {
  const ledge = box(3, 0, 4, 4, 0.4);
  const grid = createBoxGrid([ledge]);
  const p = run(grid, body(0, 0), 0.05, 0, 80);
  assert.ok(p.x > 2, `blocked by ledge: x=${p.x}`);
  assert.ok(Math.abs(p.y - 0.4) < 1e-9, `y=${p.y}`);
  assert.equal(p.onGround, true);

  const wallGrid = createBoxGrid([box(3, 0, 4, 4, 1.5)]);
  const q = run(wallGrid, body(0, 0), 0.05, 0, 80);
  assert.ok(Math.abs(q.x - (1 - OPTS.radius)) < 1e-9, `x=${q.x}`);
  assert.equal(q.y, 0);
});

test('jumping then landing on a box top', () => {
  const crate = box(2, 0, 2, 2, 1.2); // x 1..3, top 1.2
  const grid = createBoxGrid([crate]);
  const p = body(0, 0);
  p.vy = 9; // jump
  p.onGround = false;
  for (let i = 0; i < 120; i++) movePlayer(grid, p, i < 20 ? 0.1 : 0, 0, 1 / 60, OPTS);
  assert.ok(p.x > 1.5 && p.x < 3, `x=${p.x}`);
  assert.ok(Math.abs(p.y - 1.2) < 1e-9, `y=${p.y}`);
  assert.equal(p.vy, 0);
  assert.equal(p.onGround, true);
});

test('gravity brings a falling body to the ground', () => {
  const grid = createBoxGrid([]);
  const p = { x: 0, y: 10, z: 0, vy: 0, onGround: false };
  movePlayer(grid, p, 0, 0, 1 / 60, OPTS);
  assert.ok(p.y < 10 && p.vy < 0 && p.onGround === false);
  run(grid, p, 0, 0, 120);
  assert.equal(p.y, 0);
  assert.equal(p.vy, 0);
  assert.equal(p.onGround, true);
});

test('boundsRadius keeps the body inside a circle around 0,0', () => {
  const grid = createBoxGrid([]);
  const opts = { ...OPTS, boundsRadius: 10 };
  const p = run(grid, body(9, 0), 0.5, 0.5, 30, 1 / 60, opts);
  assert.ok(Math.abs(Math.hypot(p.x, p.z) - 10) < 1e-9);
  const free = run(grid, body(9, 0), 0.5, 0.5, 30);
  assert.ok(Math.hypot(free.x, free.z) > 10, 'no clamp without boundsRadius');
});

test('movePlayer requires numeric options', () => {
  assert.throws(() => movePlayer(createBoxGrid([]), body(0, 0), 0, 0, 0.1, { radius: 0.4 }), TypeError);
});

// ---- rays ----

const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };

test('rayBox: hit, inside, miss', () => {
  const b = box(5, 0, 2, 2, 2); // x 4..6, y 0..2
  assert.equal(rayBox({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, b), 4);
  assert.equal(rayBox({ x: 5, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, b), 0);
  assert.equal(rayBox({ x: 0, y: 3, z: 0 }, { x: 1, y: 0, z: 0 }, b), Infinity);
  assert.equal(rayBox({ x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, b), Infinity);
});

test('rayBoxes hits the nearest box', () => {
  const near = box(10, 0, 1, 1, 3);
  const far = box(30, 0, 1, 1, 3);
  const grid = createBoxGrid([far, near]);
  const o = { x: 0, y: 1, z: 0 };
  assert.equal(rayBoxes(grid, o, { x: 1, y: 0, z: 0 }, 100), 9.5);
  assert.equal(rayBoxes(grid, { x: 40, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, 100), 9.5);
  assert.equal(rayBoxes(grid, o, { x: 1, y: 0, z: 0 }, 5), Infinity, 'beyond maxDist');
});

test('rayBoxes hits the ground when pointing down, Infinity at the sky', () => {
  const grid = createBoxGrid([box(50, 50, 2, 2, 2)]);
  const o = { x: 0, y: 2, z: 0 };
  assert.equal(rayBoxes(grid, o, { x: 0, y: -1, z: 0 }), 2);
  const d = unit(1, -1, 0);
  assert.ok(Math.abs(rayBoxes(grid, o, d, 100) - 2 * Math.SQRT2) < 1e-9);
  assert.equal(rayBoxes(grid, o, unit(1, 1, 0.3), 1000), Infinity);
  assert.equal(rayBoxes(grid, o, { x: 0, y: 1, z: 0 }), Infinity);
  assert.equal(rayBoxes(createBoxGrid([]), o, { x: 0, y: 1, z: 0 }), Infinity);
});

test('rayBoxes finds a box larger than a cell and a thin box between samples', () => {
  const huge = box(0, 60, 80, 4, 5); // much larger than a 10 m cell
  const grid = createBoxGrid([huge, box(100, 100, 1, 1, 1)]);
  const t = rayBoxes(grid, { x: 25, y: 2, z: 0 }, { x: 0, y: 0, z: 1 }, 500);
  assert.equal(t, 58);
  // thin post that a fixed 5 m sampling with a small search radius could skip
  const post = box(12.3, 7.1, 0.2, 0.2, 4);
  const g2 = createBoxGrid([post]);
  const dir = unit(12.3, 0, 7.1);
  const hit = rayBoxes(g2, { x: 0, y: 1, z: 0 }, dir, 100);
  assert.ok(hit < Math.hypot(12.3, 7.1) && hit > Math.hypot(12.3, 7.1) - 0.2, `hit=${hit}`);
});

test('rayBoxes agrees with brute force on random scenes', () => {
  const r = lcg(12345);
  const boxes = [];
  for (let i = 0; i < 200; i++) {
    boxes.push(box(r() * 200 - 100, r() * 200 - 100, 0.3 + r() * (r() < 0.1 ? 40 : 4),
      0.3 + r() * (r() < 0.1 ? 40 : 4), 0.5 + r() * 10, r() < 0.2 ? r() * 3 : 0));
  }
  for (const cellSize of [3, 10, 25]) {
    const grid = createBoxGrid(boxes, { cellSize });
    for (let n = 0; n < 500; n++) {
      const o = { x: r() * 260 - 130, y: r() * 8, z: r() * 260 - 130 };
      const d = unit(r() * 2 - 1, r() * 0.4 - 0.25, r() * 2 - 1);
      const maxDist = r() < 0.5 ? 400 : Infinity;
      let want = Infinity;
      if (d.y < 0) want = -o.y / d.y;
      for (const b of boxes) want = Math.min(want, rayBox(o, d, b));
      if (want > maxDist) want = Infinity;
      assert.equal(rayBoxes(grid, o, d, maxDist), want);
    }
  }
});

test('rayCylinder hits the body and misses above the head', () => {
  const cyl = { x: 10, y: 0, z: 0, height: 1.85, radius: 0.55 };
  const t = rayCylinder({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, cyl);
  assert.ok(Math.abs(t - 9.45) < 1e-9);
  assert.equal(rayCylinder({ x: 0, y: 2.5, z: 0 }, { x: 1, y: 0, z: 0 }, cyl), Infinity);
  assert.equal(rayCylinder({ x: 0, y: 1, z: 2 }, { x: 1, y: 0, z: 0 }, cyl), Infinity, 'passes beside');
  assert.equal(rayCylinder({ x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, cyl), Infinity, 'behind');
  assert.equal(rayCylinder({ x: 10, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, cyl), Infinity, 'vertical ray');
});

test('rayCylinderHit says where the ray hit: distance, world height and height above the feet', () => {
  const cyl = { x: 10, y: 2, z: 0, height: 1.85, radius: 0.5 }; // standing on a 2 m box
  const head = rayCylinderHit({ x: 0, y: 3.7, z: 0 }, { x: 1, y: 0, z: 0 }, cyl);
  assert.ok(Math.abs(head.t - 9.5) < 1e-9);
  assert.ok(Math.abs(head.y - 3.7) < 1e-9);
  assert.ok(Math.abs(head.h - 1.7) < 1e-9, 'near the top: the head');
  // a sloped ray: the height is taken where it enters the side
  const d = { x: 1, y: -0.1, z: 0 }, l = Math.hypot(d.x, d.y);
  const legs = rayCylinderHit({ x: 0, y: 3.2, z: 0 }, { x: d.x / l, y: d.y / l, z: 0 }, cyl);
  assert.ok(Math.abs(legs.h - 0.25) < 1e-9, String(legs.h));
  assert.equal(legs.t, rayCylinder({ x: 0, y: 3.2, z: 0 }, { x: d.x / l, y: d.y / l, z: 0 }, cyl), 'same distance as rayCylinder');
  // misses are null
  assert.equal(rayCylinderHit({ x: 0, y: 4, z: 0 }, { x: 1, y: 0, z: 0 }, cyl), null, 'over the head');
  assert.equal(rayCylinderHit({ x: 0, y: 3, z: 2 }, { x: 1, y: 0, z: 0 }, cyl), null, 'beside');
  assert.equal(rayCylinderHit({ x: 0, y: 3, z: 0 }, { x: -1, y: 0, z: 0 }, cyl), null, 'behind');
  assert.equal(rayCylinderHit({ x: 10, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, cyl), null, 'vertical');
  // from inside the cylinder: the exit point
  const inside = rayCylinderHit({ x: 10, y: 3, z: 0 }, { x: 1, y: 0, z: 0 }, cyl);
  assert.ok(Math.abs(inside.t - 0.5) < 1e-9 && Math.abs(inside.h - 1) < 1e-9);
});

// ---- determinism ----

test('same inputs give the same outputs', () => {
  const make = () => {
    const r = lcg(99);
    const boxes = [];
    for (let i = 0; i < 80; i++) boxes.push(box(r() * 60 - 30, r() * 60 - 30, 0.8 + r() * 3, 0.8 + r() * 3, r() * 4));
    return boxes;
  };
  const sim = () => {
    const grid = createBoxGrid(make());
    const p = { x: 0, y: 0, z: 0, vy: 0, onGround: true };
    const trace = [];
    const r = lcg(7);
    for (let i = 0; i < 600; i++) {
      if (i % 50 === 0 && p.onGround) p.vy = 8;
      movePlayer(grid, p, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6, 1 / 60, { ...OPTS, boundsRadius: 28 });
      trace.push(p.x, p.y, p.z, p.vy, p.onGround,
        rayBoxes(grid, { x: p.x, y: p.y + 1.5, z: p.z }, unit(r() - 0.5, -0.1, r() - 0.5), 80));
    }
    return trace;
  };
  assert.deepEqual(sim(), sim());
});
