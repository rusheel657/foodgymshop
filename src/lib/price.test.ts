import assert from 'node:assert/strict';
import { test } from 'node:test';

import { costOf, shownPrice, toPrice100 } from './price.ts';

test('prices round-trip per kg and per piece', () => {
  assert.equal(toPrice100(8, null), 0.8); // £8/kg chicken
  assert.equal(shownPrice(0.8, null), 8);
  assert.equal(shownPrice(toPrice100(0.3, 50), 50), 0.3); // 30p an egg
});

test('a meal costs the sum of its priced items', () => {
  const foods = [{ id: 'chicken', price100: 0.8 }, { id: 'rice', price100: 0.2 }, { id: 'salt', price100: null }];
  const { cost, unpriced } = costOf(
    [{ foodId: 'chicken', grams: 200 }, { foodId: 'rice', grams: 150 }, { foodId: 'salt', grams: 1 }, { foodId: null, grams: 50 }],
    foods,
  );
  assert.ok(Math.abs(cost - 1.9) < 1e-9);
  assert.equal(unpriced, 2);
});
