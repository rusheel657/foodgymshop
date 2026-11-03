import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pairLinks } from './pairs.ts';

test('pairLinks: links go both ways and skip deleted foods', () => {
  const foods = [
    { id: 'yog', pairsWith: ['honey', 'fruit', 'gone'] },
    { id: 'honey', pairsWith: [] },
    { id: 'fruit', pairsWith: [] },
    { id: 'oats', pairsWith: ['honey'] },
  ];
  const l = pairLinks(foods);
  assert.deepEqual(l.needs('yog').map((f) => f.id), ['honey', 'fruit']);
  assert.deepEqual(l.neededBy('honey').map((f) => f.id), ['yog', 'oats']);
  assert.deepEqual(l.neededBy('yog'), []);
});
