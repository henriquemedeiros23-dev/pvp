// Small DOM helpers for the sound settings: any number of 🔊 mute buttons, a panel with the Sounds slider, and
// "start audio on the first tap". Browser only (they are given the elements; nothing runs on import).
import { soundButtonView, volumeSliderView } from './settings.js';

/**
 * @param player  from createSoundPlayer()
 * @param els.muteButtons  buttons that mute / unmute (they show 🔊 or 🔇)
 * @param els.settingsButton  opens / closes els.panel
 * @param els.panel  the settings panel (hidden with the class "hidden")
 * @param els.slider  <input type="range" min="0" max="100"> for the Sounds volume; els.sliderText shows "80%"
 * @param els.closeButton  closes the panel
 */
export function attachSoundControls(player, { muteButtons = [], settingsButton, panel, slider, sliderText, closeButton } = {}) {
  const buttons = muteButtons.filter(Boolean);
  const render = s => {
    const v = soundButtonView(s);
    for (const b of buttons) {
      b.textContent = v.icon;
      b.title = v.label;
      b.setAttribute('aria-label', v.label);
      b.setAttribute('aria-pressed', String(v.pressed));
      b.classList.toggle('muted', v.pressed);
    }
    if (slider) {
      const sv = volumeSliderView(s);
      if (document.activeElement !== slider) slider.value = String(sv.value);
      if (sliderText) sliderText.textContent = sv.text;
    }
  };
  for (const b of buttons) {
    b.addEventListener('click', () => {
      player.unlock();
      const s = player.toggleMute();
      if (!s.muted) player.play('click');
    });
  }
  slider?.addEventListener('input', () => player.setSettings({ volume: Number(slider.value) / 100, muted: false }));
  slider?.addEventListener('change', () => player.play('click'));
  const open = on => { if (panel) panel.classList.toggle('hidden', !on); settingsButton?.setAttribute('aria-expanded', String(on)); };
  settingsButton?.addEventListener('click', () => open(panel?.classList.contains('hidden')));
  closeButton?.addEventListener('click', () => open(false));
  player.onChange(render);
  render(player.settings);
  return { render, open };
}

/**
 * Browsers only start audio after the player taps, clicks or presses a key: start it on the first one.
 * Keeps listening until the audio really runs (some phones need a second tap).
 */
export function unlockOnFirstGesture(player, target = globalThis.window) {
  if (!target?.addEventListener) return () => {};
  const events = ['pointerdown', 'touchend', 'keydown', 'click'];
  const off = () => { for (const e of events) target.removeEventListener(e, go, true); };
  function go() {
    player.unlock();
    const st = player.stats().state;
    if (st === 'running' || st === 'none' || (st === 'suspended' && player.settings.muted)) off();
  }
  for (const e of events) target.addEventListener(e, go, true);
  return off;
}
