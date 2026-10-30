// @pvp/leaderboard: the ranking (#47). Top players by knockouts, ties broken by who got there first,
// and anyone's own place even outside the top. Pure functions, no dependencies: Node and the browser.

/** How many players the ranking screen lists. */
export const RANKING_SIZE = 50;

const MEDALS = ['🥇', '🥈', '🥉'];

const count = n => (Number.isInteger(n) && n > 0 ? n : 0);
const time = t => (Number.isFinite(t) && t > 0 ? t : 0);
const nameKey = name => String(name ?? '').toLowerCase();

// A clean entry from anything: { name, kills, lastKillAt, skinColor? }.
function clean(e) {
  const out = { name: String(e?.name ?? ''), kills: count(e?.kills), lastKillAt: time(e?.lastKillAt) };
  if (typeof e?.skinColor === 'string' && e.skinColor) out.skinColor = e.skinColor;
  return out;
}

/**
 * Who ranks higher? Negative: a before b. More knockouts first; the same number: whoever reached it
 * first (smaller lastKillAt); still the same: by name (ignoring case), so the order never depends on input order.
 */
export function compareRank(a, b) {
  const ka = count(a.kills), kb = count(b.kills);
  if (ka !== kb) return kb - ka;
  const ta = time(a.lastKillAt), tb = time(b.lastKillAt);
  if (ta !== tb) return ta - tb;
  const na = nameKey(a.name), nb = nameKey(b.name);
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/**
 * The ranking from a list (or any iterable) of players { name, kills, lastKillAt, skinColor? }.
 * Players with 0 knockouts are not listed.
 * @param {Iterable<object>} players
 * @param {object} [o]
 * @param {number} [o.size=RANKING_SIZE]  how many to list
 * @param {string|object} [o.me]          a player name (any case), or a player { name, kills, lastKillAt }:
 *                                        also tell this player's place (a player object counts even if not in the list)
 * @returns {{ top: { place, name, kills, skinColor? }[], me: { place: number|null, name, kills } | null }}
 *   me.place is null when that player has 0 knockouts (not ranked); me is null when no `me` was asked
 *   or there is no such player.
 *
 * One pass that keeps only the best `size` (binary insert), then one count for your place:
 * fast for thousands of players.
 */
export function rankPlayers(players, { size = RANKING_SIZE, me } = {}) {
  const limit = Number.isInteger(size) && size > 0 ? size : 0;
  const meGiven = me != null && typeof me === 'object' ? clean(me) : null;
  const meKey = me == null ? null : nameKey(meGiven ? meGiven.name : me);
  const best = []; // sorted, at most `limit`
  const ranked = []; // everyone with knockouts
  let mine = null;
  for (const raw of players ?? []) {
    const e = clean(raw);
    if (meKey !== null && mine === null && nameKey(e.name) === meKey) mine = e;
    if (!e.kills) continue;
    ranked.push(e);
    if (!limit || (best.length === limit && compareRank(e, best[limit - 1]) >= 0)) continue;
    let lo = 0, hi = best.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compareRank(best[mid], e) <= 0) lo = mid + 1; else hi = mid;
    }
    best.splice(lo, 0, e);
    if (best.length > limit) best.pop();
  }
  if (!mine && meGiven) mine = meGiven;
  const top = best.map((e, i) => {
    const row = { place: i + 1, name: e.name, kills: e.kills };
    if (e.skinColor) row.skinColor = e.skinColor;
    return row;
  });
  let meRow = null;
  if (mine) {
    let place = null;
    if (mine.kills) {
      place = 1;
      for (const e of ranked) if (e !== mine && compareRank(e, mine) < 0) place++;
    }
    meRow = { place, name: mine.name, kills: mine.kills };
  }
  return { top, me: meRow };
}

/** 🥇 🥈 🥉 for places 1 to 3, else '#4', '#57'... ('' for no place). */
export function placeLabel(place) {
  if (!Number.isInteger(place) || place < 1) return '';
  return MEDALS[place - 1] ?? `#${place}`;
}

/**
 * The rows the ranking screen shows: the top list with your own row marked `me: true`, and when you
 * are ranked but not in the top, your row once more at the bottom (`below: true`).
 * @param {{ top, me }} ranking  what rankPlayers (or the server's ranking API) gave
 * @returns {{ rows: { place, label, name, kills, skinColor?, me: boolean, below?: true }[], empty: boolean }}
 */
export function rankingRows(ranking) {
  const top = Array.isArray(ranking?.top) ? ranking.top : [];
  const me = ranking?.me ?? null;
  const meKey = me ? nameKey(me.name) : null;
  const rows = top.map(r => ({ ...r, label: placeLabel(r.place), me: meKey !== null && nameKey(r.name) === meKey }));
  if (me && me.place && !rows.some(r => r.me)) {
    rows.push({ place: me.place, label: placeLabel(me.place), name: me.name, kills: me.kills, me: true, below: true });
  }
  return { rows, empty: top.length === 0 };
}
