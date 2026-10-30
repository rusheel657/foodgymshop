import { all, run, write } from '@/db/db';
import { macrosFor, type LogItem } from '@/lib/nutrition';

// Food log: one entry per meal eaten, with item macros copied at log time (editing a food later doesn't rewrite history).

export type FoodLog = {
  id: string;
  loggedAt: string; // ISO timestamp
  mealId: string | null;
  photoPath: string | null;
  source: 'photo' | 'quick';
  items: LogItem[];
};

/** Start/end ISO timestamps of a local day ("2026-10-30"). */
function dayRange(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return [new Date(y, m - 1, d).toISOString(), new Date(y, m - 1, d + 1).toISOString()];
}

/** When a new entry for `date` is logged: now if it's today, else midday that day. */
export function logTimeFor(date: string, today: string) {
  if (date === today) return new Date().toISOString();
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toISOString();
}

export async function listLogs(date: string): Promise<FoodLog[]> {
  const [from, to] = dayRange(date);
  const logs = await all<{ id: string; logged_at: string; meal_id: string | null; photo_path: string | null; source: FoodLog['source'] }>(
    'SELECT id, logged_at, meal_id, photo_path, source FROM food_logs WHERE deleted_at IS NULL AND logged_at >= ? AND logged_at < ? ORDER BY logged_at',
    [from, to],
  );
  if (logs.length === 0) return [];
  const items = await all<{ food_log_id: string; food_id: string | null; name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number; verified: number }>(
    `SELECT * FROM food_log_items WHERE deleted_at IS NULL AND food_log_id IN (${logs.map(() => '?').join(',')}) ORDER BY rowid`,
    logs.map((l) => l.id),
  );
  return logs.map((l) => ({
    id: l.id, loggedAt: l.logged_at, mealId: l.meal_id, photoPath: l.photo_path, source: l.source,
    items: items
      .filter((i) => i.food_log_id === l.id)
      .map((i) => {
        const k = 100 / i.grams;
        return {
          foodId: i.food_id, name: i.name, grams: i.grams, verified: !!i.verified,
          per100: { kcal: i.kcal * k, protein: i.protein * k, carbs: i.carbs * k, fat: i.fat * k },
        };
      }),
  }));
}

/** Upserts the entry and replaces its items. */
export async function saveLog(userId: string, log: FoodLog) {
  const now = new Date().toISOString();
  await write(['food_logs', 'food_log_items'], async () => {
    await run(
      `INSERT INTO food_logs (id, user_id, updated_at, dirty, logged_at, meal_id, photo_path, source) VALUES (?, ?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, dirty = 1, logged_at = excluded.logged_at`,
      [log.id, userId, now, log.loggedAt, log.mealId, log.photoPath, log.source],
    );
    await run(
      'UPDATE food_log_items SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE food_log_id = ? AND deleted_at IS NULL',
      [now, now, log.id],
    );
    for (const i of log.items) {
      const m = macrosFor(i.per100, i.grams);
      await run(
        `INSERT INTO food_log_items (id, user_id, updated_at, dirty, food_log_id, food_id, name, grams, kcal, protein, carbs, fat, verified)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), userId, now, log.id, i.foodId, i.name, i.grams, m.kcal, m.protein, m.carbs, m.fat, i.verified ? 1 : 0],
      );
    }
  });
}

export async function deleteLog(id: string) {
  const now = new Date().toISOString();
  await write(['food_logs', 'food_log_items'], async () => {
    await run('UPDATE food_logs SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [now, now, id]);
    await run('UPDATE food_log_items SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE food_log_id = ?', [now, now, id]);
  });
}
