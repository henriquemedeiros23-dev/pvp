// Glue for the screens: Account screen (log in / create an account), menu, shop, loading, death screen.
// The real work lives in packages: @pvp/api-client (server calls), @pvp/account-form (the Account screen's checks),
// @pvp/shop-catalog (what the shop shows).
import { createApiClient } from '@pvp/api-client';
import { checkLoginForm, checkSignupForm } from '@pvp/account-form';
import { shopTabs, shopItems, backpackSummary, swatchBackground } from '@pvp/shop-catalog';
import { WEAPONS, BOMBS } from '@pvp/game-rules';
import { WEAPON_ICONS, POTION_ICON_SVG, bombIconSvg, coinIconDataUrl } from '@pvp/hud-model';
import { Game } from './game.js';

const $ = id => document.getElementById(id);
const SCREENS = ['login', 'menu', 'shop', 'dead'];
const ONLINE_REFRESH_MS = 5000;

// Practice mode (practice.html) sets globalThis.pvpInject = { api, openSocket } before this file runs,
// so the game talks to a server inside the page (@pvp/local-server). Normally it is not set.
const inject = globalThis.pvpInject || {};
const api = inject.api || createApiClient({ storage: (() => { try { return window.localStorage; } catch { return undefined; } })() });
let account = null;
let tab = 'color';
let busy = false;

// Every coin on the page (menu, shop, buy buttons, HUD pill, "+3 coins" pop-up) is a <span class="coin">
// that draws this picture: the coin from the boss's drawing (#29).
document.documentElement.style.setProperty('--coin-icon', `url("${coinIconDataUrl()}")`);

// ------------------------------------------------------------ screens
function show(screen) {
  for (const id of SCREENS) $(id).classList.toggle('hidden', id !== screen);
  if (screen) $('loading').classList.add('hidden');
}
const visible = id => !$(id).classList.contains('hidden');
function loading(on, text = 'Connecting…') {
  $('loading').textContent = text;
  $('loading').classList.toggle('hidden', !on);
}

// ------------------------------------------------------------ game
let game = null;
try {
  game = new Game($('view'), {
    onPlaying() { show(null); loading(false); },
    onDead(by, weapon) {
      const def = weapon && (WEAPONS[weapon] ?? BOMBS[weapon]); // a weapon or a bomb (#32)
      const w = def ? ` with ${WEAPON_ICONS[weapon] || ''} ${def.name}`.replace('  ', ' ') : '';
      $('deadBy').textContent = by ? `Knocked out by ${by}${w}` : 'Knocked out';
      show('dead');
    },
    onLeft(reason) { showMenu(reason || ''); },
    onFull() { showMenu('Arena is full. Try again in a moment!'); },
  }, { openSocket: inject.openSocket });
} catch (e) {
  console.warn('3D view could not start:', e);
}
// Open the game with ?debug to look inside from the browser console (the browser test uses it).
if (game && new URLSearchParams(location.search).has('debug')) window.pvpDebug = () => game.debugState();

function preview() {
  if (game && account) game.showPreview(account.skin);
}

// ------------------------------------------------------------ account
function setAccount(acc) {
  if (!acc) return;
  account = acc;
  $('menuName').textContent = acc.name;
  $('menuCoins').textContent = acc.coins;
  $('shopCoins').textContent = acc.coins;
  $('menuBackpack').textContent = backpackSummary(acc);
  preview();
  if (visible('shop')) renderShop();
}

function handleError(e, where) {
  if (e && e.status === 401) { goLogin(e.message); return; }
  if (where) where.textContent = (e && e.message) || 'Something went wrong';
}

// Only the newest refresh may update the screen, so an older, slower answer
// (for example one sent before leaving the arena) cannot overwrite a fresh one.
let refreshSeq = 0;
async function refresh() {
  const seq = ++refreshSeq;
  const res = await api.me();
  if (seq !== refreshSeq) return res;
  setAccount(res.account);
  $('menuOnline').textContent = res.online ?? 0;
  return res;
}

// ------------------------------------------------------------ account screen (#46)
// Always shown first (a saved token does not skip it). "Log in" keeps everything; "Create an account" needs the
// password typed twice. @pvp/account-form checks the forms first; the server decides (wrong password, name taken).
function goLogin(message = '') {
  account = null;
  closeRename();
  refreshSeq++; // an answer still on its way must not open the menu again
  for (const id of ['loginPass', 'signupPass', 'signupPass2']) $(id).value = ''; // never keep a password
  $('signupError').textContent = '';
  $('loginError').textContent = message;
  if (!$('loginName').value) $('loginName').value = api.lastName || ''; // the last name used here, never the password
  show('login');
}

