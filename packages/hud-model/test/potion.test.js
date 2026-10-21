import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '@pvp/game-rules';
import { potionView, drinkState, drinkMessage, POTION_ICON_SVG } from '../src/index.js';

test('potion button: count (max 3), empty / full, can drink only when hurt', () => {
  assert.deepEqual(
    { ...potionView({ potions: 2, hp: 40 }) },
    {
      count: 2, max: 3, label: '2', empty: false, full: false, canDrink: true,
      drinking: false, progress: 0, percent: 0, secondsLeft: 0, text: '',
      title: 'Healing Potion (Q): full H.P in 5 s · 2/3', key: 'Q',
    },
  );
  assert.equal(potionView({ potions: 0, hp: 40 }).empty, true);
  assert.equal(potionView({ potions: 0, hp: 40 }).canDrink, false);
  assert.equal(potionView({ potions: 3, hp: 40 }).full, true);
  assert.equal(potionView({ potions: 9 }).count, 3, 'never shows more than MAX_POTIONS');
  assert.equal(potionView({ potions: 2, hp: 100 }).canDrink, false, 'full health: nothing to heal');
  assert.equal(potionView({ potions: 2, hp: 100 }, { hp: 30 }).canDrink, true, 'opts.hp wins over inv.hp');
  assert.equal(potionView(null).count, 0);
  assert.equal(potionView({ potions: 'x' }).count, 0);
  assert.equal(potionView({ potions: 1 }, { key: 'tap' }).title.includes('(tap)'), true);
});

test('drinking: the ring fills up over 5 s; seconds left round up', () => {
  const drink = drinkState(null, { t: 'drink', state: 'start', ms: RULES.POTION.drinkMs, hp: 30 }, 1000);
  assert.deepEqual(drink, { startedAt: 1000, ms: 5000 });
  const at = now => potionView({ potions: 1, hp: 30 }, { drink, now });
  assert.equal(at(1000).progress, 0);
  assert.equal(at(1000).secondsLeft, 5);
  assert.equal(at(1000).text, 'Drinking… 5.0 s');
  assert.equal(at(1000).canDrink, false, 'already drinking');
  assert.equal(at(3500).progress, 0.5);
  assert.equal(at(3500).percent, 50);
  assert.equal(at(3501).secondsLeft, 2.5);
  assert.equal(at(5960).secondsLeft, 0.1);
  assert.equal(at(6000).progress, 1);
  assert.equal(at(9000).progress, 1, 'never more than full');
  assert.equal(at(0).progress, 0, 'never below 0');
});

test('drinkState follows the server: done and cancel end it, other messages keep it', () => {
  const d = drinkState(null, { t: 'drink', state: 'start', ms: 5000 }, 10);
  assert.equal(drinkState(d, { t: 'inv', potions: 1 }, 20), d);
  assert.equal(drinkState(d, { t: 'drink', state: 'done', ms: 0 }, 30), null);
  assert.equal(drinkState(d, { t: 'drink', state: 'cancel', ms: 0 }, 30), null);
  assert.equal(drinkState(undefined, null, 0), null);
  assert.equal(drinkState(null, { t: 'drink', state: 'start', ms: 0 }, 5), null);
  assert.equal(drinkMessage({ t: 'drink', state: 'done' }), 'Full H.P!');
  assert.equal(drinkMessage({ t: 'drink', state: 'cancel' }), 'Potion wasted!');
  assert.equal(drinkMessage({ t: 'drink', state: 'start' }), '');
});

test('the potion icon is the flask from the drawing: cork, neck, cone and red liquid', () => {
  assert.match(POTION_ICON_SVG, /^<svg /);
  assert.match(POTION_ICON_SVG, /#e3262f/, 'red liquid');
  assert.match(POTION_ICON_SVG, /cork/);
  assert.ok(!/<script/i.test(POTION_ICON_SVG));
});
