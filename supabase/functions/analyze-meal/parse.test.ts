import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPrompt, parseGemini, parseRequest, type Request } from './parse.ts';

const req: Request = {
  image: 'abc',
  foods: [{ id: 'uuid-lamb', name: 'Lamb mince' }, { id: 'uuid-egg', name: 'Eggs' }],
  meals: [{ id: 'uuid-bowl', name: 'Lamb bowl', items: [{ name: 'Lamb mince', grams: 500 }, { name: 'Eggs', grams: 200 }] }],
};

test('prompt lists meals with portions and foods with short ids', () => {
  const p = buildPrompt(req);
  assert.match(p, /m1: Lamb bowl = 500 g Lamb mince \+ 200 g Eggs/);
  assert.match(p, /f2: Eggs/);
});

test('known meal → app meal id, grams ignored', () => {
  const text = JSON.stringify({ items: [{ meal_id: 'm1', food_id: null, name: 'bowl', grams: 0 }] });
  assert.deepEqual(parseGemini(text, req), [
    { mealId: 'uuid-bowl', foodId: null, name: 'Lamb bowl', grams: 0, kcal: null, protein: null, carbs: null, fat: null },
  ]);
});

test('known food keeps grams, drops estimated macros; unknown food needs all macros', () => {
  const text = JSON.stringify({
    items: [
      { meal_id: null, food_id: 'f2', name: 'eggs', grams: 120, kcal: 999 },
      { meal_id: null, food_id: null, name: 'Rice', grams: 150, kcal: 195, protein: 4, carbs: 42, fat: 0.4 },
      { meal_id: null, food_id: null, name: 'Sauce', grams: 20, kcal: 40 }, // incomplete → dropped
      { meal_id: null, food_id: 'f9', name: 'Toast', grams: 40, kcal: 100, protein: 3, carbs: 18, fat: 1 }, // bad id → estimate
      { meal_id: null, food_id: 'f1', name: 'lamb', grams: -5 }, // bad grams → dropped
    ],
  });
  assert.deepEqual(parseGemini(text, req), [
    { mealId: null, foodId: 'uuid-egg', name: 'Eggs', grams: 120, kcal: null, protein: null, carbs: null, fat: null },
    { mealId: null, foodId: null, name: 'Rice', grams: 150, kcal: 195, protein: 4, carbs: 42, fat: 0.4 },
    { mealId: null, foodId: null, name: 'Toast', grams: 40, kcal: 100, protein: 3, carbs: 18, fat: 1 },
  ]);
});

test('garbage responses → empty list', () => {
  assert.deepEqual(parseGemini('not json', req), []);
  assert.deepEqual(parseGemini('{"items":5}', req), []);
});

test('request validation', () => {
  assert.equal(parseRequest({}), 'Bad image');
  assert.equal(parseRequest({ image: 'x', foods: [{ id: 1 }], meals: [] }), 'Bad foods');
  assert.equal(parseRequest({ image: 'x', foods: [], meals: [{ id: 'a', name: 'b', items: [{ name: 'c' }] }] }), 'Bad meals');
  assert.deepEqual(parseRequest(req), req);
});
