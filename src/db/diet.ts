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
};

export type MealItem = { foodId: string; grams: number };
export type Meal = { id: string; name: string; photos: string[]; items: MealItem[] };

type FoodRow = {
  id: string; name: string; kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number;
  default_grams: number | null; source: Food['source']; source_id: string | null; barcode: string | null;
  shop_unit: string | null; shop_qty: number;
};

export async function listFoods(): Promise<Food[]> {
  const rows = await all<FoodRow>('SELECT * FROM foods WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE');
  return rows.map((r) => ({
    id: r.id, name: r.name, kcal: r.kcal_100g, protein: r.protein_100g, carbs: r.carbs_100g, fat: r.fat_100g,
    defaultGrams: r.default_grams, source: r.source, sourceId: r.source_id, barcode: r.barcode,
    shopUnit: r.shop_unit, shopQty: r.shop_qty,
  }));
}

export async function saveFood(userId: string, f: Food) {
  await write(['foods'], () =>
    run(
      `INSERT INTO foods (id, user_id, updated_at, dirty, name, kcal_100g, protein_100g, carbs_100g, fat_100g,
                          default_grams, source, source_id, barcode, shop_unit, shop_qty)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         updated_at = excluded.updated_at, dirty = 1, name = excluded.name,
         kcal_100g = excluded.kcal_100g, protein_100g = excluded.protein_100g, carbs_100g = excluded.carbs_100g,
         fat_100g = excluded.fat_100g, default_grams = excluded.default_grams, shop_unit = excluded.shop_unit`,
      [f.id, userId, new Date().toISOString(), f.name, f.kcal, f.protein, f.carbs, f.fat, f.defaultGrams,
        f.source, f.sourceId, f.barcode, f.shopUnit, f.shopQty],
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

export async function setShopQty(id: string, qty: number) {
  await write(['foods'], () =>
    run('UPDATE foods SET shop_qty = ?, updated_at = ?, dirty = 1 WHERE id = ?', [Math.max(0, qty), new Date().toISOString(), id]),
  );
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
