import test from 'node:test';
import assert from 'node:assert/strict';
import { annotatePriceListImportError, classifyPriceListItem, comparePriceListRows, parsePriceListActivation, parsePriceListVersionYear } from './priceListVersionModel.js';
import { getPublicErrorResponse } from '../middleware/errorHandling.js';

test('uploads without a category column persist a specific category and classification trace', () => {
  const item = {sku:'MD094120',name:'THERMOSTAT',model:'VARIOUS',price:1624,sourceCategory:null};
  const result = classifyPriceListItem(item);
  assert.equal(result.category,'Cooling & A/C');
  assert.equal(result.classificationVersion,'2026-10-19-v3');
  assert.equal(result.classificationStrategy,'part_context');
  assert.deepEqual(result.classificationTokens,['thermostat']);
  assert.equal(result.price,item.price);
  assert.equal(result.sku,item.sku);
  assert.equal(result.sourceCategory,null);
  assert.equal(item.category,undefined);
});

test('ambiguous upload items retain General Parts without fabricating component data', () => {
  const result=classifyPriceListItem({sku:'PMS-10',name:'PMS KIT NO. 10',price:100});
  assert.equal(result.category,'General Parts & Accessories');
  assert.equal(result.price,100);
});

test('explains atomic import timeouts without exposing SQL details', () => {
  const response = getPublicErrorResponse(annotatePriceListImportError({code:'57014',message:'canceling statement inside private SQL'}));
  assert.equal(response.statusCode,504);
  assert.match(response.body.error,/upload was rolled back/);
  assert.equal(response.body.error.includes('private SQL'),false);
  const unknown = {code:'XX001',message:'private connection information'};
  assert.equal(getPublicErrorResponse(annotatePriceListImportError(unknown)).statusCode,500);
  assert.equal(unknown.publicMessage,undefined);
});

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
