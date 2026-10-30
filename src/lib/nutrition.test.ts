import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatMacros, fromOffSearch, fromOpenFoodFacts, macrosFor, sumMacros, toLogItems } from './nutrition.ts';

test('macrosFor scales per-100 g values', () => {
  assert.deepEqual(macrosFor({ kcal: 282, protein: 16.6, carbs: 0, fat: 23.4 }, 500), {
    kcal: 1410, protein: 83, carbs: 0, fat: 117,
  });
});

test('meal total: 500 g lamb + 4 eggs (200 g)', () => {
  const total = sumMacros([
    macrosFor({ kcal: 282, protein: 16.6, carbs: 0, fat: 23.4 }, 500),
    macrosFor({ kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 }, 200),
  ]);
  assert.equal(formatMacros(total), '1696 kcal · P 108 · C 1 · F 136');
});

test('Open Food Facts product', () => {
  const json = {
    status: 1,
    product: {
      product_name: 'Greek yogurt',
      brands: 'Fage, Total',
      nutriments: { 'energy-kcal_100g': 97, proteins_100g: 9, carbohydrates_100g: 3.9, fat_100g: 5 },
    },
  };
  assert.deepEqual(fromOpenFoodFacts('123', json), {
    name: 'Greek yogurt (Fage)', kcal: 97, protein: 9, carbs: 3.9, fat: 5, barcode: '123',
  });
});

test('Open Food Facts kJ-only product converts to kcal', () => {
  const json = { status: 1, product: { product_name: 'Oats', nutriments: { energy_100g: 1555, proteins_100g: 13, carbohydrates_100g: 60, fat_100g: 7 } } };
  assert.equal(fromOpenFoodFacts('1', json)?.kcal, 372);
});

test('Open Food Facts unknown or incomplete product', () => {
  assert.equal(fromOpenFoodFacts('1', { status: 0 }), null);
  assert.equal(fromOpenFoodFacts('1', { status: 1, product: { nutriments: { proteins_100g: 1 } } }), null);
});

test('Open Food Facts search hits (trimmed real response for "lamb mince 20% sainsburys")', () => {
  const json = {
    hits: [
      { code: '01621372', product_name: '20% Fat Lamb Mince', brands: ["Sainsbury's"],
        nutriments: { 'energy-kcal_100g': 269, proteins_100g: 17.6, carbohydrates_100g: 0, fat_100g: 20 } },
      { code: '6281051000315', product_name: 'Minced Lamb', brands: ['Habra'], nutriments: {} },
      { product_name: 'No code', nutriments: { 'energy-kcal_100g': 1, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 } },
    ],
  };
  assert.deepEqual(fromOffSearch(json), [
    { name: "20% Fat Lamb Mince (Sainsbury's)", kcal: 269, protein: 17.6, carbs: 0, fat: 20, barcode: '01621372' },
  ]);
  assert.deepEqual(fromOffSearch({}), []);
});

test('AI items → log rows: meal expands to stored portions, unknown dish is unverified', () => {
  const foods = [
    { id: 'lamb', name: 'Lamb', kcal: 269, protein: 21.5, carbs: 0.5, fat: 20 },
    { id: 'egg', name: 'Eggs', kcal: 143, protein: 14.1, carbs: 0.5, fat: 9.6 },
  ];
  const meals = [{ id: 'bowl', items: [{ foodId: 'lamb', grams: 500 }, { foodId: 'egg', grams: 200 }, { foodId: 'gone', grams: 9 }] }];
  const none = { kcal: null, protein: null, carbs: null, fat: null };
  const rows = toLogItems(
    [
      { mealId: 'bowl', foodId: null, name: 'Lamb bowl', grams: 0, ...none },
      { mealId: null, foodId: 'egg', name: 'Eggs', grams: 50, ...none },
      { mealId: null, foodId: null, name: 'Rice', grams: 200, kcal: 260, protein: 5, carbs: 56, fat: 0.6 },
      { mealId: null, foodId: 'missing', name: 'Ghost', grams: 50, ...none },
    ],
    foods,
    meals,
  );
  assert.deepEqual(rows.map((r) => [r.name, r.grams, r.verified]), [
    ['Lamb', 500, true], ['Eggs', 200, true], ['Eggs', 50, true], ['Rice', 200, false],
  ]);
  assert.deepEqual(rows[3].per100, { kcal: 130, protein: 2.5, carbs: 28, fat: 0.3 });
  assert.equal(formatMacros(sumMacros(rows.slice(0, 2).map((r) => macrosFor(r.per100, r.grams)))), '1631 kcal · P 136 · C 4 · F 119');
});
