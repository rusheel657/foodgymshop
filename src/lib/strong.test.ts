import assert from 'node:assert/strict';
import { test } from 'node:test';

import { equipmentOf, headerUnit, matchExercise, parseCsv, parseDuration, parseStrong } from './strong.ts';

const CSV = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-10-20 18:02:11,"Push A",1h 5m,Bench Press (Barbell),W,40,10,0,0,"","",
2026-10-20 18:02:11,"Push A",1h 5m,Bench Press (Barbell),1,80,8,0,0,"felt good, strong","",8
2026-10-20 18:02:11,"Push A",1h 5m,Bench Press (Barbell),2,80,7,0,0,"","",
2026-10-20 18:02:11,"Push A",1h 5m,Push Up,1,0,20,0,0,"","",
2026-10-20 18:02:11,"Push A",1h 5m,Running (Treadmill),1,0,0,3000,900,"","",
2026-10-22 07:30:00,"Legs",45m,Squat (Barbell),1,100,5,0,0,"","",
`;

test('CSV parsing handles quotes, commas in quotes and semicolons', () => {
  assert.deepEqual(parseCsv('a,"b, c",d\n1,"say ""hi""",3\n'), [['a', 'b, c', 'd'], ['1', 'say "hi"', '3']]);
  assert.deepEqual(parseCsv('a;b\r\n1,5;2\r\n'), [['a', 'b'], ['1,5', '2']]);
});

test('durations', () => {
  assert.equal(parseDuration('1h 5m'), 65);
  assert.equal(parseDuration('45m'), 45);
  assert.equal(parseDuration('2h'), 120);
  assert.equal(parseDuration('30s'), 0.5);
});

test('Strong export → workouts with warm-ups, skipping cardio rows', () => {
  const w = parseStrong(CSV, 'kg');
  assert.equal(w.length, 2);
  assert.equal(w[0].name, 'Push A');
  assert.equal(w[0].minutes, 65);
  assert.equal(w[0].startedAt, new Date('2026-10-20T18:02:11').toISOString());
  assert.deepEqual(w[0].exercises.map((e) => e.name), ['Bench Press (Barbell)', 'Push Up']);
  assert.deepEqual(w[0].exercises[0].sets, [
    { weightKg: 40, reps: 10, isWarmup: true },
    { weightKg: 80, reps: 8, isWarmup: false },
    { weightKg: 80, reps: 7, isWarmup: false },
  ]);
  assert.deepEqual(w[0].exercises[1].sets, [{ weightKg: null, reps: 20, isWarmup: false }]);
  assert.equal(w[1].exercises[0].sets[0].weightKg, 100);
});

test('pounds are converted (from the choice, or the header when it says)', () => {
  assert.equal(parseStrong(CSV, 'lb')[1].exercises[0].sets[0].weightKg, 45.36);
  const kgHeader = CSV.replace('Weight,', 'Weight (kg),');
  assert.equal(headerUnit(kgHeader.split('\n')[0].split(',')), 'kg');
  assert.equal(parseStrong(kgHeader, 'lb')[1].exercises[0].sets[0].weightKg, 100);
  assert.throws(() => parseStrong('a,b\n1,2', 'kg'), /Strong export/);
});

test('exercise names match with the equipment moved to the front', () => {
  const list = [{ name: 'Barbell Bench Press - Medium Grip' }, { name: 'Pushups' }, { name: 'Barbell Squat' }, { name: 'Seated Cable Rows' }, { name: 'Romanian Deadlift' }];
  assert.equal(matchExercise('Bench Press (Barbell)', list)?.name, 'Barbell Bench Press - Medium Grip');
  assert.equal(matchExercise('Squat (Barbell)', list)?.name, 'Barbell Squat');
  assert.equal(matchExercise('Seated Cable Row', list)?.name, 'Seated Cable Rows');
  assert.equal(matchExercise('Romanian Deadlift (Barbell)', list)?.name, 'Romanian Deadlift');
  assert.equal(matchExercise('Push Up', list), null);
  assert.equal(equipmentOf('Bench Press (Barbell)'), 'barbell');
  assert.equal(equipmentOf('Push Up'), 'other');
});
