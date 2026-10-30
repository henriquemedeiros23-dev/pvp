// The name bar above every other player (#54): a small dark pill with the player's name in bold white,
// and the H.P bar right under it (green, yellow, red as H.P drops). Pure layout and colors here;
// @pvp/stickman-3d's createNameBar draws it on a canvas. Damage numbers start above it.
import { RULES } from '@pvp/game-rules';

/**
 * Layout of the bar in CSS pixels (the canvas is drawn at `pixelRatio` times this for crisp text),
 * how big it is in the world, and when it shows.
 */
export const NAME_BAR = Object.freeze({
  font: 'bold 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontPx: 22,
  padX: 12,           // space left and right of the name inside the pill
  pillH: 32,          // pill height (fully rounded: radius pillH / 2)
  minW: 76,           // the pill is never narrower than this (short names)
  maxChars: 16,       // longer names are cut with '…' (names are 3-16 already)
  gap: 4,             // space between the pill and the H.P bar
  hpH: 8,             // H.P bar height
  hpInset: 10,        // the H.P bar is this much narrower than the pill on each side
  border: 1.5,        // thin light outline so the dark pill shows on dark ground too
  pixelRatio: 2,      // draw at 2x for retina screens
  metersPerPx: 0.009, // world size of one CSS pixel when close (the 44 px tall bar is 0.4 m)
  y: 2.1,             // the bottom of the bar, meters above the player's feet (over the head)
  nearDistance: 4,    // closer than this the bar keeps its world size (it gets a bit bigger as you walk up, not huge)
  maxScale: 6,        // farther away it grows with distance (stays readable) up to this many times
  hideDistance: 60,   // farther than this it is hidden
});

/** Bar colors. The H.P fill is green above HP_LEVELS.mid, yellow above HP_LEVELS.low, else red. */
export const NAME_BAR_COLORS = Object.freeze({
  pill: 'rgba(14, 16, 26, 0.66)',
  border: 'rgba(255, 255, 255, 0.22)',
  text: '#ffffff',
  textShadow: 'rgba(0, 0, 0, 0.55)',
  hpBack: 'rgba(14, 16, 26, 0.72)',
  good: '#45e070',
  mid: '#ffd23f',
  low: '#ff4a3d',
});
export const HP_LEVELS = Object.freeze({ mid: 0.6, low: 0.3 });

/** A name as the bar shows it: a string, trimmed, cut to maxChars with '…'. */
export function nameBarText(name, maxChars = NAME_BAR.maxChars) {
  const s = typeof name === 'string' ? name.trim() : name == null ? '' : String(name);
  const chars = [...s];
  return chars.length > maxChars ? `${chars.slice(0, Math.max(1, maxChars - 1)).join('')}…` : s;
}

// A guess of the bold text width when no real measure is passed (Node, tests): about 0.62 em per character.
const guessWidth = (text, fontPx) => [...text].length * fontPx * 0.62;

/**
 * What the name bar shows and where (CSS pixels): { text, hp, max, ratio, percent, level ('good'|'mid'|'low'),
 * width, height, pixelRatio, font, pill: {x,y,w,h,r}, textX, textY, hpBar: {x,y,w,h,r,fill}, colors: {...},
 * key }. `key` changes only when the picture changes: redraw the canvas only then (cheap on phones).
 * opts.measure(text, font) -> pixel width (e.g. a canvas 2D context's measureText); without it the width is guessed.
 */
export function nameBarView(name, hp, maxHp = RULES.MAX_HP, { measure, layout = NAME_BAR, colors = NAME_BAR_COLORS } = {}) {
  const L = layout;
  const text = nameBarText(name, L.maxChars);
  const max = Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 100;
  const value = Number.isFinite(hp) ? Math.max(0, Math.min(max, Math.round(hp))) : max;
  const ratio = value / max;
  const level = ratio > HP_LEVELS.mid ? 'good' : ratio > HP_LEVELS.low ? 'mid' : 'low';
  const measured = typeof measure === 'function' ? Number(measure(text, L.font)) : NaN;
  const textW = Number.isFinite(measured) && measured >= 0 ? measured : guessWidth(text, L.fontPx);
  const width = Math.ceil(Math.max(L.minW, textW + L.padX * 2 + L.border * 2));
  const height = L.pillH + L.gap + L.hpH;
  const pill = { x: L.border / 2, y: L.border / 2, w: width - L.border, h: L.pillH - L.border, r: (L.pillH - L.border) / 2 };
  const hpW = width - L.hpInset * 2;
  const hpBar = { x: L.hpInset, y: L.pillH + L.gap, w: hpW, h: L.hpH, r: L.hpH / 2, fill: Math.round(hpW * ratio * 100) / 100 };
  return {
    text, hp: value, max, ratio, percent: Math.round(ratio * 100), level,
    width, height, pixelRatio: L.pixelRatio, font: L.font,
    pill, textX: width / 2, textY: L.pillH / 2, hpBar,
    colors: { pill: colors.pill, border: colors.border, text: colors.text, textShadow: colors.textShadow, hpBack: colors.hpBack, hp: colors[level] },
    key: `${text}|${value}/${max}`,
  };
}

/**
 * How the bar sits in the world at `distance` meters from the camera: { visible, scale, y, worldHeight, top }.
 * Close (< nearDistance) it keeps its size; farther it grows with distance (so it stays readable on screen)
 * up to maxScale; beyond hideDistance it is hidden. y = its bottom above the feet, top = y + its height.
 */
export function nameBarFit(distance, layout = NAME_BAR) {
  const L = layout;
  const d = Number.isFinite(distance) && distance > 0 ? distance : 0;
  const scale = Math.min(L.maxScale, Math.max(1, d / L.nearDistance));
  const worldHeight = (L.pillH + L.gap + L.hpH) * L.metersPerPx * scale;
  return { visible: Number.isFinite(distance) && d <= L.hideDistance, scale, y: L.y, worldHeight, top: L.y + worldHeight };
}

/** Where a damage number starts (meters above the player's feet): just over the name bar at that distance. */
export function damageStartHeight(distance, layout = NAME_BAR) {
  return nameBarFit(distance, layout).top + 0.12;
}
