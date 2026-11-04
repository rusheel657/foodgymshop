import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickPrice } from './food-price.ts';

const item = (patch: object) => ({
  type: 'PRODUCT', price: 4.5, currency: 'GBP', date: '2026-11-02',
  product: { product_quantity: 500, product_quantity_unit: 'g' }, location: { osm_brand: 'Waitrose' }, ...patch,
});

test('newest UK price with its pack size and store', () => {
  assert.deepEqual(pickPrice({ items: [item({ currency: 'EUR', price: 3 }), item({})] }), { price: 4.5, packGrams: 500, date: '2026-11-02', store: 'Waitrose' });
});

test('offers count at full price; unknown pack sizes are left out', () => {
  const p = pickPrice({ items: [item({ price: 3, price_is_discounted: true, price_without_discount: 4, product: { product_quantity: 6, product_quantity_unit: null } })] });
  assert.equal(p?.price, 4);
  assert.equal(p?.packGrams, null);
});

test('skips prices typed in pence', () => {
  assert.equal(pickPrice({ items: [item({ price: 90, product: { product_quantity: 400, product_quantity_unit: 'g' } }), item({ price: 0.9 })] })?.price, 0.9);
});

test('nothing found', () => {
  assert.equal(pickPrice({ items: [] }), null);
  assert.equal(pickPrice(null), null);
});
