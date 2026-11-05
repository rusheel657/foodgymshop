// Food prices: the price of one pack, and the pack's size in grams (or ml).

export const money = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);

type Priced = { id: string; packGrams: number | null; packPrice: number | null };

/** What some logged items cost. `unpriced`: items whose food has no pack size and price (or isn't in My Diet), left out of `cost`.
 *  shortcut: uses today's price, so changing a price also changes past days; store it per log item if that matters. */
export function costOf(items: { foodId: string | null; grams: number }[], foods: Priced[]) {
  let cost = 0;
  let unpriced = 0;
  for (const i of items) {
    const f = foods.find((x) => x.id === i.foodId);
    if (!f?.packGrams || f.packPrice === null) unpriced++;
    else cost += (f.packPrice * i.grams) / f.packGrams;
  }
  return { cost, unpriced };
}

/** What this much of one food costs, or null if it has no price. */
export function priceFor(foodId: string | null, grams: number, foods: Priced[]) {
  const { cost, unpriced } = costOf([{ foodId, grams }], foods);
  return unpriced ? null : cost;
}
