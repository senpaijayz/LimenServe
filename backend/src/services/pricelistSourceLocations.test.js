import test from 'node:test';
import assert from 'node:assert/strict';
import { disambiguateSourceLocations } from './pricelistSourceLocations.js';

test('overlay keeps new workbook row and retains every older part', () => {
  const original = [
    { sku: 'OLD', sourceSheet: 'Sheet2', sourceLineNumber: 12, price: 10 },
    { sku: 'NEW', sourceSheet: 'Sheet2', sourceLineNumber: 12, price: 20 },
    { sku: 'OTHER', sourceSheet: 'Sheet2', sourceLineNumber: 13, price: 30 },
  ];
  const result = disambiguateSourceLocations(original, new Set(['NEW']));
  assert.equal(result.adjusted, 1);
  assert.deepEqual(result.items.map((item) => item.sku), ['OLD', 'NEW', 'OTHER']);
  assert.equal(result.items[1].sourceLineNumber, 12);
  assert.equal(result.items[0].sourceLineNumber, 14);
  assert.deepEqual(result.items.map((item) => item.price), [10, 20, 30]);
  assert.equal(original[0].sourceLineNumber, 12);
});
