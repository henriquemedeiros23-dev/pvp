// @pvp/stickman-3d: a three.js stickman with skins, outfits, weapon models and a pure pose.
// `three` is a peer dependency (bare import: node_modules in Node, an import map in the browser).
export { Stickman, DEFAULT_LIMB_RADIUS, disposeObject, collectResources } from './stickman.js';
export { buildWeapon, buildShieldModel, weaponModelKind, MODEL_TYPES, bolt, snowflake } from './weapons.js';
export { buildOutfit, OUTFIT_MODELS } from './outfits.js';
export { buildPotion, holdPotion } from './potion.js';
export { buildBomb, buildBombArea } from './bombs.js';
export { bodyMaterial, colorDef, eyeColor } from './materials.js';
export { createNameBar, drawNameBar } from './namebar.js';
export { computePose, restPose, rainbowHue, AIM_TYPES, SHIELD_ARM, STAND_HIP_Y, CROUCH_HIP_Y, SLIDE_HIP_Y } from './pose.js';
