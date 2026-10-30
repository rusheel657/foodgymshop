// Pure food maths. No imports, so node:test can run it directly.

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

/** Macros per 100 g → macros for `grams`. */
export function macrosFor(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  return { kcal: per100g.kcal * f, protein: per100g.protein * f, carbs: per100g.carbs * f, fat: per100g.fat * f };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** "520 kcal · P 40 · C 12 · F 30" */
export function formatMacros(m: Macros) {
  return `${Math.round(m.kcal)} kcal · P ${Math.round(m.protein)} · C ${Math.round(m.carbs)} · F ${Math.round(m.fat)}`;
}

export type FoodDraft = Macros & { name: string; barcode?: string };

type OffProduct = { code?: string; product_name?: string; brands?: string | string[]; nutriments?: Record<string, unknown> };

/** One Open Food Facts product → per-100 g food, or null if it has no usable nutrition data. */
export function fromOffProduct(code: string, p: OffProduct): FoodDraft | null {
  const n = p.nutriments;
  if (!n) return null;
  const num = (k: string) => (typeof n[k] === 'number' ? (n[k] as number) : Number(n[k] ?? NaN));
  let kcal = num('energy-kcal_100g');
  // Some products only list kJ.
  if (!Number.isFinite(kcal)) kcal = num('energy_100g') / 4.184;
  const protein = num('proteins_100g');
  const carbs = num('carbohydrates_100g');
  const fat = num('fat_100g');
  if (![kcal, protein, carbs, fat].every(Number.isFinite)) return null;
  // The product API returns brands as "A, B"; the search API as ["A", "B"].
  const brand = (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0])?.trim();
  const name = [p.product_name?.trim() || 'Unnamed product', brand && `(${brand})`].filter(Boolean).join(' ');
  return { name, kcal: Math.round(kcal), protein, carbs, fat, barcode: code };
}

/** Open Food Facts /api/v2/product/<code>.json → per-100 g food, or null if unknown / no nutrition data. */
export function fromOpenFoodFacts(code: string, json: unknown): FoodDraft | null {
  const { status, product } = (json ?? {}) as { status?: number; product?: OffProduct };
  return status === 1 && product ? fromOffProduct(code, product) : null;
}

/** search.openfoodfacts.org response → foods that have full nutrition data. */
export function fromOffSearch(json: unknown): FoodDraft[] {
  const hits = ((json ?? {}) as { hits?: OffProduct[] }).hits ?? [];
  return hits.flatMap((h) => {
    const food = h.code ? fromOffProduct(h.code, h) : null;
    return food ? [food] : [];
  });
}

/** One row of a food log. Macros are kept per 100 g so changing grams rescales them. */
export type LogItem = { foodId: string | null; name: string; grams: number; per100: Macros; verified: boolean };

/** One item returned by the analyze-meal Edge Function. */
export type AiItem = {
  mealId: string | null; foodId: string | null; name: string; grams: number;
  kcal: number | null; protein: number | null; carbs: number | null; fat: number | null;
};
type DietFood = Macros & { id: string; name: string };
type DietMeal = { id: string; items: { foodId: string; grams: number }[] };

/** analyze-meal items → log rows. Saved meals/foods use local macros (verified); the rest use the AI estimate. */
export function toLogItems(ai: AiItem[], foods: DietFood[], meals: DietMeal[]): LogItem[] {
  const fromFood = (f: DietFood, grams: number): LogItem => ({
    foodId: f.id, name: f.name, grams, verified: true,
    per100: { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat },
  });
  return ai.flatMap((a): LogItem[] => {
    const meal = meals.find((m) => m.id === a.mealId);
    if (meal) {
      return meal.items.flatMap((i) => {
        const f = foods.find((x) => x.id === i.foodId);
        return f ? [fromFood(f, i.grams)] : [];
      });
    }
    const food = foods.find((x) => x.id === a.foodId);
    if (food) return [fromFood(food, a.grams)];
    if (a.grams <= 0 || a.kcal === null || a.protein === null || a.carbs === null || a.fat === null) return [];
    const k = 100 / a.grams;
    return [{
      foodId: null, name: a.name, grams: a.grams, verified: false,
      per100: { kcal: a.kcal * k, protein: a.protein * k, carbs: a.carbs * k, fat: a.fat * k },
    }];
  });
}