async function enter(kind) {
  if (busy) return;
  const signup = kind === 'signup';
  const errorBox = $(signup ? 'signupError' : 'loginError');
  const form = signup
    ? checkSignupForm({ name: $('signupName').value, password: $('signupPass').value, repeat: $('signupPass2').value })
    : checkLoginForm({ name: $('loginName').value, password: $('loginPass').value });
  $('loginError').textContent = '';
  $('signupError').textContent = '';
  if (!form.ok) {
    errorBox.textContent = form.message;
    if (form.field === 'repeat') { $('signupPass2').value = ''; $('signupPass2').focus(); }
    return;
  }
  busy = true;
  try {
    const res = signup ? await api.signup(form.name, form.password) : await api.login(form.name, form.password);
    setAccount(res.account);
    for (const id of ['loginPass', 'signupName', 'signupPass', 'signupPass2']) $(id).value = '';
    $('loginName').value = res.account.name;
    showMenu();
  } catch (e) {
    errorBox.textContent = e.message;
  } finally {
    busy = false;
  }
}

$('loginForm').addEventListener('submit', e => { e.preventDefault(); enter('login'); });
$('signupForm').addEventListener('submit', e => { e.preventDefault(); enter('signup'); });

// ------------------------------------------------------------ menu
function showMenu(message = '', { refresh: doRefresh = true } = {}) {
  const msg = $('menuMessage');
  msg.textContent = message;
  msg.classList.toggle('hidden', !message);
  show('menu');
  preview();
  // A name saved before #41 that would not be allowed today: ask for a new one.
  if (account?.mustRename && $('renamePanel').classList.contains('hidden')) openRename("You can't use that name. Please pick a new name.");
  if (doRefresh) refresh().catch(e => handleError(e));
}

setInterval(() => {
  if (visible('menu') && !document.hidden && !leaving) refresh().catch(e => handleError(e));
}, ONLINE_REFRESH_MS);

$('btnShop').addEventListener('click', () => { closeRename(); $('shopError').textContent = ''; show('shop'); renderShop(); });

// ------------------------------------------------------------ change your name (#41)
// The ✏️ next to the name opens a small panel. The server checks the name (@pvp/name-filter in accounts-shop):
// no bad words, nobody has it or a look-alike of it. A "no" shows the message in red and keeps the panel open.
function openRename(message = '') {
  $('renameInput').value = account ? account.name : '';
  $('renameError').textContent = message;
  $('renamePanel').classList.remove('hidden');
  $('renameInput').focus();
  $('renameInput').select();
}
function closeRename() {
  $('renamePanel').classList.add('hidden');
  $('renameError').textContent = '';
}
$('btnRename').addEventListener('click', () => ($('renamePanel').classList.contains('hidden') ? openRename() : closeRename()));
$('btnRenameCancel').addEventListener('click', closeRename);
$('renameInput').addEventListener('keydown', e => { if (e.key === 'Escape') closeRename(); });
$('renamePanel').addEventListener('submit', async e => {
  e.preventDefault();
  if (busy) return;
  busy = true;
  $('renameError').textContent = '';
  try {
    const res = await api.rename($('renameInput').value);
    setAccount(res.account);
    closeRename();
  } catch (err) {
    handleError(err, $('renameError'));
  } finally {
    busy = false;
  }
});
$('btnLogout').addEventListener('click', () => { api.logout(); goLogin(); }); // back to the Account screen

$('btnJoin').addEventListener('click', async () => {
  if (!game) { showMenu('Your browser cannot show 3D graphics, so the game cannot start.'); return; }
  $('menuMessage').classList.add('hidden');
  show(null);
  loading(true);
  try {
    // 'welcome' calls onPlaying, 'full' calls onFull; no answer in time (or no connection) throws.
    await game.joinArena(api.token);
  } catch (e) {
    showMenu(e.message || 'Could not connect to the server');
  }
});

