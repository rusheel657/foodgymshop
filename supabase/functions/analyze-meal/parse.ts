// Pure helpers for analyze-meal (no Deno APIs, so node:test can run them).

export type Ref = { id: string; name: string };
export type FoodRef = Ref & { usualGrams?: number };
export type MealRef = Ref & { items: { name: string; grams: number }[] };
/** `notes`: the user's recent corrections of earlier analyses; `rules`: standing facts about how they cook. One sentence each. */
/** `kind`: a plate of food (default), or groceries laid out after shopping (total amounts bought). */
export type Request = { kind: 'meal' | 'groceries'; image: string; foods: FoodRef[]; meals: MealRef[]; notes: string[]; rules: string[] };

/** What the app gets back. Ids are the app's own ids; macros are only set for foods not in My Diet. */
export type AiItem = {
  mealId: string | null;
  foodId: string | null;
  name: string;
  grams: number;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

const MAX_IMAGE = 4_000_000; // base64 chars ≈ 3 MB JPEG

/** Validates the app's request body; returns an error message or the request. */
export function parseRequest(body: unknown): Request | string {
  const b = (body ?? {}) as Partial<Request>;
  if (typeof b.image !== 'string' || !b.image || b.image.length > MAX_IMAGE) return 'Bad image';
  const isRef = (r: unknown): r is Ref =>
    typeof (r as Ref)?.id === 'string' && typeof (r as Ref).name === 'string' && (r as Ref).name.length <= 200;
  if (!Array.isArray(b.foods) || b.foods.length > 500 || !b.foods.every(isRef)) return 'Bad foods';
  if (
    !Array.isArray(b.meals) || b.meals.length > 100 ||
    !b.meals.every((m) => isRef(m) && Array.isArray(m.items) && m.items.length <= 50 &&
      m.items.every((i) => typeof i?.name === 'string' && typeof i.grams === 'number'))
  ) return 'Bad meals';
  if (b.foods.some((f) => f.usualGrams !== undefined && typeof f.usualGrams !== 'number')) return 'Bad foods';
  const sentences = (v: unknown) => Array.isArray(v) && v.length <= 30 && v.every((n) => typeof n === 'string' && n.length <= 300);
  const notes = b.notes ?? [];
  const rules = b.rules ?? [];
  if (!sentences(notes)) return 'Bad notes';
  if (!sentences(rules)) return 'Bad rules';
  return { kind: b.kind === 'groceries' ? 'groceries' : 'meal', image: b.image, foods: b.foods, meals: b.meals, notes, rules };
}

/** Prompt text. Foods/meals get short ids (f1, m1) so the model can't mangle UUIDs. */
export function buildPrompt({ kind, foods, meals, notes, rules }: Request) {
  const foodLines =
    foods.map((f, i) => `f${i + 1}: ${f.name}${f.usualGrams ? ` (usually ${f.usualGrams} g)` : ''}`).join('\n') || '(none)';
  if (kind === 'groceries') {
    return `You are a kitchen inventory assistant. This photo shows groceries the user just bought, laid out together. List every food and drink in it.

The user's saved FOODS:
${foodLines}

Rules:
- One item per kind of food. Several packs of the same food become one item with the amounts added up.
- grams = the total amount of that food in the photo. Read the weight printed on packs where you can ("1kg" = 1000, "500g" = 500, 1 ml = 1 g). For loose or counted items, count them and use typical weights (an egg is 50 g, a banana 120 g without peel, a dozen eggs 600 g).
- If it is one of the saved foods, set food_id and leave the macros null.
- Otherwise set food_id null, give it a short plain name (e.g. "Greek yoghurt"), and estimate kcal, protein, carbs and fat (grams) for the WHOLE amount.
- Leave meal_id null. Ignore things that aren't food (bags, receipts, cleaning products) and drinks with no calories.
- Use the ids exactly as given (e.g. "f5"). If there is no food, return an empty list.`;
  }
  const mealLines =
    meals.map((m, i) => `m${i + 1}: ${m.name} = ${m.items.map((x) => `${x.grams} g ${x.name}`).join(' + ')}`).join('\n') ||
    '(none)';
  return `You are a nutrition assistant. Identify everything eaten in this photo.

The user's saved MEALS (fixed portions):
${mealLines}

The user's saved FOODS:
${foodLines}

Rules:
- If the plate matches a saved meal, return ONE item with meal_id set and the meal's name. Never estimate grams for a saved meal.
- Otherwise, for each component that is one of the saved foods, set food_id and estimate grams. Leave the macros null.
- Only for components that are not in either list: set meal_id and food_id to null, estimate grams, and estimate kcal, protein, carbs and fat (grams) for that portion.
- Use the ids exactly as given (e.g. "m2", "f5"). If nothing edible is visible, return an empty list.
- A food's usual portion is a good starting point for grams; adjust it to what the photo shows.${
  rules.length
    ? `

How this user cooks (always apply, even when it isn't visible):
${rules.map((r) => `- ${r}`).join('\n')}`
    : ''
}${
  notes.length
    ? `

The user corrected your earlier analyses like this (newest first). Learn from these mistakes:
${notes.map((n) => `- ${n}`).join('\n')}`
    : ''
}`;
}

const num = { type: 'NUMBER', nullable: true };
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          meal_id: { type: 'STRING', nullable: true },
          food_id: { type: 'STRING', nullable: true },
          name: { type: 'STRING' },
          grams: { type: 'NUMBER' },
          kcal: num,
          protein: num,
          carbs: num,
          fat: num,
        },
        required: ['name', 'grams'],
      },
    },
  },
  required: ['items'],
};

/** Gemini's JSON text → items with the app's ids. Unknown ids become estimates; unusable items are dropped. */
export function parseGemini(text: string, req: Request): AiItem[] {
  let items: unknown;
  try {
    items = (JSON.parse(text) as { items?: unknown }).items;
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];
  const pick = <T,>(list: T[], prefix: string, id: unknown) =>
    typeof id === 'string' && id.startsWith(prefix) ? list[Number(id.slice(1)) - 1] ?? null : null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  return items.flatMap((raw): AiItem[] => {
    const r = raw as Record<string, unknown>;
    const meal = req.kind === 'groceries' ? null : pick(req.meals, 'm', r.meal_id);
    const food = meal ? null : pick(req.foods, 'f', r.food_id);
    const grams = n(r.grams) ?? 0;
    const item: AiItem = {
      mealId: meal?.id ?? null,
      foodId: food?.id ?? null,
      name: meal?.name ?? food?.name ?? (typeof r.name === 'string' ? r.name.slice(0, 100) : ''),
      grams: Math.min(grams, req.kind === 'groceries' ? 20000 : 5000),
      kcal: n(r.kcal), protein: n(r.protein), carbs: n(r.carbs), fat: n(r.fat),
    };
    if (meal) return [item];
    if (!item.name || item.grams <= 0) return [];
    if (food) return [{ ...item, kcal: null, protein: null, carbs: null, fat: null }];
    return [item.kcal, item.protein, item.carbs, item.fat].every((v) => v !== null) ? [item] : [];
  });
}
