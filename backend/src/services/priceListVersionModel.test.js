import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePriceListRows, parsePriceListActivation, parsePriceListVersionYear } from './priceListVersionModel.js';

test('infers a price-list year from the effective date and rejects unsafe years', () => {
  assert.equal(parsePriceListVersionYear('', '2026-01-01'), 2026);
  assert.equal(parsePriceListVersionYear('2025', '2026-01-01'), 2025);
  assert.equal(parsePriceListVersionYear('1999', '2026-01-01'), null);
  assert.equal(parsePriceListVersionYear('not-a-year', '2026-01-01'), null);
  assert.equal(parsePriceListVersionYear('2026abc', '2026-01-01'), null);
  assert.equal(parsePriceListVersionYear('', 'not-a-date'), null);
});

test('parses JSON and multipart activation flags consistently', () => {
  assert.equal(parsePriceListActivation(false), false);
  assert.equal(parsePriceListActivation('false'), false);
  assert.equal(parsePriceListActivation('0'), false);
  assert.equal(parsePriceListActivation('true'), true);
  assert.equal(parsePriceListActivation(undefined), true);
});

test('classifies added, changed, unchanged, and removed parts without changing stock data', () => {
  const changes = comparePriceListRows(
    [
      { sku: 'A-1', name: 'Existing', price: 100 },
      { sku: 'A-2', name: 'Removed', price: 200 },
      { sku: 'A-3', name: 'Same', price: 300 },
    ],
    [
      { sku: 'A-1', name: 'Existing', price: 125 },
      { sku: 'A-3', name: 'Same', price: 300 },
      { sku: 'A-4', name: 'New', price: 50 },
    ],
  );

  assert.deepEqual(changes.map((row) => [row.sku, row.status, row.difference]), [
    ['A-1', 'new_price', 25],
    ['A-2', 'removed_from_list', null],
    ['A-3', 'unchanged', 0],
    ['A-4', 'new_part', null],
  ]);
});
