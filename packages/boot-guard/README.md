# @pvp/boot-guard

## What it does

A tiny early script for a page whose code is an ES module. Forms on the page **never reload the page** (even when
the game's code did not load), and if the module code cannot start (import map blocked by the
Content-Security-Policy, the three.js CDN unreachable, an error while loading) the page shows a kid-simple message:
"The game could not load. Check your internet and reload the page." (issue #58).

## How to use

`src/boot.js` is a **classic** script (not a module), so it runs even when modules cannot. Put it in `<head>`, before
the import map, and give the page a box with `id="bootError"`:

```html
<script src="/packages/boot-guard/src/boot.js"></script>
<script type="importmap">...</script>
...
<p id="bootError" class="error" role="alert" hidden></p>
<script type="module" src="/js/main.js"></script>
```

When the game's own form handlers are set up, the game says so:

```js
globalThis.pvpBoot?.ready(); // hides the message; from now on errors are the game's own business
```

A build that makes one single html file puts the script inline (Node side):

```js
import { inlineBootScriptTag, BOOT_SCRIPT_TAG, BOOT_MESSAGE } from '@pvp/boot-guard';
html = html.replace(BOOT_SCRIPT_TAG, () => inlineBootScriptTag());
```

In the page: `window.pvpBoot.{ ready(), fail(reason), state, MESSAGE, WAIT_MESSAGE }`. A submit before the game is
ready shows "The game is still loading. Wait a moment and try again." (or the message above once loading is over).
The page's `<html>` gets `data-boot="ready"` or `data-boot="failed"`.

Signs of "could not load": a `<script>` that failed to fetch, an error thrown before ready, a `script-src` CSP
violation, or no ready() 1.5 s after the page's load event (module scripts always run before it).

## Determinism

Partly deterministic: the decisions are a plain function of the page events it gets (tests run it in `node:vm` with a
fake window and hand-run timers); in a real browser the events and the 1.5 s wait follow real loading and time.
