// Damage numbers above heads (#33): "-15" floats up and fades out over a player's head for 2 seconds.
// Glue only: what to show and how it moves come from @pvp/hud-model (damageNumber, damageFloat).
// Cheap on phones: a small pool of HTML labels that are reused, moved with one transform each frame.
import * as THREE from 'three';
import { damageNumber, damageFloat } from '@pvp/hud-model';

const POOL_SIZE = 16;     // at most this many numbers at once (the oldest one is reused)
const HEAD_Y = 2.55;      // meters above the feet: just over the name tag
const SPREAD = [0, 28, -28, 14, -14]; // side steps (px), so quick hits on one player do not sit on top of each other

export class DamageNumbers {
  /** layer: an element over the game (position absolute, inset 0). */
  constructor(layer) {
    this.layer = layer;
    this.v = new THREE.Vector3();
    this.pool = Array.from({ length: POOL_SIZE }, () => {
      const el = document.createElement('div');
      el.className = 'dmgnum';
      el.hidden = true;
      el.append(document.createElement('b'), document.createElement('small'));
      layer.append(el);
      return { el, live: false, id: null, born: 0, x: 0, y: 0, z: 0, side: 0 };
    });
  }

  /**
   * A 'dmg' message came in. pos: where that player stands now ({ x, y, z }), or null if we can't see them.
   * now: same clock as update() (e.g. performance.now()).
   */
  add(msg, pos, now) {
    const v = damageNumber(msg);
    if (!v || !pos) return;
    const n = this.pool.find(p => !p.live) ?? this.pool.reduce((a, b) => (a.born <= b.born ? a : b));
    n.live = true; n.id = v.id; n.born = now;
    n.x = pos.x; n.y = pos.y; n.z = pos.z;
    n.side = SPREAD[(this.pool.filter(p => p.live && p.id === v.id).length - 1) % SPREAD.length]; // the others still over this head
    const [big, small] = n.el.children;
    big.textContent = v.text;
    small.textContent = v.badge;
    n.el.dataset.kind = v.kind;
    n.el.dataset.id = v.id;
    n.el.style.color = v.color;
  }

  /**
   * Move every number (call each frame). where(id): the player's position now, or null if gone
   * (then the number stays where it was, e.g. over a knocked-out player).
   */
  update(camera, width, height, now, where) {
    camera.updateMatrixWorld(); // the camera just moved this frame
    for (const n of this.pool) {
      if (!n.live) continue;
      const f = damageFloat(now - n.born);
      if (f.done) { n.live = false; n.el.hidden = true; continue; }
      const p = where(n.id);
      if (p) { n.x = p.x; n.y = p.y; n.z = p.z; }
      const v = this.v.set(n.x, n.y + HEAD_Y + f.rise, n.z).project(camera);
      if (v.z > 1 || v.z < -1) { n.el.hidden = true; continue; } // behind the camera
      n.el.hidden = false;
      const sx = (v.x + 1) / 2 * width, sy = (1 - v.y) / 2 * height;
      n.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) translateX(${n.side}px) scale(${f.scale.toFixed(3)})`;
      n.el.style.opacity = f.opacity.toFixed(3);
    }
  }

  /** Remove every number (leaving the arena). */
  clear() {
    for (const n of this.pool) { n.live = false; n.el.hidden = true; }
  }

  /** What is showing now, for tests: [{ id, text, kind }]. */
  shown() {
    return this.pool.filter(n => n.live && !n.el.hidden).map(n => ({
      id: n.id, text: n.el.children[0].textContent, badge: n.el.children[1].textContent, kind: n.el.dataset.kind,
    }));
  }
}
