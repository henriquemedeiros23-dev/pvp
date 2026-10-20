// Skins: one color/pattern plus one item per outfit slot.
import { deepFreeze } from './freeze.js';

export const COLORS = deepFreeze({
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
});

export const OUTFITS = deepFreeze({
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
});

/** The skin slots, in order: the color plus every outfit slot. */
export const SKIN_SLOTS = deepFreeze(['color', 'hat', 'face', 'back', 'shirt']);

export const DEFAULT_SKIN = deepFreeze({ color: 'black', hat: 'none', face: 'none', back: 'none', shirt: 'none' });

/** Price of a skin item. slot is 'color' | 'hat' | 'face' | 'back' | 'shirt'. Undefined if unknown. */
export function skinPrice(slot, id) {
  const table = slot === 'color' ? COLORS : (Object.hasOwn(OUTFITS, slot) ? OUTFITS[slot] : undefined);
  if (!table || !Object.hasOwn(table, id)) return undefined;
  return table[id].price;
}
