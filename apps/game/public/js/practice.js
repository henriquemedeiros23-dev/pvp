// Practice mode entry (practice.html): the whole game in this page, no server needed.
// practice-setup.js runs first (it starts the local server), then the normal game (main.js).
import './practice-setup.js';
import './main.js';

const { server, api } = globalThis.pvpPractice;
const $ = id => document.getElementById(id);

// A small "Practice mode" badge. (The ✏️ next to the name in the menu changes the name, like on the server.)
const style = document.createElement('style');
style.textContent = `
.practice-badge { position: fixed; top: max(6px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%);
  z-index: 50; pointer-events: none; padding: 3px 12px; border-radius: 999px; font: 700 12px system-ui, sans-serif;
  letter-spacing: .04em; color: #1b1424; background: #ffd34d; box-shadow: 0 2px 8px rgba(0,0,0,.35); }`;
document.head.append(style);

const badge = document.createElement('div');
badge.className = 'practice-badge';
badge.id = 'practiceBadge';
badge.textContent = 'Practice mode';
document.body.append(badge);

$('btnLogout').classList.add('hidden'); // the local player stays; change the name instead

// ?debug: test helpers (like the real server's test-only teleport).
if (new URLSearchParams(location.search).has('debug')) {
  globalThis.pvpPractice.teleport = (x, z) => server.teleport(api.token, x, z);
}
