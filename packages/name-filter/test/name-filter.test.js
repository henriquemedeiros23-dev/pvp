import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkName, hasBadWord, nameKey, nameParts, fold, BAD_WORD_MESSAGE, NAME_TAKEN_MESSAGE, NAME_RULES, rulesMessage } from '../src/index.js';
import { ANYWHERE, WHOLE, ALLOW, decodeWord as unrot } from '../src/words.js';

// No rude words are written in this file: every bad test name is made in code from the (ROT13) word lists.
const anywhere = ANYWHERE.map(unrot);
const whole = WHOLE.map(unrot);
const all = [...anywhere, ...whole];

// Ways kids try to sneak a word past a filter.
const SPELLINGS = {
  upper: w => w.toUpperCase(),
  title: w => w[0].toUpperCase() + w.slice(1),
  mixed: w => [...w].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join(''),
  repeated: w => [...w].map((c, i) => (i === 1 ? c.repeat(4) : c)).join(''),
  underscores: w => [...w].join('_'),
  dots: w => [...w].join('.'),
  spaces: w => [...w].join(' '),
  dashes: w => [...w].join('-'),
  leet: w => w.replace(/o/g, '0').replace(/e/g, '3').replace(/a/g, '4').replace(/s/g, '5').replace(/t/g, '7'),
  leetI: w => w.replace(/i/g, '1'),
  leetL: w => w.replace(/l/g, '1'),
  symbols: w => w.replace(/a/g, '@').replace(/s/g, '$').replace(/i/g, '!'),
  accents: w => w.replace(/a/g, 'á').replace(/e/g, 'ê').replace(/i/g, 'ï').replace(/o/g, 'ö').replace(/u/g, 'ü').replace(/c/g, 'ç'),
  star: w => w.replace(/[aeiou]/, '*'),
  withNumber: w => `${w}_99`,
  inName: w => `Big_${w}_Kid`,
  camel: w => `Big${w[0].toUpperCase()}${w.slice(1)}Kid`,
  plural: w => `${w}s`,
};

test('the messages are exactly the kid-friendly ones', () => {
  assert.equal(BAD_WORD_MESSAGE, "You can't use that name. Please pick a new name.");
  assert.equal(NAME_TAKEN_MESSAGE, 'Someone already has that name. Please pick a new name.');
  assert.deepEqual(checkName(all[0]), { ok: false, reason: 'bad-word', message: BAD_WORD_MESSAGE });
  assert.equal(rulesMessage(), 'Your name must be 3 to 16 letters, numbers or _');
});

test('the word lists are only lower-case letters, with no doubles', () => {
  for (const list of [ANYWHERE, WHOLE, ALLOW]) {
    for (const w of list) assert.match(w, /^[a-z]+$/);
    assert.equal(new Set(list).size, list.length);
  }
  assert.ok(ANYWHERE.length > 20 && WHOLE.length > 30);
});

test('every list word is caught, in every tricky spelling', () => {
  for (const [how, spell] of Object.entries(SPELLINGS)) {
    for (const [i, w] of all.entries()) {
      assert.equal(hasBadWord(spell(w)), true, `${how} spelling of list word #${i}`);
    }
  }
});

test('words from the "anywhere" list are caught inside longer names too', () => {
  for (const [i, w] of anywhere.entries()) {
    assert.equal(hasBadWord(`xx${w}xx`), true, `#${i} inside`);
    assert.equal(hasBadWord(`The${w}Master`), true, `#${i} glued`);
  }
});

test('normal gamer names pass (no Scunthorpe problem)', () => {
  const good = [
    'Classic', 'Grass', 'Assassin', 'Scunthorpe', 'Shitake', 'Shiitake', 'Bass', 'Passion', 'Class_Clown', 'Glasses',
    'Dickens', 'Peacock', 'Cocktail', 'Hitchcock', 'Titan', 'Titanic', 'Analyst', 'Canal', 'Grape', 'Drape', 'Therapist',
    'Scrap', 'Cucumber', 'Document', 'Sussex', 'Raccoon', 'Spice', 'Hello', 'Shell', 'Hellfire', 'Assist', 'Compass',
    'Cassandra', 'Basement', 'Harass', 'Mississippi', 'Skyscraper', 'Snipe', 'Penguin', 'Pencil', 'Niger', 'Nigeria',
    'Boss_Kid', 'Stick_Kid', 'Player_1234', 'Ace_455', 'Ace455', 'Ninja99', 'xXSniperXx', 'DragonSlayer', 'Pro_Gamer',
    'Shadow_Wolf', 'Blaze', 'Ice_Queen', 'Speedy', 'Bob', 'Bob1', 'Bob2', 'Henrique', 'Joao', 'Pedro_10', 'Lucas',
    'Computador', 'Deputado', 'Reputation', 'Shotgun', 'Mega_Shield', 'Hero_7', 'Stickman', 'Island_King', 'Kung_Fu',
    'Pushit', 'Escape', 'Butterfly', 'Shooter', 'Cockpit_Ace', 'Assets', 'Sexton',
    'HotWater', 'Saltwater', 'Underwater', 'Sushi_Tako', 'Matsushita', 'Shitzu', 'Fukushima', 'Spicy', 'Cocky',
    'Essex', 'Hancock', 'Cockatoo', 'Arsenal', 'Analog', 'Pumpkin', 'Scrappy', 'Grasshopper', 'Ambassador', 'Titanium',
    'Competition', 'Pistol', 'Amsterdam', 'Cumberland', 'Kakashi', 'Sasuke', 'Pikachu', 'Charizard', 'Knuckles',
    'Herobrine', 'Creeper', 'Fortnite', 'Noob_Master', 'Guest_666', 'Switch', 'Glitch', 'Hitman', 'Snapdragon',
    'Unicorn', 'Popcorn', 'Capricorn', 'Raccoon', 'Tycoon', 'Torpedo', 'Speedo', 'Bitcoin', 'Whitehat',
  ];
  for (const n of good) {
    assert.equal(hasBadWord(n), false, n);
    assert.equal(checkName(n).ok, true, n);
  }
});

