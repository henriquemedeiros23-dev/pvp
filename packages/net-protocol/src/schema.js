// A tiny hand-written schema checker. No libraries.
//
// A "spec" describes one value:
//   'number'  finite number, -MAX_NUMBER..MAX_NUMBER (no NaN / Infinity)
//   'int'     whole number, -MAX_NUMBER..MAX_NUMBER
//   'uint'    whole number, 0..MAX_NUMBER
//   'string'  text, at most MAX_STRING characters
//   'bool'    true or false
//   'vec2'    [number, number]
//   'vec3'    [number, number, number]
//   'int?'    any of the names above with '?' at the end: the field may be missing
//   [spec]                      list of spec, at most MAX_ARRAY items
//   { list: spec, max: n }      list of spec, at most n items
//   { tuple: [specA, specB] }   fixed-length array, one spec per slot
//   { obj: { name: spec } }     object; unknown extra fields are dropped
//   { enum: ['a', 'b'] }        one of these exact values
//   { oneOf: [specA, specB] }   the first spec that matches wins
//   { nullable: spec }          spec or null
//   { optional: spec }          spec, or the field may be missing
//   { type: 'number'|'int'|'uint'|'string', min, max }   with custom limits
//                               (for 'string', max = longest length)

export const MAX_NUMBER = 1e6;   // no position, speed or id in this game comes near this
export const MAX_STRING = 64;    // names, weapon ids, skin ids are all short
export const MAX_ARRAY = 256;    // default longest list

class SchemaError extends Error {}

const fail = (path, what) => { throw new SchemaError(`${path || 'message'}: ${what}`); };

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function checkNumber(v, path, { int = false, min = -MAX_NUMBER, max = MAX_NUMBER } = {}) {
  if (typeof v !== 'number') fail(path, `expected a number, got ${kind(v)}`);
  if (!Number.isFinite(v)) fail(path, 'number is NaN or Infinity');
  if (int && !Number.isInteger(v)) fail(path, 'expected a whole number');
  if (v < min || v > max) fail(path, `number out of range ${min}..${max}`);
  return v;
}

function checkString(v, path, max = MAX_STRING) {
  if (typeof v !== 'string') fail(path, `expected a string, got ${kind(v)}`);
  if (v.length > max) fail(path, `string longer than ${max}`);
  return v;
}

function kind(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
  return typeof v;
}

function checkBase(name, v, path) {
  switch (name) {
    case 'number': return checkNumber(v, path);
    case 'int': return checkNumber(v, path, { int: true });
    case 'uint': return checkNumber(v, path, { int: true, min: 0 });
    case 'string': return checkString(v, path);
    case 'bool':
      if (typeof v !== 'boolean') fail(path, `expected true/false, got ${kind(v)}`);
      return v;
    case 'vec2': return checkTuple(['number', 'number'], v, path);
    case 'vec3': return checkTuple(['number', 'number', 'number'], v, path);
    default: throw new Error(`schema bug: unknown type "${name}"`);
  }
}

function checkTuple(specs, v, path) {
  if (!Array.isArray(v)) fail(path, `expected an array of ${specs.length}, got ${kind(v)}`);
  if (v.length !== specs.length) fail(path, `expected exactly ${specs.length} items, got ${v.length}`);
  return specs.map((s, i) => check(s, v[i], `${path}[${i}]`));
}

function checkList(spec, max, v, path) {
  if (!Array.isArray(v)) fail(path, `expected a list, got ${kind(v)}`);
  if (v.length > max) fail(path, `list longer than ${max}`);
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = check(spec, v[i], `${path}[${i}]`);
  return out;
}

/** True when a missing field is allowed for this spec. */
export function isOptional(spec) {
  return (typeof spec === 'string' && spec.endsWith('?')) || (isObj(spec) && has(spec, 'optional'));
}

/** Check fields of an object against { name: spec }. Unknown fields are dropped. */
export function checkFields(fields, v, path) {
  if (!isObj(v)) fail(path, `expected an object, got ${kind(v)}`);
  const out = {};
  for (const name of Object.keys(fields)) {
    const spec = fields[name];
    const p = path ? `${path}.${name}` : name;
    if (!has(v, name) || v[name] === undefined) {
      if (isOptional(spec)) continue;
      fail(p, 'missing');
    }
    out[name] = check(spec, v[name], p);
  }
  return out;
}

/** Check one value. Returns a clean copy, or throws SchemaError. */
export function check(spec, v, path = '') {
  if (typeof spec === 'string') return checkBase(spec.endsWith('?') ? spec.slice(0, -1) : spec, v, path);
  if (Array.isArray(spec)) return checkList(spec[0], MAX_ARRAY, v, path);
  if (has(spec, 'optional')) return check(spec.optional, v, path);
  if (has(spec, 'nullable')) return v === null ? null : check(spec.nullable, v, path);
  if (has(spec, 'list')) return checkList(spec.list, spec.max ?? MAX_ARRAY, v, path);
  if (has(spec, 'tuple')) return checkTuple(spec.tuple, v, path);
  if (has(spec, 'obj')) return checkFields(spec.obj, v, path);
  if (has(spec, 'enum')) {
    if (!spec.enum.includes(v)) fail(path, `expected one of ${spec.enum.map(e => JSON.stringify(e)).join(', ')}`);
    return v;
  }
  if (has(spec, 'oneOf')) {
    for (const s of spec.oneOf) {
      try { return check(s, v, path); } catch (e) { if (!(e instanceof SchemaError)) throw e; }
    }
    fail(path, 'does not match any allowed form');
  }
  if (has(spec, 'type')) {
    const { type, min, max } = spec;
    if (type === 'string') return checkString(v, path, max ?? MAX_STRING);
    if (type === 'number' || type === 'int' || type === 'uint') {
      return checkNumber(v, path, {
        int: type !== 'number',
        min: min ?? (type === 'uint' ? 0 : -MAX_NUMBER),
        max: max ?? MAX_NUMBER,
      });
    }
  }
  throw new Error(`schema bug: bad spec ${JSON.stringify(spec)}`);
}

export { SchemaError };
