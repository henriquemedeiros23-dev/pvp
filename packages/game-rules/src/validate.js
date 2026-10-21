// Checks that a set of rules is consistent. Pure: never changes its input.
import { WEAPON_TYPES, RARITIES as KNOWN_RARITIES } from './weapons.js';

const REQUIRED_WEAPON_FIELDS = ['name', 'type', 'dmg', 'rate', 'rarity', 'price'];
const GUN_FIELDS = ['range', 'spread', 'pellets'];
const EXPLOSIVE_TYPES = ['throw', 'rocket', 'mine'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const isObject = v => v !== null && typeof v === 'object';
const isPrice = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isPosInt = v => Number.isInteger(v) && v > 0;
const isPercent = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

/**
 * Validate a rules object shaped like this package's exports
 * ({ WEAPONS, STARTING_WEAPON, RARITIES?, RARITY_COLORS?, COLORS, OUTFITS, DEFAULT_SKIN, LOOT_TABLE? }).
 * Returns a list of problems as strings; an empty list means the rules are valid.
 */
export function validateRules(rules) {
  const problems = [];
  if (!isObject(rules)) return ['rules must be an object'];
  const { WEAPONS, STARTING_WEAPON, COLORS, OUTFITS, DEFAULT_SKIN, LOOT_TABLE, RARITY_COLORS } = rules;
  const RARITIES = rules.RARITIES ?? KNOWN_RARITIES;

  // Rarities: a list of names, each with a color
  if (!Array.isArray(RARITIES) || RARITIES.length === 0) problems.push('RARITIES must be a non-empty list');
  else if (RARITY_COLORS !== undefined) {
    if (!isObject(RARITY_COLORS)) problems.push('RARITY_COLORS must be an object');
    else {
      for (const r of RARITIES) {
        const c = Object.hasOwn(RARITY_COLORS, r) ? RARITY_COLORS[r] : undefined;
        if (!isObject(c)) { problems.push(`RARITY_COLORS: missing rarity "${r}"`); continue; }
        for (const f of ['color', 'color2']) {
          if (typeof c[f] !== 'string' || !HEX_COLOR.test(c[f])) problems.push(`RARITY_COLORS.${r}.${f}: "${c[f]}" is not a valid hex color`);
        }
      }
      for (const r of Object.keys(RARITY_COLORS)) if (!RARITIES.includes(r)) problems.push(`RARITY_COLORS.${r}: unknown rarity`);
    }
  }
  const rarities = Array.isArray(RARITIES) ? RARITIES : [];
  if (isObject(rules.GOLDEN_CHEST_BOOST)) {
    for (const [r, n] of Object.entries(rules.GOLDEN_CHEST_BOOST)) {
      if (!rarities.includes(r)) problems.push(`GOLDEN_CHEST_BOOST.${r}: unknown rarity`);
      if (!isPrice(n)) problems.push(`GOLDEN_CHEST_BOOST.${r}: must be a number >= 0`);
    }
  }

  // Weapons
  if (!isObject(WEAPONS)) {
    problems.push('WEAPONS must be an object');
  } else {
    let chanceTotal = 0;
    for (const [id, w] of Object.entries(WEAPONS)) {
      if (!isObject(w)) { problems.push(`weapon ${id}: must be an object`); continue; }
      for (const f of REQUIRED_WEAPON_FIELDS) {
        if (w[f] === undefined) problems.push(`weapon ${id}: missing ${f}`);
      }
      if (w.type !== undefined && !WEAPON_TYPES.includes(w.type)) problems.push(`weapon ${id}: unknown type "${w.type}"`);
      if (w.rarity !== undefined && !rarities.includes(w.rarity)) problems.push(`weapon ${id}: unknown rarity "${w.rarity}"`);
      if (w.price !== undefined && !isPrice(w.price)) problems.push(`weapon ${id}: price must be a number >= 0`);
      if (w.durability === undefined) problems.push(`weapon ${id}: missing durability (null = never breaks)`);
      else if (w.durability !== null && !isPosInt(w.durability)) problems.push(`weapon ${id}: durability must be null or a whole number > 0`);
      if (w.wearPerUse !== undefined && !isPosInt(w.wearPerUse)) problems.push(`weapon ${id}: wearPerUse must be a whole number > 0`);
      if (w.type === 'gun') {
        for (const f of GUN_FIELDS) if (w[f] === undefined) problems.push(`weapon ${id}: gun missing ${f}`);
      }
      if (EXPLOSIVE_TYPES.includes(w.type) && w.radius === undefined) problems.push(`weapon ${id}: explosive missing radius`);
      if (w.chestChance === undefined) problems.push(`weapon ${id}: missing chestChance (percent, 0 = never in chests)`);
      else if (!isPercent(w.chestChance)) problems.push(`weapon ${id}: chestChance must be a number from 0 to 100`);
      else chanceTotal += w.chestChance;
    }
    if (Math.abs(chanceTotal - 100) > 1e-9) problems.push(`weapon chestChance values must add up to 100, they add up to ${+chanceTotal.toFixed(4)}`);
    if (!Object.hasOwn(WEAPONS, STARTING_WEAPON)) problems.push(`STARTING_WEAPON "${STARTING_WEAPON}" is not a weapon`);

    if (isObject(LOOT_TABLE)) {
      for (const [rarity, ids] of Object.entries(LOOT_TABLE)) {
        if (!rarities.includes(rarity)) problems.push(`LOOT_TABLE.${rarity}: unknown rarity`);
        for (const id of ids) {
          if (WEAPONS[id]?.rarity !== rarity) problems.push(`LOOT_TABLE.${rarity}: "${id}" is not a ${rarity} weapon`);
        }
      }
    }
  }

  // The Healing Potion (optional in a rules object; the real rules have it)
  if (rules.POTION !== undefined) {
    const P = rules.POTION;
    if (!isObject(P)) problems.push('POTION must be an object');
    else {
      if (typeof P.id !== 'string' || !P.id) problems.push('POTION: missing id');
      if (P.name === undefined) problems.push('POTION: missing name');
      if (!isPercent(P.healPercent) || P.healPercent <= 0) problems.push('POTION: healPercent must be a number from 1 to 100');
      if (!isPosInt(P.drinkMs)) problems.push('POTION: drinkMs must be a whole number > 0');
      if (!isPercent(P.chestChance)) problems.push('POTION: chestChance must be a number from 0 to 100');
      if (!isPrice(P.price)) problems.push('POTION: price must be a number >= 0');
      if (!rarities.includes(P.rarity)) problems.push(`POTION: unknown rarity "${P.rarity}"`);
    }
    if (!Number.isInteger(rules.MAX_POTIONS) || rules.MAX_POTIONS < 0) problems.push('MAX_POTIONS must be a whole number >= 0');
  }

  // Colors
  if (!isObject(COLORS)) {
    problems.push('COLORS must be an object');
  } else {
    for (const [id, c] of Object.entries(COLORS)) {
      if (!isObject(c)) { problems.push(`color ${id}: must be an object`); continue; }
      if (c.name === undefined) problems.push(`color ${id}: missing name`);
      if (!isPrice(c.price)) problems.push(`color ${id}: price must be a number >= 0`);
      if (typeof c.color !== 'string' || !HEX_COLOR.test(c.color)) problems.push(`color ${id}: "${c.color}" is not a valid hex color`);
    }
  }

  // Outfits
  if (!isObject(OUTFITS)) {
    problems.push('OUTFITS must be an object');
  } else {
    for (const [slot, items] of Object.entries(OUTFITS)) {
      if (!isObject(items)) { problems.push(`outfit slot ${slot}: must be an object`); continue; }
      if (!isObject(items.none)) problems.push(`outfit slot ${slot}: missing "none"`);
      else if (items.none.price !== 0) problems.push(`outfit slot ${slot}: "none" must be free`);
      for (const [id, item] of Object.entries(items)) {
        if (!isObject(item)) { problems.push(`outfit ${slot}.${id}: must be an object`); continue; }
        if (item.name === undefined) problems.push(`outfit ${slot}.${id}: missing name`);
        if (!isPrice(item.price)) problems.push(`outfit ${slot}.${id}: price must be a number >= 0`);
      }
    }
  }

  // Default skin: every slot points to an existing free item
  if (!isObject(DEFAULT_SKIN)) {
    problems.push('DEFAULT_SKIN must be an object');
  } else if (isObject(COLORS) && isObject(OUTFITS)) {
    const slots = ['color', ...Object.keys(OUTFITS)];
    for (const slot of slots) {
      const id = DEFAULT_SKIN[slot];
      const table = slot === 'color' ? COLORS : OUTFITS[slot];
      const item = isObject(table) && Object.hasOwn(table, id) ? table[id] : undefined;
      if (!item) problems.push(`DEFAULT_SKIN.${slot}: unknown item "${id}"`);
      else if (item.price !== 0) problems.push(`DEFAULT_SKIN.${slot}: "${id}" is not free`);
    }
    for (const slot of Object.keys(DEFAULT_SKIN)) {
      if (!slots.includes(slot)) problems.push(`DEFAULT_SKIN.${slot}: unknown slot`);
    }
  }

  return problems;
}
