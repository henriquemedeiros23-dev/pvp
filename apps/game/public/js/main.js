// Glue for the screens: Account screen (log in / create an account), menu, shop, Inventory, loading, death screen.
// The real work lives in packages: @pvp/api-client (server calls), @pvp/account-form (the Account screen's checks),
// @pvp/shop-catalog (what the shop and the Inventory show).
import { createApiClient } from '@pvp/api-client';
import { checkLoginForm, checkSignupForm } from '@pvp/account-form';
import { shopTabs, shopItems, swatchBackground, inventoryCards, barSlots, extrasSlots, barSummary } from '@pvp/shop-catalog';
import { WEAPONS, BOMBS } from '@pvp/game-rules';
import { WEAPON_ICONS, POTION_ICON_SVG, bombIconSvg, coinIconDataUrl } from '@pvp/hud-model';
import { Game } from './game.js';
import { setupRanking } from './ranking.js';

const $ = id => document.getElementById(id);
const SCREENS = ['login', 'menu', 'shop', 'inventory', 'dead', 'ranking'];
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
  $('invCoins').textContent = acc.coins;
  $('menuBackpack').textContent = barSummary(acc); // what comes into the arena (#39)
  preview();
  if (visible('shop')) renderShop();
  if (visible('inventory')) renderInventory();
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
    // Practice mode (#48): an old automatic player was claimed with this name; it is yours again.
    showMenu(res.claimed ? 'Welcome back! Your old player is yours again.' : '');
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
$('btnInventory').addEventListener('click', () => { closeRename(); openInventory(); });

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
    if (c.stashCount) tag.append(` · ${c.stashCount} in Inventory`);
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

// ------------------------------------------------------------ Inventory and fast bar (#39)
// Tap an item: it goes into the first free bar slot (or the bar slot you tapped first). Tap a bar item: back
// into the Inventory. The server checks everything (@pvp/accounts-shop); cards come from @pvp/shop-catalog.
let pickedSlot = null; // an empty bar slot the player tapped first, or null

$('btnInvBack').addEventListener('click', () => showMenu());

function openInventory() {
  pickedSlot = null;
  $('invError').textContent = '';
  show('inventory');
  renderInventory();
  api.inventory().then(res => setAccount(res.account)).catch(e => handleError(e, $('invError')));
}

// Rarity look (colors from RARITY_COLORS in @pvp/game-rules, via the view-model)
function rarityLook(e, c) {
  if (c.rarityColor) e.style.setProperty('--rc', c.rarityColor);
  e.style.setProperty('--rbg', c.rarityBackground !== c.rarityColor ? `${c.rarityColor}aa` : `${c.rarityColor}55`);
}

function itemIcon(c) {
  const icon = el('span', 'icon');
  if (c.iconSvg) icon.innerHTML = c.iconSvg; // the potion flask / the bomb (@pvp/hud-model)
  else icon.textContent = c.icon || '';
  return icon;
}

// The small durability bar of a weapon (#51: worn weapons stay worn): green, yellow when low, red when almost broken.
function durBar(d) {
  const bar = el('span', 'dur');
  const fill = el('i');
  fill.style.width = `${d.percent}%`;
  if (d.percent < 20) fill.className = 'critical'; else if (d.percent <= 50) fill.className = 'low';
  bar.append(fill);
  return bar;
}

function invCardElement(c) {
  const b = el('button', 'inv-card' + (c.ghost ? ' ghost' : ''));
  Object.assign(b.dataset, { kind: c.kind, id: c.id, filled: c.filled ? '1' : '0' });
  b.setAttribute('role', 'listitem');
  b.append(itemIcon(c), el('span', 'name', c.name), el('span', 'cnt', c.label));
  if (c.ghost) {
    b.title = `${c.name}: buy it in the shop`;
    b.setAttribute('aria-label', `${c.name}: empty space`);
    b.addEventListener('click', () => { $('invError').textContent = `No ${c.name} here yet. Buy one in the SHOP!`; });
    return b;
  }
  rarityLook(b, c);
  if (c.durability) b.append(durBar(c.durability));
  const where = c.place === 'extras' ? 'your extras bar' : 'your fast bar';
  const label = `${c.name}${c.count > 1 ? ` ×${c.count}` : ''}${c.durability ? ` (durability ${c.durability.label})` : ''}: tap to put it in ${where}`;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', () => {
    // a weapon goes into the picked fast-bar slot (or the first free one); extras fill their own space (#50)
    const slot = c.place === 'bar' ? pickedSlot : null;
    const opts = {};
    if (slot != null) opts.slot = slot;
    if (c.dur != null) opts.dur = c.dur; // this worn copy (#51)
    invAction(() => api.toBar(c.kind, c.id, opts));
  });
  return b;
}

