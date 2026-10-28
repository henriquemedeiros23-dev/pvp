import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInputState, attachTouchControls, attachDesktopControls, isTouchDevice } from '../src/index.js';

// Tiny fake element: enough of the DOM for the adapters.
function fakeEl(rect = { left: 0, top: 0, width: 100, height: 100 }) {
  const handlers = {};
  const classes = new Set();
  return {
    style: { transform: '' },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), has: c => classes.has(c) },
    captured: [],
    lockRequests: 0,
    addEventListener(t, fn) { (handlers[t] ||= new Set()).add(fn); },
    removeEventListener(t, fn) { handlers[t]?.delete(fn); },
    setPointerCapture(id) { this.captured.push(id); },
    requestPointerLock() { this.lockRequests++; },
    getBoundingClientRect: () => rect,
    fire(t, e = {}) {
      const ev = { preventDefault() {}, stopPropagation() {}, ...e };
      for (const fn of handlers[t] || []) fn(ev);
    },
    count: t => handlers[t]?.size || 0,
  };
}

test('touch adapter: stick, look, fire, tap buttons, detach', () => {
  const s = createInputState();
  const canvas = fakeEl(), stick = fakeEl(), knob = fakeEl();
  const fire = fakeEl(), jump = fakeEl(), potion = fakeEl();
  const detach = attachTouchControls(s, { canvas, stick, knob, buttons: { fire, jump, potion } });

  stick.fire('pointerdown', { pointerId: 1, clientX: 50 + 110, clientY: 50 });
  assert.deepEqual(s.move, { x: 1, y: 0 });
  assert.equal(knob.style.transform, 'translate(55px, 0px)');
  stick.fire('pointerup', { pointerId: 1 });
  assert.deepEqual(s.move, { x: 0, y: 0 });
  assert.equal(knob.style.transform, '');

  canvas.fire('pointerdown', { pointerId: 2, clientX: 10, clientY: 10 });
  canvas.fire('pointermove', { pointerId: 2, clientX: 20, clientY: 10 });
  assert.deepEqual(canvas.captured, [2]);

  fire.fire('pointerdown', { pointerId: 3, clientX: 0, clientY: 0 });
  assert.equal(s.fire, true);
  assert.ok(fire.classList.has('pressed'));
  fire.fire('pointermove', { pointerId: 3, clientX: 10, clientY: 0 });
  fire.fire('pointerup', { pointerId: 3 });
  assert.equal(s.fire, false);

  jump.fire('pointerdown', { pointerId: 4 });
  potion.fire('pointerdown', { pointerId: 5 });
  const t = s.take();
  assert.deepEqual(t.ev, ['jump', 'potion']);
  assert.ok(Math.abs(t.look.x - 20 * 0.0055) < 1e-9);

  detach();
  for (const el of [canvas, stick, fire, jump, potion]) assert.equal(el.count('pointerdown'), 0);
});

test('desktop adapter: pointer lock, mouse, keys, wheel, blur, detach', () => {
  const s = createInputState();
  const canvas = fakeEl();
  const doc = { pointerLockElement: null, exitPointerLock() { this.pointerLockElement = null; } };
  const win = fakeEl();
  const detach = attachDesktopControls(s, { canvas, target: win, doc });

  canvas.fire('mousedown', { button: 0 });
  assert.equal(canvas.lockRequests, 1);
  assert.equal(s.fire, false);
  win.fire('mousemove', { movementX: 50, movementY: 0 }); // not locked: ignored
  doc.pointerLockElement = canvas;
  canvas.fire('mousedown', { button: 0 });
  assert.equal(s.fire, true);
  win.fire('mouseup', { button: 0 });
  assert.equal(s.fire, false);
  win.fire('mousemove', { movementX: 10, movementY: 0 });

  win.fire('keydown', { key: 'W', target: { tagName: 'BODY' } });
  win.fire('keydown', { key: 'e', target: { tagName: 'INPUT' } }); // typing in a box
  win.fire('keydown', { key: '2', target: { tagName: 'BODY' } });
  win.fire('wheel', { deltaY: 1 });
  assert.deepEqual(s.move, { x: 0, y: 1 });
  const t = s.take();
  assert.deepEqual(t.ev, ['slot:1', 'slot:+']);
  assert.ok(Math.abs(t.look.x - 10 * 0.0024) < 1e-9);

  win.fire('blur');
  assert.deepEqual(s.move, { x: 0, y: 0 });

  s.reset();
  assert.equal(doc.pointerLockElement, null);

  detach();
  assert.equal(win.count('keydown'), 0);
  assert.equal(canvas.count('mousedown'), 0);
});

