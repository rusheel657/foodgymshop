// Food prices: stored per 100 g, entered per kg (or per piece for counted foods like eggs).

export const money = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);

/** Stored price → what you type: £ per kg, or £ each for counted foods. */
export const shownPrice = (price100: number, pieceGrams: number | null) =>
  Math.round((pieceGrams ? (price100 * pieceGrams) / 100 : price100 * 10) * 100) / 100;

export const toPrice100 = (entered: number, pieceGrams: number | null) => (pieceGrams ? (entered * 100) / pieceGrams : entered / 10);

/** What some logged items cost. `unpriced`: items whose food has no price (or isn't in My Diet), left out of `cost`.
 *  shortcut: uses today's price, so changing a price also changes past days; store it per log item if that matters. */
export function costOf(items: { foodId: string | null; grams: number }[], foods: { id: string; price100: number | null }[]) {
  let cost = 0;
  let unpriced = 0;
  for (const i of items) {
    const p = foods.find((f) => f.id === i.foodId)?.price100;
    if (p == null) unpriced++;
    else cost += (p * i.grams) / 100;
  }
  return { cost, unpriced };
}
