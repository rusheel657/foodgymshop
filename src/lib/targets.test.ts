import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ageOn, computeTargets, type TargetInput } from './targets.ts';

const base: TargetInput = {
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activity: 1.55,
  goal: 'lose',
  rateKgWeek: 0.5,
  proteinGPerLb: 1,
  carbRatio: 0.6,
  calorieOverride: null,
};

test('cut: BMR 1780 × 1.55 = 2759, minus 550/day for 0.5 kg/week', () => {
  assert.deepEqual(computeTargets(base), { maintenance: 2759, kcal: 2209, protein: 176, carbs: 226, fat: 67 });
});

test('gain adds the surplus, maintain adds nothing', () => {
  assert.equal(computeTargets({ ...base, goal: 'gain' }).kcal, 3309);
  assert.equal(computeTargets({ ...base, goal: 'maintain' }).kcal, 2759);
});

test('female uses −161: BMR 1614 × 1.55 = 2501.7', () => {
  assert.equal(computeTargets({ ...base, sex: 'female', goal: 'maintain' }).maintenance, 2502);
});

test('manual override wins and macros split what is left after protein', () => {
  const t = computeTargets({ ...base, calorieOverride: 2500, carbRatio: 0.5 });
  assert.equal(t.kcal, 2500);
  assert.equal(t.protein * 4 + t.carbs * 4 + t.fat * 9 - 2500 <= 9, true);
});

test('protein above calories never produces negative carbs/fat', () => {
  const t = computeTargets({ ...base, calorieOverride: 500 });
  assert.equal(t.carbs, 0);
  assert.equal(t.fat, 0);
});

test('age counts birthdays', () => {
  assert.equal(ageOn('1996-10-28', new Date(2026, 9, 28)), 30);
  assert.equal(ageOn('1996-10-29', new Date(2026, 9, 28)), 29);
});
