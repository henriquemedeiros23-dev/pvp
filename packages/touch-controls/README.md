# @pvp/touch-controls

## What it does

Game controls for phones and computers: a joystick on the left, drag on the
screen (or on the fire button) to aim, tap buttons for actions, plus keyboard
(WASD / arrows, hold Shift = raise the shield, G = drop weapon, space / C / E / Q / F / 1-5), mouse look with
pointer lock and the mouse wheel. A pure core keeps the input state; thin
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
                 open: $('btnOpen'), bandage: $('btnBandage') }, // any number of buttons
    })
  : attachDesktopControls(input, { canvas, target: window });

input.enabled = true;            // e.g. when the match starts
// every frame:
const { ev, look, move, fire, shield } = input.take(); // ev: ['jump', 'slot:2', ...], look is cleared
// fire / shield: held right now (shield: Shift on a computer, the shield button on a phone)
input.reset();                   // let go of everything (also resets the knob / pointer lock)
detach();                        // remove all listeners
```

Core events (also usable without a DOM, e.g. for replays or tests):
`stickStart(dx, dy)`, `stickMove(dx, dy)`, `stickEnd()` (pixel offsets from the
stick centre), `lookStart(id, x, y)`, `lookMove(id, x, y)`, `lookEnd(id)`,
`button(name, down)`, `mouseButton(button, down)`, `mouseMove(dx, dy)`,
`wheel(dy)`, `key(key, down, repeat)`, `blur()`.

Options (`DEFAULT_CONFIG`): `stickRadius` 55, `touchLookSensitivity` 0.0055,
`mouseSensitivity` 0.0024, `walkSpeed` 0.6, `fireButton` `'fire'`,
`holdKeys` `{ shield: ['shift'] }` and `holdButtons` `['shield']` (held actions: `input.held('shield')`,
`input.shield`, and `shield` / `holds` in `take()`), `moveKeys.walk` empty by default (Shift is the shield),
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
