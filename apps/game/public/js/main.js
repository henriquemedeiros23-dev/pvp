// Glue for the screens: login, menu, shop, loading, death screen.
// The real work lives in packages: @pvp/api-client (server calls), @pvp/shop-catalog (what the shop shows).
import { createApiClient } from '@pvp/api-client';
import { shopTabs, shopItems, backpackSummary, swatchBackground } from '@pvp/shop-catalog';
import { WEAPONS, BOMBS } from '@pvp/game-rules';
import { WEAPON_ICONS, POTION_ICON_SVG, bombIconSvg, coinIconDataUrl } from '@pvp/hud-model';
import { Game } from './game.js';
import { setupRanking } from './ranking.js';

const $ = id => document.getElementById(id);
const SCREENS = ['login', 'menu', 'shop', 'dead', 'ranking'];
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

// ------------------------------------------------------------ login
function goLogin(message = '') {
  account = null;
  $('loginError').textContent = message;
  show('login');
}

async function enter(kind) {
  if (busy) return;
  const name = $('loginName').value, pass = $('loginPass').value;
  if (!name.trim() || !pass) { $('loginError').textContent = 'Type a name and a password'; return; }
  busy = true;
  $('loginError').textContent = '';
  try {
    const res = kind === 'signup' ? await api.signup(name, pass) : await api.login(name, pass);
    setAccount(res.account);
    $('loginPass').value = '';
    showMenu();
  } catch (e) {
    $('loginError').textContent = e.message;
  } finally {
    busy = false;
  }
}

$('btnLogin').addEventListener('click', () => enter('login'));
$('btnSignup').addEventListener('click', () => enter('signup'));
$('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') enter('login'); });
$('loginName').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginPass').focus(); });

// ------------------------------------------------------------ menu
function showMenu(message = '', { refresh: doRefresh = true } = {}) {
  const msg = $('menuMessage');
  msg.textContent = message;
  msg.classList.toggle('hidden', !message);
  show('menu');
  preview();
  if (doRefresh) refresh().catch(e => handleError(e));
}

setInterval(() => {
  if (visible('menu') && !document.hidden && !leaving) refresh().catch(e => handleError(e));
}, ONLINE_REFRESH_MS);

$('btnShop').addEventListener('click', () => { $('shopError').textContent = ''; show('shop'); renderShop(); });
$('btnLogout').addEventListener('click', () => { api.logout(); goLogin(); });
setupRanking({ api, show, showMenu, handleError }); // the 🏆 RANKING screen (#47)

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
if (api.hasToken()) {
  loading(true, 'Loading…');
  api.me()
    .then(res => { setAccount(res.account); $('menuOnline').textContent = res.online ?? 0; showMenu(); })
    .catch(e => goLogin(e.status === 401 ? '' : e.message));
} else {
  goLogin();
}
