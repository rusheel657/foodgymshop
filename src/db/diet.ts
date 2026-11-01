import { all, run, write } from '@/db/db';
import { macrosFor, sumMacros, type Macros } from '@/lib/nutrition';

// My Diet: foods (macros per 100 g) and fixed-portion meals built from them.

export type Food = Macros & {
  id: string;
  name: string;
  defaultGrams: number | null;
  source: 'usda' | 'off' | 'manual';
  sourceId: string | null;
  barcode: string | null;
  shopUnit: string | null;
  shopQty: number;
  atHome: boolean;
  homeGrams: number | null;
  pieceGrams: number | null; // set for foods counted in pieces (eggs, dates)
  dailyMaxGrams: number | null;
  minGrams: number | null; // smallest portion worth suggesting
  pairsWith: string[]; // food ids it's only eaten with (yoghurt → honey, fruit, chocolate)
  disabled: boolean; // switched off in My Diet; past entries keep their own copy of its macros either way
};

export type MealItem = { foodId: string; grams: number };
export type Meal = { id: string; name: string; photos: string[]; items: MealItem[] };

type FoodRow = {
  id: string; name: string; kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number;
  default_grams: number | null; source: Food['source']; source_id: string | null; barcode: string | null;
  shop_unit: string | null; shop_qty: number; at_home: number; home_grams: number | null;
  piece_grams: number | null; daily_max_grams: number | null;
  min_grams: number | null; pairs_with: string; disabled: number;
};

/** Foods in use; `withDisabled` also returns the ones switched off (My Diet, editing old entries). */
export async function listFoods(withDisabled = false): Promise<Food[]> {
  const rows = await all<FoodRow>(
    `SELECT * FROM foods WHERE deleted_at IS NULL ${withDisabled ? '' : 'AND disabled = 0'} ORDER BY name COLLATE NOCASE`,
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, kcal: r.kcal_100g, protein: r.protein_100g, carbs: r.carbs_100g, fat: r.fat_100g,
    defaultGrams: r.default_grams, source: r.source, sourceId: r.source_id, barcode: r.barcode,
    shopUnit: r.shop_unit, shopQty: r.shop_qty, atHome: !!r.at_home, homeGrams: r.home_grams,
    pieceGrams: r.piece_grams, dailyMaxGrams: r.daily_max_grams,
    minGrams: r.min_grams, pairsWith: JSON.parse(r.pairs_with), disabled: !!r.disabled,
  }));
}

export async function saveFood(userId: string, f: Food) {
  await write(['foods'], () =>
    run(
      `INSERT INTO foods (id, user_id, updated_at, dirty, name, kcal_100g, protein_100g, carbs_100g, fat_100g,
                          default_grams, source, source_id, barcode, shop_unit, shop_qty, piece_grams, daily_max_grams,
                          min_grams, pairs_with)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         updated_at = excluded.updated_at, dirty = 1, name = excluded.name,
         kcal_100g = excluded.kcal_100g, protein_100g = excluded.protein_100g, carbs_100g = excluded.carbs_100g,
         fat_100g = excluded.fat_100g, default_grams = excluded.default_grams, shop_unit = excluded.shop_unit,
         piece_grams = excluded.piece_grams, daily_max_grams = excluded.daily_max_grams,
         min_grams = excluded.min_grams, pairs_with = excluded.pairs_with`,
      [f.id, userId, new Date().toISOString(), f.name, f.kcal, f.protein, f.carbs, f.fat, f.defaultGrams,
        f.source, f.sourceId, f.barcode, f.shopUnit, f.shopQty, f.pieceGrams, f.dailyMaxGrams,
        f.minGrams, JSON.stringify(f.pairsWith)],
    ),
  );
}

