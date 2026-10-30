import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDays, dayStatus, monthGrid, monthStats, streak, weekOf } from './history.ts';

test('month grid starts on Monday and pads both ends', () => {
  const oct = monthGrid(2026, 9); // October 2026 starts on a Thursday
  assert.deepEqual(oct[0], [null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.deepEqual(oct.at(-1), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null]);
  assert.equal(oct.flat().filter(Boolean).length, 31);
  const feb = monthGrid(2027, 1); // February 2027 starts on a Monday, 28 days → exactly 4 weeks
  assert.equal(feb.length, 4);
  assert.equal(feb[0][0], '2027-02-01');
});

test('day status uses ±10% of target', () => {
  assert.equal(dayStatus(2000, 2000), 'on');
  assert.equal(dayStatus(1799, 2000), 'under');
  assert.equal(dayStatus(2201, 2000), 'over');
});

test('month stats average logged days only', () => {
  const target = { kcal: 2000, protein: 150, carbs: 200, fat: 70 };
  const days = new Map([
    ['2026-10-01', { kcal: 2000, protein: 150, carbs: 200, fat: 70 }],
    ['2026-10-02', { kcal: 1000, protein: 50, carbs: 100, fat: 30 }],
    ['2026-10-03', { kcal: 0, protein: 0, carbs: 0, fat: 0 }],
  ]);
  assert.deepEqual(monthStats(days, target), {
    logged: 2, avg: { kcal: 1500, protein: 100, carbs: 150, fat: 50 }, onTarget: 1, proteinHit: 1,
  });
  assert.equal(monthStats(new Map(), target).logged, 0);
});

test('weeks run Monday to Sunday, across month ends', () => {
  assert.deepEqual(weekOf('2026-10-30'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.equal(weekOf('2026-10-26')[0], '2026-10-26'); // a Monday
  assert.equal(weekOf('2026-11-01')[0], '2026-10-26'); // a Sunday
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('streak counts back from today, or from yesterday if today is empty', () => {
  const days = new Set(['2026-10-27', '2026-10-28', '2026-10-29']);
  const has = (d: string) => days.has(d);
  assert.equal(streak(has, '2026-10-29'), 3);
  assert.equal(streak(has, '2026-10-30'), 3); // nothing logged yet today
  assert.equal(streak(has, '2026-10-31'), 0); // missed yesterday
});
