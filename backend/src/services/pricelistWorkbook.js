import { inflateRawSync } from 'node:zlib';
import path from 'node:path';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_XML_BYTES = 128 * 1024 * 1024;
const MAX_ROWS = 200000;
const MAX_COLUMNS = 256;
const fieldAliases = {
  sku: /^(partnumber|partno|part|sku|material|materialnumber|itemcode|productcode|code)$/,
  name: /^(description|name|materialdescription|partdescription|partname|itemdescription|productdescription)$/,
  model: /^(model|modelcode|modelname|vehicle|application)$/,
  uom: /^(salesunit|unit|uom|unitofmeasure)$/,
  pcc: /^pcc$/,
  category: /^(category|sourcecategory|group)$/,
};
const clean = (value) => String(value ?? '').trim();
const normalized = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');

function fail(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function xmlText(value = '') {
  return value.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (_all, hex, dec, named) => {
    if (hex || dec) {
      const code = Number.parseInt(hex || dec, hex ? 16 : 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[named.toLowerCase()];
  });
}

function attributes(xml) {
  return Object.fromEntries([...xml.matchAll(/([\w:.-]+)\s*=\s*["']([^"']*)["']/g)]
    .map((match) => [match[1], xmlText(match[2])]));
}

function unzipEntries(buffer) {
  let footer = -1;
  for (let cursor = buffer.length - 22; cursor >= Math.max(0, buffer.length - 65557); cursor -= 1) {
    if (buffer.readUInt32LE(cursor) === 0x06054b50 && cursor + 22 + buffer.readUInt16LE(cursor + 20) === buffer.length) {
      footer = cursor;
      break;
    }
  }
  if (footer < 0) fail('This XLSX file is damaged or is not an Excel workbook. Save it as .xlsx and upload it again.');
  const count = buffer.readUInt16LE(footer + 10);
  let cursor = buffer.readUInt32LE(footer + 16);
  if (count > 2048 || buffer.readUInt16LE(footer + 4) !== 0 || cursor >= footer) fail('This Excel archive format is not supported. Save a standard .xlsx workbook.');
  const entries = new Map();
  let totalSize = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > footer || buffer.readUInt32LE(cursor) !== 0x02014b50) fail('The Excel archive directory is damaged.');
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const offset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    totalSize += size;
    if ((flags & 1) || size > MAX_XML_BYTES || totalSize > 256 * 1024 * 1024) fail('The workbook is encrypted or too large to expand safely. Upload a smaller, unencrypted workbook.');
    if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) fail('The Excel archive contains an invalid entry.');
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    if (start + compressedSize > cursor || ![0, 8].includes(method)) fail('The workbook uses an unsupported or damaged archive entry.');
    entries.set(name, () => {
      const data = buffer.subarray(start, start + compressedSize);
      const decoded = method === 0 ? data : inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES });
      if (decoded.length !== size) fail('The Excel archive entry size does not match its contents.');
      return decoded.toString('utf8');
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return (name) => entries.get(name)?.() || '';
}

function cellPosition(ref) {
  const match = /^([A-Z]+)(\d+)$/i.exec(ref || '');
  if (!match) return null;
  const column = [...match[1].toUpperCase()].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  return { column, row: Number(match[2]) };
}

