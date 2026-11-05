import assert from 'node:assert/strict';
import { test } from 'node:test';

import { costOf, spendSummary } from './price.ts';

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

test('spending adds up per day and per food, most expensive food first', () => {
  const foods = [
    { id: 'chicken', name: 'Chicken', packGrams: 500, packPrice: 4 },
    { id: 'rice', name: 'Rice', packGrams: 1000, packPrice: 2 },
  ];
  const s = spendSummary(
    [
      { day: '2026-11-01', foodId: 'rice', name: 'Rice', grams: 500 },
      { day: '2026-11-01', foodId: 'chicken', name: 'Chicken', grams: 250 },
      { day: '2026-11-02', foodId: 'rice', name: 'Rice', grams: 250 },
      { day: '2026-11-02', foodId: null, name: 'Crisps', grams: 30 },
    ],
    foods,
  );
  assert.equal(s.total, 3.5);
  assert.equal(s.unpriced, 1);
  assert.deepEqual([...s.byDay], [['2026-11-01', 3], ['2026-11-02', 0.5]]);
  assert.deepEqual(s.byFood, [{ name: 'Chicken', cost: 2, grams: 250 }, { name: 'Rice', cost: 1.5, grams: 750 }]);
});
