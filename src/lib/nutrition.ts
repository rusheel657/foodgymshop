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