function readXlsx(buffer) {
  const entry = unzipEntries(buffer);
  const workbookXml = entry('xl/workbook.xml');
  const relationshipXml = entry('xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relationshipXml) fail('This file is missing its Excel workbook structure.');
  const stylesXml = entry('xl/styles.xml');
  const numberFormats = new Map([...stylesXml.matchAll(/<numFmt\b([^>]*)\/?\s*>/g)]
    .map((match) => attributes(match[1])).map((format) => [Number(format.numFmtId), format.formatCode]));
  const cellFormatsXml = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '';
  const cellNumberFormats = [...cellFormatsXml.matchAll(/<xf\b([^>]*)\/?\s*>/g)]
    .map((match) => Number(attributes(match[1]).numFmtId || 0));
  const relations = new Map([...relationshipXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)]
    .map((match) => attributes(match[1])).filter((rel) => rel.TargetMode !== 'External')
    .map((rel) => [rel.Id, rel.Target.startsWith('/') ? rel.Target.slice(1) : path.posix.normalize(`xl/${rel.Target}`)]));
  const strings = [...entry('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)]
    .map((match) => [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((text) => xmlText(text[1])).join(''));
  const sheets = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].map((match) => {
    const sheet = attributes(match[1]);
    const target = relations.get(sheet['r:id']);
    if (!target?.startsWith('xl/')) fail(`Worksheet ${sheet.name} has an unsupported location.`);
    const xml = entry(target);
    if (!xml) fail(`Worksheet ${sheet.name} could not be read.`);
    const rows = [];
    let cellCount = 0;
    for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNumber = Number(attributes(rowMatch[1]).r) || rows.length + 1;
      if (rows.length >= MAX_ROWS) fail(`Worksheet ${sheet.name} exceeds ${MAX_ROWS.toLocaleString()} rows.`);
      const cells = [];
      const cellTypes = [];
      for (const matchCell of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = attributes(matchCell[1]);
        const column = cellPosition(attrs.r)?.column ?? cells.length;
        if (column >= MAX_COLUMNS) continue;
        cellCount += 1;
        if (cellCount > 3000000) fail(`Worksheet ${sheet.name} has too many populated cells.`);
        const body = matchCell[2] || '';
        const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
        const inline = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join('');
        const cellType = attrs.t || 'n';
        let value = attrs.t === 's' ? strings[Number(raw)] ?? '' : raw === undefined ? inline : xmlText(raw);
        // Excel may store a part number as a number while displaying leading
        // zeroes through a custom 000... format. Preserve those visible digits.
        const styleIndex = Number(attrs.s || 0);
        const formatCode = numberFormats.get(cellNumberFormats[styleIndex]) || '';
        if (cellType === 'n' && /^0+$/.test(formatCode) && /^\d+$/.test(String(value))) {
          value = String(value).padStart(formatCode.length, '0');
        }
        cells[column] = clean(value);
        cellTypes[column] = cellType;
      }
      rows.push({ rowNumber, cells, cellTypes });
    }
    const merges = [...xml.matchAll(/<mergeCell\b([^>]*)\/?\s*>/g)].map((matchMerge) => {
      const [a, b] = (attributes(matchMerge[1]).ref || '').split(':').map(cellPosition);
      return a && b ? { startRow: a.row, endRow: b.row, startColumn: a.column, endColumn: b.column } : null;
    }).filter(Boolean);
    return { name: sheet.name, rows, merges };
  });
  if (!sheets.length || sheets.length > 100) fail('Choose a workbook with between 1 and 100 worksheets.');
  return { sheets };
}

function readCsv(buffer) {
  let text = buffer[0] === 0xff && buffer[1] === 0xfe ? buffer.subarray(2).toString('utf16le') : buffer.toString('utf8').replace(/^\ufeff/, '');
  if (text.includes('\0')) fail('This CSV encoding is not supported. Save the file as UTF-8 CSV.');
  // Count delimiters outside quoted fields in the first non-empty records.
  const scores = new Map([[',', 0], [';', 0], ['\t', 0]]);
  let quoted = false;
  for (let i = 0; i < Math.min(text.length, 8192); i += 1) {
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && scores.has(text[i])) scores.set(text[i], scores.get(text[i]) + 1);
  }
  const delimiter = [...scores].sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let cells = [], cell = '', rowNumber = 1, sourceLine = 1;
  quoted = false;
  const finishRow = () => {
    cells.push(cell);
    if (cells.length > MAX_COLUMNS) fail('The CSV contains too many columns.');
    rows.push({ rowNumber, cells });
    if (rows.length > MAX_ROWS) fail('The CSV contains too many rows.');
    cells = []; cell = ''; rowNumber = sourceLine + 1;
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (quoted || !cell.trim()) quoted = !quoted;
      else fail(`CSV row ${sourceLine} contains an unexpected quote. Quote the entire field.`);
    } else if (char === delimiter && !quoted) { cells.push(cell); cell = ''; }
    else if (char === '\r' || char === '\n') {
      if (!quoted) finishRow(); else cell += '\n';
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      sourceLine += 1;
    } else cell += char;
  }
  if (quoted) fail(`CSV row ${rowNumber} has an unclosed quoted field.`);
  if (cell || cells.length) finishRow();
  return { sheets: [{ name: 'CSV', rows, merges: [] }] };
}

