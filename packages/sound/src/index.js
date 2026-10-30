// @pvp/sound: game sounds made in code (Web Audio API), no audio files.
// Pure parts (Node and browser): recipes, planner, mixer math, settings, which sounds a server message makes.
// Browser parts: createSoundPlayer (plays), attachSoundControls / unlockOnFirstGesture (buttons and slider).
export { SOUNDS, SOUND_NAMES } from './recipes.js';
export { planSound, SILENT } from './planner.js';
export { volumeToGain, masterGain, attenuation, spatialize, SPATIAL, createVoiceLimiter, createFootsteps, noiseSamples } from './mixer.js';
export { SETTINGS_KEY, DEFAULT_SETTINGS, cleanSettings, loadSettings, saveSettings, soundButtonView, volumeSliderView } from './settings.js';
export { soundEventsFor, gunSound, hitSound, GUN_SOUNDS, MELEE_HIT_SOUNDS, BOOM_SOUNDS } from './events.js';
export { createSoundPlayer } from './player.js';
export { attachSoundControls, unlockOnFirstGesture } from './controls.js';
