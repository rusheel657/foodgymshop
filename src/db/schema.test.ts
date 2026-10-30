// Applies every migration to an in-memory SQLite DB with Node's built-in driver.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { MIGRATIONS } from './schema.ts';

test('migrations build every table with sync columns and working constraints', () => {
  const db = new DatabaseSync(':memory:');
  MIGRATIONS.forEach((sql, i) => db.exec(`${sql}\nPRAGMA user_version = ${i + 1};`));

  assert.equal(db.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.length);

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => String(r.name));
  assert.deepEqual(tables, [
    'ai_corrections', 'exercises', 'food_log_items', 'food_logs', 'foods', 'meal_items', 'meals', 'profile',
    'template_exercises', 'template_sets', 'templates', 'weight_logs', 'workout_sets', 'workouts',
  ]);

  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    for (const c of ['id', 'user_id', 'updated_at', 'deleted_at', 'dirty']) {
      assert.ok(cols.includes(c), `${t} missing ${c}`);
    }
  }

  // Constraints actually bite.
  const now = new Date().toISOString();
  db.prepare("INSERT INTO weight_logs (id, user_id, updated_at, date, weight_kg) VALUES ('a','u',?,'2026-10-28',80)").run(now);
  assert.throws(() =>
    db.prepare("INSERT INTO weight_logs (id, user_id, updated_at, date, weight_kg) VALUES ('b','u',?,'2026-10-28',81)").run(now),
  );
  assert.throws(() =>
    db.prepare("INSERT INTO food_logs (id, updated_at, logged_at, source) VALUES ('c',?,?,'bogus')").run(now, now),
  );

});
