import assert from 'node:assert/strict';
import { test } from 'node:test';

import { namesMatch } from './match.ts';

test('namesMatch: accepts the same food, rejects look-alikes', () => {
  assert.ok(namesMatch('Tropicana Smooth Orange Juice', 'Tropicana Smooth Orange with no bits'));
  assert.ok(namesMatch('Greek Yoghurt', 'Bon appetit Greek Yogurt'));
  assert.ok(namesMatch('Eggs', 'Organic free range eggs'));
  assert.ok(!namesMatch('Raw Farm Raw Butter', 'Raw cheddar'));
  assert.ok(!namesMatch('Rebel Kitchen Raw Coconut Water', 'Veggie burger'));
  assert.ok(!namesMatch('Honey', 'Miel de montagne'));
});
