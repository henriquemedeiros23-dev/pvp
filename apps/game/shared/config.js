// Game rules shared by the server and the browser.

export const MAX_PLAYERS = 100;
export const MAX_HP = 100;
export const MAX_SLOTS = 5;          // weapon slots, including the basic weapon
export const MAX_BANDAGES = 10;
export const MAX_MEDKITS = 3;
export const BANDAGE_HEAL = 25;
export const MEDKIT_HEAL = 75;
export const CHEST_RESPAWN_MS = 15000;
export const GOLDEN_CHEST_EVERY_MS = 3 * 60 * 1000;
export const ITEM_LIFETIME_MS = 120000;
export const SPAWN_PROTECT_MS = 3000;
export const BASIC_WEAPON = 'woodsword';

export const PLAYER_RADIUS = 0.45;
export const PLAYER_HEIGHT = 1.85;
export const CROUCH_HEIGHT = 1.2;
export const WALK_SPEED = 5.5;
export const RUN_SPEED = 8.5;
export const CROUCH_SPEED = 2.8;
export const SLIDE_SPEED = 13;
export const SLIDE_TIME = 0.65;
export const JUMP_SPEED = 8.5;
export const GRAVITY = 24;
export const STEP_HEIGHT = 0.55;

// type: melee | gun | throw | rocket | mine
export const WEAPONS = {
  woodsword: { name: 'Wooden Sword', type: 'melee', dmg: 14, range: 2.6, rate: 0.5, rarity: 'basic', price: 0 },
  sword:     { name: 'Sword',        type: 'melee', dmg: 30, range: 2.9, rate: 0.55, rarity: 'common', price: 30 },
  bat:       { name: 'Bat',          type: 'melee', dmg: 24, range: 2.7, rate: 0.45, rarity: 'common', price: 25, knock: 6 },
  spear:     { name: 'Spear',        type: 'melee', dmg: 28, range: 3.9, rate: 0.7, rarity: 'rare', price: 40 },
  axe:       { name: 'Axe',          type: 'melee', dmg: 42, range: 2.7, rate: 0.85, rarity: 'rare', price: 50 },
  pistol:    { name: 'Pistol',       type: 'gun', dmg: 18, range: 70, rate: 0.35, spread: 0.012, pellets: 1, rarity: 'common', price: 40 },
  shotgun:   { name: 'Shotgun',      type: 'gun', dmg: 10, range: 22, rate: 0.95, spread: 0.09, pellets: 8, rarity: 'rare', price: 80 },
  rifle:     { name: 'Rifle',        type: 'gun', dmg: 13, range: 90, rate: 0.12, spread: 0.02, pellets: 1, rarity: 'rare', price: 120 },
  sniper:    { name: 'Sniper',       type: 'gun', dmg: 75, range: 220, rate: 1.6, spread: 0, pellets: 1, rarity: 'legendary', price: 200 },
  grenade:   { name: 'Grenades',     type: 'throw', dmg: 60, radius: 6, rate: 1.4, speed: 18, fuse: 2.2, rarity: 'rare', price: 100 },
  rocket:    { name: 'Rocket Launcher', type: 'rocket', dmg: 75, radius: 5.5, rate: 1.9, speed: 38, rarity: 'legendary', price: 250 },
  mine:      { name: 'Mines',        type: 'mine', dmg: 65, radius: 4.5, rate: 1.0, maxActive: 3, rarity: 'legendary', price: 150 },
};

export const HEALS = {
  bandage: { name: 'Bandage', heal: BANDAGE_HEAL },
  medkit:  { name: 'Medkit',  heal: MEDKIT_HEAL },
};

export const LOOT_TABLE = {
  common: Object.keys(WEAPONS).filter(k => WEAPONS[k].rarity === 'common'),
  rare: Object.keys(WEAPONS).filter(k => WEAPONS[k].rarity === 'rare'),
  legendary: Object.keys(WEAPONS).filter(k => WEAPONS[k].rarity === 'legendary'),
};

// Skins: one color/pattern plus one item per outfit slot.
export const COLORS = {
  black:  { name: 'Classic Black', price: 0,   color: '#1b1b1f' },
  red:    { name: 'Red',           price: 50,  color: '#e0342f' },
  blue:   { name: 'Blue',          price: 50,  color: '#2f6fe0' },
  green:  { name: 'Green',         price: 50,  color: '#2fae4a' },
  purple: { name: 'Purple',        price: 75,  color: '#8b3fe0' },
  orange: { name: 'Orange',        price: 75,  color: '#f08a1c' },
  white:  { name: 'Snow White',    price: 100, color: '#f2f2f2' },
  zebra:  { name: 'Zebra Stripes', price: 150, color: '#ffffff', pattern: 'stripes' },
  gold:   { name: 'Shiny Gold',    price: 250, color: '#ffc531', pattern: 'gold' },
  rainbow:{ name: 'Rainbow',       price: 400, color: '#ff0000', pattern: 'rainbow' },
};

export const OUTFITS = {
  hat: {
    none:    { name: 'No Hat', price: 0 },
    cap:     { name: 'Baseball Cap', price: 100 },
    tophat:  { name: 'Top Hat', price: 150 },
    wizard:  { name: 'Wizard Hat', price: 200 },
    crown:   { name: 'Crown', price: 300 },
  },
  face: {
    none:    { name: 'No Mask', price: 0 },
    shades:  { name: 'Sunglasses', price: 80 },
    ninja:   { name: 'Ninja Band', price: 120 },
    hero:    { name: 'Hero Mask', price: 150 },
  },
  back: {
    none:    { name: 'Nothing', price: 0 },
    redcape: { name: 'Red Cape', price: 150 },
    bluecape:{ name: 'Blue Cape', price: 150 },
    backpack:{ name: 'Backpack', price: 100 },
  },
  shirt: {
    none:    { name: 'No Shirt', price: 0 },
    tshirt:  { name: 'T-Shirt', price: 60 },
    vest:    { name: 'Explorer Vest', price: 100 },
    armor:   { name: 'Knight Armor', price: 220 },
  },
};

export const DEFAULT_SKIN = { color: 'black', hat: 'none', face: 'none', back: 'none', shirt: 'none' };
