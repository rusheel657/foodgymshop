import { all, run, write } from '@/db/db';
import { noteStockChange, type StockReason } from '@/db/diet';
import { ymd } from '@/lib/history';
import { macrosFor, usualGrams, type Correction, type LogItem, type Macros } from '@/lib/nutrition';

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

/** Grams per food currently in a log entry. */
async function gramsInLog(logId: string) {
  const rows = await all<{ food_id: string; grams: number }>(
    'SELECT food_id, grams FROM food_log_items WHERE food_log_id = ? AND deleted_at IS NULL AND food_id IS NOT NULL',
    [logId],
  );
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.food_id, (out.get(r.food_id) ?? 0) + r.grams);
  return out;
}

/** Eating uses up what's at home: subtracts `used` grams per food from its At home amount and notes the change
 *  (foods set to "any" aren't tracked). Call inside write(). */
async function useStock(used: Map<string, number>, reason: StockReason, now: string) {
  for (const [id, grams] of used) {
    if (Math.abs(grams) < 0.01) continue;
    const before = (await all<{ home_grams: number | null }>('SELECT home_grams FROM foods WHERE id = ?', [id]))[0]?.home_grams ?? null;
    if (before === null) continue;
    const after = Math.max(0, before - grams);
    await run('UPDATE foods SET home_grams = ?, updated_at = ?, dirty = 1 WHERE id = ?', [after, now, id]);
    await noteStockChange(id, reason, before, after, now);
  }
}

/** Upserts the entry and replaces its items; the change in grams eaten comes off the At home amounts. */
export async function saveLog(userId: string, log: FoodLog) {
  const now = new Date().toISOString();
  await write(['food_logs', 'food_log_items', 'foods', 'stock_changes'], async () => {
    const used = new Map<string, number>();
    const before = await gramsInLog(log.id);
    for (const [id, g] of before) used.set(id, -g); // an edit only uses the difference
    for (const i of log.items) if (i.foodId) used.set(i.foodId, (used.get(i.foodId) ?? 0) + i.grams);
    await useStock(used, before.size ? 'edited' : 'eaten', now);
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

/** Deletes the entry and puts its food back in the At home amounts. */
export async function deleteLog(id: string) {
  const now = new Date().toISOString();
  await write(['food_logs', 'food_log_items', 'foods', 'stock_changes'], async () => {
    await useStock(new Map([...(await gramsInLog(id))].map(([food, g]) => [food, -g])), 'returned', now);
    await run('UPDATE food_logs SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [now, now, id]);
    await run('UPDATE food_log_items SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE food_log_id = ?', [now, now, id]);
  });
}

/** Remembers how the user corrected a photo analysis. */
export async function saveCorrections(userId: string, logId: string, list: Correction[]) {
  if (list.length === 0) return;
  const now = new Date().toISOString();
  await write(['ai_corrections'], async () => {
    for (const c of list) {
      await run(
        'INSERT INTO ai_corrections (id, user_id, updated_at, dirty, food_log_id, kind, name, ai_grams, grams) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), userId, now, logId, c.kind, c.name, 'aiGrams' in c ? c.aiGrams : null, 'grams' in c ? c.grams : null],
      );
    }
  });
}

/** The most recent corrections, newest first. */
export async function recentCorrections(limit = 20): Promise<Correction[]> {
  const rows = await all<{ kind: Correction['kind']; name: string; ai_grams: number; grams: number }>(
    'SELECT kind, name, ai_grams, grams FROM ai_corrections WHERE deleted_at IS NULL ORDER BY updated_at DESC, rowid DESC LIMIT ?',
    [limit],
  );
  return rows.map((r) => ({ kind: r.kind, name: r.name, aiGrams: r.ai_grams, grams: r.grams }) as Correction);
}

/** Usual logged portion per food, from the last 90 days. */
export async function usualPortions() {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const rows = await all<{ foodId: string; grams: number }>(
    `SELECT i.food_id AS foodId, i.grams FROM food_log_items i JOIN food_logs l ON l.id = i.food_log_id
     WHERE i.food_id IS NOT NULL AND i.deleted_at IS NULL AND l.deleted_at IS NULL AND l.logged_at >= ?`,
    [since],
  );
  return usualGrams(rows);
}

/** Total macros per local day ("YYYY-MM-DD") for logs between two local dates (to exclusive). */
export async function dailyTotals(from: string, to: string): Promise<Map<string, Macros>> {
  const rows = await all<{ logged_at: string; kcal: number; protein: number; carbs: number; fat: number }>(
    `SELECT l.logged_at, i.kcal, i.protein, i.carbs, i.fat FROM food_log_items i JOIN food_logs l ON l.id = i.food_log_id
     WHERE i.deleted_at IS NULL AND l.deleted_at IS NULL AND l.logged_at >= ? AND l.logged_at < ?`,
    [dayRange(from)[0], dayRange(to)[0]],
  );
  const out = new Map<string, Macros>();
  for (const r of rows) {
    const day = ymd(new Date(r.logged_at));
    const m = out.get(day) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    out.set(day, { kcal: m.kcal + r.kcal, protein: m.protein + r.protein, carbs: m.carbs + r.carbs, fat: m.fat + r.fat });
  }
  return out;
}