export function readPricelistWorkbook(file) {
  if (!Buffer.isBuffer(file?.buffer) || !file.buffer.length) fail('Upload a non-empty Excel or CSV pricelist.');
  if (file.buffer.length > MAX_FILE_BYTES) fail('The pricelist is larger than 20 MB.');
  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  if (extension === '.xls') fail('Legacy .xls files are not supported. Save the original as .xlsx or CSV before uploading.');
  if (extension === '.xlsx') return readXlsx(file.buffer);
  if (extension === '.csv') return readCsv(file.buffer);
  fail('Upload an .xlsx or .csv pricelist.');
}

function headerLabels(sheet, row) {
  const lookup = new Map(sheet.rows.filter((candidate) => candidate.rowNumber <= row.rowNumber && candidate.rowNumber >= row.rowNumber - 3)
    .map((candidate) => [candidate.rowNumber, candidate.cells]));
  const width = Math.min(MAX_COLUMNS, Math.max(row.cells.length, ...[...lookup.values()].map((cells) => cells.length)));
  const labels = [];
  const mergedValue = (rowNumber, column) => {
    const merge = sheet.merges.find((range) => range.startRow <= rowNumber && range.endRow >= rowNumber && range.startColumn <= column && range.endColumn >= column);
    return merge ? clean(lookup.get(merge.startRow)?.[merge.startColumn]) : clean(lookup.get(rowNumber)?.[column]);
  };
  for (let column = 0; column < width; column += 1) {
    const label = mergedValue(row.rowNumber, column);
    const parents = [];
    for (let offset = 3; offset >= 1; offset -= 1) {
      let parent = mergedValue(row.rowNumber - offset, column);
      if (!parent) {
        const priorCells = lookup.get(row.rowNumber - offset) || [];
        for (let previous = column - 1; previous >= 0; previous -= 1) {
          if (clean(priorCells[previous])) {
            if (/^(current|new|old)$/i.test(clean(priorCells[previous]))) parent = clean(priorCells[previous]);
            break;
          }
        }
      }
      if (/^(current|new|old|srp|dnp|(?:current|new|old)\s+(?:srp|dnp))$/i.test(parent) && parent !== label && !parents.includes(parent)) parents.push(parent);
    }
    labels.push([...parents, label].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim());
  }
  return labels;
}

export function describePriceColumn(label, index) {
  const text = clean(label).toLowerCase().replace(/\s+/g, ' ');
  const key = normalized(text);
  if (/increase|difference|variance|change|discount|decrease|percent|%/.test(text)) return null;
  if (!/srp|dnp|price|amount/.test(key)) return null;
  const vatStatus = /withoutvat|wovat|exvat|exclusive|excludingvat|beforevat/.test(key) ? 'exclusive'
    : /withvat|wvat|inclusive|includingvat|vatin/.test(key) ? 'inclusive' : 'unknown';
  const priceKind = /dnp|dealer(net|purchase)/.test(key) ? 'dnp' : /srp|retail|selling|customer/.test(key) ? 'srp' : 'unknown';
  const period = /\bnew\b/.test(text) ? 'new' : /\bold\b/.test(text) ? 'old' : /\bcurrent\b/.test(text) ? 'current' : null;
  const priceBasis = /per\s*(lit(?:er|re)|l\b)|\/\s*(lit(?:er|re)|l\b)/.test(text) ? 'per_liter' : 'per_unit';
  return { index, label, vatStatus, priceKind, period, priceBasis };
}

function detectSheet(sheet, explicitHeaderRow) {
  let best = null;
  const rows = explicitHeaderRow ? sheet.rows.filter((row) => row.rowNumber === Number(explicitHeaderRow)) : sheet.rows.slice(0, 100);
  for (const row of rows) {
    const labels = headerLabels(sheet, row);
    const mapping = Object.fromEntries(Object.entries(fieldAliases).map(([key, regex]) => [key, labels.findIndex((label) => regex.test(normalized(label)))]));
    const priceColumns = labels.map(describePriceColumn).filter(Boolean);
    const score = (mapping.sku >= 0 ? 20 : 0) + (mapping.name >= 0 ? 5 : 0) + priceColumns.length * 2;
    if (!best || score > best.score) best = { score, row, labels, mapping, priceColumns };
  }
  if (!best) return { name: sheet.name, headerRow: null, columns: [], mapping: {}, priceColumns: [], category: 'Unrecognized worksheet', rowCount: 0, status: 'mapping_required' };
  const preferredPrices = [...best.priceColumns].sort((a, b) => priceScore(b) - priceScore(a));
  best.mapping.price = preferredPrices[0]?.index ?? -1;
  const oil = best.priceColumns.some((column) => column.priceBasis === 'per_liter') || /engine\s*oil/i.test(sheet.name);
  const detailed = best.priceColumns.some((column) => column.priceKind === 'dnp');
  const rowCount = sheet.rows.filter((row) => row.rowNumber > best.row.rowNumber && row.cells.some((value) => clean(value))).length;
  return {
    name: sheet.name, headerRow: best.row.rowNumber,
    columns: best.labels.map((label, index) => ({ index, label: label || `Column ${index + 1}` })),
    mapping: best.mapping, priceColumns: best.priceColumns,
    category: oil ? (detailed ? 'Detailed engine oil pricing' : 'Customer engine oil pricing') : detailed ? 'Detailed pricelist' : 'Customer pricelist',
    rowCount, status: best.mapping.sku >= 0 && best.priceColumns.length ? 'ready' : 'mapping_required',
  };
}

