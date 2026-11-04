import assert from 'node:assert/strict';
import { test } from 'node:test';

import { costOf } from './price.ts';

test('a meal costs its share of each pack', () => {
  const foods = [
    { id: 'chicken', packGrams: 500, packPrice: 4 }, // £4 for 500 g
    { id: 'rice', packGrams: 1000, packPrice: 2 },
    { id: 'salt', packGrams: 750, packPrice: null },
    { id: 'oil', packGrams: null, packPrice: 3 },
  ];
  const { cost, unpriced } = costOf(
    [{ foodId: 'chicken', grams: 200 }, { foodId: 'rice', grams: 150 }, { foodId: 'salt', grams: 1 }, { foodId: 'oil', grams: 10 }, { foodId: null, grams: 50 }],
    foods,
  );
  assert.ok(Math.abs(cost - 1.9) < 1e-9);
  assert.equal(unpriced, 3);
});
