import assert from 'node:assert/strict';
import { test } from 'node:test';

import { epley, formatDuration, shape, volume, warmups } from './gym.ts';

test('Epley 1RM', () => {
  assert.equal(epley(100, 1), 100);
  assert.equal(epley(100, 5), 100 * (1 + 5 / 30));
});

test('volume counts completed working sets only', () => {
  assert.equal(
    volume([
      { weightKg: 60, reps: 10, isWarmup: true, done: true },
      { weightKg: 100, reps: 5, isWarmup: false, done: true },
      { weightKg: 100, reps: 5, isWarmup: false, done: false },
      { weightKg: null, reps: 12, isWarmup: false, done: true },
    ]),
    500,
  );
});

test('warm-ups: 50/70/85% rounded to 2.5 kg, nothing under the bar or at the working weight', () => {
  assert.deepEqual(warmups(100), [{ weightKg: 50, reps: 10 }, { weightKg: 70, reps: 5 }, { weightKg: 85, reps: 3 }]);
  assert.deepEqual(warmups(61), [{ weightKg: 30, reps: 10 }, { weightKg: 42.5, reps: 5 }, { weightKg: 52.5, reps: 3 }]);
  assert.deepEqual(warmups(30), [{ weightKg: 20, reps: 5 }, { weightKg: 25, reps: 3 }]);
  assert.deepEqual(warmups(20), []);
  // Dumbbells (no bar): 6 → 5, 8.4 → 7.5, 10.2 → 10.
  assert.deepEqual(warmups(12, 0), [{ weightKg: 5, reps: 10 }, { weightKg: 7.5, reps: 5 }, { weightKg: 10, reps: 3 }]);
  // Duplicates after rounding are dropped: 1.5, 2.1 and 2.55 all round to 2.5.
  assert.deepEqual(warmups(3, 0), [{ weightKg: 2.5, reps: 10 }]);
});

test('durations', () => {
  assert.equal(formatDuration(42 * 60_000 + 7000), '42:07');
  assert.equal(formatDuration(3_723_000), '1:02:03');
});

test('shape ignores warm-ups and weights', () => {
  const a = [{ exerciseId: 'bench', sets: [{ isWarmup: true }, { isWarmup: false }, { isWarmup: false }] }];
  const b = [{ exerciseId: 'bench', sets: [{ isWarmup: false }, { isWarmup: false }] }];
  assert.equal(shape(a), shape(b));
  assert.notEqual(shape(a), shape([...b, { exerciseId: 'row', sets: [] }]));
});
