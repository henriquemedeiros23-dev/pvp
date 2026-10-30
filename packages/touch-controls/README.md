# @pvp/touch-controls

## What it does

Game controls for phones and computers: a joystick on the left, drag on the
screen (or on the fire button) to aim, tap buttons for actions, plus keyboard
(WASD / arrows, Shift (or a tap on the phone's AIM button) = aim on, the next one = aim off (#37, #40, #49), G = drop weapon,
B / N = throw a Bomb / Legendary Bomb, space / C / E / Q / 1-5), mouse look with pointer lock, hold the right mouse
button = raise the shield (#49), and the mouse wheel. Buttons can be held (fire, shield), toggled (aim: on until pressed again) or tapped.
On-screen buttons can be hidden and shown (`input.show('aim', true)`). A pure core keeps the input state; thin
DOM adapters feed it real browser events. No dependencies.

## How to use

```js
import {
  createInputState, attachTouchControls, attachDesktopControls, isTouchDevice,
} from '@pvp/touch-controls';
// In the browser without a bundler: import from './packages/touch-controls/src/index.js'

const input = createInputState({ enabled: false }); // all options are optional, see DEFAULT_CONFIG
const $ = id => document.getElementById(id);
const detach = isTouchDevice(window)
  ? attachTouchControls(input, {
      canvas, stick: $('stick'), knob: $('knob'),
      buttons: { fire: $('btnFire'), jump: $('btnJump'), crouch: $('btnCrouch'),
                 shield: $('btnShield'),                // held like fire (raise the shield)
                 aim: $('btnAim'),                      // toggle (aim, #40): tap on, tap off; classes 'pressed' + 'on' while on;
                                                        // hidden until input.show('aim', true)
                 open: $('btnOpen'), potion: $('btnPotion') }, // any number of buttons
    })
  : attachDesktopControls(input, { canvas, target: window }); // hold right button = shield, Shift = aim on / off, no context menu

input.enabled = true;            // e.g. when the match starts
input.show('aim', canAim);       // show the AIM button only with a weapon that can aim (hiding it switches aiming off)
input.setToggle('aim', false);   // switch aiming off from the game (e.g. the weapon broke); input.toggled('aim')
// every frame:
const { ev, look, move, fire, shield, aim } = input.take(); // ev: ['jump', 'slot:2', ...], look is cleared
// fire / shield: held right now (shield: right mouse button or the shield button); aim: switched on (Shift or the AIM button)
input.reset();                   // let go of everything and switch every toggle off (also resets the knob / pointer lock)
detach();                        // remove all listeners
```

Core events (also usable without a DOM, e.g. for replays or tests):
`stickStart(dx, dy)`, `stickMove(dx, dy)`, `stickEnd()` (pixel offsets from the
stick centre), `lookStart(id, x, y)`, `lookMove(id, x, y)`, `lookEnd(id)`,
`button(name, down)`, `mouseButton(button, down)`, `mouseMove(dx, dy)`,
`wheel(dy)`, `key(key, down, repeat)`, `blur()` (lets go of held things; toggles stay on), and `show(name, visible)`,
`shown(name)`, `onShow(fn)` (hide/show an on-screen button; the touch adapter toggles its element's `hidden` class),
`toggled(name)`, `setToggle(name, on)`, `onToggle(fn)` (toggled actions; a toggle cannot be switched on while disabled
or while its button is hidden, not even with a key or the mouse; key repeat never switches a toggle).

Options (`DEFAULT_CONFIG`): `stickRadius` 55, `touchLookSensitivity` 0.0055,
`mouseSensitivity` 0.0024, `walkSpeed` 0.6, `fireButton` `'fire'`,
`holdKeys` `{}`, `holdButtons` `['shield']` and `holdMouse` `{ 2: 'shield' }` (held actions: on while held down),
`toggleButtons` `['aim']`, `toggleKeys` `{ aim: ['shift'] }` and `toggleMouse` `{}` (toggled actions: each press switches on / off, letting go does
nothing; `input.held(name)` is true for a held or switched-on action: `input.shield`, `input.aim`, and `shield` / `aim` /
`holds` / `toggles` in `take()`),
`hiddenButtons` `['aim']` (on-screen buttons hidden at the start), `moveKeys.walk` empty by default (Shift is aim),
`wheelUp` `'slot:-'`, `wheelDown` `'slot:+'`, `moveKeys` (forward/back/left/right/walk,
merged per direction), `actionKeys` (key → action, replaces the defaults when given),
`buttonActions` (button name → action, default: the button's own name), `enabled` true.

While disabled, new input is ignored, but releases (key up, fire up, stick end)
still work so nothing gets stuck.

## Determinism

The core (`createInputState`) is fully deterministic: no time, no randomness,
no globals. The same sequence of events always gives the same `move`, `look`,
`fire` and actions. The DOM adapters are not deterministic (they depend on
real fingers, mice and screen layout), but they only translate browser events
into core events.
