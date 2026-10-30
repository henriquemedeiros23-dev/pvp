// Glue for the 🏆 RANKING screen (#47): asks the server (@pvp/api-client) and draws the rows from
// @pvp/leaderboard's rankingRows (medals for the top 3, your own row in gold, your place at the bottom
// when you are not in the top 50).
import { rankingRows } from '@pvp/leaderboard';
import { COLORS } from '@pvp/game-rules';
import { swatchBackground } from '@pvp/shop-catalog';

const $ = id => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function rowElement(r) {
  const li = el('li', 'rank-row' + (r.place <= 3 ? ' medal' : '') + (r.me ? ' me' : '') + (r.below ? ' below' : ''));
  li.dataset.place = String(r.place);
  li.append(el('span', 'place', r.label));
  const swatch = el('span', 'swatch');
  const color = r.skinColor && Object.hasOwn(COLORS, r.skinColor) ? COLORS[r.skinColor] : null;
  swatch.style.background = color ? swatchBackground(color) : 'transparent';
  if (!color) swatch.style.visibility = 'hidden';
  li.append(swatch);
  li.append(el('span', 'name', r.me ? `${r.name} (you)` : r.name));
  li.append(el('span', 'kills', `${r.kills} KO${r.kills === 1 ? '' : 's'}`));
  return li;
}

/**
 * Wire up the ranking screen.
 * @param {object} o
 * @param {object} o.api           @pvp/api-client (needs ranking())
 * @param {Function} o.show        show(screenId)
 * @param {Function} o.showMenu    back to the menu
 * @param {Function} o.handleError handleError(e, element): a 401 goes to the login screen
 */
export function setupRanking({ api, show, showMenu, handleError }) {
  let seq = 0;
  async function open() {
    const mine = ++seq;
    $('rankingError').textContent = '';
    $('rankingEmpty').classList.add('hidden');
    $('rankingList').replaceChildren();
    $('rankingList').setAttribute('aria-busy', 'true');
    show('ranking');
    try {
      const res = await api.ranking();
      if (mine !== seq) return;
      const { rows, empty } = rankingRows(res);
      $('rankingList').replaceChildren(...rows.map(rowElement));
      $('rankingEmpty').classList.toggle('hidden', !empty);
    } catch (e) {
      if (mine === seq) handleError(e, $('rankingError'));
    } finally {
      if (mine === seq) $('rankingList').removeAttribute('aria-busy');
    }
  }
  $('btnRanking').addEventListener('click', open);
  $('btnRankingBack').addEventListener('click', () => { seq++; showMenu(); });
  return { open };
}
