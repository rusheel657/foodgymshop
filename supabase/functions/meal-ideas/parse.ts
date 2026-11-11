// Pure helpers for meal-ideas (no Deno APIs, so node:test can run them).

type Macros = { kcal: number; protein: number; carbs: number; fat: number };
/** `meals`: the meals to plan with what each should hold; `foods`: what's at home; `recent`: meals you've logged lately
 *  ("Greek yoghurt + Oats + Banana (Breakfast)"), so ideas look like how you eat; `perMeal`: ideas wanted per meal. */
export type Request = {
  meals: (Macros & { label: string })[];
  foods: { id: string; name: string }[];
  recent: string[];
  perMeal: number;
};
export type Idea = { name: string; foodIds: string[] };

/** Validates the app's request body; returns an error message or the request. */
export function parseRequest(body: unknown): Request | string {
  const b = (body ?? {}) as Partial<Request>;
  const num = (n: unknown) => typeof n === 'number' && n >= 0 && n < 10000;
  if (!Array.isArray(b.meals) || b.meals.length < 1 || b.meals.length > 4) return 'Bad meals';
  if (!b.meals.every((m) => typeof m?.label === 'string' && m.label.length <= 30 && num(m.kcal) && num(m.protein) && num(m.carbs) && num(m.fat))) return 'Bad meals';
  if (!Array.isArray(b.foods) || b.foods.length < 1 || b.foods.length > 200) return 'Bad foods';
  if (!b.foods.every((f) => typeof f?.id === 'string' && typeof f.name === 'string' && f.name.length <= 120)) return 'Bad foods';
  const recent = b.recent ?? [];
  if (!Array.isArray(recent) || recent.length > 40 || !recent.every((r) => typeof r === 'string' && r.length <= 300)) return 'Bad recent';
  const perMeal = b.perMeal ?? 3;
  if (typeof perMeal !== 'number' || perMeal < 1 || perMeal > 4) return 'Bad perMeal';
  return { meals: b.meals, foods: b.foods, recent, perMeal };
}

/** Foods go to Gemini as short ids (f1, f2…) so it can only pick from the list; `fromShort` maps them back. */
export function buildPrompt(r: Request) {
  const r0 = Math.round;
  return (
    'You plan realistic meals from the foods someone has at home. Pick foods that genuinely go together as one dish or plate ' +
    "(something a person would actually eat, in a normal combination). Don't pick drinks, condiments or very dense foods as the core of a meal " +
    'unless the combination is a known dish. Only use foods from the list, by id. Use 2 to 5 foods per idea. Amounts are worked out later, so ignore them.\n\n' +
    'Foods at home:\n' + r.foods.map((f, i) => `f${i + 1}: ${f.name}`).join('\n') + '\n\n' +
    (r.recent.length ? 'Meals they have eaten recently (match their style where it makes sense):\n' + r.recent.map((x) => `- ${x}`).join('\n') + '\n\n' : '') +
    `For each meal below, give ${r.perMeal} different idea${r.perMeal === 1 ? '' : 's'} whose foods can reach its macros:\n` +
    r.meals.map((m) => `- ${m.label}: about ${r0(m.kcal)} kcal, ${r0(m.protein)} g protein, ${r0(m.carbs)} g carbs, ${r0(m.fat)} g fat`).join('\n') +
    '\nGive each idea a short, appetising name.'
  );
}

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    meals: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          ideas: {
            type: 'ARRAY',
            items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, foods: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['name', 'foods'] },
          },
        },
        required: ['label', 'ideas'],
      },
    },
  },
  required: ['meals'],
};

/** Gemini's JSON → ideas per meal label, with the app's own food ids. Unknown ids are dropped; ideas need 1–5 foods. */
export function parseIdeas(text: string, r: Request): Record<string, Idea[]> {
  const out: Record<string, Idea[]> = Object.fromEntries(r.meals.map((m) => [m.label, []]));
  let j: { meals?: { label?: unknown; ideas?: { name?: unknown; foods?: unknown }[] }[] };
  try {
    j = JSON.parse(text);
  } catch {
    return out;
  }
  for (const m of j.meals ?? []) {
    const label = r.meals.find((x) => x.label.toLowerCase() === String(m.label ?? '').toLowerCase())?.label;
    if (!label) continue;
    for (const idea of m.ideas ?? []) {
      const ids = [...new Set((Array.isArray(idea.foods) ? idea.foods : []).map((s) => r.foods[Number(String(s).replace(/^f/i, '')) - 1]?.id).filter((x): x is string => !!x))];
      const name = typeof idea.name === 'string' ? idea.name.trim().slice(0, 80) : '';
      if (name && ids.length >= 1 && ids.length <= 5 && out[label].length < r.perMeal) out[label].push({ name, foodIds: ids });
    }
  }
  return out;
}
