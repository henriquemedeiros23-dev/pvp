// Checks that a set of rules is consistent. Pure: never changes its input.
import { WEAPON_TYPES, RARITIES } from './weapons.js';

const REQUIRED_WEAPON_FIELDS = ['name', 'type', 'dmg', 'rate', 'rarity', 'price'];
const GUN_FIELDS = ['range', 'spread', 'pellets'];
const EXPLOSIVE_TYPES = ['throw', 'rocket', 'mine'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const isObject = v => v !== null && typeof v === 'object';
const isPrice = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Validate a rules object shaped like this package's exports
 * ({ WEAPONS, BASIC_WEAPON, COLORS, OUTFITS, DEFAULT_SKIN, LOOT_TABLE? }).
 * Returns a list of problems as strings; an empty list means the rules are valid.
 */
export function validateRules(rules) {
  const problems = [];
  if (!isObject(rules)) return ['rules must be an object'];
  const { WEAPONS, BASIC_WEAPON, COLORS, OUTFITS, DEFAULT_SKIN, LOOT_TABLE } = rules;

  // Weapons
  if (!isObject(WEAPONS)) {
    problems.push('WEAPONS must be an object');
  } else {
    const basics = [];
    for (const [id, w] of Object.entries(WEAPONS)) {
      if (!isObject(w)) { problems.push(`weapon ${id}: must be an object`); continue; }
      for (const f of REQUIRED_WEAPON_FIELDS) {
        if (w[f] === undefined) problems.push(`weapon ${id}: missing ${f}`);
      }
      if (w.type !== undefined && !WEAPON_TYPES.includes(w.type)) problems.push(`weapon ${id}: unknown type "${w.type}"`);
      if (w.rarity !== undefined && !RARITIES.includes(w.rarity)) problems.push(`weapon ${id}: unknown rarity "${w.rarity}"`);
      if (w.price !== undefined && !isPrice(w.price)) problems.push(`weapon ${id}: price must be a number >= 0`);
      if (w.type === 'gun') {
        for (const f of GUN_FIELDS) if (w[f] === undefined) problems.push(`weapon ${id}: gun missing ${f}`);
      }
      if (EXPLOSIVE_TYPES.includes(w.type) && w.radius === undefined) problems.push(`weapon ${id}: explosive missing radius`);
      if (w.rarity === 'basic') basics.push(id);
    }
    if (basics.length !== 1) problems.push(`there must be exactly one basic weapon, found ${basics.length}${basics.length ? ` (${basics.join(', ')})` : ''}`);
    if (!Object.hasOwn(WEAPONS, BASIC_WEAPON)) problems.push(`BASIC_WEAPON "${BASIC_WEAPON}" is not a weapon`);
    else if (WEAPONS[BASIC_WEAPON]?.rarity !== 'basic') problems.push(`BASIC_WEAPON "${BASIC_WEAPON}" is not the basic weapon`);

    if (isObject(LOOT_TABLE)) {
      for (const [rarity, ids] of Object.entries(LOOT_TABLE)) {
        for (const id of ids) {
          if (WEAPONS[id]?.rarity !== rarity) problems.push(`LOOT_TABLE.${rarity}: "${id}" is not a ${rarity} weapon`);
        }
      }
    }
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
