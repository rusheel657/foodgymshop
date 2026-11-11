import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPrompt, parseRecipe, parseRequest } from './parse.ts';

test('request: 1–15 named items with sensible grams', () => {
  assert.deepEqual(parseRequest({ items: [{ name: ' Chicken ', grams: 200.4 }] }), { items: [{ name: 'Chicken', grams: 200 }] });
  assert.equal(parseRequest({ items: [] }), 'Bad items');
  assert.equal(parseRequest({ items: [{ name: 'Rice', grams: -5 }] }), 'Bad items');
  assert.equal(parseRequest(null), 'Bad items');
});

test('prompt lists the exact amounts and forbids other ingredients', () => {
  const p = buildPrompt({ items: [{ name: 'Chicken', grams: 200 }, { name: 'Rice', grams: 80 }] });
  assert.match(p, /- 200 g Chicken\n- 80 g Rice/);
  assert.match(p, /nothing else except salt/);
});

test('recipe: needs a name and steps', () => {
  assert.deepEqual(parseRecipe('{"name":"Chicken rice bowl","steps":["Cook the rice.","  ","Fry the chicken."]}'), {
    name: 'Chicken rice bowl', steps: ['Cook the rice.', 'Fry the chicken.'],
  });
  assert.equal(parseRecipe('{"name":"x","steps":[]}'), null);
  assert.equal(parseRecipe('not json'), null);
});