// Leaving: show the menu right away, but ask for the account only after the server
// confirms 'left' (it puts the backpack weapons and coins back first).
let leaving = false;
$('btnLeave').addEventListener('click', async () => {
  const left = game ? game.leave() : Promise.resolve();
  leaving = true;
  refreshSeq++; // an older refresh that is still on its way must not win
  showMenu('', { refresh: false });
  try { await left; } finally { leaving = false; }
  if (visible('menu')) refresh().catch(e => handleError(e));
});

$('btnDeadMenu').addEventListener('click', () => showMenu());

// ------------------------------------------------------------ shop
const tabs = shopTabs();
const tabButtons = [...document.querySelectorAll('#shop .tabs button')];
for (const b of tabButtons) {
  b.addEventListener('click', () => { tab = b.dataset.tab; $('shopError').textContent = ''; renderShop(); });
}

$('btnShopBack').addEventListener('click', () => showMenu());

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function cardElement(c) {
  const card = el('div', 'card' + (c.equipped ? ' equipped' : ''));
  if (c.kind === 'color') {
    const s = el('div', 'swatch');
    s.style.background = swatchBackground(c);
    card.append(s);
  } else if (c.kind === 'potion') {
    const icon = el('div', 'icon potion-icon');
    icon.innerHTML = POTION_ICON_SVG; // the flask from the boss's drawing (@pvp/hud-model)
    card.append(icon);
  } else if (c.kind === 'bomb') {
    const icon = el('div', 'icon potion-icon');
    icon.innerHTML = bombIconSvg(BOMBS[c.id]?.color); // the round bomb from the boss's card
    card.append(icon);
  } else {
    card.append(el('div', 'icon', c.kind === 'weapon' ? (WEAPON_ICONS[c.id] || '❔') : (c.icon || '❔')));
  }
  card.append(el('div', 'name', c.kind === 'bomb' && c.pack > 1 ? `${c.name} ×${c.pack}` : c.name));
  if (c.kind === 'potion') card.append(el('div', 'tag', `Full H.P · drink ${c.drinkSeconds} s · max ${c.maxCarry}`));
  if (c.kind === 'bomb') {
    card.append(el('div', 'tag', `${c.dmg} damage · ${c.area}x${c.area} m · throw ${c.maxThrow} m · max ${c.maxCarry}${c.hurtsThrower ? ' · hurts you too!' : ''}`));
  }
  if (c.kind === 'weapon' || c.kind === 'potion' || c.kind === 'bomb') {
    const tag = el('div', 'tag');
    const rar = el('span', 'rar rar-' + c.rarity, c.rarityName);
    rar.style.color = c.rarityColor; // colors from RARITY_COLORS in @pvp/game-rules
    if (c.rarityBackground !== c.rarityColor) { // two colors (Megalegend): a small blue + black badge
      Object.assign(rar.style, { color: '#fff', background: c.rarityBackground, padding: '0 6px', borderRadius: '6px' });
    }
    tag.append(rar);
    if (c.stashCount) tag.append(` · ${c.stashCount} in backpack`);
    card.append(tag);
  }

  const btn = el('button');
  if (c.action === 'equipped') {
    btn.className = 'on';
    btn.textContent = 'Wearing';
    btn.disabled = true;
  } else if (c.action === 'equip') {
    btn.textContent = 'Wear';
    btn.addEventListener('click', () => shopAction(() => api.equip(c.kind, c.id)));
  } else {
    btn.className = 'buy';
    btn.append(el('span', 'coin'), String(c.price));
    btn.disabled = !c.canAfford;
    if (!c.canAfford) btn.title = 'Not enough coins';
    btn.addEventListener('click', () => shopAction(() => api.buy(c.kind, c.id)));
  }
  card.append(btn);
  return card;
}

function renderShop() {
  if (!account) return;
  for (const b of tabButtons) b.classList.toggle('active', b.dataset.tab === tab);
  $('shopHint').textContent = (tabs.find(t => t.id === tab) || {}).hint || '';
  $('shopCoins').textContent = account.coins;
  $('shopGrid').replaceChildren(...shopItems(tab, account).map(cardElement));
}

async function shopAction(call) {
  if (busy) return;
  busy = true;
  $('shopError').textContent = '';
  try {
    const res = await call();
    setAccount(res.account);
  } catch (e) {
    handleError(e, $('shopError'));
  } finally {
    busy = false;
  }
}

// ------------------------------------------------------------ start
// Always the Account screen first (#46): the saved token is forgotten, so a password is needed every time.
api.logout();
goLogin();
