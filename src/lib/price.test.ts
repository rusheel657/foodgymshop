import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cheapestSources, costOf, packsFor, spendSummary } from './price.ts';

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

test('whole packs to buy', () => {
  assert.equal(packsFor(850, 500), 2);
  assert.equal(packsFor(500, 500), 1);
  assert.equal(packsFor(505, 500), 1); // within 2% of a pack
  assert.equal(packsFor(520, 500), 2);
  assert.equal(packsFor(40, 500), 1);
});

test('cheapest sources: cost of 100 g of a macro, cheapest first', () => {
  const foods = [
    { id: 'oats', packGrams: 1000, packPrice: 1.5, protein: 11, carbs: 60, fat: 7 }, // £0.15 per 100 g → £0.25 per 100 g carbs
    { id: 'oj', packGrams: 1000, packPrice: 2, protein: 0.7, carbs: 10, fat: 0 }, // £2.00 per 100 g carbs
    { id: 'bread', packGrams: 800, packPrice: 3.2, protein: 9, carbs: 50, fat: 1 }, // £0.40 per 100 g → £0.80
    { id: 'unpriced', packGrams: null, packPrice: null, protein: 0, carbs: 80, fat: 0 },
  ];
  const r = cheapestSources(foods, 'carbs');
  assert.deepEqual(r.map((x) => x.food.id), ['oats', 'bread', 'oj']);
  assert.ok(Math.abs(r[0].per100 - 0.25) < 1e-9 && Math.abs(r[1].per100 - 0.8) < 1e-9 && Math.abs(r[2].per100 - 2) < 1e-9);
  assert.deepEqual(cheapestSources(foods, 'fat').map((x) => x.food.id), ['oats']); // under 2 g fat per 100 g left out
});
