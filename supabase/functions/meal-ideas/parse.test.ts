import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPrompt, parseIdeas, parseRequest, type Request } from './parse.ts';

const req: Request = {
  meals: [{ label: 'Breakfast', kcal: 500, protein: 35, carbs: 50, fat: 15 }, { label: 'Dinner', kcal: 700, protein: 50, carbs: 60, fat: 25 }],
  foods: [{ id: 'uuid-yog', name: 'Greek yoghurt' }, { id: 'uuid-oats', name: 'Oats' }, { id: 'uuid-chk', name: 'Chicken breast' }, { id: 'uuid-rice', name: 'Rice' }],
  recent: ['Greek yoghurt + Oats (Breakfast)'],
  perMeal: 2,
};

test('request validation', () => {
  assert.deepEqual(parseRequest(req), req);
  assert.equal(parseRequest({ ...req, meals: [] }), 'Bad meals');
  assert.equal(parseRequest({ ...req, foods: [] }), 'Bad foods');
  assert.equal(parseRequest({ ...req, perMeal: 9 }), 'Bad perMeal');
});

test('prompt lists foods by short id, recent meals and each meal target', () => {
  const p = buildPrompt(req);
  assert.match(p, /f1: Greek yoghurt\nf2: Oats\nf3: Chicken breast\nf4: Rice/);
  assert.match(p, /- Greek yoghurt \+ Oats \(Breakfast\)/);
  assert.match(p, /- Dinner: about 700 kcal, 50 g protein, 60 g carbs, 25 g fat/);
  assert.match(p, /give 2 different ideas/);
});

test('ideas map back to app ids; unknown ids and extra ideas are dropped', () => {
  const text = JSON.stringify({
    meals: [
      { label: 'breakfast', ideas: [{ name: 'Yoghurt oats', foods: ['f1', 'f2', 'f99'] }, { name: 'Oats', foods: ['f2'] }, { name: 'Third', foods: ['f1'] }] },
      { label: 'Dinner', ideas: [{ name: 'Chicken rice', foods: ['f3', 'f4', 'f3'] }, { name: '', foods: ['f3'] }] },
      { label: 'Elevenses', ideas: [{ name: 'x', foods: ['f1'] }] },
    ],
  });
  assert.deepEqual(parseIdeas(text, req), {
    Breakfast: [{ name: 'Yoghurt oats', foodIds: ['uuid-yog', 'uuid-oats'] }, { name: 'Oats', foodIds: ['uuid-oats'] }],
    Dinner: [{ name: 'Chicken rice', foodIds: ['uuid-chk', 'uuid-rice'] }],
  });
  assert.deepEqual(parseIdeas('nope', req), { Breakfast: [], Dinner: [] });
});