function barSlotElement(s) {
  const b = el('button', 'slot' + (s.empty ? ' empty' : '') + (s.empty && pickedSlot === s.index ? ' picked' : ''));
  b.dataset.slot = s.index;
  if (!s.empty) Object.assign(b.dataset, { kind: s.kind, id: s.id });
  b.setAttribute('role', 'listitem');
  b.append(el('span', 'key', s.key), itemIcon(s), el('small', 'name', s.name), el('span', 'cnt', s.label));
  if (s.empty) {
    b.setAttribute('aria-label', `Bar slot ${s.key}: empty. Tap it, then tap an item`);
    b.addEventListener('click', () => { pickedSlot = pickedSlot === s.index ? null : s.index; renderInventory(); });
  } else {
    rarityLook(b, s);
    // like the HUD slots: a soft glow in the rarity color
    b.style.background = s.rarityBackground !== s.rarityColor
      ? `radial-gradient(circle at 50% 40%, ${s.rarityColor}aa, rgba(10,8,16,0.85) 75%)`
      : `radial-gradient(circle at 50% 40%, ${s.rarityColor}66, rgba(10,8,16,0.6) 70%)`;
    if (s.durability) b.append(durBar(s.durability));
    b.setAttribute('aria-label', `Bar slot ${s.key}: ${s.name}${s.durability ? ` (durability ${s.durability.label})` : ''}. Tap to put it back`);
    b.addEventListener('click', () => invAction(() => api.fromBar(s.index)));
  }
  b.title = b.getAttribute('aria-label');
  return b;
}

// One space of the extras bar (#50): empty spaces show a faint drawing of what goes there.
function extrasSlotElement(s) {
  const b = el('button', 'slot' + (s.empty ? ' empty' : ''));
  b.dataset.space = s.space;
  if (!s.empty) Object.assign(b.dataset, { kind: s.kind, id: s.id });
  b.setAttribute('role', 'listitem');
  const icon = s.empty ? itemIcon({ icon: s.hintIcon, iconSvg: s.hintIconSvg }) : itemIcon(s);
  b.append(icon, el('small', 'name', s.empty ? s.hintName : s.name), el('span', 'cnt', s.fill));
  if (s.empty) {
    b.style.borderColor = `${s.hintColor}66`;
    b.setAttribute('aria-label', `${s.hintName} space: empty. Tap ${s.max > 1 ? 'them' : 'one'} in your Inventory to put ${s.max > 1 ? `up to ${s.max}` : 'it'} here`);
    b.addEventListener('click', () => { $('invError').textContent = `This space is for ${s.hintName}. Tap ${s.max > 1 ? 'them' : 'one'} in your Inventory!`; });
  } else {
    rarityLook(b, s);
    b.style.background = s.rarityBackground !== s.rarityColor
      ? `radial-gradient(circle at 50% 40%, ${s.rarityColor}aa, rgba(10,8,16,0.85) 75%)`
      : `radial-gradient(circle at 50% 40%, ${s.rarityColor}66, rgba(10,8,16,0.6) 70%)`;
    if (s.durability) b.append(durBar(s.durability));
    b.setAttribute('aria-label', `${s.hintName} space: ${s.name}${s.max > 1 ? ` ${s.fill}` : ''}${s.durability ? ` (durability ${s.durability.label})` : ''}. Tap to put it back`);
    b.addEventListener('click', () => invAction(() => api.fromExtras(s.space)));
  }
  b.title = b.getAttribute('aria-label');
  return b;
}

function renderInventory() {
  if (!account) return;
  $('invCoins').textContent = account.coins;
  const grid = $('invGrid'), top = grid.scrollTop;
  grid.replaceChildren(...inventoryCards(account).map(invCardElement));
  grid.scrollTop = top; // stay where you were
  $('invBar').replaceChildren(...barSlots(account).map(barSlotElement));
  $('invExtras').replaceChildren(...extrasSlots(account).map(extrasSlotElement));
  $('invBarHint').textContent = pickedSlot != null ? `Now tap a weapon for slot ${pickedSlot + 1}` : 'Swords and guns. Only the bars come along';
}

async function invAction(call) {
  if (busy) return;
  busy = true;
  $('invError').textContent = '';
  try {
    const res = await call();
    pickedSlot = null;
    setAccount(res.account);
  } catch (e) {
    handleError(e, $('invError'));
  } finally {
    busy = false;
  }
}

// ------------------------------------------------------------ start
// Always the Account screen first (#46): the saved token is forgotten, so a password is needed every time.
api.logout();
goLogin();
