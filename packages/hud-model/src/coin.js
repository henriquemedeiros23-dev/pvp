// The coin from the boss's drawing (#29): a yellow, almost square coin with slightly cut corners,
// a darker outline, a "P" on it and shiny sparkle lines next to it (top right).
// Pure functions that return SVG text: no DOM, no clock, no randomness.

/** The coin's colors (the 3D coin in @pvp/island-scene uses the same ones). */
export const COIN_COLORS = Object.freeze({
  face: '#ffcc1f',    // the coin
  inner: '#ffe04d',   // the raised middle
  rim: '#e39b00',     // the shadowed lower right edge
  outline: '#8a5200', // the darker outline and the letter
  shine: '#fff6c2',   // light edge and the letter's light side
  sparkle: '#ffd21f', // the shiny lines next to the coin
});

const LABELS = new Set(['P', 'PvP', '']);

/**
 * The coin icon as a small SVG (64x64 viewBox). Flat colors only (no gradients or ids), so it can be put
 * inline many times on one page, or used as an image (coinIconDataUrl()).
 * @param {{ label?: 'P'|'PvP'|'', sparkle?: boolean }} [opts] what is written on it (default 'P'), and the shiny lines
 */
export function coinIconSvg({ label = 'P', sparkle = true } = {}) {
  const c = COIN_COLORS;
  const text = LABELS.has(label) ? label : 'P';
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">';
  // body: almost square (40 x 46), corners cut a little
  s += `<path class="body" d="M10 13H40L45 18V54L40 59H10L5 54V18Z" fill="${c.face}"/>`;
  s += `<path d="M42.5 19V53L39 56.5H11" fill="none" stroke="${c.rim}" stroke-width="4" stroke-linejoin="round"/>`; // shadow side
  s += `<path d="M7.5 53V19L11 15.5H39" fill="none" stroke="${c.shine}" stroke-width="2.2" stroke-linejoin="round" opacity="0.85"/>`; // light side
  // the raised middle
  s += `<path d="M14 19H36L40 23V49L36 53H14L10 49V23Z" fill="${c.inner}" stroke="${c.rim}" stroke-width="1.4" stroke-linejoin="round"/>`;
  if (text === 'P') {
    // a bold "P", drawn as a path (no fonts needed); the light copy under it makes it look stamped in
    const p = 'M18 24H27.5A7.5 7.5 0 0 1 27.5 39H24.5V48H18ZM24.5 29.5V33.5H27A2 2 0 0 0 27 29.5Z';
    s += `<path d="${p}" transform="translate(1.2 1.2)" fill="${c.shine}" fill-rule="evenodd"/>`;
    s += `<path class="label" d="${p}" fill="${c.outline}" fill-rule="evenodd"/>`;
  } else if (text === 'PvP') {
    s += `<text class="label" x="25" y="41.5" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="15" fill="${c.outline}">PvP</text>`;
  }
  // the darker outline on top of everything
  s += `<path d="M10 13H40L45 18V54L40 59H10L5 54V18Z" fill="none" stroke="${c.outline}" stroke-width="3.4" stroke-linejoin="round"/>`;
  if (sparkle) {
    // three shiny lines, the right one highest (like the drawing), with a dark edge so they show on gold too
    const lines = 'M49 33L51 23M54.5 26L57 13.5M60 16L62 5';
    s += `<path d="${lines}" fill="none" stroke="${c.outline}" stroke-opacity="0.55" stroke-width="5" stroke-linecap="round"/>`;
    s += `<path class="sparkle" d="${lines}" fill="none" stroke="${c.sparkle}" stroke-width="3" stroke-linecap="round"/>`;
    // a small star glint on the coin's top left corner
    s += `<path d="M14 15.5L15.2 19.3L19 20.5L15.2 21.7L14 25.5L12.8 21.7L9 20.5L12.8 19.3Z" fill="#ffffff"/>`;
  }
  return s + '</svg>';
}

/** The default coin: "P" on it, with sparkle lines. */
export const COIN_ICON_SVG = coinIconSvg();

/** The coin as a `data:` URL, e.g. for CSS: `background-image: url("…")`. */
export function coinIconDataUrl(opts) {
  return `data:image/svg+xml,${encodeURIComponent(coinIconSvg(opts))}`;
}

/** The pop-up text when you get coins: '+3 coins', '+1 coin'. Shown next to the coin icon. */
export function coinsToast(amount) {
  const n = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  return { amount: n, text: `${n >= 0 ? '+' : ''}${n} coin${Math.abs(n) === 1 ? '' : 's'}` };
}
