import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cheapestBuy, usualBuy } from './shop-plan.ts';

const foods = [
  { id: 'chicken', name: 'Chicken', atHome: true, homeGrams: 300, pieceGrams: null },
  { id: 'eggs', name: 'Eggs', atHome: false, homeGrams: null, pieceGrams: 50 },
  { id: 'oil', name: 'Olive oil', atHome: true, homeGrams: null, pieceGrams: null },
  { id: 'icecream', name: 'Ice cream', atHome: false, homeGrams: null, pieceGrams: null },
];
// 14 days of history (23 Oct – 5 Nov): 150 g chicken and 2 eggs a day, a splash of oil; ice cream never.
const history = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(2026, 9, 23 + i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}).flatMap((day) => [{ day, foodId: 'chicken', grams: 150 }, { day, foodId: 'eggs', grams: 100 }, { day, foodId: 'oil', grams: 10 }]);

test('recommended: your usual amounts for the days, minus what is at home', () => {
  const r = usualBuy(history, new Map([['chicken', 150]]), foods, '2026-11-06', 5)!;
  assert.equal(r.historyDays, 14);
  // Chicken: today's 150 g already eaten, then 5 × 150 = 750, minus 300 at home = 450 g. Eggs: (1 + 5) × 100 = 600 g = 12 eggs.
  assert.deepEqual(r.buy, [
    { foodId: 'chicken', name: 'Chicken', grams: 450 },
    { foodId: 'eggs', name: 'Eggs', grams: 600 },
  ]);
});

test('recommended needs a week of history', () => {
  assert.equal(usualBuy(history.slice(-15), new Map(), foods, '2026-11-06', 3), null);
  assert.equal(usualBuy([], new Map(), foods, '2026-11-06', 3), null);
});

const priced = [
  { id: 'chicken', name: 'Chicken', protein: 24, carbs: 0, fat: 1, pricePer100: 0.8, maxGrams: 2000 },
  { id: 'steak', name: 'Steak', protein: 25, carbs: 0, fat: 5, pricePer100: 2.5, maxGrams: 2000 },
  { id: 'rice', name: 'Rice', protein: 7, carbs: 78, fat: 1, pricePer100: 0.2, maxGrams: 2000 },
  { id: 'oil', name: 'Oil', protein: 0, carbs: 0, fat: 100, pricePer100: 0.9, maxGrams: 500 },
];

test('cheapest covers every macro at the lowest cost', () => {
  const short = { protein: 200, carbs: 300, fat: 60 };
  const { buy, feasible } = cheapestBuy(short, priced);
  assert.ok(feasible);
  const g = (id: string) => buy.find((b) => b.foodId === id)?.grams ?? 0;
  assert.equal(g('steak'), 0, JSON.stringify(buy)); // same protein as chicken at 3× the price
  const got = (k: 'protein' | 'carbs' | 'fat') => priced.reduce((s, f) => s + (f[k] * g(f.id)) / 100, 0);
  for (const k of ['protein', 'carbs', 'fat'] as const) assert.ok(got(k) >= short[k] - 0.5, `${k}: ${got(k)} ${JSON.stringify(buy)}`);
  // Rice is the cheapest protein here too (35 g per £ vs chicken's 30), so it maxes rice before adding chicken:
  // 2 kg rice (£4) + 250 g chicken (£2) + oil for the rest of the fat ≈ £6.34, cheaper than a plan led by chicken (≈ £6.90).
  const cost = priced.reduce((s, f) => s + (f.pricePer100 * g(f.id)) / 100, 0);
  assert.equal(g('rice'), 2000, JSON.stringify(buy));
  assert.ok(cost < 6.45, `cost £${cost.toFixed(2)} ${JSON.stringify(buy)}`);
});

test('cheapest says when the caps make it impossible', () => {
  const r = cheapestBuy({ protein: 1000, carbs: 0, fat: 0 }, priced.map((f) => ({ ...f, maxGrams: 100 })));
  assert.equal(r.feasible, false);
  assert.deepEqual(cheapestBuy({ protein: 0, carbs: 0, fat: 0 }, priced), { buy: [], feasible: true });
});
