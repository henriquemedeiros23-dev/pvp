import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInputState, DEFAULT_CONFIG } from '../src/index.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('joystick clamps to radius and normalises', () => {
  const s = createInputState();
  const k = s.stickStart(110, 0); // twice the radius to the right
  assert.deepEqual(k, { x: 55, y: 0 });
  assert.deepEqual(s.move, { x: 1, y: 0 });
  s.stickMove(0, -27.5); // half up = forward
  close(s.move.x, 0); close(s.move.y, 0.5);
  s.stickMove(100, 100);
  close(Math.hypot(s.move.x, s.move.y), 1);
  close(Math.hypot(s.knob.x, s.knob.y), 55);
});

test('joystick radius is configurable', () => {
  const s = createInputState({ stickRadius: 10 });
  s.stickStart(5, 0);
  assert.deepEqual(s.move, { x: 0.5, y: 0 });
});

test('releasing the joystick resets move', () => {
  const s = createInputState();
  s.stickStart(20, 20);
  s.stickEnd();
  assert.deepEqual(s.move, { x: 0, y: 0 });
  assert.deepEqual(s.knob, { x: 0, y: 0 });
  s.stickMove(30, 0); // move without an active stick does nothing
  assert.deepEqual(s.move, { x: 0, y: 0 });
});

test('look accumulates per pointer and take() clears it', () => {
  const s = createInputState();
  s.lookStart(1, 100, 100);
  s.lookStart(2, 500, 500);
  s.lookMove(1, 110, 100);
  s.lookMove(1, 120, 90);
  s.lookMove(2, 520, 500);
  s.lookMove(3, 999, 999); // unknown pointer ignored
  const t = s.take();
  close(t.look.x, 40 * DEFAULT_CONFIG.touchLookSensitivity);
  close(t.look.y, -10 * DEFAULT_CONFIG.touchLookSensitivity);
  assert.deepEqual(s.take().look, { x: 0, y: 0 });
  s.lookEnd(1);
  s.lookMove(1, 0, 0);
  assert.deepEqual(s.take().look, { x: 0, y: 0 });
});

test('fire is held via button and via mouse', () => {
  const s = createInputState();
  s.button('fire', true);
  assert.equal(s.fire, true);
  s.mouseButton(0, true);
  s.button('fire', false);
  assert.equal(s.fire, true); // mouse still holds it
  s.mouseButton(2, false);    // other mouse buttons ignored
  assert.equal(s.fire, true);
  s.mouseButton(0, false);
  assert.equal(s.fire, false);
  assert.deepEqual(s.take().ev, []); // fire is not an action
});

test('tap buttons queue actions, any extra name works', () => {
  const s = createInputState({ buttonActions: { drink: 'potion' } });
  s.button('jump', true); s.button('jump', false);
  s.button('potion', true);
  s.button('drink', true);
  assert.deepEqual(s.take().ev, ['jump', 'potion', 'potion']);
  assert.deepEqual(s.take().ev, []);
});

test('keys: WASD, diagonal normalised, shift does not slow you down any more', () => {
  const s = createInputState();
  s.key('w', true);
  assert.deepEqual(s.move, { x: 0, y: 1 });
  s.key('D', true);
  close(s.move.x, Math.SQRT1_2); close(s.move.y, Math.SQRT1_2);
  s.key('Shift', true);
  close(Math.hypot(s.move.x, s.move.y), 1);
  s.key('Shift', false); s.key('w', false); s.key('d', false);
  assert.deepEqual(s.move, { x: 0, y: 0 });
  s.key('ArrowLeft', true); s.key('a', true);
  assert.deepEqual(s.move, { x: -1, y: 0 });
  s.key('arrowleft', false);
  assert.deepEqual(s.move, { x: -1, y: 0 }); // 'a' still held
});

test('keys: actions, repeat ignored, slots 1-5', () => {
  const s = createInputState();
  s.key(' ', true); s.key(' ', true, true); s.key(' ', false);
  s.key('c', true); s.key('Control', true); s.key('e', true); s.key('g', true); s.key('q', true); s.key('f', true); // f: nothing (no medkits any more)
  s.key('B', true); s.key('n', true); // bombs (#32)
  for (const n of ['1', '2', '3', '4', '5']) s.key(n, true);
  s.key('6', true);
  assert.deepEqual(s.take().ev, ['jump', 'crouch', 'crouch', 'open', 'drop', 'potion', 'throw:bomb', 'throw:legendarybomb',
    'slot:0', 'slot:1', 'slot:2', 'slot:3', 'slot:4']);
});