function priceScore(column) {
  return (column.priceKind === 'srp' ? 100 : column.priceKind === 'dnp' ? -100 : 0)
    + (column.period === 'new' ? 30 : column.period === 'old' ? -30 : 0)
    + (column.vatStatus === 'inclusive' ? 10 : 0);
}

export function analyzePricelistWorkbook(workbook) {
  const sheets = workbook.sheets.map((sheet) => detectSheet(sheet));
  const ranked = sheets.map((sheet) => {
    const selected = sheet.priceColumns?.find((column) => column.index === sheet.mapping?.price);
    if (sheet.status !== 'ready' || selected?.priceKind !== 'srp' || selected?.priceBasis === 'per_liter') return { sheet, score: -1 };
    return {
      sheet,
      score: (sheet.category === 'Customer pricelist' ? 40 : 0)
        + (/customer|retail|srp/i.test(sheet.name) ? 20 : 0)
        + (selected.vatStatus === 'inclusive' ? 12 : 0)
        + (selected.period === 'new' ? 6 : 0)
        + Math.min(sheet.rowCount, 100000) / 100000,
    };
  }).filter((entry) => entry.score >= 0).sort((left, right) => right.score - left.score);
  const recommendedSheetName = ranked.length === 1 || (ranked.length > 1 && ranked[0].score > ranked[1].score)
    ? ranked[0].sheet.name : null;
  return { sheets, recommendedSheetName };
}

export function inferPricelistEffectiveDate(fileName, workbook) {
  const sourceName = clean(fileName).replaceAll('_', ' ');
  const worksheetText = (workbook?.sheets || []).flatMap((sheet) => (sheet.rows || []).slice(0, 12)
    .map((row) => row.cells?.join(' ') || '')).join(' ');
  const explicitlyDated = [sourceName, worksheetText]
    .filter((source) => /(?:effective|effectivity|valid\s+from|pricing\s+date)/i.test(source));
  // Some vendor files put the effective date in a price-list filename
  // without saying "effective". Prefer an explicit date when one is present.
  const sources = /\bprice\s*list\b/i.test(sourceName)
    ? [...explicitlyDated, sourceName] : explicitlyDated;
  for (const source of sources) {
    const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(source);
    let year, month, day;
    if (iso) [, year, month, day] = iso;
    if (!iso) {
      const monthNames = 'january|february|march|april|may|june|july|august|september|october|november|december';
      const monthFirst = new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})\\b`, 'i').exec(source);
      const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})[,]?\\s+(20\\d{2})\\b`, 'i').exec(source);
      const match = monthFirst || dayFirst;
      if (match) {
        const monthLabel = monthFirst ? match[1] : match[2];
        year = monthFirst ? match[3] : match[4];
        month = String('january february march april may june july august september october november december'.split(' ').indexOf(monthLabel.toLowerCase()) + 1);
        day = monthFirst ? match[2] : match[1];
      }
    }
    if (year && month && day) {
      const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const parsed = new Date(`${candidate}T00:00:00Z`);
      if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate) return candidate;
    }
  }
  return null;
}

export function parsePricelistNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const original = clean(value);
  if (!original) return null;
  const text = original.replace(/^(?:PHP|₱|PESO)\s*/i, '').replace(/\s*(?:PHP|₱|PESO)$/i, '').replace(/\s/g, '');
  // Thousands separators must be correctly grouped; arbitrary letters and
  // accounting negatives are errors, never coerced into zero or positive prices.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) return null;
  const number = Number(text.replace(/,/g, ''));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizedSku(value) {
  // A pricelist part number is an identifier, not a barcode. Preserve leading
  // zeroes and prefixes (including "PA") instead of collapsing distinct SKUs.
  return clean(value).normalize('NFKC').toUpperCase();
}

