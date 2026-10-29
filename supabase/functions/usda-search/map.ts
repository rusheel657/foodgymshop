// Pure mapping from a USDA FoodData Central search response to our food shape (per 100 g).
// Kept free of Deno APIs so `npm test` can run it under Node.

export type UsdaFood = { id: string; name: string; kcal: number; protein: number; carbs: number; fat: number };

type Nutrient = { nutrientNumber?: string | number; value?: number };
type Food = { fdcId: number; description: string; brandName?: string; foodNutrients?: Nutrient[] };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function mapUsdaFoods(json: { foods?: Food[] }): UsdaFood[] {
  return (json.foods ?? []).flatMap((f) => {
    const get = (num: string) => f.foodNutrients?.find((n) => String(n.nutrientNumber) === num)?.value;
    // Search results are per 100 g for every data type. Negative "by difference" carbs happen; clamp them.
    const protein = Math.max(0, get('203') ?? 0);
    const fat = Math.max(0, get('204') ?? 0);
    const carbs = Math.max(0, get('205') ?? 0);
    // Foundation foods have no plain Energy (208), only Atwater factors (958 specific, 957 general).
    const kcal = get('208') ?? get('958') ?? get('957') ?? protein * 4 + carbs * 4 + fat * 9;
    if (!f.foodNutrients?.length) return [];
    const name = f.brandName ? `${f.description} (${f.brandName})` : f.description;
    return [{ id: String(f.fdcId), name, kcal: Math.round(kcal), protein: round1(protein), carbs: round1(carbs), fat: round1(fat) }];
  });
}
