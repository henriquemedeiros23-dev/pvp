# @pvp/name-filter

## What it does

Checks a player name: 3 to 16 letters, numbers or `_`, and **no swear words or slurs** (issue #41). It also gives a
"look-alike" key so two players can't have names that only look different (`Bob`, `B0b`, `b_o_b`, `BOB`).
Pure functions with no dependencies: the server decides, and the browser can check early with the same code.

## How to use

```js
import { checkName, nameKey, hasBadWord, NAME_TAKEN_MESSAGE } from '@pvp/name-filter';

checkName('  Stick_Kid ');  // { ok: true, name: 'Stick_Kid' } (trimmed)
checkName('ab');            // { ok: false, reason: 'too-short', message: 'Your name must be 3 to 16 letters, numbers or _' }
checkName('<rude name>');   // { ok: false, reason: 'bad-word', message: "You can't use that name. Please pick a new name." }
// reason: 'bad-word' | 'too-short' | 'too-long' | 'bad-chars' | 'taken'. A bad word is checked first, so a rude
// name with dots or spaces gets the bad-word message.
checkName('B0b', { isTaken: key => keys.has(key) });
// { ok: false, reason: 'taken', message: 'Someone already has that name. Please pick a new name.' }
// isTaken gets nameKey(name); the server keeps a Set/Map of the keys of every name (fast).
checkName(name, { badWords: false });           // only the format (used for log in: old names keep working)
checkName(name, { minLength: 4, maxLength: 12 }); // other limits; also `pattern`

hasBadWord('Classic');      // false: normal words that contain a rude piece are fine
nameKey('B0b') === nameKey('Bob');  // true: same name for "someone already has that name"
nameKey('Bob1') === nameKey('Bob2'); // false
```

What it catches, in every spelling a kid might try:

- **Categories of words:** English swear words, rude body words, slurs and hate words, and a few common Portuguese
  swear words. The lists live in [`src/words.js`](src/words.js), written in ROT13 so they don't read as plain words.
- **Tricky spellings:** upper/lower case, accents (é, ç, ü...), l33t (`0`=o, `1`=i or l, `3`=e, `4`=a, `5`=s, `7`=t,
  `@`=a, `$`=s, `!`=i, `+`=t), `*` for a vowel, dots/spaces/`_`/`-` between letters, repeated letters, plurals and
  endings (s, es, y, ed, ing, er), CamelCase and numbers around the word.

How it avoids false alarms (the "Scunthorpe problem"):

- Two lists: `ANYWHERE` words are found even inside a longer name (only words that hide in no normal word),
  `WHOLE` words only count as a whole part of the name (split at `_`, spaces, numbers and CamelCase), so
  "Classic", "Grass", "Assassin", "Peacock", "Titan", "Spicy" and "Therapist" are fine.
- An `ALLOW` list of normal words that contain a list word (a town name, a mushroom, "water"...) is taken out first.
- A plain number next to letters (`Ace_455`) is a number, not l33t.
- The tests check a long list of normal gamer names that must pass.

`nameKey(name)`: lower-case, accents off, symbols and `_` dropped, and look-alikes folded (`i`, `l`, `1`, `|`, `!` are one
letter; `0`=o, `3`=e, `4`=a, `5`=s, `7`=t, `@`=a, `$`=s). Other numbers stay, so `Bob1` and `Bob2` are different names.

Other exports: `BAD_WORD_MESSAGE`, `NAME_TAKEN_MESSAGE`, `NAME_RULES`, `rulesMessage(min, max)`, `nameParts(text)`, `fold(text)`.

## Determinism

Fully deterministic: pure functions of the name and the fixed word lists. No randomness, no clock, no I/O.