/** Soft-deletes the food and removes it from every meal. */
export async function deleteFood(id: string) {
  const now = new Date().toISOString();
  await write(['foods', 'meal_items'], async () => {
    await run('UPDATE foods SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [now, now, id]);
    await run(
      'UPDATE meal_items SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE food_id = ? AND deleted_at IS NULL',
      [now, now, id],
    );
  });
}

export async function setDisabled(id: string, disabled: boolean) {
  await write(['foods'], () =>
    run('UPDATE foods SET disabled = ?, updated_at = ?, dirty = 1 WHERE id = ?', [disabled ? 1 : 0, new Date().toISOString(), id]),
  );
}

export async function setShopQty(id: string, qty: number) {
  await write(['foods'], () =>
    run('UPDATE foods SET shop_qty = ?, updated_at = ?, dirty = 1 WHERE id = ?', [Math.max(0, qty), new Date().toISOString(), id]),
  );
}

export async function setAtHome(id: string, atHome: boolean) {
  await write(['foods'], () =>
    run('UPDATE foods SET at_home = ?, updated_at = ?, dirty = 1 WHERE id = ?', [atHome ? 1 : 0, new Date().toISOString(), id]),
  );
}

export type StockReason = 'eaten' | 'edited' | 'returned' | 'bought' | 'manual';
export type StockChange = { id: string; foodId: string; reason: StockReason; before: number | null; after: number | null; at: string };

/** Notes a change to a food's At home amount (call inside write()). Typing in the amount box counts as one change
 *  per minute, so a few keystrokes don't fill the list. */
export async function noteStockChange(foodId: string, reason: StockReason, before: number | null, after: number | null, now: string) {
  if (before === after) return;
  if (reason === 'manual') {
    const last = await all<{ id: string; reason: string; changed_at: string }>(
      'SELECT id, reason, changed_at FROM stock_changes WHERE food_id = ? AND deleted_at IS NULL ORDER BY changed_at DESC, rowid DESC LIMIT 1',
      [foodId],
    );
    if (last[0]?.reason === 'manual' && Date.parse(now) - Date.parse(last[0].changed_at) < 60_000) {
      await run('UPDATE stock_changes SET after_grams = ?, changed_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [after, now, now, last[0].id]);
      return;
    }
  }
  await run(
    'INSERT INTO stock_changes (id, updated_at, dirty, food_id, reason, before_grams, after_grams, changed_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?)',
    [crypto.randomUUID(), now, foodId, reason, before, after, now],
  );
}

const homeGramsOf = async (id: string) =>
  (await all<{ home_grams: number | null }>('SELECT home_grams FROM foods WHERE id = ?', [id]))[0]?.home_grams ?? null;

export async function setHomeGrams(id: string, grams: number | null) {
  const now = new Date().toISOString();
  await write(['foods', 'stock_changes'], async () => {
    const before = await homeGramsOf(id);
    await run('UPDATE foods SET home_grams = ?, updated_at = ?, dirty = 1 WHERE id = ?', [grams, now, id]);
    await noteStockChange(id, 'manual', before, grams, now);
  });
}

/** Recent At home changes, newest first. */
export async function listStockChanges(limit = 80): Promise<StockChange[]> {
  const rows = await all<{ id: string; food_id: string; reason: StockReason; before_grams: number | null; after_grams: number | null; changed_at: string }>(
    'SELECT * FROM stock_changes WHERE deleted_at IS NULL ORDER BY changed_at DESC, rowid DESC LIMIT ?',
    [limit],
  );
  return rows.map((r) => ({ id: r.id, foodId: r.food_id, reason: r.reason, before: r.before_grams, after: r.after_grams, at: r.changed_at }));
}

/** Bought `grams` of a food: it's now at home (and back in use if it was switched off), and its At home amount goes up. */
export async function restock(id: string, grams: number) {
  const now = new Date().toISOString();
  await write(['foods', 'stock_changes'], async () => {
    const before = await homeGramsOf(id);
    await run('UPDATE foods SET at_home = 1, disabled = 0, home_grams = COALESCE(home_grams, 0) + ?, updated_at = ?, dirty = 1 WHERE id = ?', [grams, now, id]);
    await noteStockChange(id, 'bought', before, (before ?? 0) + grams, now);
  });
}

export async function clearShopList() {
  await write(['foods'], () =>
    run('UPDATE foods SET shop_qty = 0, updated_at = ?, dirty = 1 WHERE shop_qty > 0 AND deleted_at IS NULL', [
      new Date().toISOString(),
    ]),
  );
}

export async function listMeals(): Promise<Meal[]> {
  const meals = await all<{ id: string; name: string; ref_photo_paths: string }>(
    'SELECT id, name, ref_photo_paths FROM meals WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE',
  );
  const items = await all<{ meal_id: string; food_id: string; grams: number }>(
    'SELECT meal_id, food_id, grams FROM meal_items WHERE deleted_at IS NULL ORDER BY rowid',
  );
  return meals.map((m) => ({
    id: m.id,
    name: m.name,
    photos: JSON.parse(m.ref_photo_paths),
    items: items.filter((i) => i.meal_id === m.id).map((i) => ({ foodId: i.food_id, grams: i.grams })),
  }));
}

/** Upserts the meal and replaces its items. */
export async function saveMeal(userId: string, m: Meal) {
  const now = new Date().toISOString();
  await write(['meals', 'meal_items'], async () => {
    await run(
      `INSERT INTO meals (id, user_id, updated_at, dirty, name, ref_photo_paths) VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, dirty = 1,
         name = excluded.name, ref_photo_paths = excluded.ref_photo_paths`,
      [m.id, userId, now, m.name, JSON.stringify(m.photos)],
    );
    await run(
      'UPDATE meal_items SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE meal_id = ? AND deleted_at IS NULL',
      [now, now, m.id],
    );
    for (const i of m.items) {
      await run(
        'INSERT INTO meal_items (id, user_id, updated_at, dirty, meal_id, food_id, grams) VALUES (?, ?, ?, 1, ?, ?, ?)',
        [crypto.randomUUID(), userId, now, m.id, i.foodId, i.grams],
      );
    }
  });
}

export async function deleteMeal(id: string) {
  const now = new Date().toISOString();
  await write(['meals', 'meal_items'], async () => {
    await run('UPDATE meals SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [now, now, id]);
    await run('UPDATE meal_items SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE meal_id = ?', [now, now, id]);
  });
}

/** Total macros of a meal; items whose food was deleted are skipped. */
export function mealMacros(meal: Meal, foods: Food[]): Macros {
  return sumMacros(
    meal.items.flatMap((i) => {
      const f = foods.find((x) => x.id === i.foodId);
      return f ? [macrosFor(f, i.grams)] : [];
    }),
  );
}
