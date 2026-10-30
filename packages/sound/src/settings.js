// Sound settings: muted or not, and the Sounds volume. Saved per browser (localStorage, passed in).
// Reading and writing never throw: private windows and blocked storage just use the defaults.

export const SETTINGS_KEY = 'pvp-sound';
export const DEFAULT_SETTINGS = Object.freeze({ muted: false, volume: 0.8 });

/** Any value -> valid settings (unknown or broken fields fall back to the defaults). */
export function cleanSettings(s) {
  const o = s && typeof s === 'object' ? s : {};
  const volume = typeof o.volume === 'number' && Number.isFinite(o.volume) ? Math.min(1, Math.max(0, o.volume)) : DEFAULT_SETTINGS.volume;
  return { muted: typeof o.muted === 'boolean' ? o.muted : DEFAULT_SETTINGS.muted, volume };
}

/** Settings saved in this browser, or the defaults. */
export function loadSettings(storage) {
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    return cleanSettings(text ? JSON.parse(text) : null);
  } catch {
    return cleanSettings(null);
  }
}

/** Save the settings; true if it worked. */
export function saveSettings(storage, settings) {
  try {
    if (!storage) return false;
    storage.setItem(SETTINGS_KEY, JSON.stringify(cleanSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

/** What the 🔊 button shows. */
export function soundButtonView(settings) {
  const s = cleanSettings(settings);
  const off = s.muted || s.volume === 0;
  return {
    icon: off ? '🔇' : '🔊',
    pressed: s.muted,
    label: s.muted ? 'Sound is off. Tap to turn it on' : 'Sound is on. Tap to turn it off',
  };
}

/** What the Sounds volume slider shows: 0..100 and a text like "80%". */
export function volumeSliderView(settings) {
  const v = Math.round(cleanSettings(settings).volume * 100);
  return { value: v, text: `${v}%` };
}
