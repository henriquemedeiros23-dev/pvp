# @pvp/touch-controls

## What it does

Game controls for phones and computers: a joystick on the left, drag on the
screen (or on the fire button) to aim, tap buttons for actions, plus keyboard
(WASD / arrows, hold Shift = raise the shield, G = drop weapon, B / N = throw a Bomb / Legendary Bomb, space / C / E / Q / 1-5), mouse look with
pointer lock, hold the right mouse button (or the phone's AIM button) = aim (#37), and the mouse wheel.
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
                 aim: $('btnAim'),                      // held (aim, #37); hidden until input.show('aim', true)
                 open: $('btnOpen'), potion: $('btnPotion') }, // any number of buttons
    })
  : attachDesktopControls(input, { canvas, target: window }); // right mouse button = aim, no context menu

input.enabled = true;            // e.g. when the match starts
input.show('aim', canAim);       // show the AIM button only with a weapon that can aim (hiding it lets go of it)
// every frame:
const { ev, look, move, fire, shield, aim } = input.take(); // ev: ['jump', 'slot:2', ...], look is cleared
// fire / shield / aim: held right now (shield: Shift or the shield button; aim: right mouse or the AIM button)
input.reset();                   // let go of everything (also resets the knob / pointer lock)
detach();                        // remove all listeners
```

Core events (also usable without a DOM, e.g. for replays or tests):
`stickStart(dx, dy)`, `stickMove(dx, dy)`, `stickEnd()` (pixel offsets from the
stick centre), `lookStart(id, x, y)`, `lookMove(id, x, y)`, `lookEnd(id)`,
`button(name, down)`, `mouseButton(button, down)`, `mouseMove(dx, dy)`,
`wheel(dy)`, `key(key, down, repeat)`, `blur()`, and `show(name, visible)`, `shown(name)`, `onShow(fn)`
(hide/show an on-screen button; the touch adapter toggles its element's `hidden` class).

Options (`DEFAULT_CONFIG`): `stickRadius` 55, `touchLookSensitivity` 0.0055,
`mouseSensitivity` 0.0024, `walkSpeed` 0.6, `fireButton` `'fire'`,
`holdKeys` `{ shield: ['shift'] }`, `holdButtons` `['shield', 'aim']` and `holdMouse` `{ 2: 'aim' }` (held actions:
`input.held('shield')`, `input.shield`, `input.aim`, and `shield` / `aim` / `holds` in `take()`),
`hiddenButtons` `['aim']` (on-screen buttons hidden at the start), `moveKeys.walk` empty by default (Shift is the shield),
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