test('keys: bindings are configurable', () => {
  const s = createInputState({
    moveKeys: { forward: ['z'], left: ['q'], walk: ['shift'] },
    actionKeys: { x: 'reload' },
    walkSpeed: 0.5,
  });
  s.key('z', true); s.key('q', true);
  close(s.move.x, -Math.SQRT1_2); close(s.move.y, Math.SQRT1_2);
  s.key('Shift', true);
  close(Math.hypot(s.move.x, s.move.y), 0.5);
  s.key('x', true); s.key(' ', true);
  assert.deepEqual(s.take().ev, ['reload']); // default action keys replaced
});

test('wheel down/up switches slots', () => {
  const s = createInputState();
  s.wheel(100); s.wheel(-3); s.wheel(0);
  assert.deepEqual(s.take().ev, ['slot:+', 'slot:-']);
});

test('mouse move looks with mouse sensitivity', () => {
  const s = createInputState();
  s.mouseMove(10, -5);
  const { look } = s.take();
  close(look.x, 10 * 0.0024); close(look.y, -5 * 0.0024);
});

test('blur clears keys and fire', () => {
  const s = createInputState();
  s.key('w', true); s.key('a', true); s.button('fire', true); s.mouseButton(0, true);
  s.blur();
  assert.deepEqual(s.move, { x: 0, y: 0 });
  assert.equal(s.fire, false);
});

test('disabled state ignores input but still lets go', () => {
  const s = createInputState({ enabled: false });
  s.stickStart(30, 0); s.lookStart(1, 0, 0); s.lookMove(1, 50, 50);
  s.button('fire', true); s.button('jump', true); s.mouseButton(0, true);
  s.mouseMove(5, 5); s.wheel(1); s.key('w', true); s.key(' ', true);
  assert.deepEqual(s.take(), { ev: [], actions: [], look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, fire: false, shield: false, aim: false, holds: { shield: false, aim: false }, toggles: { aim: false } });

  s.enabled = true;
  s.key('w', true); s.button('fire', true);
  s.enabled = false;
  s.key('w', false); s.button('fire', false); // releases still work
  assert.deepEqual(s.move, { x: 0, y: 0 });
  assert.equal(s.fire, false);
});

test('reset clears everything and calls listeners', () => {
  const s = createInputState();
  let calls = 0;
  const off = s.onReset(() => calls++);
  s.stickStart(40, 0); s.button('fire', true); s.key('e', true); s.mouseMove(3, 3);
  s.reset();
  assert.deepEqual(s.take(), { ev: [], actions: [], look: { x: 0, y: 0 }, move: { x: 0, y: 0 }, fire: false, shield: false, aim: false, holds: { shield: false, aim: false }, toggles: { aim: false } });
  assert.equal(calls, 1);
  off(); s.reset();
  assert.equal(calls, 1);
});

test('same event sequence gives the same result', () => {
  const run = () => {
    const s = createInputState();
    const out = [];
    s.stickStart(12, -40); s.lookStart(7, 300, 200);
    for (let i = 0; i < 20; i++) {
      s.stickMove(12 + i * 3, -40 + i);
      s.lookMove(7, 300 + i * i, 200 - i);
      if (i % 4 === 0) s.button('jump', true);
      if (i % 5 === 0) s.wheel(i - 10);
      s.key(i % 2 ? 'w' : 'd', i % 3 === 0);
      out.push(s.take());
    }
    s.stickEnd(); s.mouseMove(4, 2); s.key('3', true);
    out.push(s.take());
    return out;
  };
  assert.deepEqual(run(), run());
});

