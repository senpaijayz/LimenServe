import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePricelistWorkbook,
  parsePricelistNumber,
  previewPricelistWorksheet,
  readPricelistWorkbook,
} from './pricelistWorkbook.js';

test('detects worksheet-specific headers and grouped current/new prices', () => {
  const workbook = {
    sheets: [{
      name: 'Detailed',
      rows: [
        { rowNumber: 1, cells: ['Mitsubishi price list'] },
        { rowNumber: 2, cells: ['', '', 'CURRENT', 'NEW'] },
        { rowNumber: 3, cells: ['Material', 'Material Description', 'SRP without VAT', 'SRP with VAT'] },
        { rowNumber: 4, cells: ['ABC-1', 'Filter', '100', '134.4'] },
      ],
      merges: [],
    }],
  };
  const { sheets } = analyzePricelistWorkbook(workbook);
  assert.equal(sheets[0].headerRow, 3);
  assert.deepEqual(sheets[0].priceColumns.map(({ period, vatStatus }) => [period, vatStatus]), [
    ['current', 'exclusive'], ['new', 'inclusive'],
  ]);
  assert.equal(sheets[0].category, 'Customer pricelist');
});

test('keeps separate engine-oil price sheets identifiable as per-liter', () => {
  const workbook = {
    sheets: [{ name: 'Engine Oil', rows: [
      { rowNumber: 1, cells: ['Material', 'Material Description', 'Sales Unit', 'NEW SRP with VAT per liter'] },
      { rowNumber: 2, cells: ['MZ320852', 'Engine Oil', 'L', '820.0024'] },
    ], merges: [] }],
  };
  const [sheet] = analyzePricelistWorkbook(workbook).sheets;
  assert.equal(sheet.category, 'Customer engine oil pricing');
  assert.equal(sheet.priceColumns[0].priceBasis, 'per_liter');
  const preview = previewPricelistWorksheet(workbook, {
    sheetName: 'Engine Oil', headerRow: 1, mapping: sheet.mapping,
    priceKind: 'srp', vatStatus: 'inclusive', confirmPriceType: true,
  });
  assert.equal(preview.selection.priceBasis, 'per_liter');
});

test('reports duplicate parts and missing prices without silently dropping them', () => {
  const workbook = {
    sheets: [{ name: 'CSV', rows: [
      { rowNumber: 1, cells: ['PART_NUMBER', 'DESCRIPTION', 'SRP with VAT'] },
      { rowNumber: 2, cells: ['PAABC1', 'Filter', '₱1,234.50'] },
      { rowNumber: 3, cells: ['ABC1', 'Duplicate filter', '1,250'] },
      { rowNumber: 4, cells: ['ABC2', 'Missing price', ''] },
    ], merges: [] }],
  };
  const [sheet] = analyzePricelistWorkbook(workbook).sheets;
  const preview = previewPricelistWorksheet(workbook, {
    sheetName: 'CSV', headerRow: sheet.headerRow, mapping: sheet.mapping,
    priceKind: 'srp', vatStatus: 'inclusive', confirmPriceType: true,
  });
  assert.equal(preview.counts.validRows, 1);
  assert.equal(preview.counts.duplicateRows, 1);
  assert.equal(preview.counts.missingPrices, 1);
  assert.equal(preview.canImport, false);
  assert.equal(preview.items[0].price, 1234.5);
});

test('reads a CSV with quoted delimiters and accepts formatted money safely', () => {
  const workbook = readPricelistWorkbook({
    originalname: 'prices.csv',
    buffer: Buffer.from('Part No,Description,SRP with VAT\nA-1,"Filter, air","PHP 2,500.25"\n'),
  });
  assert.equal(workbook.sheets[0].name, 'CSV');
  assert.equal(workbook.sheets[0].rows[1].cells[1], 'Filter, air');
  assert.equal(parsePricelistNumber('₱2,500.25'), 2500.25);
  assert.equal(parsePricelistNumber('not a price'), null);
  assert.equal(parsePricelistNumber('(100)'), null);
});
