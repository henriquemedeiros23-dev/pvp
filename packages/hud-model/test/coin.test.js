import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COIN_ICON_SVG, COIN_COLORS, coinIconSvg, coinIconDataUrl, coinsToast } from '../src/index.js';

const BODY = 'M10 13H40L45 18V54L40 59H10L5 54V18Z';

test('coin icon: an almost square coin with cut corners, a dark outline, a "P" and sparkle lines', () => {
  const svg = COIN_ICON_SVG;
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"'));
  assert.ok(svg.endsWith('</svg>'));
  // the body: 40 wide, 46 high (almost square), every corner cut by 5
  assert.ok(svg.includes(`class="body" d="${BODY}" fill="${COIN_COLORS.face}"`));
  assert.ok(svg.includes(`d="${BODY}" fill="none" stroke="${COIN_COLORS.outline}"`), 'darker outline');
  assert.ok(svg.includes('class="label"'), 'something written on it');
  assert.ok(svg.includes('class="sparkle"'), 'shiny lines');
  assert.ok(!/<(linearGradient|radialGradient|filter)|\sid="/.test(svg), 'no ids: safe to put inline many times');
  assert.equal(coinIconSvg(), svg);
});

test('coin icon options: PvP label, no label, no sparkle; unknown labels fall back to P', () => {
  assert.ok(coinIconSvg({ label: 'PvP' }).includes('>PvP</text>'));
  assert.ok(!coinIconSvg({ label: '' }).includes('class="label"'));
  assert.ok(!coinIconSvg({ sparkle: false }).includes('class="sparkle"'));
  assert.equal(coinIconSvg({ label: '<script>' }), COIN_ICON_SVG);
});

test('coin data URL decodes back to the SVG', () => {
  const url = coinIconDataUrl();
  assert.ok(url.startsWith('data:image/svg+xml,'));
  assert.equal(decodeURIComponent(url.slice('data:image/svg+xml,'.length)), COIN_ICON_SVG);
  assert.ok(!/["'\s]/.test(url), 'safe inside url("…") in CSS');
});

test('coins toast text', () => {
  assert.deepEqual(coinsToast(3), { amount: 3, text: '+3 coins' });
  assert.deepEqual(coinsToast(1), { amount: 1, text: '+1 coin' });
  assert.deepEqual(coinsToast(-2), { amount: -2, text: '-2 coins' });
  assert.deepEqual(coinsToast('x'), { amount: 0, text: '+0 coins' });
});
