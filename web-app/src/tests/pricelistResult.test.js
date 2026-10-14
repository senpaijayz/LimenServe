import { describe, expect, it } from 'vitest';
import { describePricelistResult } from '../modules/inventory/utils/pricelistResult';

describe('pricelist upload feedback', () => {
  it('clearly reports unchanged prices without duplicate history', () => {
    expect(describePricelistResult({noPriceChanges:true,unchangedCount:10})).toBe('No price changes. 10 prices kept; no duplicate price history saved.');
  });
  it('reports new products and actual price writes separately', () => {
    expect(describePricelistResult({priceRowsWritten:2,newProductsCount:1,unchangedCount:9})).toBe('2 new or changed prices saved. 1 new products added; 9 prices unchanged.');
  });
  it('does not claim a draft changed selling prices', () => {
    expect(describePricelistResult({isActive:false,newProductsCount:1})).toContain('selling prices have not been applied');
  });
});