test('shield (#49): hold the right mouse button or the shield button; held while any of them is down', () => {
  const s = createInputState();
  assert.equal(s.shield, false);
  s.key('Shift', true);
  assert.equal(s.shield, false, 'Shift does not raise the shield any more');
  s.key('Shift', false);
  s.mouseButton(2, true);
  assert.equal(s.shield, true);
  assert.equal(s.aim, false, 'right click does not aim any more');
  assert.equal(s.held('shield'), true);
  let t = s.take();
  assert.equal(t.shield, true);
  assert.deepEqual(t.holds, { shield: true, aim: false });
  assert.deepEqual(t.ev, [], 'holding is not an action');
  s.button('shield', true);   // phone button too
  s.mouseButton(2, false);
  assert.equal(s.shield, true, 'the button is still held');
  s.button('shield', false);
  assert.equal(s.take().shield, false);
  s.mouseButton(2, true);
  s.mouseButton(2, false);
  assert.equal(s.shield, false, 'letting go lowers it (not a toggle)');
  // disabled: new presses are ignored, releases still work
  s.mouseButton(2, true);
  s.enabled = false;
  s.button('shield', true);
  s.mouseButton(2, false);
  assert.equal(s.shield, false);
  s.enabled = true;
  s.mouseButton(2, true);
  s.blur();
  assert.equal(s.shield, false, 'blur lets go');
  s.button('shield', true);
  s.reset();
  assert.equal(s.shield, false, 'reset lets go');
});

test('held actions are configurable', () => {
  const s = createInputState({ holdKeys: { block: ['b'] }, holdButtons: ['guard'] });
  s.key('Shift', true);
  assert.equal(s.shield, false);
  s.key('b', true);
  assert.equal(s.held('block'), true);
  s.button('guard', true);
  assert.deepEqual(s.take().holds, { block: true, guard: true, shield: false, aim: false },
    'shield (holdMouse) and aim (toggleButtons / toggleKeys) are still there');
});

test('aim (#37, #40, #49): a tap on the aim button or a press of Shift switches aiming on, the next one off', () => {
  const s = createInputState();
  assert.equal(s.shown('aim'), false, 'the aim button starts hidden');
  s.button('aim', true);
  assert.equal(s.aim, false, 'a hidden button cannot be pressed');
  s.key('Shift', true); s.key('Shift', false);
  assert.equal(s.aim, false, 'a hidden toggle cannot be switched on with Shift either (weapon cannot aim)');

  const seen = [], toggles = [];
  const stop = s.onShow((name, visible) => seen.push(`${name}:${visible}`));
  const stopT = s.onToggle((name, on) => toggles.push(`${name}:${on}`));
  s.show('aim', true);
  s.show('aim', true); // no change, no call
  assert.equal(s.shown('aim'), true);

  // tap: on, and it stays on after letting go
  s.button('aim', true);
  s.button('aim', false);
  assert.equal(s.aim, true, 'stays on after letting go');
  assert.equal(s.toggled('aim'), true);
  assert.equal(s.fire, false, 'aiming is not shooting');
  let t = s.take();
  assert.equal(t.aim, true);
  assert.equal(t.holds.aim, true);
  assert.deepEqual(t.toggles, { aim: true });
  assert.deepEqual(t.ev, [], 'a toggle is not an action');
  assert.equal(s.take().aim, true, 'still on after a take');
  // tap again: off
  s.button('aim', true);
  assert.equal(s.aim, false);
  s.button('aim', false);
  assert.equal(s.aim, false, 'letting go does nothing');

  // Shift: press = switch, release does nothing, key repeat does nothing; it is the same toggle as the button
  s.key('Shift', true);
  assert.equal(s.aim, true, 'Shift: on');
  for (let i = 0; i < 5; i++) s.key('Shift', true, true);
  assert.equal(s.aim, true, 'key repeat does not switch it again');
  s.key('Shift', true);
  assert.equal(s.aim, true, 'a second keydown while still down does not switch it either');
  s.key('Shift', false);
  assert.equal(s.aim, true, 'letting go of Shift does nothing');
  assert.deepEqual(s.take().ev, [], 'Shift is not an action');
  s.button('aim', true);
  assert.equal(s.aim, false, 'the button switches the same toggle off');
  s.key('shift', true); s.key('shift', false);
  s.key('SHIFT', true);
  assert.equal(s.aim, false, 'Shift again: off');
  s.key('Shift', false);
  s.mouseButton(2, true);
  assert.equal(s.aim, false, 'right click does not aim any more');
  s.mouseButton(2, false);

  // blur keeps it on (nothing is held down)
  s.button('aim', true);
  s.blur();
  assert.equal(s.aim, true, 'blur keeps a toggle on');

  // the game switches it off (e.g. the weapon broke), or hiding the button does (switched to the Gun)
  s.setToggle('aim', false);
  assert.equal(s.aim, false);
  s.setToggle('aim', true);
  assert.equal(s.aim, true, 'the game can switch it on too');
  s.show('aim', false);
  assert.equal(s.aim, false, 'hiding the button switches it off');
  s.setToggle('aim', true);
  assert.equal(s.aim, false, 'not while hidden');
  assert.deepEqual(seen, ['aim:true', 'aim:false']);
  stop();
  s.show('aim', true);
  assert.equal(seen.length, 2, 'listener removed');

  // disabled: cannot switch on, but can switch off; reset switches off
  s.button('aim', true);
  s.enabled = false;
  s.key('Shift', true); s.key('Shift', false);
  assert.equal(s.aim, false, 'switching off works while disabled');
  s.button('aim', true);
  s.key('Shift', true); s.key('Shift', false);
  assert.equal(s.aim, false, 'switching on does not');
  s.enabled = true;
  s.button('aim', true);
  s.reset();
  assert.equal(s.aim, false, 'reset switches it off (new game)');
  assert.equal(s.shown('aim'), true, 'reset keeps what is shown');
  assert.deepEqual(toggles, ['aim:true', 'aim:false', 'aim:true', 'aim:false', 'aim:true', 'aim:false', 'aim:true', 'aim:false',
    'aim:true', 'aim:false', 'aim:true', 'aim:false', 'aim:true', 'aim:false']);
  stopT();
  s.button('aim', true);
  assert.equal(toggles.length, 14, 'toggle listener removed');
});

