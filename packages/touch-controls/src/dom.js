// Thin browser adapters: turn real pointer / keyboard / mouse events into
// core events on an input state from createInputState(). Each returns detach().

export function isTouchDevice(win = globalThis) {
  if (!win) return false;
  const coarse = typeof win.matchMedia === 'function' && !!win.matchMedia('(pointer: coarse)')?.matches;
  return coarse || (win.navigator?.maxTouchPoints ?? 0) > 0;
}

function listen(list, el, type, fn, opts) {
  el.addEventListener(type, fn, opts);
  list.push(() => el.removeEventListener(type, fn, opts));
}

const capture = (el, e) => { try { el.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ } };

/**
 * Touch screen: joystick on the left, drag on the canvas / fire button to aim,
 * tap buttons for actions. `buttons` maps a button name to its element;
 * the name equal to state.config.fireButton ('fire') is held, every other one is tapped.
 */
export function attachTouchControls(state, { canvas, stick, knob, buttons = {} } = {}) {
  const off = [];
  const setKnob = p => { if (knob) knob.style.transform = p.x || p.y ? `translate(${p.x}px, ${p.y}px)` : ''; };

  if (stick) {
    let stickId = null, cx = 0, cy = 0;
    listen(off, stick, 'pointerdown', e => {
      e.preventDefault();
      if (!state.enabled) return;
      stickId = e.pointerId;
      capture(stick, e);
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      setKnob(state.stickStart(e.clientX - cx, e.clientY - cy));
    });
    listen(off, stick, 'pointermove', e => {
      if (e.pointerId !== stickId) return;
      setKnob(state.stickMove(e.clientX - cx, e.clientY - cy));
    });
    const end = e => {
      if (e.pointerId !== stickId) return;
      stickId = null; state.stickEnd(); setKnob({ x: 0, y: 0 });
    };
    listen(off, stick, 'pointerup', end);
    listen(off, stick, 'pointercancel', end);
  }

  const lookMove = e => state.lookMove(e.pointerId, e.clientX, e.clientY);
  const lookEnd = e => state.lookEnd(e.pointerId);

  if (canvas) {
    listen(off, canvas, 'pointerdown', e => {
      if (state.lookStart(e.pointerId, e.clientX, e.clientY)) capture(canvas, e);
    });
    listen(off, canvas, 'pointermove', lookMove);
    listen(off, canvas, 'pointerup', lookEnd);
    listen(off, canvas, 'pointercancel', lookEnd);
  }

  const pressedEls = [];
  for (const [name, el] of Object.entries(buttons)) {
    if (!el) continue;
    pressedEls.push(el);
    if (name === state.config.fireButton) {
      // hold to shoot, and drag on it to aim at the same time
      listen(off, el, 'pointerdown', e => {
        e.preventDefault();
        state.button(name, true);
        el.classList.add('pressed');
        if (state.lookStart(e.pointerId, e.clientX, e.clientY)) capture(el, e);
      });
      listen(off, el, 'pointermove', lookMove);
      const end = e => { state.button(name, false); el.classList.remove('pressed'); lookEnd(e); };
      listen(off, el, 'pointerup', end);
      listen(off, el, 'pointercancel', end);
    } else {
      listen(off, el, 'pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        state.button(name, true);
        el.classList.add('pressed');
      });
      const up = () => { state.button(name, false); el.classList.remove('pressed'); };
      listen(off, el, 'pointerup', up);
      listen(off, el, 'pointercancel', up);
    }
  }

  off.push(state.onReset(() => {
    setKnob({ x: 0, y: 0 });
    for (const el of pressedEls) el.classList.remove('pressed');
  }));

  return function detach() { while (off.length) off.pop()(); };
}

/**
 * Computer: click the canvas to lock the pointer, then mouse = look,
 * left button = fire, keyboard = move + actions, wheel = switch slot.
 */
export function attachDesktopControls(state, { canvas, target = globalThis.window, doc } = {}) {
  const off = [];
  const d = doc || target?.document || globalThis.document;
  const locked = () => !!canvas && d?.pointerLockElement === canvas;

  if (canvas) {
    listen(off, canvas, 'mousedown', e => {
      if (!state.enabled) return;
      if (!locked()) { canvas.requestPointerLock?.(); return; }
      state.mouseButton(e.button, true);
    });
  }
  listen(off, target, 'mouseup', e => state.mouseButton(e.button, false));
  listen(off, target, 'mousemove', e => { if (locked()) state.mouseMove(e.movementX || 0, e.movementY || 0); });
  listen(off, target, 'keydown', e => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
    if (!state.enabled) return;
    state.key(e.key, true, !!e.repeat);
    if (e.key === ' ') e.preventDefault();
  });
  listen(off, target, 'keyup', e => state.key(e.key, false));
  listen(off, target, 'blur', () => state.blur());
  listen(off, target, 'wheel', e => state.wheel(e.deltaY));

  off.push(state.onReset(() => { if (d?.pointerLockElement) d.exitPointerLock?.(); }));

  return function detach() { while (off.length) off.pop()(); };
}
