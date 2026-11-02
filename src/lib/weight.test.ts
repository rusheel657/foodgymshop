import assert from 'node:assert/strict';
import { test } from 'node:test';

import { inRange, ticks, weeklyRate } from './weight.ts';

test('weekly rate is the trend over the last 4 weeks', () => {
  const pts = [
    { date: '2026-10-05', kg: 82 },
    { date: '2026-10-12', kg: 81.5 },
    { date: '2026-10-19', kg: 81 },
    { date: '2026-10-26', kg: 80.5 },
    { date: '2026-11-02', kg: 80 },
  ];
  assert.equal(Math.round(weeklyRate(pts, '2026-11-02')! * 100) / 100, -0.5);
  assert.equal(weeklyRate([pts[4]], '2026-11-02'), null);
  assert.equal(weeklyRate([{ date: '2026-01-01', kg: 90 }, ...pts.slice(4)], '2026-11-02'), null); // old entries ignored
});

test('range filter and axis ticks', () => {
  assert.deepEqual(inRange([{ date: '2026-11-02', kg: 80 }, { date: '2026-09-01', kg: 82 }], '2026-10-01').map((p) => p.date), ['2026-11-02']);
  assert.deepEqual(ticks(79.6, 82.3), [79, 80, 81, 82, 83]);
  assert.deepEqual(ticks(80, 80.4), [80, 80.5]);
  assert.deepEqual(ticks(70, 90), [70, 75, 80, 85, 90]);
});
