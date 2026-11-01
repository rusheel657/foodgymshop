import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPrompt, parseGemini, parseRequest, type Request } from './parse.ts';

const req: Request = {
  kind: 'meal',
  image: 'abc',
  foods: [{ id: 'uuid-lamb', name: 'Lamb mince', usualGrams: 250 }, { id: 'uuid-egg', name: 'Eggs' }],
  meals: [{ id: 'uuid-bowl', name: 'Lamb bowl', items: [{ name: 'Lamb mince', grams: 500 }, { name: 'Eggs', grams: 200 }] }],
  notes: ['"Rice": you estimated 150 g, it was actually 220 g.'],
  rules: ['Chicken and eggs are always cooked in "Butter".'],
};

test('prompt lists meals with portions and foods with short ids', () => {
  const p = buildPrompt(req);
  assert.match(p, /m1: Lamb bowl = 500 g Lamb mince \+ 200 g Eggs/);
  assert.match(p, /f1: Lamb mince \(usually 250 g\)\nf2: Eggs\n/);
  assert.match(p, /Learn from these mistakes:\n- "Rice": you estimated 150 g, it was actually 220 g\./);
  assert.match(p, /always apply, even when it isn't visible\):\n- Chicken and eggs are always cooked in "Butter"\./);
  assert.doesNotMatch(buildPrompt({ ...req, notes: [], rules: [] }), /mistakes|always apply/);
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
  assert.equal(parseRequest({ ...req, notes: [5] }), 'Bad notes');
  assert.deepEqual(parseRequest(req), req);
  assert.equal(parseRequest({ ...req, rules: 'x' }), 'Bad rules');
  assert.deepEqual(parseRequest({ ...req, notes: undefined, rules: undefined }), { ...req, notes: [], rules: [] }); // older app versions
});

test('groceries: own prompt, no meals, whole amounts up to 20 kg', () => {
  const g: Request = { ...req, kind: 'groceries' };
  assert.equal((parseRequest({ ...req, kind: 'groceries' }) as Request).kind, 'groceries');
  assert.equal((parseRequest({ ...req, kind: 'other' }) as Request).kind, 'meal');
  const p = buildPrompt(g);
  assert.match(p, /groceries/);
  assert.match(p, /f1: Lamb mince/);
  assert.doesNotMatch(p, /MEALS/);
  const text = JSON.stringify({
    items: [
      { meal_id: 'm1', food_id: 'f1', name: 'lamb', grams: 1500 }, // meal ids are ignored for groceries
      { meal_id: null, food_id: null, name: 'Oats', grams: 30000, kcal: 3800, protein: 130, carbs: 600, fat: 70 },
    ],
  });
  assert.deepEqual(parseGemini(text, g), [
    { mealId: null, foodId: 'uuid-lamb', name: 'Lamb mince', grams: 1500, kcal: null, protein: null, carbs: null, fat: null },
    { mealId: null, foodId: null, name: 'Oats', grams: 20000, kcal: 3800, protein: 130, carbs: 600, fat: 70 },
  ]);
});
