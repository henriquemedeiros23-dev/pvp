// Deterministic seeded random numbers.
// Plain ES module with no dependencies: works in Node and directly in the browser.
// The core is mulberry32, identical to the generator the game used first,
// so a numeric seed gives the exact same sequence as before.

/**
 * Hash a string to an unsigned 32-bit integer (FNV-1a over UTF-16 code units).
 * @param {string} str
 * @returns {number}
 */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Turn a seed (number or string) into an unsigned 32-bit integer.
 * Numbers keep their low 32 bits (same as `seed >>> 0`); strings are hashed.
 * @param {number|string} seed
 * @returns {number}
 */
export function normalizeSeed(seed) {
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) throw new TypeError('seed must be a finite number or a string');
    return seed >>> 0;
  }
  if (typeof seed === 'string') return hashString(seed);
  throw new TypeError('seed must be a finite number or a string');
}

// Mix two 32-bit values into one well-spread 32-bit value (murmur3 finalizer).
function mix(a, b) {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function fromRawState(initial) {
  let a = initial >>> 0;

  // mulberry32
  function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function range(min, max) {
    return min + next() * (max - min);
  }

  function int(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new TypeError('int(min, max) needs integer bounds');
    }
    if (max < min) throw new RangeError('int(min, max) needs min <= max');
    return min + Math.floor(next() * (max - min + 1));
  }

  function chance(p) {
    return next() < p;
  }

  function pick(array) {
    if (!array || array.length === 0) throw new RangeError('pick() needs a non-empty array');
    return array[Math.floor(next() * array.length)];
  }

  // Fisher-Yates on a copy; the input is never modified.
  function shuffle(array) {
    const out = Array.from(array);
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  // A new generator derived from the current state and the label.
  // It does not advance this generator.
  function fork(label = '') {
    return fromRawState(mix(a, hashString(String(label))));
  }

  // The full internal state: a plain unsigned 32-bit number (JSON-safe).
  function state() {
    return a;
  }

  return { next, range, int, chance, pick, shuffle, fork, state };
}

/**
 * Create a deterministic random generator.
 * @param {number|string} seed
 */
export function createRandom(seed) {
  return fromRawState(normalizeSeed(seed));
}

/**
 * Re-create a generator from a value returned by `state()`.
 * It continues exactly where the saved generator was.
 * @param {number} saved
 */
createRandom.fromState = function fromState(saved) {
  if (!Number.isInteger(saved) || saved < 0 || saved > 0xffffffff) {
    throw new TypeError('fromState() needs a value returned by state()');
  }
  return fromRawState(saved);
};

export default createRandom;
