// The name bar above a player (#54): a sprite that always faces the camera, drawn on a canvas
// (user names are only ever drawn as canvas text, never put into HTML). What to draw comes in as a "view"
// (e.g. nameBarView() from @pvp/hud-model): { key, width, height, pixelRatio, font, text, textX, textY,
// pill: {x,y,w,h,r}, hpBar: {x,y,w,h,r,fill}, colors: { pill, border, text, textShadow, hpBack, hp } }.
// The canvas is redrawn only when view.key changes (cheap on phones).
import * as THREE from 'three';

const defaultCanvas = () => (typeof document !== 'undefined' && typeof document.createElement === 'function' ? document.createElement('canvas') : null);

// A rounded rectangle path (no ctx.roundRect: older phones).
function roundRect(g, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  g.lineTo(x + w, y + h - rr);
  g.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  g.lineTo(x + rr, y + h);
  g.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  g.lineTo(x, y + rr);
  g.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
  g.closePath();
}

/** Draw a name bar view on a 2D context (CSS pixels; scale the context for retina first). */
export function drawNameBar(g, v) {
  g.clearRect(0, 0, v.width, v.height);
  const c = v.colors;
  // the dark pill with a thin light outline
  roundRect(g, v.pill.x, v.pill.y, v.pill.w, v.pill.h, v.pill.r);
  g.fillStyle = c.pill;
  g.fill();
  if (c.border) { g.lineWidth = 1.5; g.strokeStyle = c.border; g.stroke(); }
  // the name: bold white, centered, a soft shadow so it reads on sky and grass
  g.font = v.font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = c.textShadow || 'transparent';
  g.shadowBlur = 3;
  g.shadowOffsetY = 1;
  g.fillStyle = c.text;
  g.fillText(v.text, v.textX, v.textY + 1);
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
  g.shadowOffsetY = 0;
  // the H.P bar under it
  const b = v.hpBar;
  roundRect(g, b.x, b.y, b.w, b.h, b.r);
  g.fillStyle = c.hpBack;
  g.fill();
  if (b.fill > 0) {
    roundRect(g, b.x + 1, b.y + 1, Math.max(0, b.fill - 2), b.h - 2, (b.h - 2) / 2);
    g.fillStyle = c.hp;
    g.fill();
  }
}

/**
 * A name bar: { object (THREE.Sprite, its bottom sits at its position), draw(view), fit({ visible, scale, y }),
 * measure(text, font), draws, view, dispose() }. Add `object` to the player's root (it faces the camera by itself).
 * opts.metersPerPx: world size of one CSS pixel at scale 1 (default 0.009). opts.createCanvas: make a canvas
 * (default document.createElement('canvas'); none in Node: then it draws nothing).
 * A wall between you and the player hides it for free (depth test on, no ray casts).
 */
export function createNameBar({ metersPerPx = 0.009, createCanvas = defaultCanvas, renderOrder = 5 } = {}) {
  const canvas = createCanvas();
  const g = canvas?.getContext?.('2d') ?? null;
  const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: true });
  const sprite = new THREE.Sprite(material);
  sprite.center.set(0.5, 0); // bottom middle at the position
  sprite.renderOrder = renderOrder;
  sprite.name = 'nameBar';
  let texture = null, w = 0, h = 0, pr = 1, scale = 1;
  const bar = {
    object: sprite,
    draws: 0,
    view: null,
    measure(text, font) {
      if (!g) return NaN;
      g.font = font;
      return g.measureText(text).width;
    },
    /** Draw a view; does nothing if its key did not change. Returns true when it redrew. */
    draw(view) {
      if (!view || (bar.view && bar.view.key === view.key)) return false;
      bar.view = view;
      if (!g) return false;
      const size = view.width !== w || view.height !== h || (view.pixelRatio || 1) !== pr;
      if (size) {
        w = view.width; h = view.height; pr = view.pixelRatio || 1;
        canvas.width = Math.ceil(w * pr); canvas.height = Math.ceil(h * pr);
        // a texture keeps its first size on the GPU: a new size needs a new texture (only when the name changes)
        texture?.dispose();
        texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        material.map = texture;
        material.needsUpdate = true;
        applyScale();
      }
      g.setTransform(pr, 0, 0, pr, 0, 0);
      drawNameBar(g, view);
      texture.needsUpdate = true;
      bar.draws++;
      return true;
    },
    /** Place and size it (e.g. nameBarFit(distance) from @pvp/hud-model): { visible, scale, y }. */
    fit({ visible = true, scale: s = 1, y } = {}) {
      sprite.visible = !!visible && !!texture;
      if (Number.isFinite(y)) sprite.position.y = y;
      if (Number.isFinite(s) && s > 0 && s !== scale) { scale = s; applyScale(); }
    },
    dispose() {
      texture?.dispose();
      material.dispose();
      sprite.removeFromParent();
    },
  };
  function applyScale() {
    sprite.scale.set(Math.max(1e-3, w * metersPerPx * scale), Math.max(1e-3, h * metersPerPx * scale), 1);
  }
  sprite.visible = false; // until the first draw
  return bar;
}
