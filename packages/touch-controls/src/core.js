// Pure, deterministic input state. No DOM, no time, no randomness:
// abstract input events go in, `move`, `look`, `fire` and named actions come out.

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  stickRadius: 55,            // joystick knob travel in pixels
  touchLookSensitivity: 0.0055, // radians per pixel of drag
  mouseSensitivity: 0.0024,   // radians per pixel of mouse movement
  walkSpeed: 0.6,             // move length while a walk key is held
  fireButton: 'fire',         // button name that is held to shoot
  // Held actions besides fire: true while any of their keys or buttons is held down.
  // The right mouse button (computer) or the shield button (phone) raises the shield (#49).
  holdKeys: Object.freeze({}),  // held action -> keys, e.g. { shield: ['shift'] }
  holdButtons: Object.freeze(['shield']),
  holdMouse: Object.freeze({ 2: 'shield' }), // mouse button number -> held action (0 is always fire)
  // Toggled actions: a press switches them on, the next press switches them off (letting go does nothing).
  // The aim button (phone) or Shift (computer) toggles aiming (#37, #40, #49).
  toggleButtons: Object.freeze(['aim']),
  toggleKeys: Object.freeze({ aim: Object.freeze(['shift']) }), // toggled action -> keys (key repeat does not switch again)
  toggleMouse: Object.freeze({}), // mouse button number -> toggled action, e.g. { 2: 'aim' }
  // On-screen buttons hidden at the start (show them with state.show(name, true)), e.g. aim only with a weapon that can aim.
  // A hidden toggle is switched off and cannot be switched on (not even with the mouse).
  hiddenButtons: Object.freeze(['aim']),
  wheelUp: 'slot:-',          // action for wheel dy < 0
  wheelDown: 'slot:+',        // action for wheel dy > 0
  moveKeys: Object.freeze({
    forward: Object.freeze(['w', 'arrowup']),
    back: Object.freeze(['s', 'arrowdown']),
    left: Object.freeze(['a', 'arrowleft']),
    right: Object.freeze(['d', 'arrowright']),
    walk: Object.freeze([]),  // no walk key by default (Shift toggles aiming)
  }),
  actionKeys: Object.freeze({
    ' ': 'jump',
    c: 'crouch',
    control: 'crouch',
    e: 'open',
    g: 'drop',
    q: 'potion',               // drink a Healing Potion
    b: 'throw:bomb',           // throw a Bomb (#32)
    n: 'throw:legendarybomb',  // throw a Legendary Bomb
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
    holdKeys: { ...(config.holdKeys || DEFAULT_CONFIG.holdKeys) },
    holdButtons: [...(config.holdButtons || DEFAULT_CONFIG.holdButtons)],
    holdMouse: { ...(config.holdMouse || DEFAULT_CONFIG.holdMouse) },
    toggleButtons: [...(config.toggleButtons || DEFAULT_CONFIG.toggleButtons)],
    toggleKeys: { ...(config.toggleKeys || DEFAULT_CONFIG.toggleKeys) },
    toggleMouse: { ...(config.toggleMouse || DEFAULT_CONFIG.toggleMouse) },
    hiddenButtons: [...(config.hiddenButtons || DEFAULT_CONFIG.hiddenButtons)],
  };
  const actionKeys = new Map(Object.entries(cfg.actionKeys).map(([k, a]) => [lower(k), a]));
  const moveKeys = {};
  for (const [dir, list] of Object.entries(cfg.moveKeys)) moveKeys[dir] = list.map(lower);
  const holdKeys = new Map(); // key -> held action name
  for (const [name, list] of Object.entries(cfg.holdKeys)) for (const k of list) holdKeys.set(lower(k), name);
  const holdButtons = new Set(cfg.holdButtons);
  const holdMouse = new Map(Object.entries(cfg.holdMouse).map(([b, n]) => [Number(b), n]));
  const holding = new Map(); // held action name -> Set of sources ('key:shift', 'button', 'mouse:2')
  const hold = (name, source, down) => {
    if (!holding.has(name)) holding.set(name, new Set());
    if (down) holding.get(name).add(source); else holding.get(name).delete(source);
  };
  const toggleButtons = new Set(cfg.toggleButtons);
  const toggleMouse = new Map(Object.entries(cfg.toggleMouse).map(([b, n]) => [Number(b), n]));
  const toggleKeys = new Map(); // key -> toggled action name
  for (const [name, list] of Object.entries(cfg.toggleKeys)) for (const k of list) toggleKeys.set(lower(k), name);
  const toggleNames = [...new Set([...toggleButtons, ...toggleKeys.values(), ...toggleMouse.values()])];
  const toggledOn = new Set(); // toggled action names switched on right now
  const toggleListeners = new Set();
  const hidden = new Set(cfg.hiddenButtons); // on-screen buttons hidden right now
  const showListeners = new Set();
  const setToggle = (name, on) => {
    on = !!on && enabled && !hidden.has(name);
    if (toggledOn.has(name) === on) return;
    if (on) toggledOn.add(name); else toggledOn.delete(name);
    for (const fn of [...toggleListeners]) fn(name, on);
  };
  const toggleOffAll = () => { for (const n of [...toggledOn]) setToggle(n, false); };
  // an action is on while any of its keys / buttons is held, or while it is toggled on
  const isHeld = name => (holding.get(name)?.size ?? 0) > 0 || toggledOn.has(name);
  const holdNames = [...new Set([...holdKeys.values(), ...holdButtons, ...holdMouse.values(), ...toggleNames])];
  const holds = () => Object.fromEntries(holdNames.map(n => [n, isHeld(n)]));
  const toggles = () => Object.fromEntries(toggleNames.map(n => [n, toggledOn.has(n)]));

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
    /** Is a held action (e.g. 'shield') held down right now, or a toggled one (e.g. 'aim') switched on? */
    held: isHeld,
    get shield() { return isHeld('shield'); },
    /** Aiming (#37, #40, #49): switched on by a tap on the aim button or a press of Shift, off by the next one. */
    get aim() { return isHeld('aim'); },
    /** Is a toggled action (e.g. 'aim') switched on? */
    toggled: name => toggledOn.has(name),
    /**
     * Switch a toggled action on or off from the game (e.g. off when the weapon breaks). It cannot be switched on
     * while disabled or while its button is hidden.
     */
    setToggle,
    /** Call fn(name, on) whenever a toggled action is switched on or off. Returns a function that stops it. */
    onToggle(fn) { toggleListeners.add(fn); return () => toggleListeners.delete(fn); },
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

    // --- on-screen buttons: the fire button and holdButtons are held, toggleButtons switch on / off, the rest are tapped ---
    button(name, down) {
      if (toggleButtons.has(name)) {
        if (down) setToggle(name, !toggledOn.has(name));
        return;
      }
      if (name === cfg.fireButton) {
        if (!down) held.delete('button');
        else if (enabled) held.add('button');
        return;
      }
      if (holdButtons.has(name)) {
        if (!down || (enabled && !hidden.has(name))) hold(name, 'button', down);
        return;
      }
      if (down && enabled) actions.push(cfg.buttonActions[name] ?? name);
    },

    /**
     * Show or hide an on-screen button (the DOM adapter hides its element). Hiding a held button lets go of it,
     * and a hidden button cannot be pressed. Keys and holdMouse still work. Hiding a toggle switches it off, and it
     * cannot be switched on while hidden (not with a key or the mouse either: e.g. no aiming with a weapon that cannot aim).
     */
    show(name, visible = true) {
      const was = !hidden.has(name);
      if (visible) hidden.delete(name); else hidden.add(name);
      if (!visible) {
        if (holdButtons.has(name)) hold(name, 'button', false);
        setToggle(name, false);
        if (name === cfg.fireButton) held.delete('button');
      }
      if (was !== !!visible) for (const fn of [...showListeners]) fn(name, !!visible);
    },
    /** Is this on-screen button shown? */
    shown: name => !hidden.has(name),
    /** Call fn(name, visible) whenever a button is shown or hidden. Returns a function that stops it. */
    onShow(fn) { showListeners.add(fn); return () => showListeners.delete(fn); },

    // --- mouse: button 0 fires, holdMouse buttons are held (2 = right button raises the shield), toggleMouse buttons
    //     switch on / off,
    //     movement looks (only while pointer is locked) ---
    mouseButton(button, down) {
      if (toggleMouse.has(button)) {
        const name = toggleMouse.get(button);
        if (down) setToggle(name, !toggledOn.has(name));
        return;
      }
      if (holdMouse.has(button)) {
        if (!down || enabled) hold(holdMouse.get(button), 'mouse:' + button, down);
        return;
      }
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
      if (!down) { keys.delete(k); if (holdKeys.has(k)) hold(holdKeys.get(k), 'key:' + k, false); updateKeys(); return; }
      // toggle keys (Shift = aim): a press switches, key repeat (or a second keydown while still down) does not
      if (toggleKeys.has(k) && !repeat && !keys.has(k)) {
        const name = toggleKeys.get(k);
        setToggle(name, !toggledOn.has(name)); // switching off works while disabled, switching on does not
      }
      if (!enabled) return;
      if (holdKeys.has(k)) hold(holdKeys.get(k), 'key:' + k, true);
      if (!repeat && actionKeys.has(k)) actions.push(actionKeys.get(k));
      keys.add(k);
      updateKeys();
    },

    // window lost focus: let go of everything that is held (toggles stay on: nothing is held down)
    blur() {
      keys.clear(); held.clear(); holding.clear();
      updateKeys();
    },

    // returns queued actions and accumulated look, then clears them
    take() {
      const ev = actions; actions = [];
      const l = { x: look.x, y: look.y }; look.x = look.y = 0;
      return { ev, actions: ev, look: l, move: { x: move.x, y: move.y }, fire: held.size > 0, shield: isHeld('shield'), aim: isHeld('aim'), holds: holds(), toggles: toggles() };
    },

    // drop all input (e.g. when a match ends): also switches every toggle off
    reset() {
      keys.clear(); held.clear(); holding.clear(); lookers.clear(); actions = [];
      toggleOffAll();
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
