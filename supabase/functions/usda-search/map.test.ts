import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapUsdaFoods } from './map.ts';

// Trimmed from a real /fdc/v1/foods/search response for "lamb".
const sample = {
  foods: [
    { fdcId: 2628046, description: 'LAMB', brandName: 'SWIFT', foodNutrients: [
      { nutrientNumber: '203', value: 17 }, { nutrientNumber: '204', value: 20.5 },
      { nutrientNumber: '205', value: 0 }, { nutrientNumber: '208', value: 259 }] },
    { fdcId: 2727570, description: 'Lamb, ground, raw', foodNutrients: [
      { nutrientNumber: '204', value: 18.6 }, { nutrientNumber: '203', value: 17.5 },
      { nutrientNumber: '205', value: -0.251 }, { nutrientNumber: '957', value: 237 }, { nutrientNumber: '958', value: 242 }] },
    { fdcId: 1, description: 'No nutrients', foodNutrients: [] },
  ],
};

test('maps branded and foundation foods per 100 g', () => {
  assert.deepEqual(mapUsdaFoods(sample), [
    { id: '2628046', name: 'LAMB (SWIFT)', kcal: 259, protein: 17, carbs: 0, fat: 20.5 },
    { id: '2727570', name: 'Lamb, ground, raw', kcal: 242, protein: 17.5, carbs: 0, fat: 18.6 },
  ]);
});

test('empty response', () => {
  assert.deepEqual(mapUsdaFoods({}), []);
});
