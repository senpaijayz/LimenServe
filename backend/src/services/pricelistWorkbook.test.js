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

test('preserves part number prefixes and reports missing prices without converting them to zero', () => {
  const workbook = {
    sheets: [{ name: 'CSV', rows: [
      { rowNumber: 1, cells: ['PART_NUMBER', 'DESCRIPTION', 'SRP with VAT'] },
      { rowNumber: 2, cells: ['PAABC1', 'Filter', '₱1,234.50'] },
      { rowNumber: 3, cells: ['000ABC1', 'Leading zero filter', '1,250'] },
      { rowNumber: 4, cells: ['ABC2', 'Missing price', ''] },
      { rowNumber: 5, cells: ['ABC3', 'Text price', 'Contact Dealer'] },
    ], merges: [] }],
  };
  const [sheet] = analyzePricelistWorkbook(workbook).sheets;
  const preview = previewPricelistWorksheet(workbook, {
    sheetName: 'CSV', headerRow: sheet.headerRow, mapping: sheet.mapping,
    priceKind: 'srp', vatStatus: 'inclusive', confirmPriceType: true,
  });
  assert.equal(preview.counts.validRows, 2);
  assert.equal(preview.counts.duplicateRows, 0);
  assert.equal(preview.counts.missingPrices, 1);
  assert.equal(preview.counts.invalidPrices, 1);
  assert.equal(preview.canImport, true);
  assert.equal(preview.items[0].price, 1234.5);
  assert.equal(preview.items[0].sku, 'PAABC1');
  assert.equal(preview.items[1].sku, '000ABC1');
  assert.equal(preview.errors[0].sourceValue, '');
  assert.equal(preview.errors[1].sourceValue, 'Contact Dealer');
});

test('deduplicates identical repeated rows but flags conflicting rows for explicit selection', () => {
  const workbook = { sheets: [{ name: 'CSV', rows: [
    { rowNumber: 1, cells: ['PART_NUMBER', 'DESCRIPTION', 'SRP with VAT'] },
    { rowNumber: 2, cells: ['A-001', 'Filter', '100'] },
    { rowNumber: 3, cells: ['A-001', 'Filter', '100'] },
    { rowNumber: 4, cells: ['B-001', 'Oil Filter', '200'] },
    { rowNumber: 5, cells: ['B-001', 'Oil Filter', '250'] },
    { rowNumber: 6, cells: ['C-001', 'Spark Plug', '300'] },
  ], merges: [] }] };
  const [sheet] = analyzePricelistWorkbook(workbook).sheets;
  const preview = previewPricelistWorksheet(workbook, {
    sheetName: 'CSV', headerRow: sheet.headerRow, mapping: sheet.mapping,
    priceKind: 'srp', vatStatus: 'inclusive', confirmPriceType: true,
  });
  assert.equal(preview.counts.validRows, 2);
  assert.equal(preview.counts.duplicateRows, 2);
  assert.equal(preview.counts.conflictingDuplicateGroups, 1);
  assert.equal(preview.canImport, true);
  assert.equal(preview.items.some((item) => item.sku === 'B-001'), false);
  assert.equal(preview.errors.find((row) => row.severity === 'conflict').relatedRows.join(','), '4,5');

  const resolved = previewPricelistWorksheet(workbook, {
    sheetName: 'CSV', headerRow: sheet.headerRow, mapping: sheet.mapping,
    priceKind: 'srp', vatStatus: 'inclusive', confirmPriceType: true,
    duplicateResolutions: { 'B-001': 5 },
  });
  assert.equal(resolved.items.find((item) => item.sku === 'B-001').sourceLineNumber, 5);
  assert.equal(resolved.items.find((item) => item.sku === 'B-001').price, 250);
  assert.equal(resolved.counts.conflictingDuplicateGroups, 0);
});

