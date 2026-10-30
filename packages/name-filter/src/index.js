// @pvp/name-filter: is this player name OK? (length, letters, and no swear words or slurs, issue #41)
// Plus nameKey(): a "look-alike" key so "B0b", "b_o_b" and "BOB" count as the same name as "Bob".
// Pure functions, no dependencies, no randomness, no clock: works in Node and the browser.
import { ANYWHERE, WHOLE, ALLOW, decodeWord as unrot } from './words.js';

export const BAD_WORD_MESSAGE = "You can't use that name. Please pick a new name.";
export const NAME_TAKEN_MESSAGE = 'Someone already has that name. Please pick a new name.';
const MESSAGES = { 'bad-word': BAD_WORD_MESSAGE, taken: NAME_TAKEN_MESSAGE };
export const NAME_RULES = Object.freeze({ minLength: 3, maxLength: 16, pattern: /^[A-Za-z0-9_]+$/ });
export const rulesMessage = (min = NAME_RULES.minLength, max = NAME_RULES.maxLength) =>
  `Your name must be ${min} to ${max} letters, numbers or _`;

// l33t letters. '1' is "i" or "l": both are tried (see VARIANTS). '*' stays: it stands for any vowel (f*ck).
const LEET = { 0: 'o', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '|': 'l', '+': 't' };
const VARIANTS = ['i', 'l'];
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const SPECIAL = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', Æ: 'AE', Œ: 'OE', Ø: 'O', Đ: 'D', Ł: 'L' };

/** Accents off (é -> e, ç -> c, ß -> ss); upper/lower case is kept. */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ßæœøđłÆŒØĐŁ]/g, c => SPECIAL[c]);
}

// "fuuuck" -> /f+[u*]{1,}c+k+/: every letter may repeat, a vowel may be a '*'.
function wordPattern(word) {
  let out = '';
  for (const run of word.match(/(.)\1*/g)) {
    const c = run[0];
    out += `${VOWELS.has(c) ? `[${c}*]` : c}{${run.length},}`;
  }
  return out;
}

const ANYWHERE_RE = ANYWHERE.map(w => new RegExp(wordPattern(unrot(w))));
const WHOLE_RE = WHOLE.map(w => new RegExp(`^${wordPattern(unrot(w))}(?:s|es|y|ies|ed|ing|er|ers|z)?$`));
const ALLOW_SET = new Set(ALLOW);

/**
 * The parts of a name, folded to lower-case letters: split at anything that is not a letter or l33t symbol
 * ("_", ".", spaces), at CamelCase and at plain numbers ("Ace_455" keeps "455" out, "a55" becomes "ass").
 * Single letters in a row are glued back together ("a.s.s" -> "ass"). `one` is what '1' becomes.
 * { camel: false } does not split at CamelCase (for names wRiTtEn LiKe ThIs).
 */
export function nameParts(text, one = 'i', { camel = true } = {}) {
  let s = fold(text);
  if (camel) s = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  s = s.toLowerCase();
  const parts = [];
  const letters = /[a-z]/.test(s); // a name of only numbers is read as l33t
  for (const raw of s.split(/[^a-z0-9@$!|+*]+/)) {
    if (!raw || (letters && /^[0-9]+$/.test(raw) && raw.length > 1)) continue; // "Ace_455": 455 is just a number
    let mapped = '';
    for (const c of raw) {
      if (c >= 'a' && c <= 'z') mapped += c;
      else if (c === '1') mapped += one;
      else if (c === '*') mapped += '*';
      else mapped += LEET[c] ?? ' '; // 2, 6, 8, 9: a break
    }
    parts.push(...mapped.split(' ').filter(Boolean));
  }
  // glue single letters in a row: "f", "u", "c", "k" -> "fuck"
  const out = [];
  let single = '';
  for (const p of parts) {
    if (p.length === 1) { single += p; continue; }
    if (single) { out.push(single); single = ''; }
    out.push(p);
  }
  if (single) out.push(single);
  return out;
}

/** True if the text has a swear word or slur in it (tricky spellings too). */
export function hasBadWord(text) {
  for (const [one, camel] of [[VARIANTS[0], true], [VARIANTS[0], false], [VARIANTS[1], true], [VARIANTS[1], false]]) {
    const parts = nameParts(text, one, { camel });
    for (const p of parts) {
      if (!ALLOW_SET.has(p) && WHOLE_RE.some(re => re.test(p))) return true;
    }
    // everything glued together, with the allowed normal words ("Scunthorpe") taken out
    let joined = parts.join('');
    for (const ok of ALLOW) joined = joined.split(ok).join('-');
    if (ANYWHERE_RE.some(re => re.test(joined))) return true;
  }
  return false;
}

/**
 * Check a new player name.
 * Returns { ok: true, name } (the name trimmed) or { ok: false, reason, message } where reason is
 * 'bad-word' | 'too-short' | 'too-long' | 'bad-chars' | 'taken' and message is kid-friendly.
 * opts: minLength (3), maxLength (16), pattern (letters, numbers, _), badWords (true; false = only the format),
 * isTaken (optional `key => boolean`, called with nameKey(name) of a name that passed everything else).
 */
export function checkName(name, opts = {}) {
  const { minLength, maxLength, pattern } = { ...NAME_RULES, ...opts };
  const badWords = opts.badWords !== false;
  const s = String(name ?? '').trim();
  const no = reason => ({ ok: false, reason, message: MESSAGES[reason] ?? rulesMessage(minLength, maxLength) });
  if (badWords && hasBadWord(s)) return no('bad-word');
  if (s.length < minLength) return no('too-short');
  if (s.length > maxLength) return no('too-long');
  if (!pattern.test(s) || !/[A-Za-z0-9]/.test(s)) return no('bad-chars');
  if (typeof opts.isTaken === 'function' && opts.isTaken(nameKey(s))) return no('taken');
  return { ok: true, name: s };
}

// For look-alike names: i, l, 1, |, ! are one letter; 0 = o, 3 = e, 4 = a, 5 = s, 7 = t, @ = a, $ = s.
const SAME = { i: 'l', 1: 'l', '|': 'l', '!': 'l', 0: 'o', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

/**
 * A key for "is this the same name?": "Bob", "BOB", "B0b", "b_o_b" and "Böb" all give "bob".
 * Case, accents, symbols and l33t look-alikes are folded; other numbers stay, so "Bob1" and "Bob2" differ.
 */
export function nameKey(name) {
  let out = '';
  for (const c of fold(name).toLowerCase()) {
    if (Object.hasOwn(SAME, c)) out += SAME[c];
    else if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) out += c;
  }
  return out;
}
