import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNameBar, drawNameBar } from '../src/index.js';

// A fake canvas that records what is drawn (no DOM in Node).
function fakeCanvas() {
  const calls = [];
  const g = new Proxy({ font: '' }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return text => ({ width: text.length * 10 });
      return (...a) => calls.push([k, ...a]);
    },
    set(t, k, v) { t[k] = v; if (k === 'fillStyle') calls.push(['fillStyle', v]); return true; },
  });
  return { width: 0, height: 0, calls, getContext: () => g };
}

const view = (key, width = 80, hp = '#45e070') => ({
  key, width, height: 44, pixelRatio: 2, font: 'bold 22px sans-serif', text: 'Ace', textX: width / 2, textY: 16,
  pill: { x: 0.75, y: 0.75, w: width - 1.5, h: 30.5, r: 15.25 }, hpBar: { x: 10, y: 36, w: width - 20, h: 8, r: 4, fill: 30 },
  colors: { pill: 'rgba(0,0,0,.6)', border: 'rgba(255,255,255,.2)', text: '#ffffff', textShadow: 'rgba(0,0,0,.5)', hpBack: '#111', hp },
});

test('createNameBar: a sprite that draws the name on a 2x canvas, only when the view changes', () => {
  const c = fakeCanvas();
  const bar = createNameBar({ createCanvas: () => c, metersPerPx: 0.01 });
  assert.ok(bar.object.isSprite);
  assert.equal(bar.object.center.y, 0, 'bottom sits on its position');
  assert.equal(bar.object.visible, false, 'hidden before the first draw');
  assert.equal(bar.object.material.depthTest, true, 'walls hide it');
  assert.equal(bar.measure('Ace', 'bold 22px sans-serif'), 30);

  assert.equal(bar.draw(view('Ace|100')), true);
  assert.equal(c.width, 160, '2x for retina');
  assert.equal(c.height, 88);
  assert.ok(c.calls.some(([k, t]) => k === 'fillText' && t === 'Ace'), 'name drawn as canvas text');
  assert.ok(c.calls.some(([k, v]) => k === 'fillStyle' && v === '#45e070'), 'green H.P');
  assert.equal(bar.draw(view('Ace|100')), false, 'same key: no redraw');
  assert.equal(bar.draws, 1);
  const tex = bar.object.material.map;
  assert.ok(tex.isCanvasTexture);

  bar.fit({ visible: true, scale: 2, y: 2.1 });
  assert.equal(bar.object.visible, true);
  assert.equal(bar.object.position.y, 2.1);
  assert.ok(Math.abs(bar.object.scale.x - 80 * 0.01 * 2) < 1e-9);
  assert.ok(Math.abs(bar.object.scale.y - 44 * 0.01 * 2) < 1e-9);

  assert.equal(bar.draw(view('Ace|20', 80, '#ff4a3d')), true, 'H.P changed: redraw');
  assert.equal(bar.object.material.map, tex, 'same size: same texture');
  assert.equal(bar.draw(view('Longer|20', 120)), true);
  assert.notEqual(bar.object.material.map, tex, 'new size: new texture');
  assert.equal(c.width, 240);
  assert.ok(Math.abs(bar.object.scale.x - 120 * 0.01 * 2) < 1e-9, 'keeps its scale');
  bar.fit({ visible: false });
  assert.equal(bar.object.visible, false);
  bar.dispose();
});

test('createNameBar works without a canvas (Node): draws nothing, stays hidden', () => {
  const bar = createNameBar();
  assert.equal(bar.draw(view('x')), false);
  bar.fit({ visible: true });
  assert.equal(bar.object.visible, false);
  assert.ok(Number.isNaN(bar.measure('x', 'bold 22px sans-serif')));
  bar.dispose();
});

test('drawNameBar skips the H.P fill at 0 H.P', () => {
  const c = fakeCanvas();
  const v = view('k', 80, '#ff4a3d');
  v.hpBar.fill = 0;
  drawNameBar(c.getContext('2d'), v);
  assert.ok(!c.calls.some(([k, val]) => k === 'fillStyle' && val === '#ff4a3d'));
});
