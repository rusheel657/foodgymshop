import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatMacros, fromOpenFoodFacts, macrosFor, sumMacros } from './nutrition.ts';

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
