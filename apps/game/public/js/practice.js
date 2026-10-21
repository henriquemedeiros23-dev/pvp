// Practice mode entry (practice.html): the whole game in this page, no server needed.
// practice-setup.js runs first (it starts the local server), then the normal game (main.js).
import './practice-setup.js';
import './main.js';

const { server, api } = globalThis.pvpPractice;
const $ = id => document.getElementById(id);

// A small "Practice mode" badge, and a way to change the local player's name (no log in here).
const style = document.createElement('style');
style.textContent = `
.practice-badge { position: fixed; top: max(6px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
  z-index: 50; pointer-events: none; padding: 3px 12px; border-radius: 999px; font: 700 12px system-ui, sans-serif;
  letter-spacing: .04em; color: #1b1424; background: #ffd34d; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
.practice-rename { margin-left: 8px; padding: 2px 8px; font-size: 13px; border-radius: 8px; cursor: pointer; }
.practice-name-form { display: flex; gap: 6px; align-items: center; }
.practice-name-form input { width: 9.5em; padding: 4px 6px; font-size: 14px; border-radius: 8px; border: 1px solid #555; }
.practice-name-form .error { font-size: 12px; margin: 0; }`;
document.head.append(style);

const badge = document.createElement('div');
badge.className = 'practice-badge';
badge.id = 'practiceBadge';
badge.textContent = 'Practice mode';
document.body.append(badge);

$('btnLogout').classList.add('hidden'); // the local player stays; change the name instead

const who = $('menuName').parentElement;
const edit = document.createElement('button');
edit.id = 'btnRename';
edit.className = 'practice-rename';
edit.textContent = '✏️ Name';
edit.title = 'Change your name';
who.append(edit);

const form = document.createElement('form');
form.className = 'practice-name-form hidden';
const input = Object.assign(document.createElement('input'), { id: 'renameInput', maxLength: 16, placeholder: 'New name', autocomplete: 'off' });
const ok = Object.assign(document.createElement('button'), { type: 'submit', textContent: 'OK' });
const err = Object.assign(document.createElement('p'), { className: 'error' });
form.append(input, ok, err);
who.append(form);

edit.addEventListener('click', () => {
  input.value = $('menuName').textContent;
  err.textContent = '';
  form.classList.remove('hidden');
  edit.classList.add('hidden');
  input.focus();
  input.select();
});
form.addEventListener('submit', e => {
  e.preventDefault();
  try {
    const account = server.rename(api.token, input.value);
    $('menuName').textContent = account.name;
    form.classList.add('hidden');
    edit.classList.remove('hidden');
  } catch (e2) {
    err.textContent = e2.message;
  }
});

// ?debug: test helpers (like the real server's test-only teleport).
if (new URLSearchParams(location.search).has('debug')) {
  globalThis.pvpPractice.teleport = (x, z) => server.teleport(api.token, x, z);
}
