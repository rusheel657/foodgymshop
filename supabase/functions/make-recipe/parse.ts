// Pure helpers for make-recipe (no Deno APIs, so node:test can run them).

export type Request = { items: { name: string; grams: number }[] };
export type Recipe = { name: string; steps: string[] };

/** Validates the app's request body; returns an error message or the request. */
export function parseRequest(body: unknown): Request | string {
  const items = (body as Partial<Request> | null)?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 15) return 'Bad items';
  if (!items.every((i) => typeof i?.name === 'string' && i.name.trim() && i.name.length <= 120 && typeof i.grams === 'number' && i.grams > 0 && i.grams <= 5000)) {
    return 'Bad items';
  }
  return { items: items.map((i) => ({ name: i.name.trim(), grams: Math.round(i.grams) })) };
}

export function buildPrompt(r: Request) {
  return (
    'Write a simple home recipe that uses exactly these ingredients in these amounts:\n' +
    r.items.map((i) => `- ${i.grams} g ${i.name}`).join('\n') +
    '\nUse nothing else except salt, pepper, dried herbs and spices, and water. Don\'t change any amount. ' +
    'Give it a short, appetising name and 3 to 6 short steps (one sentence each, with times and heat where useful).'
  );
}

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: { name: { type: 'STRING' }, steps: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['name', 'steps'],
};

/** Gemini's JSON → a recipe, or null if it's unusable. */
export function parseRecipe(text: string): Recipe | null {
  try {
    const j = JSON.parse(text) as Partial<Recipe>;
    const name = typeof j.name === 'string' ? j.name.trim().slice(0, 80) : '';
    const steps = Array.isArray(j.steps) ? j.steps.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 300)).slice(0, 10) : [];
    return name && steps.length ? { name, steps } : null;
  } catch {
    return null;
  }
}
