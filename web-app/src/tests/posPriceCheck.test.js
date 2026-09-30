import { describe, expect, it } from 'vitest';
import { checkCartPrices } from '../modules/pos/utils/priceCheck';
describe('POS current retail price check', () => {
  const item = { id: 'p', lineType: 'product', price: 100 };
  it('detects both yearly increases and decreases', () => {
    for (const price of [90, 110]) expect(checkCartPrices([item], [{ productId: 'p', available: true, price }]).changed).toEqual([item]);
  });
  it('never treats a missing price as a free product', () => {
    for (const rows of [[], [{ productId: 'p', available: false, price: null }]]) expect(checkCartPrices([item], rows).unavailable).toEqual([item]);
  });
  it('permits an explicitly configured zero price and ignores service lines', () => {
    expect(checkCartPrices([{ ...item, price: 0 }, { id: 's', lineType: 'service', price: 50 }], [{ productId: 'p', available: true, price: 0 }])).toEqual({ changed: [], unavailable: [] });
  });
});
