import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAME_BAR, NAME_BAR_COLORS, HP_LEVELS, nameBarText, nameBarView, nameBarFit, damageStartHeight } from '../src/index.js';

test('nameBarText trims, keeps short names and cuts long ones with …', () => {
  assert.equal(nameBarText('  Ace '), 'Ace');
  assert.equal(nameBarText('Sixteen_chars_ok'), 'Sixteen_chars_ok');
  assert.equal(nameBarText('a'.repeat(20)), `${'a'.repeat(15)}…`);
  assert.equal(nameBarText(null), '');
  assert.equal(nameBarText(42), '42');
  assert.equal(nameBarText('<b>x</b>'), '<b>x</b>', 'user text is kept as text (drawn on canvas only)');
});

test('nameBarView: pill with the name, H.P bar under it, colors by H.P', () => {
  const v = nameBarView('Ace', 100);
  assert.equal(v.text, 'Ace');
  assert.equal(v.level, 'good');
  assert.equal(v.colors.hp, NAME_BAR_COLORS.good);
  assert.equal(v.colors.text, '#ffffff');
  assert.equal(v.width, NAME_BAR.minW, 'short names get the minimum width');
  assert.equal(v.height, NAME_BAR.pillH + NAME_BAR.gap + NAME_BAR.hpH);
  assert.equal(v.pixelRatio, 2);
  assert.equal(v.textX, v.width / 2, 'centered');
  assert.ok(v.hpBar.y >= v.pill.y + v.pill.h, 'H.P bar right under the pill');
  assert.equal(v.hpBar.fill, v.hpBar.w);
  assert.equal(v.pill.r, v.pill.h / 2, 'fully rounded');

  assert.equal(nameBarView('Ace', 60).level, 'mid');
  assert.equal(nameBarView('Ace', 60).colors.hp, NAME_BAR_COLORS.mid);
  assert.equal(nameBarView('Ace', 61).level, 'good');
  assert.equal(nameBarView('Ace', 30).level, 'low');
  assert.equal(nameBarView('Ace', 30).colors.hp, NAME_BAR_COLORS.low);
  assert.equal(nameBarView('Ace', 31).level, 'mid');
  assert.equal(HP_LEVELS.mid, 0.6);

  const half = nameBarView('Ace', 50);
  assert.equal(half.hpBar.fill, half.hpBar.w / 2);
  assert.equal(half.percent, 50);
  assert.equal(nameBarView('Ace', -5).hp, 0);
  assert.equal(nameBarView('Ace', -5).hpBar.fill, 0);
  assert.equal(nameBarView('Ace', 500).hp, 100);
  assert.equal(nameBarView('Ace', undefined).hp, 100, 'no H.P known yet: full');
  assert.equal(nameBarView('Ace', 40, 80).percent, 50, 'another max H.P');
});

test('nameBarView: width follows the measured text; key changes only when the picture does', () => {
  const measure = (text, font) => { assert.equal(font, NAME_BAR.font); return text.length * 20; };
  const v = nameBarView('LongerName12', 100, 100, { measure });
  assert.equal(v.width, Math.ceil(12 * 20 + NAME_BAR.padX * 2 + NAME_BAR.border * 2));
  assert.ok(nameBarView('LongerName12', 100).width > NAME_BAR.minW, 'guessed width without measure');
  assert.equal(nameBarView('Ace', 70).key, nameBarView('Ace', 70.2).key, 'same rounded H.P: no redraw');
  assert.notEqual(nameBarView('Ace', 70).key, nameBarView('Ace', 69).key);
  assert.notEqual(nameBarView('Ace', 70).key, nameBarView('Bob', 70).key);
  assert.equal(nameBarView('Ace', 70, 100, { measure: () => NaN }).width, nameBarView('Ace', 70).width, 'a bad measure falls back to the guess');
});

test('nameBarFit: same size close up, grows with distance up to a cap, hidden far away', () => {
  const near = nameBarFit(NAME_BAR.nearDistance - 1);
  assert.equal(near.scale, 1);
  assert.equal(near.visible, true);
  assert.equal(near.y, NAME_BAR.y);
  assert.ok(Math.abs(near.worldHeight - (NAME_BAR.pillH + NAME_BAR.gap + NAME_BAR.hpH) * NAME_BAR.metersPerPx) < 1e-9);
  assert.equal(nameBarFit(0.5).scale, 1, 'not huge up close');
  assert.equal(nameBarFit(NAME_BAR.nearDistance * 2).scale, 2, 'twice as far as nearDistance: twice as big (same size on screen)');
  assert.equal(nameBarFit(50).scale, NAME_BAR.maxScale);
  assert.equal(nameBarFit(60).visible, true);
  assert.equal(nameBarFit(60.1).visible, false);
  assert.equal(nameBarFit(Infinity).visible, false);
  assert.ok(nameBarFit(NAME_BAR.nearDistance * 2).top > nameBarFit(1).top);
});

test('damage numbers start above the name bar', () => {
  for (const d of [1, 5, 10, 30, 60]) {
    const fit = nameBarFit(d);
    assert.ok(damageStartHeight(d) > fit.top, `at ${d} m`);
    assert.ok(damageStartHeight(d) < fit.top + 0.5);
  }
});