test('requires confirmation for numeric zero and reports raw source value', () => {
  const workbook = { sheets: [{ name: 'CSV', rows: [
    { rowNumber: 1, cells: ['PART_NUMBER', 'DESCRIPTION', 'SRP with VAT'] },
    { rowNumber: 2, cells: ['A-001', 'Zero price', '0'] },
    { rowNumber: 3, cells: ['B-001', 'Valid price', '1.12E-2'] },
  ], merges: [] }] };
  const [sheet] = analyzePricelistWorkbook(workbook).sheets;
  const needsConfirmation = previewPricelistWorksheet(workbook, {
    sheetName: 'CSV', headerRow: sheet.headerRow, mapping: sheet.mapping,
    priceKind: 'srp', vatStatus: 'inclusive', confirmPriceType: true,
  });
  assert.equal(needsConfirmation.counts.zeroPrices, 1);
  assert.equal(needsConfirmation.items.some((item) => item.sku === 'A-001'), false);
  assert.equal(needsConfirmation.errors[0].sourceValue, '0');

  const confirmed = previewPricelistWorksheet(workbook, {
    sheetName: 'CSV', headerRow: sheet.headerRow, mapping: sheet.mapping,
    priceKind: 'srp', vatStatus: 'inclusive', confirmPriceType: true, confirmZeroPrices: true,
  });
  assert.equal(confirmed.items.find((item) => item.sku === 'A-001').price, 0);
  assert.equal(confirmed.items.find((item) => item.sku === 'B-001').price, 0.01);
  assert.equal(confirmed.counts.roundingWarnings, 1);
  assert.match(confirmed.warnings[0], /1\.12E-2.*₱0\.01/);
  assert.equal(parsePricelistNumber('1.12E-2'), 0.0112);
});

test('does not silently round a positive value to a zero stored price', () => {
  const workbook = { sheets: [{ name: 'CSV', rows: [
    { rowNumber: 1, cells: ['PART_NUMBER', 'DESCRIPTION', 'SRP with VAT'] },
    { rowNumber: 2, cells: ['A-001', 'Too small to store', '0.004'] },
  ], merges: [] }] };
  const [sheet] = analyzePricelistWorkbook(workbook).sheets;
  const preview = previewPricelistWorksheet(workbook, {
    sheetName: 'CSV', headerRow: sheet.headerRow, mapping: sheet.mapping,
    priceKind: 'srp', vatStatus: 'inclusive', confirmPriceType: true,
  });
  assert.equal(preview.items.length, 0);
  assert.equal(preview.errors[0].sourceValue, '0.004');
  assert.equal(preview.errors[0].issue, 'below_cent_precision');
  assert.equal(preview.canImport, false);
});

test('recommends the customer SRP worksheet and detects an effective date in the source title', async () => {
  const workbook = { sheets: [
    { name: 'Detailed', rows: [
      { rowNumber: 1, cells: ['Material', 'Description', 'DNP', 'NEW SRP without VAT'] },
      { rowNumber: 2, cells: ['A-001', 'Filter', '50', '100'] },
    ], merges: [] },
    { name: 'Customer Pricelist', rows: [
      { rowNumber: 1, cells: ['PART_NUMBER', 'DESCRIPTION', 'Customer SRP with VAT'] },
      { rowNumber: 2, cells: ['A-001', 'Filter', '112'] },
    ], merges: [] },
  ] };
  assert.equal(analyzePricelistWorkbook(workbook).recommendedSheetName, 'Customer Pricelist');
  const { inferPricelistEffectiveDate } = await import('./pricelistWorkbook.js');
  assert.equal(inferPricelistEffectiveDate('New Pricelist Effective October 1 2025.xlsx', workbook), '2025-10-01');
  assert.equal(inferPricelistEffectiveDate('effective 2025-10-01.csv', workbook), '2025-10-01');
  assert.equal(inferPricelistEffectiveDate('Dealer Pricelist_February 1, 2024 (1).xlsx'), '2024-02-01');
  assert.equal(inferPricelistEffectiveDate('Price List_October 1, 2026_For Customer.xlsx'), '2026-10-01');
  assert.equal(inferPricelistEffectiveDate('Inventory_October 1, 2026.xlsx'), null);
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
  assert.equal(parsePricelistNumber(''), null);
  assert.equal(parsePricelistNumber('(100)'), null);
});
