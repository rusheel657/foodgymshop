// Prices shoppers recorded in Open Prices (prices.openfoodfacts.org, free, no key), by barcode.

export type FoundPrice = { price: number; packGrams: number | null; date: string; store: string | null };

type PriceItem = {
  type?: string; price: number; price_is_discounted?: boolean; price_without_discount?: number | null; currency: string; date: string;
  product?: { product_quantity?: number | null; product_quantity_unit?: string | null } | null;
  location?: { osm_brand?: string | null; osm_name?: string | null } | null;
};

/** The newest UK price in an Open Prices response (the full price if it was on offer), or null. */
export function pickPrice(json: unknown): FoundPrice | null {
  const items = ((json ?? {}) as { items?: PriceItem[] }).items ?? [];
  for (const p of items) {
    if (p.type !== 'PRODUCT' || p.currency !== 'GBP' || !(p.price > 0)) continue;
    const q = p.product?.product_quantity;
    const unit = p.product?.product_quantity_unit;
    const price = (p.price_is_discounted && p.price_without_discount) || p.price;
    const packGrams = q && q > 0 && (unit === 'g' || unit === 'ml') ? q : null; // ml counted as g, like the macros
    // Skip typos like 90p entered as £90: over £100 a kg, or over £50 for a pack of unknown size.
    if (packGrams ? (price / packGrams) * 1000 > 100 : price > 50) continue;
    return { price, packGrams, date: p.date, store: p.location?.osm_brand ?? p.location?.osm_name ?? null };
  }
  return null;
}

/** Newest UK price for any of these barcodes. */
export async function findPrice(codes: string[]): Promise<FoundPrice | null> {
  if (!codes.length) return null;
  const q = new URLSearchParams({ product_code__in: codes.join(','), currency: 'GBP', order_by: '-date', size: '10' });
  const res = await fetch(`https://prices.openfoodfacts.org/api/v1/prices?${q}`);
  if (!res.ok) throw new Error(`Open Prices error ${res.status}`);
  return pickPrice(await res.json());
}
