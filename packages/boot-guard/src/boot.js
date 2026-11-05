// @pvp/boot-guard: the early page script (a CLASSIC script, not a module: it must run even when modules cannot).
// Load it early in the page head from /packages/boot-guard/src/boot.js with a plain (non-module) script tag, before the import map.
// 1. No <form> on the page ever does a native submit (that would reload the page and empty the boxes).
// 2. If the game's module code does not start (import map blocked, CDN unreachable, an error while loading),
//    the element with id="bootError" shows the message.
// 3. The game calls window.pvpBoot.ready() once its own form handlers are set up.
(function (win) {
  'use strict';
  if (!win || !win.document || win.pvpBoot) return;
  var doc = win.document;
  var MESSAGE = 'The game could not load. Check your internet and reload the page.';
  var WAIT_MESSAGE = 'The game is still loading. Wait a moment and try again.';
  var GRACE_MS = 1500; // after the page's load event, how long the game code may still take to start
  var state = { ready: false, failed: false, loaded: false, reason: '' };

  function mark(value) { if (doc.documentElement) doc.documentElement.setAttribute('data-boot', value); }
  function show(text) {
    var box = doc.getElementById('bootError');
    if (!box) return;
    box.textContent = text;
    box.hidden = !text;
  }
  function fail(reason) {
    if (state.ready) return;
    state.failed = true;
    if (!state.reason) state.reason = String(reason || 'error');
    mark('failed');
    show(MESSAGE);
  }
  function ready() {
    state.ready = true;
    state.failed = false;
    state.reason = '';
    mark('ready');
    show('');
  }

  // 1. Never a native submit, whatever happens to the game's code. (The game's own submit handlers still run.)
  doc.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!state.ready) show(state.failed || state.loaded ? MESSAGE : WAIT_MESSAGE);
  }, true);

  // 2. Signs that the module code cannot start.
  // A script that could not be fetched (error events of elements do not bubble, but they pass window in the capture
  // phase), or an error thrown while the game code starts (e.g. "Failed to resolve module specifier").
  win.addEventListener('error', function (e) {
    if (state.ready) return;
    var t = e && e.target;
    if (t && t !== win && t.tagName !== 'SCRIPT') return; // a picture that did not load is not our problem
    fail(t && t !== win ? 'script-failed' : (e.message || 'error'));
  }, true);
  // The Content-Security-Policy blocked a script (e.g. the import map's hash did not match, issue #58).
  doc.addEventListener('securitypolicyviolation', function (e) {
    if (/^script-src/.test(String((e && (e.effectiveDirective || e.violatedDirective)) || ''))) fail('csp');
  });
  // Module scripts run before the page's load event; if the game has not said ready a bit after it, it never will.
  win.addEventListener('load', function () {
    state.loaded = true;
    win.setTimeout(function () { if (!state.ready) fail('not-started'); }, GRACE_MS);
  });

  win.pvpBoot = { ready: ready, fail: fail, state: state, MESSAGE: MESSAGE, WAIT_MESSAGE: WAIT_MESSAGE };
})(typeof window !== 'undefined' ? window : undefined);
