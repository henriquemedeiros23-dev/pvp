// Pure, deterministic input state. No DOM, no time, no randomness:
// abstract input events go in, `move`, `look`, `fire` and named actions come out.

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  stickRadius: 55,            // joystick knob travel in pixels
  touchLookSensitivity: 0.0055, // radians per pixel of drag
  mouseSensitivity: 0.0024,   // radians per pixel of mouse movement
  walkSpeed: 0.6,             // move length while a walk key is held
  fireButton: 'fire',         // button name that is held to shoot
  wheelUp: 'slot:-',          // action for wheel dy < 0
  wheelDown: 'slot:+',        // action for wheel dy > 0
  moveKeys: Object.freeze({
    forward: Object.freeze(['w', 'arrowup']),
    back: Object.freeze(['s', 'arrowdown']),
    left: Object.freeze(['a', 'arrowleft']),
    right: Object.freeze(['d', 'arrowright']),
    walk: Object.freeze(['shift']),
  }),
  actionKeys: Object.freeze({
    ' ': 'jump',
    c: 'crouch',
    control: 'crouch',
    e: 'open',
    q: 'potion',               // drink a Healing Potion
    1: 'slot:0',
    2: 'slot:1',
    3: 'slot:2',
    4: 'slot:3',
    5: 'slot:4',
  }),
  buttonActions: Object.freeze({}), // optional: button name -> action name (default: same name)
});

const lower = k => String(k).toLowerCase();

export function createInputState(config = {}) {
  const cfg = {
    ...DEFAULT_CONFIG,
    ...config,
    moveKeys: { ...DEFAULT_CONFIG.moveKeys, ...(config.moveKeys || {}) },
    actionKeys: { ...(config.actionKeys || DEFAULT_CONFIG.actionKeys) },
    buttonActions: { ...DEFAULT_CONFIG.buttonActions, ...(config.buttonActions || {}) },
  };
  const actionKeys = new Map(Object.entries(cfg.actionKeys).map(([k, a]) => [lower(k), a]));
  const moveKeys = {};
  for (const [dir, list] of Object.entries(cfg.moveKeys)) moveKeys[dir] = list.map(lower);

  let enabled = !!cfg.enabled;
  const keys = new Set();
  const stick = { active: false, x: 0, y: 0 };   // normalised -1..1, y = forward
  const knob = { x: 0, y: 0 };                   // clamped pixel offset for drawing
  const keyMove = { x: 0, y: 0 };
  const move = { x: 0, y: 0 };
  const look = { x: 0, y: 0 };
  const lookers = new Map();
  const held = new Set();                        // fire sources: 'button', 'mouse'
  let actions = [];
  const resetListeners = new Set();

  const has = dir => (moveKeys[dir] || []).some(k => keys.has(k));

  function updateMove() {
    if (stick.active) { move.x = stick.x; move.y = stick.y; return; }
    move.x = keyMove.x; move.y = keyMove.y;
  }

  function updateKeys() {
    const x = (has('right') ? 1 : 0) - (has('left') ? 1 : 0);
    const y = (has('forward') ? 1 : 0) - (has('back') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    const speed = has('walk') ? cfg.walkSpeed : 1;
    keyMove.x = (x / len) * speed + 0; keyMove.y = (y / len) * speed + 0;
    updateMove();
  }

  function stickTo(dx, dy) {
    const R = cfg.stickRadius;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.x = dx; knob.y = dy;
    stick.x = dx / R + 0; stick.y = -dy / R + 0;
    updateMove();
    return { x: knob.x, y: knob.y };
  }

  const state = {
    config: cfg,
    move, look, knob,
    get fire() { return held.size > 0; },
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; },

    // --- joystick (pixel offsets from the stick centre, screen y down) ---
    stickStart(dx, dy) {
      if (!enabled) return { x: knob.x, y: knob.y };
      stick.active = true;
      return stickTo(dx, dy);
    },
    stickMove(dx, dy) {
      if (!stick.active) return { x: knob.x, y: knob.y };
      return stickTo(dx, dy);
    },
    stickEnd() {
      stick.active = false; stick.x = stick.y = 0; knob.x = knob.y = 0;
      updateMove();
    },

    // --- drag-to-aim, one entry per pointer id (absolute pixel positions) ---
    lookStart(id, x, y) {
      if (!enabled) return false;
      lookers.set(id, { x, y });
      return true;
    },
    lookMove(id, x, y) {
      const l = lookers.get(id);
      if (!l) return;
      if (enabled) {
        look.x += (x - l.x) * cfg.touchLookSensitivity;
        look.y += (y - l.y) * cfg.touchLookSensitivity;
      }
      l.x = x; l.y = y;
    },
    lookEnd(id) { lookers.delete(id); },

    // --- on-screen buttons: the fire button is held, the rest are tapped ---
    button(name, down) {
      if (name === cfg.fireButton) {
        if (!down) held.delete('button');
        else if (enabled) held.add('button');
        return;
      }
      if (down && enabled) actions.push(cfg.buttonActions[name] ?? name);
    },

    // --- mouse: button 0 fires, movement looks (only while pointer is locked) ---
    mouseButton(button, down) {
      if (button !== 0) return;
      if (!down) held.delete('mouse');
      else if (enabled) held.add('mouse');
    },
    mouseMove(dx, dy) {
      if (!enabled) return;
      look.x += dx * cfg.mouseSensitivity;
      look.y += dy * cfg.mouseSensitivity;
    },
    wheel(dy) {
      if (!enabled || !dy) return;
      actions.push(dy > 0 ? cfg.wheelDown : cfg.wheelUp);
    },

    // --- keyboard (KeyboardEvent.key values, any case) ---
    key(key, down, repeat = false) {
      const k = lower(key);
      if (!down) { keys.delete(k); updateKeys(); return; }
      if (!enabled) return;
      if (!repeat && actionKeys.has(k)) actions.push(actionKeys.get(k));
      keys.add(k);
      updateKeys();
    },

    // window lost focus: let go of everything that is held
    blur() {
      keys.clear(); held.clear();
      updateKeys();
    },

    // returns queued actions and accumulated look, then clears them
    take() {
      const ev = actions; actions = [];
      const l = { x: look.x, y: look.y }; look.x = look.y = 0;
      return { ev, actions: ev, look: l, move: { x: move.x, y: move.y }, fire: held.size > 0 };
    },

    // drop all input (e.g. when a match ends)
    reset() {
      keys.clear(); held.clear(); lookers.clear(); actions = [];
      look.x = look.y = 0;
      stick.active = false; stick.x = stick.y = 0; knob.x = knob.y = 0;
      keyMove.x = keyMove.y = 0;
      updateMove();
      for (const fn of [...resetListeners]) fn();
    },
    onReset(fn) { resetListeners.add(fn); return () => resetListeners.delete(fn); },
  };
  return state;
}
