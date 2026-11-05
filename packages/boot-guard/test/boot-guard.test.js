import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { bootScriptSource, inlineBootScriptTag, BOOT_MESSAGE, BOOT_SCRIPT_URL, BOOT_SCRIPT_TAG, BOOT_SCRIPT_FILE } from '../src/index.js';

// A tiny fake window/document: listeners, one #bootError box, timers run by hand (no real time).
function fakePage() {
  const listeners = { win: {}, doc: {} };
  const on = where => (type, fn, capture) => { (listeners[where][type] ||= []).push({ fn, capture: !!capture }); };
  const box = { id: 'bootError', textContent: '', hidden: true };
  const attrs = {};
  const timers = [];
  const document = {
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
    getElementById: id => (id === 'bootError' ? box : null),
    addEventListener: on('doc'),
  };
  const window = { document, addEventListener: on('win'), setTimeout: (fn, ms) => timers.push({ fn, ms }) };
  const fire = (where, type, event) => { for (const l of listeners[where][type] || []) l.fn(event); return event; };
  const submit = () => {
    const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    return fire('doc', 'submit', e);
  };
  const runTimers = () => { for (const t of timers.splice(0)) t.fn(); };
  vm.runInNewContext(bootScriptSource(), { window });
  return { window, document, box, attrs, listeners, fire, submit, runTimers, timers };
}

test('the script is a classic script (no import/export) and the message is kid-simple', () => {
  const src = bootScriptSource();
  assert.doesNotMatch(src, /^\s*(import|export)\s/m);
  assert.ok(src.includes(BOOT_MESSAGE));
  assert.equal(BOOT_MESSAGE, 'The game could not load. Check your internet and reload the page.');
  assert.equal(BOOT_SCRIPT_URL, '/packages/boot-guard/src/boot.js');
  assert.equal(BOOT_SCRIPT_TAG, '<script src="/packages/boot-guard/src/boot.js"></script>');
  assert.ok(BOOT_SCRIPT_FILE.endsWith('boot.js'));
  const tag = inlineBootScriptTag();
  assert.match(tag, /^<script>\n[\s\S]*<\/script>$/);
  assert.equal(tag.match(/<\/script/g).length, 1, 'no early end of the script tag');
});

test('a form submit never navigates: before, after and without the game starting', () => {
  const p = fakePage();
  assert.equal(p.listeners.doc.submit[0].capture, true, 'runs first (capture)');
  assert.equal(p.submit().defaultPrevented, true);
  assert.equal(p.box.textContent, p.window.pvpBoot.WAIT_MESSAGE, 'still loading: wait');
  assert.equal(p.box.hidden, false);
  p.window.pvpBoot.ready();
  assert.equal(p.box.hidden, true);
  assert.equal(p.box.textContent, '');
  assert.equal(p.submit().defaultPrevented, true);
  assert.equal(p.box.hidden, true, 'no message once the game runs');
  assert.equal(p.attrs['data-boot'], 'ready');
});

test('the game never says ready: after load (+ a short wait) the message shows', () => {
  const p = fakePage();
  p.fire('win', 'load', {});
  assert.equal(p.box.hidden, true);
  assert.equal(p.timers.length, 1);
  p.runTimers();
  assert.equal(p.box.textContent, BOOT_MESSAGE);
  assert.equal(p.box.hidden, false);
  assert.equal(p.window.pvpBoot.state.reason, 'not-started');
  assert.equal(p.attrs['data-boot'], 'failed');
  assert.equal(p.submit().defaultPrevented, true);
  assert.equal(p.box.textContent, BOOT_MESSAGE);
});

test('the game says ready in time: no message after load', () => {
  const p = fakePage();
  p.window.pvpBoot.ready();
  p.fire('win', 'load', {});
  p.runTimers();
  assert.equal(p.box.hidden, true);
  assert.equal(p.window.pvpBoot.state.failed, false);
});

test('a script that could not load, an error while starting, or a CSP block shows the message', () => {
  const script = fakePage();
  script.fire('win', 'error', { target: { tagName: 'SCRIPT' } });
  assert.equal(script.box.textContent, BOOT_MESSAGE);
  assert.equal(script.window.pvpBoot.state.reason, 'script-failed');

  const thrown = fakePage();
  thrown.fire('win', 'error', { target: thrown.window, message: 'TypeError: Failed to resolve module specifier "@pvp/api-client"' });
  assert.equal(thrown.box.textContent, BOOT_MESSAGE);
  assert.match(thrown.window.pvpBoot.state.reason, /resolve module specifier/);

  const csp = fakePage();
  csp.fire('doc', 'securitypolicyviolation', { effectiveDirective: 'script-src-elem' });
  assert.equal(csp.box.textContent, BOOT_MESSAGE);
  assert.equal(csp.window.pvpBoot.state.reason, 'csp');
});

test('a picture that did not load, a style CSP report or errors after ready do not show the message', () => {
  const p = fakePage();
  p.fire('win', 'error', { target: { tagName: 'IMG' } });
  p.fire('doc', 'securitypolicyviolation', { effectiveDirective: 'img-src' });
  assert.equal(p.box.hidden, true);
  p.window.pvpBoot.ready();
  p.fire('win', 'error', { target: p.window, message: 'boom later' });
  p.fire('doc', 'securitypolicyviolation', { effectiveDirective: 'script-src' });
  assert.equal(p.box.hidden, true);
});

test('running twice does nothing the second time', () => {
  const p = fakePage();
  const first = p.window.pvpBoot;
  vm.runInNewContext(bootScriptSource(), { window: p.window });
  assert.equal(p.window.pvpBoot, first);
  assert.equal(p.listeners.doc.submit.length, 1);
});

test('without a window (e.g. Node) it does nothing', () => {
  assert.doesNotThrow(() => vm.runInNewContext(bootScriptSource(), {}));
});
