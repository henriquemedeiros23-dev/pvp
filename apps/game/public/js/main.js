// Glue for the screens: login, menu, shop, loading, death screen.
// The real work lives in packages: @pvp/api-client (server calls), @pvp/shop-catalog (what the shop shows).
import { createApiClient } from '@pvp/api-client';
import { shopTabs, shopItems, backpackSummary, swatchBackground } from '@pvp/shop-catalog';
import { WEAPONS } from '@pvp/game-rules';
import { Game, WEAPON_ICONS } from './game.js';

const $ = id => document.getElementById(id);
const SCREENS = ['login', 'menu', 'shop', 'dead'];
const ONLINE_REFRESH_MS = 5000;

const api = createApiClient({ storage: (() => { try { return window.localStorage; } catch { return undefined; } })() });
let account = null;
let tab = 'color';
let busy = false;

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
      const w = weapon && WEAPONS[weapon] ? ` with ${WEAPON_ICONS[weapon] || ''} ${WEAPONS[weapon].name}`.replace('  ', ' ') : '';
      $('deadBy').textContent = by ? `Knocked out by ${by}${w}` : 'Knocked out';
      show('dead');
    },
    onLeft(reason) { showMenu(reason || ''); },
    onFull() { showMenu('Arena is full. Try again in a moment!'); },
  });
} catch (e) {
  console.warn('3D view could not start:', e);
}

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

async function refresh() {
  const res = await api.me();
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
function showMenu(message = '') {
  const msg = $('menuMessage');
  msg.textContent = message;
  msg.classList.toggle('hidden', !message);
  show('menu');
  preview();
  refresh().catch(e => handleError(e));
}

setInterval(() => {
  if (visible('menu') && !document.hidden) refresh().catch(e => handleError(e));
}, ONLINE_REFRESH_MS);

$('btnShop').addEventListener('click', () => { $('shopError').textContent = ''; show('shop'); renderShop(); });
$('btnLogout').addEventListener('click', () => { api.logout(); goLogin(); });

$('btnJoin').addEventListener('click', async () => {
  if (!game) { showMenu('Your browser cannot show 3D graphics, so the game cannot start.'); return; }
  $('menuMessage').classList.add('hidden');
  show(null);
  loading(true);
  try {
    await game.connect(api.token);
    game.join(); // the server answers 'welcome' (onPlaying) or 'full' (onFull)
  } catch (e) {
    showMenu(e.message || 'Could not connect to the server');
  }
});

$('btnLeave').addEventListener('click', () => {
  if (game) game.leave();
  showMenu();
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
  } else {
    card.append(el('div', 'icon', c.kind === 'weapon' ? (WEAPON_ICONS[c.id] || '❔') : (c.icon || '❔')));
  }
  card.append(el('div', 'name', c.name));
  if (c.kind === 'weapon') {
    const tag = el('div', 'tag');
    tag.append(el('span', 'rar-' + c.rarity, c.rarity[0].toUpperCase() + c.rarity.slice(1)));
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
