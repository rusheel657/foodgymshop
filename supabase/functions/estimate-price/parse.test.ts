import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildPrompt, parseEstimate, parseRequest } from './parse.ts';

test('request: name required, pack size optional and bounded', () => {
  assert.deepEqual(parseRequest({ name: ' Greek yoghurt ', packGrams: 500 }), { name: 'Greek yoghurt', packGrams: 500 });
  assert.deepEqual(parseRequest({ name: 'Eggs' }), { name: 'Eggs', packGrams: null });
  assert.equal(parseRequest({ name: '' }), 'Bad name');
  assert.equal(parseRequest({ name: 'Eggs', packGrams: -1 }), 'Bad pack size');
});

test('prompt asks for the pack size the user buys', () => {
  assert.match(buildPrompt({ name: 'Rice', packGrams: 1000 }), /"Rice".*\n.*about 1000 g/);
  assert.match(buildPrompt({ name: 'Rice', packGrams: null }), /most common pack size/);
});

test('estimate: JSON inside prose, rounded; none or implausible → null', () => {
  assert.deepEqual(parseEstimate('Here it is:\n```json\n{"price": 1.249, "pack_grams": 500, "store": "Tesco"}\n```'), {
    price: 1.25, packGrams: 500, store: 'Tesco',
  });
  assert.deepEqual(parseEstimate('{"price": 2, "pack_grams": "big", "store": ""}'), { price: 2, packGrams: null, store: null });
  assert.equal(parseEstimate('{"price": null}'), null);
  assert.equal(parseEstimate('{"price": 900}'), null);
  assert.equal(parseEstimate('no idea'), null);
});