test('the shield stays a hold button', () => {
  const s = createInputState();
  s.button('shield', true);
  s.button('shield', false);
  assert.equal(s.shield, false);
  assert.deepEqual(DEFAULT_CONFIG.holdButtons, ['shield']);
});

test('aim is deterministic: the same events give the same result', () => {
  const run = () => {
    const s = createInputState();
    const out = [];
    s.show('aim', true);
    for (const [kind, v] of [['b', true], ['b', false], ['m', true], ['m', false], ['m', true], ['b', true], ['b', false]]) {
      if (kind === 'b') s.button('aim', v); else s.key('Shift', v);
      out.push(s.take().aim);
    }
    return out;
  };
  assert.deepEqual(run(), [true, true, false, false, true, false, false]);
  assert.deepEqual(run(), run());
});

test('hiddenButtons, holdMouse and toggles are configurable', () => {
  const s = createInputState({ hiddenButtons: [], holdMouse: { 1: 'zoom' }, toggleKeys: {}, toggleButtons: ['map'] });
  assert.equal(s.shown('aim'), true);
  s.mouseButton(2, true);
  assert.equal(s.aim, false, 'right button does not aim');
  assert.equal(s.shield, false, 'right button not bound any more');
  s.key('Shift', true);
  assert.equal(s.aim, false, 'Shift not bound any more');
  s.mouseButton(1, true);
  assert.equal(s.held('zoom'), true);
  s.mouseButton(1, false);
  assert.equal(s.held('zoom'), false, 'holdMouse: held only while down');
  s.button('map', true); s.button('map', false);
  assert.equal(s.toggled('map'), true);
  assert.deepEqual(s.take().toggles, { map: true });
  s.button('aim', true);
  assert.deepEqual(s.take().ev, ['aim'], 'aim is a plain tap button when it is not a toggle');
  assert.deepEqual(DEFAULT_CONFIG.holdMouse, { 2: 'shield' });
  assert.deepEqual(DEFAULT_CONFIG.holdKeys, {});
  assert.deepEqual(DEFAULT_CONFIG.toggleKeys, { aim: ['shift'] });
  assert.deepEqual(DEFAULT_CONFIG.toggleMouse, {});
  assert.deepEqual(DEFAULT_CONFIG.toggleButtons, ['aim']);
  assert.deepEqual(DEFAULT_CONFIG.hiddenButtons, ['aim']);
});

test('the old controls can be set back (#49): Shift held = shield, right click = aim toggle', () => {
  const s = createInputState({ holdKeys: { shield: ['shift'] }, holdMouse: {}, toggleKeys: {}, toggleMouse: { 2: 'aim' } });
  s.show('aim', true);
  s.key('Shift', true);
  assert.equal(s.shield, true);
  s.key('Shift', false);
  assert.equal(s.shield, false);
  s.mouseButton(2, true); s.mouseButton(2, false);
  assert.equal(s.aim, true);
  s.mouseButton(2, true);
  assert.equal(s.aim, false);
});
