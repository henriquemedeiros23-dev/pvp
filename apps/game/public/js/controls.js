// Touch controls (joystick on the left, buttons on the right, drag to aim)
// plus keyboard and mouse for testing on a computer.

const $ = id => document.getElementById(id);

export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    document.body.classList.toggle('desktop', !this.touch);
    $('keysHelp').classList.toggle('hidden', this.touch);

    this.move = { x: 0, y: 0 };     // x = right, y = forward, length 0..1
    this.look = { x: 0, y: 0 };     // accumulated radians since last read
    this.fire = false;
    this.events = [];               // 'jump' | 'crouch' | 'open' | 'slot:N' | 'bandage' | 'medkit'
    this.enabled = false;
    this.keys = new Set();

    if (this.touch) this.setupTouch(); else this.setupDesktop();
  }

  take() {
    const ev = this.events; this.events = [];
    const look = { ...this.look }; this.look.x = this.look.y = 0;
    return { ev, look };
  }

  reset() {
    this.move.x = this.move.y = 0; this.fire = false; this.events = []; this.look.x = this.look.y = 0;
    this.keys.clear();
    $('knob').style.transform = '';
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setupTouch() {
    const stick = $('stick'), knob = $('knob');
    let stickId = null, cx = 0, cy = 0;
    const R = 55;
    stick.addEventListener('pointerdown', e => {
      e.preventDefault();
      stickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      moveStick(e);
    });
    const moveStick = e => {
      if (e.pointerId !== stickId) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.move.x = dx / R; this.move.y = -dy / R;
    };
    stick.addEventListener('pointermove', moveStick);
    const endStick = e => {
      if (e.pointerId !== stickId) return;
      stickId = null; this.move.x = this.move.y = 0; knob.style.transform = '';
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    // drag anywhere on the right part of the screen to aim
    const SENS = 0.0055;
    const lookers = new Map();
    const startLook = (el, e) => { lookers.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.setPointerCapture?.(e.pointerId); };
    const moveLook = e => {
      const l = lookers.get(e.pointerId);
      if (!l) return;
      this.look.x += (e.clientX - l.x) * SENS;
      this.look.y += (e.clientY - l.y) * SENS;
      l.x = e.clientX; l.y = e.clientY;
    };
    const endLook = e => lookers.delete(e.pointerId);
    this.canvas.addEventListener('pointerdown', e => { if (this.enabled) startLook(this.canvas, e); });
    this.canvas.addEventListener('pointermove', moveLook);
    this.canvas.addEventListener('pointerup', endLook);
    this.canvas.addEventListener('pointercancel', endLook);

    // fire button: hold to shoot, and you can drag on it to aim at the same time
    const fireBtn = $('btnFire');
    fireBtn.addEventListener('pointerdown', e => { e.preventDefault(); this.fire = true; fireBtn.classList.add('pressed'); startLook(fireBtn, e); });
    fireBtn.addEventListener('pointermove', moveLook);
    const endFire = e => { this.fire = false; fireBtn.classList.remove('pressed'); endLook(e); };
    fireBtn.addEventListener('pointerup', endFire);
    fireBtn.addEventListener('pointercancel', endFire);

    const tap = (id, ev) => {
      const b = $(id);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.events.push(ev); b.classList.add('pressed'); });
      const up = () => b.classList.remove('pressed');
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    };
    tap('btnJump', 'jump');
    tap('btnCrouch', 'crouch');
    tap('btnOpen', 'open');
  }

  setupDesktop() {
    const SENS = 0.0024;
    this.canvas.addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== this.canvas) { this.canvas.requestPointerLock(); return; }
      if (e.button === 0) this.fire = true;
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.fire = false; });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== this.canvas) return;
      this.look.x += e.movementX * SENS;
      this.look.y += e.movementY * SENS;
    });
    addEventListener('keydown', e => {
      if (!this.enabled || e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (!e.repeat) {
        if (k === ' ') this.events.push('jump');
        if (k === 'c' || k === 'control') this.events.push('crouch');
        if (k === 'e') this.events.push('open');
        if (k === 'q') this.events.push('bandage');
        if (k === 'f') this.events.push('medkit');
        if (k >= '1' && k <= '5') this.events.push('slot:' + (Number(k) - 1));
      }
      this.keys.add(k);
      this.updateKeys();
      if (k === ' ') e.preventDefault();
    });
    addEventListener('keyup', e => { this.keys.delete(e.key.toLowerCase()); this.updateKeys(); });
    addEventListener('blur', () => { this.keys.clear(); this.updateKeys(); this.fire = false; });
    addEventListener('wheel', e => { if (this.enabled) this.events.push(e.deltaY > 0 ? 'slot:+' : 'slot:-'); });
  }

  updateKeys() {
    const k = this.keys;
    let x = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    let y = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    const speed = k.has('shift') ? 0.6 : 1; // shift = walk
    this.move.x = (x / len) * speed; this.move.y = (y / len) * speed;
  }
}