test('isTouchDevice', () => {
  assert.equal(isTouchDevice({ matchMedia: () => ({ matches: true }), navigator: {} }), true);
  assert.equal(isTouchDevice({ matchMedia: () => ({ matches: false }), navigator: { maxTouchPoints: 5 } }), true);
  assert.equal(isTouchDevice({ matchMedia: () => ({ matches: false }), navigator: { maxTouchPoints: 0 } }), false);
  assert.equal(isTouchDevice({}), false);
});

test('touch adapter: the shield button is held (and you can aim by dragging on it)', () => {
  const s = createInputState();
  const canvas = fakeEl(), shield = fakeEl();
  attachTouchControls(s, { canvas, buttons: { shield } });
  shield.fire('pointerdown', { pointerId: 5, clientX: 0, clientY: 0 });
  assert.equal(s.shield, true);
  assert.ok(shield.classList.has('pressed'));
  shield.fire('pointermove', { pointerId: 5, clientX: 10, clientY: 0 });
  assert.ok(s.take().look.x > 0, 'drag on it to turn');
  assert.equal(s.shield, true, 'still held after a take');
  shield.fire('pointerup', { pointerId: 5 });
  assert.equal(s.shield, false);
});

test('touch adapter: the aim button is hidden until shown, then a tap switches it on / off (#37, #40)', () => {
  const s = createInputState();
  const canvas = fakeEl(), aim = fakeEl();
  const detach = attachTouchControls(s, { canvas, buttons: { aim } });
  assert.ok(aim.classList.has('hidden'), 'hidden at the start');
  s.show('aim', true);
  assert.ok(!aim.classList.has('hidden'));
  aim.fire('pointerdown', { pointerId: 2, clientX: 0, clientY: 0 });
  aim.fire('pointermove', { pointerId: 2, clientX: 10, clientY: 0 });
  assert.ok(s.take().look.x > 0, 'drag on it to turn');
  aim.fire('pointerup', { pointerId: 2 });
  assert.equal(s.aim, true, 'stays on after letting go');
  assert.ok(aim.classList.has('pressed') && aim.classList.has('on'), 'looks pressed while on');
  aim.fire('pointerdown', { pointerId: 3, clientX: 0, clientY: 0 });
  aim.fire('pointerup', { pointerId: 3 });
  assert.equal(s.aim, false, 'tap again = off');
  assert.ok(!aim.classList.has('pressed') && !aim.classList.has('on'));
  aim.fire('pointerdown', { pointerId: 4, clientX: 0, clientY: 0 });
  assert.ok(aim.classList.has('on'));
  s.setToggle('aim', false); // e.g. the weapon broke
  assert.ok(!aim.classList.has('on'), 'switched off by the game: the look follows');
  s.setToggle('aim', true);
  s.show('aim', false);
  assert.ok(aim.classList.has('hidden') && !aim.classList.has('pressed') && !aim.classList.has('on'));
  assert.equal(s.aim, false);
  detach();
  s.show('aim', true);
  s.setToggle('aim', true);
  assert.ok(aim.classList.has('hidden') && !aim.classList.has('on'), 'detached: the element is not changed any more');
});

test('desktop adapter: a right click switches aiming on / off, no context menu (#37, #40)', () => {
  const s = createInputState();
  s.show('aim', true); // a weapon that can aim
  const canvas = fakeEl();
  const doc = { pointerLockElement: canvas };
  const win = fakeEl();
  attachDesktopControls(s, { canvas, target: win, doc });
  canvas.fire('mousedown', { button: 2 });
  win.fire('mouseup', { button: 2 });
  assert.equal(s.aim, true, 'stays on after letting go');
  assert.equal(s.fire, false);
  canvas.fire('mousedown', { button: 2 });
  assert.equal(s.aim, false, 'right click again = off');
  win.fire('mouseup', { button: 2 });
  assert.equal(s.aim, false);
  let prevented = false;
  canvas.fire('contextmenu', { preventDefault() { prevented = true; } });
  assert.ok(prevented);
});
