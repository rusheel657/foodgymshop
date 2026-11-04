// Pure helpers for estimate-price (no Deno APIs, so node:test can run them).

/** `packGrams`: the pack size the user buys, when they've entered one. */
export type Request = { name: string; packGrams: number | null };
export type Estimate = { price: number; packGrams: number | null; store: string | null };

/** Validates the app's request body; returns an error message or the request. */
export function parseRequest(body: unknown): Request | string {
  const b = (body ?? {}) as Partial<Request>;
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 200) return 'Bad name';
  const g = b.packGrams ?? null;
  if (g !== null && !(typeof g === 'number' && g > 0 && g <= 50000)) return 'Bad pack size';
  return { name: b.name.trim(), packGrams: g };
}

export function buildPrompt(r: Request) {
  return (
    `Estimate the current regular shelf price at UK supermarkets (Tesco, Sainsbury's, Asda, Aldi, Lidl, Morrisons) of: "${r.name}".\n` +
    (r.packGrams ? `Price a pack of about ${r.packGrams} g (or ml); if that size isn't sold, the nearest common size.\n` : 'Use its most common pack size.\n') +
    'Ignore offers and loyalty-card prices. ' +
    'Answer with JSON only, no other text: {"price": pounds as a number, "pack_grams": grams or ml in that pack as a number, "store": the store}. ' +
    'If you have no idea, answer {"price": null}.'
  );
}

/** Gemini's answer → an estimate, or null when it found none or it isn't plausible. */
export function parseEstimate(text: string): Estimate | null {
  const m = text.match(/\{[\s\S]*\}/); // no response schema (keeps grounding possible later), so find the JSON in the text
  let j: { price?: unknown; pack_grams?: unknown; store?: unknown };
  try {
    j = JSON.parse(m?.[0] ?? '');
  } catch {
    return null;
  }
  const price = typeof j.price === 'number' ? Math.round(j.price * 100) / 100 : 0;
  if (!(price > 0 && price <= 100)) return null;
  const g = j.pack_grams;
  const packGrams = typeof g === 'number' && g > 0 && g <= 50000 ? Math.round(g) : null;
  const store = typeof j.store === 'string' && j.store.trim() ? j.store.trim().slice(0, 60) : null;
  return { price, packGrams, store };
}