test('length and characters: same rules as before (3-16 letters, numbers or _)', () => {
  assert.deepEqual(checkName('  Bob_7  '), { ok: true, name: 'Bob_7' });
  assert.equal(checkName('ab').reason, 'too-short');
  assert.equal(checkName('').reason, 'too-short');
  assert.equal(checkName(undefined).reason, 'too-short');
  assert.equal(checkName('a'.repeat(17)).reason, 'too-long');
  assert.equal(checkName('Bob Smith').reason, 'bad-chars');
  assert.equal(checkName('Bób').reason, 'bad-chars');
  assert.equal(checkName('___').reason, 'bad-chars'); // needs a letter or a number
  assert.match(checkName('ab').message, /3 to 16/);
  assert.equal(checkName('a'.repeat(16)).ok, true);
  assert.equal(checkName('abcd', { minLength: 5 }).message, rulesMessage(5, 16));
  assert.equal(NAME_RULES.minLength, 3);
});

test('a bad word wins over the other reasons (the kid sees the right message)', () => {
  assert.equal(checkName(SPELLINGS.dots(all[0])).reason, 'bad-word');
  assert.equal(checkName(`${all[0]}`.repeat(5)).reason, 'bad-word');
});

test('isTaken: a name someone already has (or a look-alike of it) is "taken"', () => {
  const keys = new Set([nameKey('Bob')]);
  const isTaken = k => keys.has(k);
  assert.deepEqual(checkName('B0b', { isTaken }), { ok: false, reason: 'taken', message: NAME_TAKEN_MESSAGE });
  assert.equal(checkName('b_o_b', { isTaken }).reason, 'taken');
  assert.deepEqual(checkName('Bob1', { isTaken }), { ok: true, name: 'Bob1' });
  assert.equal(checkName(all[0], { isTaken: () => true }).reason, 'bad-word'); // a bad word is the first reason
  assert.equal(checkName('ab', { isTaken: () => true }).reason, 'too-short');
});

test('badWords: false only checks the format (old names can still log in)', () => {
  assert.deepEqual(checkName(all[0], { badWords: false }), { ok: true, name: all[0] });
});

test('nameParts and fold', () => {
  assert.equal(fold('Joãozinho Ñ ß'), 'Joaozinho N ss');
  assert.deepEqual(nameParts('xXSniperXx'), ['xx', 'sniper', 'xx']);
  assert.deepEqual(nameParts('Ace_455'), ['ace']);
  assert.deepEqual(nameParts('b.o.b_Kid'), ['bob', 'kid']);
  assert.deepEqual(nameParts('B1ll', 'l'), ['blll']);
});

test('nameKey: look-alike names get the same key, really different names do not', () => {
  const bob = nameKey('Bob');
  for (const n of ['Bob', 'BOB', 'bob', 'B0b', 'b_o_b', 'B.O.B', 'Böb', ' Bob ']) assert.equal(nameKey(n), bob, n);
  assert.notEqual(nameKey('Bob1'), nameKey('Bob2'));
  assert.notEqual(nameKey('Bob1'), bob);
  assert.notEqual(nameKey('Bobby'), bob);
  assert.equal(nameKey('Bill'), nameKey('B1ll'));
  assert.equal(nameKey('Bill'), nameKey('BiII'));
  assert.equal(nameKey('Ace5'), nameKey('Aces'));
  assert.notEqual(nameKey('Player_1234'), nameKey('Player_1235'));
});

test('pure: same input, same answer', () => {
  for (const n of ['Bob', 'Classic', all[3]]) {
    assert.deepEqual(checkName(n), checkName(n));
    assert.equal(nameKey(n), nameKey(n));
  }
});
