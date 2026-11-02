import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayBurn, plannedSteps, stepKcal, workoutKcal, workoutMet } from './burn.ts';

test('10,000 steps at 80 kg, 180 cm ≈ 300 kcal', () => {
  assert.equal(Math.round(stepKcal(10_000, 80, 180)), 299);
  assert.equal(stepKcal(0, 80, 180), 0);
});

test('workout intensity follows volume per minute per kg', () => {
  assert.equal(workoutMet(60, 0, 80), 3.5); // bodyweight / nothing logged → light
  assert.equal(Math.round(workoutMet(60, 10_000, 80) * 100) / 100, 5.08);
  assert.equal(workoutMet(60, 40_000, 80), 6); // capped
  assert.equal(Math.round(workoutKcal(60, 10_000, 80)), 327);
  assert.equal(Math.round(workoutKcal(600, 10_000, 80)), Math.round(workoutKcal(180, 10_000, 80))); // forgotten-to-finish cap
});

test('day burn adds base, steps and workouts', () => {
  const b = dayBurn({ bmr: 1800, weightKg: 80, heightCm: 180, steps: 10_000, workouts: [{ minutes: 60, volumeKg: 10_000 }] });
  assert.deepEqual(b, { base: 2160, steps: 10_000, stepKcal: 299, workoutKcal: 327, workoutMinutes: 60, total: 2785 });
});

test('today plans with the recent average until you pass it', () => {
  assert.deepEqual(plannedSteps(2000, [8000, 10_000]), { steps: 9000, projected: true });
  assert.deepEqual(plannedSteps(12_000, [8000, 10_000]), { steps: 12_000, projected: false });
  assert.deepEqual(plannedSteps(undefined, []), { steps: 0, projected: false });
});