export function previewPricelistWorksheet(workbook, options = {}) {
  const sheet = workbook.sheets.find((candidate) => candidate.name === options.sheetName);
  if (!sheet) fail('Choose one of the detected worksheets before previewing.');
  const detection = detectSheet(sheet, options.headerRow);
  const mapping = { ...detection.mapping, ...options.mapping };
  for (const [key, value] of Object.entries(mapping)) {
    mapping[key] = value === null || value === '' ? -1 : Number(value);
    if (!Number.isInteger(mapping[key]) || mapping[key] < -1 || mapping[key] >= MAX_COLUMNS) fail(`Choose a valid ${key} column.`);
  }
  if (!(detection.headerRow > 0) || mapping.sku < 0 || mapping.price < 0) fail('Map the header row, part number, and price columns before previewing.');
  if (mapping.sku === mapping.price) fail('Part number and price must use different columns.');
  const selectedLabel = detection.columns[mapping.price]?.label || `Column ${mapping.price + 1}`;
  const detectedPrice = describePriceColumn(selectedLabel, mapping.price);
  const price = { index: mapping.price, label: selectedLabel, vatStatus: 'unknown', priceKind: 'unknown', priceBasis: 'per_unit', period: null, ...detectedPrice };
  const warnings = [];
  const blockers = [];
  if (detectedPrice?.priceKind && ['srp', 'dnp'].includes(options.priceKind) && options.priceKind !== detectedPrice.priceKind) {
    blockers.push(`The selected column is labeled ${detectedPrice.priceKind.toUpperCase()}; the manual price type does not match.`);
  }
  if (detectedPrice?.vatStatus && ['inclusive', 'exclusive'].includes(options.vatStatus) && options.vatStatus !== detectedPrice.vatStatus) {
    blockers.push(`The selected column is labeled ${detectedPrice.vatStatus === 'inclusive' ? 'VAT-inclusive' : 'VAT-exclusive'}; the manual VAT status does not match.`);
  }
  if (detectedPrice?.priceBasis && ['per_liter', 'per_unit'].includes(options.priceBasis) && options.priceBasis !== detectedPrice.priceBasis) {
    blockers.push(`The selected column indicates ${detectedPrice.priceBasis === 'per_liter' ? 'per-liter' : 'per-item'} pricing; the manual unit selection does not match.`);
  }
  if (price.vatStatus === 'unknown' && ['inclusive', 'exclusive'].includes(options.vatStatus)) price.vatStatus = options.vatStatus;
  if (price.priceKind === 'unknown' && options.priceKind === 'srp') price.priceKind = 'srp';
  if (price.priceBasis === 'per_unit' && options.priceBasis === 'per_liter') price.priceBasis = 'per_liter';
  if (/increase|difference|variance|change|discount|decrease|percent|%/i.test(selectedLabel)) blockers.push('An increase or percentage column cannot be used as the selling price.');
  if (price.priceKind === 'dnp') blockers.push('DNP is a dealer cost, not a customer selling price. Select an SRP column.');
  if (price.priceKind === 'unknown' || price.vatStatus === 'unknown') blockers.push('Confirm whether this column is customer SRP and whether VAT is included.');
  if ((!detectedPrice || detectedPrice.vatStatus === 'unknown' || detectedPrice.priceKind === 'unknown') && options.confirmPriceType !== true) blockers.push('Confirm the selected pricing type before importing an uncertain column mapping.');
  const vatRate = Number(options.vatRate);
  if (price.vatStatus === 'exclusive') {
    const explicitInclusive = detection.priceColumns.find((column) => column.vatStatus === 'inclusive' && column.priceKind === price.priceKind && column.period === price.period && column.priceBasis === price.priceBasis);
    if (explicitInclusive) blockers.push(`This worksheet already provides ${explicitInclusive.label}. Select that column instead of recalculating VAT.`);
    else if (options.confirmPriceType !== true || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) blockers.push('Confirm conversion from VAT-exclusive SRP using the configured VAT rate before importing.');
    else warnings.push(`VAT-exclusive SRP will be converted once using the configured ${(vatRate * 100).toFixed(2)}% VAT rate. Source values are retained in the original workbook.`);
  }
  if (price.priceBasis === 'per_liter') {
    warnings.push('These are prices per liter. They must not replace per-container prices. Product units must be checked before activation.');
    if (options.confirmPriceType !== true) blockers.push('Confirm that the selected prices are per liter before importing.');
  }
  const errors = [];
  const items = [];
  const skuRows = new Map();
  const seenSkuRows = new Map();
  const counts = { totalRows: 0, validRows: 0, invalidRows: 0, duplicateRows: 0, conflictingDuplicateGroups: 0, missingPartNumbers: 0, missingPrices: 0, invalidPrices: 0, zeroPrices: 0, blankRows: 0, vatInconsistencies: 0, roundingWarnings: 0 };
  const pairColumn = detection.priceColumns.find((column) => column.index !== price.index && column.priceKind === price.priceKind && column.period === price.period && column.priceBasis === price.priceBasis && column.vatStatus !== price.vatStatus && ['exclusive', 'inclusive'].includes(column.vatStatus));
  for (const row of sheet.rows.filter((candidate) => candidate.rowNumber > detection.headerRow)) {
    if (!row.cells.some((value) => clean(value))) { counts.blankRows += 1; continue; }
    counts.totalRows += 1;
    const originalSku = clean(row.cells[mapping.sku]);
    const sku = normalizedSku(originalSku);
    const name = clean(row.cells[mapping.name]);
    const sourcePriceValue = String(row.cells[mapping.price] ?? '');
    const sourcePrice = parsePricelistNumber(sourcePriceValue);
    const reasons = [];
    const seenCount = sku ? (seenSkuRows.get(sku) || 0) : 0;
    if (seenCount > 0) counts.duplicateRows += 1;
    if (sku) seenSkuRows.set(sku, seenCount + 1);
    if (!sku) { counts.missingPartNumbers += 1; reasons.push('Missing part number'); }
    if (sourcePrice === null) {
      if (!sourcePriceValue.trim()) {
        counts.missingPrices += 1;
        reasons.push('Price is blank');
      } else {
        counts.invalidPrices += 1;
        reasons.push('The uploaded price contains text or an unsupported number format');
      }
    }
    const unconfirmedZero = sourcePrice === 0 && options.confirmZeroPrices !== true;
    if (unconfirmedZero) {
      counts.zeroPrices += 1;
      reasons.push('The price is zero and needs administrator confirmation');
    }
    if (reasons.length) {
      counts.invalidRows += 1;
      errors.push({ rowNumber: row.rowNumber, sku: originalSku, name, sourceValue: sourcePriceValue, sourceColumn: selectedLabel,
        reason: reasons.join('; '), issue: sourcePrice === 0 ? 'zero_confirmation' : !sourcePriceValue.trim() ? 'missing_price' : 'invalid_price',
        suggestion: sourcePrice === 0 ? 'Confirm this is an intentional zero price, or correct the workbook value.' : !sourcePriceValue.trim() ? 'Enter a price. The current price will be preserved for an existing part.' : 'Replace the text with a numeric price. The current price will be preserved for an existing part.' });
      continue;
    }
    if (pairColumn && Number.isFinite(vatRate)) {
      const paired = parsePricelistNumber(row.cells[pairColumn.index]);
      const inclusive = price.vatStatus === 'inclusive' ? sourcePrice : paired;
      const exclusive = price.vatStatus === 'exclusive' ? sourcePrice : paired;
      if (inclusive !== null && exclusive !== null && Math.abs(inclusive - exclusive * (1 + vatRate)) > 0.02) {
        counts.vatInconsistencies += 1;
        errors.push({ rowNumber: row.rowNumber, sku: originalSku, name, severity: 'warning', reason: 'VAT-inclusive and VAT-exclusive values do not reconcile at the configured rate', suggestion: 'Check the workbook prices. The explicitly selected price will be preserved; no VAT correction is automatic.' });
      }
    }
    const storedPrice = Math.round(((price.vatStatus === 'exclusive' && Number.isFinite(vatRate)
      ? sourcePrice * (1 + vatRate)
      : sourcePrice) + Number.EPSILON) * 100) / 100;
    if (sourcePrice > 0 && storedPrice === 0) {
      counts.invalidRows += 1;
      counts.invalidPrices += 1;
      errors.push({ rowNumber: row.rowNumber, sku: originalSku, name, sourceValue: sourcePriceValue, sourceColumn: selectedLabel,
        reason: 'The numeric price rounds to ₱0.00 at the database’s two-decimal precision', issue: 'below_cent_precision',
        suggestion: 'Verify or correct this value. The existing price will be preserved until a usable price is supplied.' });
      continue;
    }
    if (storedPrice !== sourcePrice) {
      counts.roundingWarnings += 1;
      warnings.push(`Excel row ${row.rowNumber} (${originalSku}): source value ${sourcePriceValue} will be stored as ₱${storedPrice.toFixed(2)} because prices are saved to two decimal places.`);
    }
    const item = { sku, originalSku, name: name || null, model: clean(row.cells[mapping.model]) || null, uom: clean(row.cells[mapping.uom]) || null,
      pcc: clean(row.cells[mapping.pcc]) || null, sourceCategory: clean(row.cells[mapping.category]) || null,
      sourceSheet: sheet.name, sourceLineNumber: row.rowNumber, sourcePrice, sourcePriceValue,
      // Versioned retail prices are stored as numeric(12,2); preview the exact
      // value that the database will save, including explicitly selected VAT.
      price: storedPrice,
      priceBasis: price.priceBasis };
    const group = skuRows.get(sku) || [];
    group.push(item);
    skuRows.set(sku, group);
  }
  const duplicateGroups = [];
  for (const [sku, group] of skuRows) {
    if (group.length === 1) {
      items.push(group[0]);
      continue;
    }
    const signature = (item) => JSON.stringify([
      item.price, item.name?.trim().toUpperCase() || '', item.model?.trim().toUpperCase() || '',
      item.uom?.trim().toUpperCase() || '', item.pcc?.trim().toUpperCase() || '',
      item.sourceCategory?.trim().toUpperCase() || '',
    ]);
    const signatures = new Set(group.map(signature));
    const rows = group.map((item) => ({ rowNumber: item.sourceLineNumber, sourcePrice: item.sourcePriceValue, price: item.price, name: item.name }));
    if (signatures.size === 1) {
      items.push(group[0]);
      errors.push({ severity: 'warning', rowNumber: group[1].sourceLineNumber, sku: group[0].originalSku, name: group[0].name, sourceValue: group[1].sourcePriceValue, sourceColumn: selectedLabel, relatedRows: rows.map((entry) => entry.rowNumber), reason: `Identical repeated part number; row ${group[0].sourceLineNumber} will be used once`, suggestion: 'No action needed. The repeated row will not create another product.' });
      continue;
    }
    const selectedRow = Number(options.duplicateResolutions?.[sku]);
    const chosen = group.find((item) => item.sourceLineNumber === selectedRow);
    duplicateGroups.push({ sku, rows, selectedRow: chosen?.sourceLineNumber ?? null });
    if (chosen) {
      items.push(chosen);
      errors.push({ severity: 'warning', rowNumber: chosen.sourceLineNumber, sku: chosen.originalSku, name: chosen.name, sourceValue: chosen.sourcePriceValue, sourceColumn: selectedLabel, relatedRows: rows.map((entry) => entry.rowNumber), reason: `Selected row ${chosen.sourceLineNumber}; other records for this part were skipped`, suggestion: 'Review the chosen row. The other rows will not be imported.' });
    } else {
      counts.conflictingDuplicateGroups += 1;
      counts.invalidRows += group.length;
      errors.push({ severity: 'conflict', rowNumber: group[0].sourceLineNumber, sku: group[0].originalSku, name: group[0].name, sourceValue: group.map((entry) => entry.sourcePriceValue).join(' | '), sourceColumn: selectedLabel, relatedRows: rows.map((entry) => entry.rowNumber), candidates: rows, reason: `Conflicting rows for this part number (${rows.map((entry) => entry.rowNumber).join(', ')})`, suggestion: 'Choose the correct Excel row. Until then, an existing price will be preserved.' });
    }
  }
  counts.validRows = items.length;
  if (!items.length) blockers.push('No valid product prices were found in the selected worksheet.');
  return { items, errors, duplicateGroups, warnings, blockers, canImport: blockers.length === 0 && items.length > 0, counts,
    selection: { sheetName: sheet.name, headerRow: detection.headerRow, mapping, category: detection.category, ...price, confirmPriceType: options.confirmPriceType === true } };
}
