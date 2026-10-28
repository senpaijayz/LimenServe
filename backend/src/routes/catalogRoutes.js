import { Router } from 'express';
import multer from 'multer';
import zlib from 'node:zlib';
import { supabaseAdmin } from '../config/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { clearPublicResponseCache } from '../middleware/cache.js';
import { analyzeSupplierInvoiceImage } from '../services/invoiceOcrService.js';
import { callRpc } from '../services/supabaseRpc.js';
import { mapStockReceiptError, receiveCatalogStock, receiveSupplierInvoiceStock, requireIdempotencyKey } from '../services/stockReceipt.js';
import { annotatePriceListImportError, classifyPriceListItem, parsePriceListActivation, parsePriceListVersionYear } from '../services/priceListVersionModel.js';
import { selectByInChunks } from '../utils/supabaseBatchSelect.js';
import { createPriceHistoryRouter } from './priceHistoryRoutes.js';
import { applyEstimatePricelistScope, getActiveEstimatePricelist } from '../services/estimatePricelistScope.js';
import inventoryClassifier from '../../../scripts/lib/inventory-classifier.cjs';
import publishedPackageRoutes from './publishedPackageRoutes.js';
import replenishmentRoutes from './replenishmentRoutes.js';

const { CLASSIFIER_VERSION, classifyInventoryItem } = inventoryClassifier;

const router = Router();
router.use(replenishmentRoutes);
router.use(publishedPackageRoutes);
router.use(createPriceHistoryRouter(supabaseAdmin));
const invoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter(_req, file, callback) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.mimetype || '')) {
      callback(new Error('Upload a JPG, PNG, or WEBP invoice image.'));
      return;
    }

    callback(null, true);
  },
});
const priceListUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

function handlePriceListUpload(req, res, next) {
  priceListUpload.single('priceList')(req, res, (uploadError) => {
    if (uploadError) {
      uploadError.statusCode = uploadError.statusCode || 400;
      uploadError.message = uploadError.code === 'LIMIT_FILE_SIZE'
        ? 'The price list file is too large. Upload a file up to 20 MB.'
        : uploadError.message || 'The price list upload could not be read.';
      next(uploadError);
      return;
    }

    next();
  });
}
const PRODUCT_CATALOG_CACHE_TTL_MS = 30 * 60 * 1000;
const CATALOG_SUMMARY_CACHE_TTL_MS = 30 * 1000;
const VEHICLE_PRICELIST_CANDIDATE_LIMIT = 8000;
const PRICE_LIST_DB_BATCH_SIZE = 1000;
const PRICE_LIST_LOOKUP_BATCH_SIZE = 250;
const PRICE_LIST_CHANGE_PREVIEW_LIMIT = 500;
const SERVICE_CATALOG_CACHE_TTL_MS = 30 * 60 * 1000;
const VEHICLE_FITMENT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const PRODUCT_BARCODE_SUFFIX = '0001';
const PRODUCT_BARCODE_VENDOR_PREFIXES = ['PA'];
const MODEL_YEAR_LOOKAHEAD = 1;
const GENERAL_FITMENT_TERMS = ['various', 'universal', 'general', 'accessories'];

function isPrivateSchemaAccessError(error) {
  const message = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].filter(Boolean).join(' ').toLowerCase();

  return message.includes('invalid schema')
    || message.includes('schema must be one of')
    || message.includes('not included in the schema cache')
    || message.includes('relation "app.')
    || message.includes('relation app.')
    || (message.includes('relation "') && message.includes('" does not exist'));
}







let productCatalogCache = {
  data: null,
  fetchedAt: 0,
};

let serviceCatalogCache = {
  data: null,
  fetchedAt: 0,
};

let vehicleFitmentCache = {
  data: null,
  fetchedAt: 0,
};
let catalogSummaryCache = {
  data: null,
  fetchedAt: 0,
};
let archivedProductIdsCache = {
  data: null,
  fetchedAt: 0,
};

let productCatalogCachePromise = null;
let serviceCatalogCachePromise = null;
let vehicleFitmentCachePromise = null;
let catalogSummaryCachePromise = null;
let archivedProductIdsPromise = null;

function parsePrice(value) {
  const normalized = typeof value === 'number'
    ? value
    : String(value ?? '')
      .replace(/\u20b1|php|peso/gi, '')
      .replace(/[,\s]/g, '')
      .trim();
  const numeric = Number(normalized);

  if (Number.isFinite(numeric) && numeric >= 0) {
    return Number(numeric.toFixed(2));
  }

  const currencyFallback = String(normalized).replace(/[^\d.-]/g, '');
  const fallbackNumeric = Number(currencyFallback);
  return Number.isFinite(fallbackNumeric) && fallbackNumeric >= 0 ? Number(fallbackNumeric.toFixed(2)) : null;
}

function normalizePriceListPartNumber(value) {
  const normalized = normalizePartNumber(value);
  const prefixStripped = PRODUCT_BARCODE_VENDOR_PREFIXES
    .filter((prefix) => normalized.startsWith(prefix) && normalized.length > prefix.length)
    .map((prefix) => normalizePartNumber(normalized.slice(prefix.length)))
    .find(Boolean);

  return prefixStripped || normalized;
}

function normalizePriceListItems(items = []) {
  return items
    .map((item) => {
      const originalSku = String(item?.sku || '').trim();
      return {
        sku: normalizePriceListPartNumber(originalSku),
        originalSku,
        price: parsePrice(item?.price),
        name: normalizeOptionalText(item?.name || item?.description, 220),
        model: normalizeOptionalText(item?.model || item?.application, 140),
        category: normalizeOptionalText(item?.category, 140),
        sourceCategory: normalizeOptionalText(item?.sourceCategory || item?.category, 140),
      };
    })
    .filter((item) => item.sku && item.price !== null)
    .map(classifyPriceListItem);
}

function decodeXmlEntities(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function parseCsvRows(text = '') {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function findZipEntry(buffer, filename) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== 0x06054b50) {
      continue;
    }

    const entryCount = buffer.readUInt16LE(offset + 10);
    const centralDirectorySize = buffer.readUInt32LE(offset + 12);
    const centralDirectoryOffset = buffer.readUInt32LE(offset + 16);
    const end = centralDirectoryOffset + centralDirectorySize;
    let cursor = centralDirectoryOffset;

    for (let entryIndex = 0; entryIndex < entryCount && cursor < end; entryIndex += 1) {
      if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
        break;
      }

      const compressionMethod = buffer.readUInt16LE(cursor + 10);
      const compressedSize = buffer.readUInt32LE(cursor + 20);
      const filenameLength = buffer.readUInt16LE(cursor + 28);
      const extraLength = buffer.readUInt16LE(cursor + 30);
      const commentLength = buffer.readUInt16LE(cursor + 32);
      const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
      const entryName = buffer.toString('utf8', cursor + 46, cursor + 46 + filenameLength);

      if (entryName === filename) {
        const localFilenameLength = buffer.readUInt16LE(localHeaderOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + localFilenameLength + localExtraLength;
        const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

        if (compressionMethod === 0) {
          return compressed.toString('utf8');
        }

        if (compressionMethod === 8) {
          return zlib.inflateRawSync(compressed).toString('utf8');
        }

        throw new Error(`Unsupported XLSX compression method ${compressionMethod}.`);
      }

      cursor += 46 + filenameLength + extraLength + commentLength;
    }
  }

  return '';
}

function parseSharedStrings(xml = '') {
  return Array.from(xml.matchAll(/<si\b[\s\S]*?<\/si>/g)).map(([si]) => {
    const values = Array.from(si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((match) => decodeXmlEntities(match[1]));
    return values.join('');
  });
}

function getCellIndex(cellRef = '') {
  const letters = String(cellRef).replace(/\d+/g, '').toUpperCase();
  return letters.split('').reduce((total, letter) => (total * 26) + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseXlsxWorksheetRows(buffer) {
  const sharedStrings = parseSharedStrings(findZipEntry(buffer, 'xl/sharedStrings.xml'));
  const worksheets = [];

  for (let sheetNumber = 1; sheetNumber <= 50; sheetNumber += 1) {
    const sheetXml = findZipEntry(buffer, `xl/worksheets/sheet${sheetNumber}.xml`);
    if (!sheetXml) {
      continue;
    }

    const rows = Array.from(sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g))
      .map((rowMatch) => {
        const row = [];
        for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
          const attrs = cellMatch[1];
          const body = cellMatch[2];
          const ref = attrs.match(/\br="([^"]+)"/)?.[1] || '';
          const type = attrs.match(/\bt="([^"]+)"/)?.[1] || '';
          const index = Math.max(getCellIndex(ref), row.length);
          const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '';
          const value = type === 's' ? sharedStrings[Number(rawValue)] ?? '' : decodeXmlEntities(rawValue);
          row[index] = String(value).trim();
        }
        return row;
      })
      .filter((row) => row.some(Boolean));

    if (rows.length > 0) {
      worksheets.push(rows);
    }
  }

  if (worksheets.length === 0) {
    throw new Error('The Excel workbook does not contain a readable worksheet.');
  }

  return worksheets;
}

function normalizeHeader(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const PRICE_LIST_COLUMN_ALIASES = {
  sku: {
    fallback: 0,
    names: new Map([
      ['partnumber', 100],
      ['partno', 100],
      ['part', 80],
      ['sku', 100],
      ['itemcode', 90],
      ['code', 70],
      ['material', 100],
      ['materialnumber', 100],
      ['productcode', 90],
    ]),
  },
  price: {
    fallback: 1,
    names: new Map([
      ['srpwithvat', 120],
      ['srpwvat', 120],
      ['dealersrpwithvat', 135],
      ['dealersrpwvat', 135],
      ['customersrpwithvat', 130],
      ['customersrpwvat', 130],
      ['dealersrpvatinclusive', 130],
      ['srpvatinclusive', 120],
      ['srpincludingvat', 120],
      ['srpvatin', 110],
      ['srpwithoutvat', 70],
      ['srpwithouttax', 70],
      ['newsrpwithvat', 130],
      ['newsrpwvat', 130],
      ['newprice', 110],
      ['newsrp', 110],
      ['retailprice', 100],
      ['sellingprice', 100],
      ['unitprice', 90],
      ['listprice', 90],
      ['amount', 80],
      ['price', 80],
      ['srp', 80],
    ]),
  },
  name: {
    fallback: 2,
    names: new Map([
      ['name', 80],
      ['description', 90],
      ['partname', 90],
      ['partdescription', 100],
      ['materialdescription', 120],
      ['itemdescription', 100],
    ]),
  },
  model: {
    fallback: 3,
    names: new Map([
      ['model', 90],
      ['application', 90],
      ['vehicle', 80],
      ['modelname', 90],
      ['modelcode', 100],
    ]),
  },
  category: {
    fallback: 4,
    names: new Map([
      ['category', 90],
      ['sourcecategory', 90],
      ['group', 80],
      ['pcc', 75],
    ]),
  },
};

function findColumnIndex(header, columnKey, options = {}) {
  const config = PRICE_LIST_COLUMN_ALIASES[columnKey];
  const allowFallback = options.allowFallback ?? true;
  let best = { index: -1, score: -1 };

  header.forEach((value, index) => {
    const score = config.names.get(value) ?? -1;
    if (score < 0) {
      return;
    }

    if (score > best.score || (score === best.score && index > best.index)) {
      best = { index, score };
    }
  });

  if (best.index >= 0) {
    return best.index;
  }

  return allowFallback ? config.fallback : -1;
}

function findPriceListHeader(rows = []) {
  let best = { rowIndex: -1, score: -1, header: [] };
  const scanLimit = Math.min(rows.length, 25);

  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const header = (rows[rowIndex] || []).map(normalizeHeader);
    const skuIndex = findColumnIndex(header, 'sku', { allowFallback: false });
    const priceIndex = findColumnIndex(header, 'price', { allowFallback: false });
    const skuScore = PRICE_LIST_COLUMN_ALIASES.sku.names.get(header[skuIndex]) ?? 0;
    const priceScore = PRICE_LIST_COLUMN_ALIASES.price.names.get(header[priceIndex]) ?? 0;
    const score = skuScore + priceScore;

    if (skuScore > 0 && priceScore > 0 && score > best.score) {
      best = { rowIndex, score, header };
    }
  }

  return best.rowIndex >= 0 ? best : null;
}

function rowsToPriceListItems(rows = []) {
  if (rows.length === 0) {
    return [];
  }

  const detectedHeader = findPriceListHeader(rows);
  if (!detectedHeader) {
    return [];
  }

  const header = detectedHeader.header;
  const dataRows = detectedHeader ? rows.slice(detectedHeader.rowIndex + 1) : rows;
  const skuIndex = findColumnIndex(header, 'sku', { allowFallback: false });
  const priceIndex = findColumnIndex(header, 'price', { allowFallback: false });
  const nameIndex = findColumnIndex(header, 'name', { allowFallback: false });
  const modelIndex = findColumnIndex(header, 'model', { allowFallback: false });
  const categoryIndex = findColumnIndex(header, 'category', { allowFallback: false });

  if (skuIndex < 0 || priceIndex < 0) {
    return [];
  }

  return normalizePriceListItems(dataRows.map((row) => ({
    sku: row[skuIndex],
    price: row[priceIndex],
    name: row[nameIndex],
    model: row[modelIndex],
    category: row[categoryIndex],
  })));
}

function parsePriceListUpload(file) {
  const filename = String(file?.originalname || '').toLowerCase();
  const mimetype = String(file?.mimetype || '').toLowerCase();

  if (filename.endsWith('.xls') || mimetype.includes('ms-excel')) {
    const error = new Error('Legacy .xls files are not supported yet. Save the workbook as .xlsx or CSV, then upload again.');
    error.statusCode = 400;
    throw error;
  }

  try {
    if (filename.endsWith('.xlsx') || mimetype.includes('spreadsheetml')) {
      return parseXlsxWorksheetRows(file.buffer)
        .map((rows) => rowsToPriceListItems(rows))
        .sort((left, right) => right.length - left.length)[0] ?? [];
    }

    return rowsToPriceListItems(parseCsvRows(file.buffer.toString('utf8').replace(/\t/g, ',')));
  } catch (parseError) {
    parseError.statusCode = parseError.statusCode || 400;
    parseError.message = parseError.message || 'The price list file could not be read. Save it as a clean .xlsx or CSV file, then upload again.';
    throw parseError;
  }
}

function getPreviousDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function chunkArray(items = [], size = PRICE_LIST_DB_BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function parsePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}


function normalizeOptionalText(value, maxLength = 160) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeRequiredText(value, maxLength = 160) {
  const text = normalizeOptionalText(value, maxLength);
  return text || null;
}







export function invalidateProductCatalogCache() {
  productCatalogCache = {
    data: null,
    fetchedAt: 0,
  };
  productCatalogCachePromise = null;
  catalogSummaryCache = {
    data: null,
    fetchedAt: 0,
  };
  catalogSummaryCachePromise = null;
  archivedProductIdsCache = {
    data: null,
    fetchedAt: 0,
  };
  archivedProductIdsPromise = null;
  clearPublicResponseCache(['catalog-products', 'recommendations']);
}

function parsePositiveStockQuantity(value) {
  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return Number(quantity.toFixed(2));
}

function parseStockLevel(value) {
  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity < 0) {
    return null;
  }

  return Number(quantity.toFixed(2));
}

function getStatusForStockLevel(stock) {
  const quantity = Number(stock ?? 0);

  if (quantity <= 0) {
    return 'out_of_stock';
  }

  if (quantity <= 5) {
    return 'low_stock';
  }

  return 'in_stock';
}

function normalizeSku(value, fallbackPrefix = 'SKU') {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || `${fallbackPrefix}-${Date.now().toString(36).toUpperCase()}`;
}

function normalizePartNumber(value) {
  const normalizedScanValue = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^\*+|\*+$/g, '')
    .replace(/\s+/g, '');
  const withoutBarcodeSuffix = normalizedScanValue.endsWith(PRODUCT_BARCODE_SUFFIX) && normalizedScanValue.length > PRODUCT_BARCODE_SUFFIX.length
    ? normalizedScanValue.slice(0, -PRODUCT_BARCODE_SUFFIX.length)
    : normalizedScanValue;

  return withoutBarcodeSuffix
    .replace(/[^A-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function mergeProductMetadata(currentMetadata = {}, patch = {}) {
  const base = currentMetadata && typeof currentMetadata === 'object' ? currentMetadata : {};
  return Object.entries(patch).reduce((metadata, [key, value]) => {
    if (value !== undefined) {
      metadata[key] = value === '' ? null : value;
    }
    return metadata;
  }, { ...base });
}

function mapCatalogRow(row) {
  const sourceCategory = row.source_category
    ?? row.sourceCategory
    ?? row.metadata?.sourceCategory
    ?? row.metadata?.source_category
    ?? null;
  const storedClassification = row.metadata?.classification ?? row.classification ?? null;
  const runtimeClassification = classifyInventoryItem({
    sku: row.sku,
    name: row.name,
    model_name: row.model ?? row.model_name,
    category: row.category,
    sourceCategory,
    pcc: row.pcc ?? row.metadata?.pcc,
    metadata: row.metadata ?? {},
  });
  const classification = storedClassification?.version === CLASSIFIER_VERSION
    && runtimeClassification.category === row.category
    ? storedClassification
    : runtimeClassification.trace;
  const physicalStock = Number(row.on_hand ?? row.physicalStock ?? row.stock ?? 0);
  // Reservations have been retired; on-hand stock is the sellable quantity.
  const reservedStock = 0;
  const availableStock = Math.max(physicalStock, 0);

  return {
    id: row.id,
    catalogEntryId: row.catalog_entry_id ?? row.catalogEntryId ?? row.metadata?.catalogEntryId ?? row.id,
    sku: row.sku,
    name: row.name,
    model: row.model,
    category: runtimeClassification.category,
    sourceCategory: runtimeClassification.sourceCategory ?? sourceCategory,
    classification,
    price: Number(row.price ?? 0),
    stock: availableStock,
    physicalStock,
    reservedStock,
    availableStock,
    status: availableStock <= 0
      ? 'out_of_stock'
      : availableStock <= 5
        ? 'low_stock'
        : row.status,
    uom: row.uom,
    brand: row.brand,
    createdAt: row.created_at ?? row.createdAt ?? row.date_added ?? row.dateAdded ?? row.metadata?.createdAt ?? null,
    dateAdded: row.date_added ?? row.dateAdded ?? row.created_at ?? row.createdAt ?? row.metadata?.dateAdded ?? null,
    location: row.location ?? {},
    supplierId: row.supplier_id ?? row.supplierId ?? row.metadata?.supplierId ?? null,
    supplierName: row.supplier_name ?? row.supplierName ?? row.metadata?.supplierName ?? null,
    categoryId: row.category_id ?? row.categoryId ?? row.metadata?.categoryId ?? null,
    imageUrl: row.image_url ?? row.imageUrl ?? row.metadata?.imageUrl ?? row.metadata?.primaryImageUrl ?? null,
    metadata: row.metadata ?? {},
  };
}

function mapPublicCatalogProduct(product = {}) {
  const availableStock = Math.max(Number(product.availableStock ?? product.stock ?? 0), 0);

  return {
    id: product.id,
    catalogEntryId: product.catalogEntryId ?? product.id,
    sku: product.sku,
    name: product.name,
    model: product.model,
    category: product.category,
    sourceCategory: product.sourceCategory,
    price: Number(product.price ?? 0),
    stock: availableStock,
    availableStock,
    status: product.status,
    uom: product.uom,
    brand: product.brand,
    createdAt: product.createdAt,
    dateAdded: product.dateAdded,
    imageUrl: product.imageUrl,
  };
}

function canViewInternalCatalogFields(req) {
  return ['admin', 'stock_clerk'].includes(req.user?.role);
}

async function getProductByPartNumber(partNumber) {
  const sku = normalizePartNumber(partNumber);

  if (!sku) {
    return null;
  }

  const { data: product, error: productError } = await supabaseAdmin
    .schema('catalog')
    .from('products')
    .select('id, sku, name, model_name, category, brand, uom, status, source_category, metadata, is_active, created_at, updated_at')
    .eq('sku', sku)
    .maybeSingle();

  if (productError) {
    throw productError;
  }

  if (!product) {
    return null;
  }

  const [{ data: price }, { data: balance }] = await Promise.all([
    supabaseAdmin
      .schema('catalog')
      .from('product_prices')
      .select('amount')
      .eq('product_id', product.id)
      .eq('price_type', 'retail')
      .eq('is_current', true)
      .maybeSingle(),
    supabaseAdmin
      .schema('catalog')
      .from('inventory_balances')
      .select('on_hand, reserved, location')
      .eq('product_id', product.id)
      .maybeSingle(),
  ]);

  const mappedProduct = mapCatalogRow({
    id: product.id,
    sku: product.sku,
    name: product.name,
    model: product.model_name,
    category: product.category,
    source_category: product.source_category,
    price: Number(price?.amount ?? 0),
    stock: Math.max(Number(balance?.on_hand ?? 0), 0),
    on_hand: Number(balance?.on_hand ?? 0),
    reserved: 0,
    status: product.status,
    uom: product.uom,
    brand: product.brand,
    created_at: product.created_at,
    location: balance?.location ?? {},
    metadata: product.metadata ?? {},
  });

  return {
    ...mappedProduct,
    isActive: product.is_active !== false,
    archived: product.is_active === false,
    archivedAt: product.is_active === false ? product.updated_at : null,
  };
}

function sendDuplicateProductResponse(res, product, sku) {
  const archivedText = product?.archived ? ' It is archived; restore it from Archived Products instead of creating a new copy.' : '';
  res.status(409).json({
    error: `Part number ${sku} already exists on ${product?.name || 'another product'}.${archivedText}`,
    code: 'DUPLICATE_PART_NUMBER',
    product,
  });
}

function mapSupplierRow(row = {}) {
  return {
    id: row.id,
    supplierId: row.supplier_code ?? row.supplierId ?? row.id,
    name: row.name ?? '',
    contactName: row.contact_name ?? row.contactName ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    notes: row.notes ?? '',
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

function mapCategoryRow(row = {}) {
  return {
    id: row.id ?? row.value ?? row.name,
    name: row.name ?? row.label ?? row.value ?? '',
    description: row.description ?? '',
    color: row.color ?? '#1d4ed8',
    count: Number(row.count ?? 0),
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

async function listSupplierRows() {
  const { data, error } = await supabaseAdmin
    .schema('catalog')
    .from('suppliers')
    .select('id, supplier_code, name, contact_name, phone, email, address, notes, created_at, updated_at')
    .order('name', { ascending: true });

  if (error) {
    if (isPrivateSchemaAccessError(error) || String(error.message || '').includes('suppliers')) {
      return [];
    }
    throw error;
  }

  return (data ?? []).map(mapSupplierRow);
}

async function listCategoryRows() {
  const { data, error } = await supabaseAdmin
    .schema('catalog')
    .from('categories')
    .select('id, name, description, color, created_at, updated_at')
    .order('name', { ascending: true });

  if (error) {
    if (isPrivateSchemaAccessError(error) || String(error.message || '').includes('categories')) {
      return buildCategoryRows(await getCachedProductCatalog()).map(mapCategoryRow);
    }
    throw error;
  }

  let counts = [];
  try {
    counts = await fetchProductCatalogCategories({});
  } catch (error) {
    if (!isPrivateSchemaAccessError(error)) {
      counts = [];
    }
  }
  const countMap = new Map((counts ?? []).map((category) => [category.value, category.count]));
  return (data ?? []).map((category) => mapCategoryRow({
    ...category,
    count: countMap.get(category.name) ?? 0,
  }));
}

async function upsertProductImage(productId, imageUrl) {
  if (imageUrl === undefined) {
    return;
  }

  const normalizedImageUrl = String(imageUrl || '').trim();
  try {
    if (!normalizedImageUrl) {
      await supabaseAdmin.schema('catalog').from('product_images').delete().eq('product_id', productId);
      return;
    }

    await supabaseAdmin
      .schema('catalog')
      .from('product_images')
      .upsert({
        product_id: productId,
        image_url: normalizedImageUrl,
        alt_text: 'Product image',
        is_primary: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id' });
  } catch (error) {
    if (!isPrivateSchemaAccessError(error) && !String(error.message || '').includes('product_images')) {
      throw error;
    }
  }
}

async function linkProductSupplier(productId, supplierId) {
  if (supplierId === undefined) {
    return;
  }

  try {
    await supabaseAdmin.schema('catalog').from('product_supplier_links').delete().eq('product_id', productId);
    if (supplierId) {
      await supabaseAdmin.schema('catalog').from('product_supplier_links').insert({
        product_id: productId,
        supplier_id: supplierId,
      });
    }
  } catch (error) {
    if (!isPrivateSchemaAccessError(error) && !String(error.message || '').includes('product_supplier_links')) {
      throw error;
    }
  }
}

async function saveCurrentRetailPrice(productId, amount, businessDate) {
  const { error } = await supabaseAdmin.rpc('limen_set_retail_price', {
    p_product_id: productId, p_amount: amount, p_business_date: businessDate,
  });
  if (error) throw error;
}

async function enrichCatalogProducts(products = []) {
  const productIds = [...new Set(products.map((product) => product.id).filter(Boolean))];
  if (productIds.length === 0) {
    return products;
  }

  const productById = new Map(products.map((product) => [product.id, { ...product }]));

  const { data: balances, error: balancesError } = await selectByInChunks({
    client: supabaseAdmin,
    schema: 'catalog',
    table: 'inventory_balances',
    select: 'product_id, on_hand, reserved, location',
    column: 'product_id',
    values: productIds,
  });

  if (balancesError && !isPrivateSchemaAccessError(balancesError)) {
    throw balancesError;
  }

  (balancesError ? [] : (balances ?? [])).forEach((balance) => {
    const product = productById.get(balance.product_id);
    if (!product) return;

    const physicalStock = Number(balance.on_hand ?? 0);
    const availableStock = Math.max(physicalStock, 0);
    product.physicalStock = physicalStock;
    product.reservedStock = 0;
    product.availableStock = availableStock;
    product.stock = availableStock;
    product.status = availableStock <= 0
      ? 'out_of_stock'
      : availableStock <= 5
        ? 'low_stock'
        : product.status;
    product.location = balance.location ?? product.location ?? {};
  });

  try {
    const { data: images, error: imagesError } = await selectByInChunks({
      client: supabaseAdmin,
      schema: 'catalog',
      table: 'product_images',
      select: 'product_id, image_url',
      column: 'product_id',
      values: productIds,
      apply: (query) => query.eq('is_primary', true),
    });

    if (imagesError && !isPrivateSchemaAccessError(imagesError)) {
      throw imagesError;
    }

    (imagesError ? [] : (images ?? [])).forEach((image) => {
      const product = productById.get(image.product_id);
      if (product) {
        product.imageUrl = image.image_url;
      }
    });
  } catch (error) {
    if (!String(error.message || '').includes('product_images')) {
      throw error;
    }
  }

  try {
    const { data: links, error: linksError } = await selectByInChunks({
      client: supabaseAdmin,
      schema: 'catalog',
      table: 'product_supplier_links',
      select: 'product_id, supplier_id, suppliers(id, supplier_code, name)',
      column: 'product_id',
      values: productIds,
    });

    if (linksError && !isPrivateSchemaAccessError(linksError)) {
      throw linksError;
    }

    (linksError ? [] : (links ?? [])).forEach((link) => {
      const product = productById.get(link.product_id);
      if (product) {
        product.supplierId = link.supplier_id;
        product.supplierName = link.suppliers?.name ?? product.supplierName ?? null;
      }
    });
  } catch (error) {
    if (!String(error.message || '').includes('product_supplier_links')) {
      throw error;
    }
  }

  return products.map((product) => productById.get(product.id) ?? product);
}

function mapPricelistStagingRow(row, productBySku = new Map(), balanceByProductId = new Map()) {
  const product = productBySku.get(row.sku) ?? null;
  const balance = product?.id ? balanceByProductId.get(product.id) : null;

  return mapCatalogRow({
    id: product?.id || `staging-${row.id || row.source_line_number}`,
    catalog_entry_id: `pricelist-${row.id || row.source_line_number}`,
    sku: row.sku,
    name: row.name,
    model: row.model_name,
    category: row.category,
    source_category: row.source_category,
    pcc: row.pcc,
    price: row.price,
    stock: balance?.on_hand ?? 0,
    status: row.status || product?.status || 'out_of_stock',
    uom: row.uom || product?.uom || 'PC',
    brand: product?.brand || 'Mitsubishi',
    created_at: product?.created_at ?? null,
    location: balance?.location ?? {},
    metadata: {
      ...(product?.metadata ?? {}),
      pcc: row.pcc || product?.metadata?.pcc || null,
      source: '2025-10 pricelist import',
      sourceSheet: row.source_sheet,
      sourceLineNumber: row.source_line_number,
      catalogEntryId: `pricelist-${row.id || row.source_line_number}`,
      sourceCategory: row.source_category ?? product?.metadata?.sourceCategory ?? null,
      classification: {
        version: row.classification_version,
        confidence: row.classification_confidence,
        strategy: row.classification_strategy,
        ruleKey: row.classification_rule_key,
        matchedTokens: row.classification_tokens ?? [],
      },
    },
  });
}

async function enrichPricelistCatalogProducts(products = []) {
  const skus = [...new Set(products.map((product) => product.sku).filter(Boolean))];
  const { data: productRows, error: productsError } = skus.length
    ? await selectByInChunks({
      client: supabaseAdmin,
      schema: 'catalog',
      table: 'products',
      select: 'id, sku, brand, uom, status, is_active, metadata, created_at',
      column: 'sku',
      values: skus,
      chunkSize: PRICE_LIST_LOOKUP_BATCH_SIZE,
    })
    : { data: [], error: null };

  if (productsError) {
    if (isPrivateSchemaAccessError(productsError)) {
      return null;
    }
    throw productsError;
  }

  const productBySku = new Map((productRows ?? []).map((product) => [product.sku, product]));
  const productIds = [...new Set((productRows ?? []).map((product) => product.id).filter(Boolean))];
  const { data: balanceRows, error: balancesError } = productIds.length
    ? await selectByInChunks({
      client: supabaseAdmin,
      schema: 'catalog',
      table: 'inventory_balances',
      select: 'product_id, on_hand, reserved, location',
      column: 'product_id',
      values: productIds,
      chunkSize: PRICE_LIST_LOOKUP_BATCH_SIZE,
    })
    : { data: [], error: null };

  if (balancesError) {
    if (isPrivateSchemaAccessError(balancesError)) {
      return null;
    }
    throw balancesError;
  }

  const balanceByProductId = new Map((balanceRows ?? []).map((balance) => [balance.product_id, balance]));

  return products.map((product) => {
    const catalogProduct = productBySku.get(product.sku) ?? null;
    const balance = catalogProduct?.id ? balanceByProductId.get(catalogProduct.id) : null;

    return {
      ...product,
      id: catalogProduct?.id || product.id,
      quoteEligible: catalogProduct?.is_active === true,
      brand: catalogProduct?.brand || product.brand,
      uom: product.uom || catalogProduct?.uom || 'PC',
      status: product.status || catalogProduct?.status || 'out_of_stock',
      stock: Math.max(Number(balance?.on_hand ?? product.physicalStock ?? product.stock ?? 0), 0),
      physicalStock: Number(balance?.on_hand ?? product.physicalStock ?? product.stock ?? 0),
      reservedStock: 0,
      availableStock: Math.max(Number(balance?.on_hand ?? product.physicalStock ?? product.stock ?? 0), 0),
      createdAt: catalogProduct?.created_at ?? product.createdAt ?? null,
      dateAdded: product.dateAdded ?? catalogProduct?.created_at ?? null,
      location: balance?.location ?? product.location ?? {},
      metadata: {
        ...(catalogProduct?.metadata ?? {}),
        ...(product.metadata ?? {}),
      },
    };
  });
}

async function mapPricelistStagingRowsWithInventory(stagingRows = []) {
  return enrichPricelistCatalogProducts(stagingRows.map((row) => mapPricelistStagingRow(row)));
}

function mapServiceRow(service) {
  return {
    id: service.id,
    code: service.code,
    name: service.name,
    description: service.description,
    price: Number(service.price ?? 0),
    estimatedDurationMinutes: Number(service.estimated_duration_minutes ?? service.estimatedDurationMinutes ?? 0),
  };
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}


function buildProductSearchText(product) {
  return normalizeText([
    product.name,
    product.category,
    product.sourceCategory,
    product.model,
    product.sku,
  ].filter(Boolean).join(' '));
}


function extractVehicleFamily(modelName) {
  const base = String(modelName || '').split('(')[0].trim();
  return base || null;
}

function normalizeVehicleSelectorValue(value) {
  return normalizeText(value).replace(/\s+/g, ' ').trim();
}

function parseModelYearRange(value) {
  const match = String(value || '').match(/(\d{4})\s*(?:-|\/|to)\s*(present|\d{4})/i);

  if (!match) {
    return null;
  }

  return {
    start: Number(match[1]),
    end: match[2].toLowerCase() === 'present' ? new Date().getFullYear() + MODEL_YEAR_LOOKAHEAD : Number(match[2]),
  };
}


function buildVehicleFilterContext({ vehicleModel = '', vehicleYear = '', vehicleFamily = '' } = {}) {
  const model = normalizeVehicleSelectorValue(vehicleModel);
  const family = normalizeVehicleSelectorValue(vehicleFamily || extractVehicleFamily(vehicleModel));
  const parsedYear = Number.parseInt(vehicleYear, 10);

  return {
    rawModel: vehicleModel || '',
    rawYear: vehicleYear || '',
    model,
    modelAliases: getVehicleModelAliases(vehicleModel),
    family,
    year: Number.isFinite(parsedYear) ? parsedYear : null,
  };
}


function matchesVehicleModel(productModel, context) {
  const requestedAliases = context.modelAliases?.length ? context.modelAliases : getVehicleModelAliases(context.rawModel || context.model);
  if (requestedAliases.length === 0) {
    return true;
  }

  const normalizedModel = normalizeVehicleSelectorValue(cleanVehicleModelLabel(productModel));
  if (!normalizedModel) {
    return false;
  }

  return requestedAliases.some((alias) => normalizedModel.includes(alias) || alias.includes(normalizedModel))
    || Boolean(context.family && normalizedModel.includes(context.family));
}

function isGeneralFitmentProduct(product) {
  const text = normalizeText([
    product.model,
    product.category,
    product.sourceCategory,
    product.source_category,
    product.metadata?.sourceCategory,
  ].filter(Boolean).join(' '));

  return !normalizeText(product.model) || GENERAL_FITMENT_TERMS.some((term) => text.includes(term));
}

function searchLooksLikePartNumber(searchQuery) {
  const normalizedSearch = String(searchQuery || '').trim();
  return /^[a-z0-9-]{4,}$/i.test(normalizedSearch) && /\d/.test(normalizedSearch);
}

function matchesVehicleFilters(product, context) {
  if (!context.model) {
    return true;
  }

  if (isGeneralFitmentProduct(product)) {
    return true;
  }

  if (!matchesVehicleModel(product.model, context)) {
    return false;
  }

  const yearRange = parseModelYearRange(product.model);
  if (context.year && yearRange && (context.year < yearRange.start || context.year > yearRange.end)) {
    return false;
  }

  return true;
}

function matchesCatalogFilters(product, { searchQuery = '', selectedCategory = 'all', vehicleContext = null } = {}) {
  const normalizedSearch = normalizeText(searchQuery);
  let matchesSearch = true;

  if (normalizedSearch) {
    const productSearchText = buildProductSearchText(product);
    matchesSearch = productSearchText.includes(normalizedSearch);

    if (!matchesSearch) {
      return false;
    }
  }

  if (selectedCategory !== 'all' && product.category !== selectedCategory) {
    return false;
  }

  return !vehicleContext
    || matchesVehicleFilters(product, vehicleContext)
    || (matchesSearch && searchLooksLikePartNumber(searchQuery));
}

function sortCatalogProducts(products = [], sortBy = 'name-asc') {
  const sortValue = String(sortBy);
  const prioritizeAvailable = sortValue.startsWith('available-');
  const prioritizeUnavailable = sortValue.startsWith('unavailable-');
  const requestedSort = sortValue.replace(/^(available-|unavailable-)/, '');
  return [...products].sort((left, right) => {
    if (prioritizeAvailable || prioritizeUnavailable) {
      const leftAvailable = Number(left.availableStock ?? left.stock ?? left.quantity ?? 0) > 0 ? 1 : 0;
      const rightAvailable = Number(right.availableStock ?? right.stock ?? right.quantity ?? 0) > 0 ? 1 : 0;
      if (leftAvailable !== rightAvailable) return prioritizeAvailable
        ? rightAvailable - leftAvailable
        : leftAvailable - rightAvailable;
    }

    if (requestedSort === 'stock-desc') {
      return Number(right.stock ?? right.quantity ?? 0) - Number(left.stock ?? left.quantity ?? 0)
        || String(left.name || '').localeCompare(String(right.name || ''));
    }

    if (requestedSort === 'stock-asc') {
      return Number(left.stock ?? left.quantity ?? 0) - Number(right.stock ?? right.quantity ?? 0)
        || String(left.name || '').localeCompare(String(right.name || ''));
    }

    if (requestedSort === 'name-desc') {
      return String(right.name || '').localeCompare(String(left.name || '')) || String(left.sku || '').localeCompare(String(right.sku || ''));
    }

    if (requestedSort === 'price-asc') {
      return Number(left.price ?? 0) - Number(right.price ?? 0) || String(left.name || '').localeCompare(String(right.name || ''));
    }

    if (requestedSort === 'price-desc') {
      return Number(right.price ?? 0) - Number(left.price ?? 0) || String(left.name || '').localeCompare(String(right.name || ''));
    }

    return String(left.name || '').localeCompare(String(right.name || '')) || String(left.sku || '').localeCompare(String(right.sku || ''));
  });
}

function buildCategoryRows(products = []) {
  const grouped = products.reduce((map, product) => {
    const key = product.category || 'Other';
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());

  return Array.from(grouped.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ value, label: value, count }));
}

function splitVehicleScopedCatalogProducts(catalog = [], { searchQuery = '', selectedCategory = 'all', vehicleContext } = {}) {
  const scopedProducts = [];
  const categoryScopedProducts = [];

  for (const product of catalog) {
    if (!matchesCatalogFilters(product, {
      searchQuery,
      selectedCategory: 'all',
      vehicleContext,
    })) {
      continue;
    }

    categoryScopedProducts.push(product);

    if (selectedCategory === 'all' || product.category === selectedCategory) {
      scopedProducts.push(product);
    }
  }

  return {
    scopedProducts,
    categoryScopedProducts,
  };
}

function mapVehicleFitmentRow(row) {
  return {
    modelName: row.model_name,
    vehicleFamily: row.vehicle_family,
    year: Number(row.year ?? 0),
    engine: row.engine,
    sortOrder: Number(row.sort_order ?? 100),
  };
}

async function getCachedVehicleFitments() {
  const now = Date.now();
  if (vehicleFitmentCache.data && (now - vehicleFitmentCache.fetchedAt) < VEHICLE_FITMENT_CACHE_TTL_MS) {
    return vehicleFitmentCache.data;
  }

  if (vehicleFitmentCachePromise) {
    return vehicleFitmentCachePromise;
  }

  vehicleFitmentCachePromise = (async () => {
    try {
      const rows = await callRpc('get_public_vehicle_fitments');
      vehicleFitmentCache = {
        data: (rows ?? []).map(mapVehicleFitmentRow),
        fetchedAt: Date.now(),
      };

      return vehicleFitmentCache.data;
    } finally {
      vehicleFitmentCachePromise = null;
    }
  })();

  return vehicleFitmentCachePromise;
}

const VEHICLE_MODEL_EXCLUSION_TERMS = ['various', 'universal', 'tools', 'manuals', 'collaterals', 'merchandise', 'accessories'];
const VEHICLE_MODEL_ALIASES = {
  'montero sport': ['montero qx', 'montero'],
  'montero sports': ['montero qx', 'montero'],
  'pajero sport': ['montero qx', 'montero'],
  'xpander cross': ['xpander'],
  mirage: ['mirage hb', 'mirage g4'],
  'mirage hatchback': ['mirage hb', 'mirage'],
  'mirage hb': ['mirage hatchback', 'mirage'],
  'outlander sport': ['asx', 'outlander'],
  adventure: ['kz'],
  l300: ['l300', 'l300 vv'],
  strada: ['strada cr', 'strada su', 'strada k64 k74', 'strada l200', 'triton'],
  triton: ['triton', 'strada cr', 'strada su', 'strada l200'],
};

function isCatalogVehicleModel(modelName) {
  const normalized = normalizeVehicleSelectorValue(modelName);
  return Boolean(normalized) && !VEHICLE_MODEL_EXCLUSION_TERMS.some((term) => normalized.includes(term));
}

function cleanVehicleModelLabel(modelName) {
  return String(modelName || '')
    .replace(/\((?:19|20)\d{2}\s*[-/]\s*(?:present|(?:19|20)\d{2})\)/ig, ' ')
    .replace(/\b(?:19|20)\d{2}\s*[-/]\s*(?:present|(?:19|20)\d{2})\b/ig, ' ')
    .replace(/\b(?:19|20)\d{2}\b/ig, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getVehicleModelAliases(modelName) {
  const normalized = normalizeVehicleSelectorValue(cleanVehicleModelLabel(modelName));
  const aliases = new Set(normalized ? [normalized] : []);

  (VEHICLE_MODEL_ALIASES[normalized] ?? []).forEach((alias) => aliases.add(normalizeVehicleSelectorValue(alias)));

  if (normalized.includes('montero') && normalized.includes('sport')) {
    aliases.add('montero qx');
    aliases.add('montero');
  }

  if (normalized.includes('mirage') && normalized.includes('hatch')) {
    aliases.add('mirage hb');
    aliases.add('mirage');
  }

  return Array.from(aliases).filter(Boolean);
}

function expandYearRange(range) {
  if (!range) {
    return [];
  }

  const span = Number(range.end) - Number(range.start);
  if (!Number.isFinite(span) || span < 0 || span > 25) {
    return [];
  }

  return Array.from({ length: span + 1 }, (_, index) => range.start + index);
}

function extractCatalogVehicleYears(product) {
  const text = String(product?.model || '');
  const years = new Set(expandYearRange(parseModelYearRange(text)));
  const yearMatches = text.match(/\b(?:19|20)\d{2}\b/g) ?? [];

  yearMatches.forEach((value) => years.add(Number(value)));

  return Array.from(years).filter((value) => Number.isFinite(value));
}

function buildVehicleFitmentOptions(products = [], selectedModel = '') {
  const modelMap = new Map();
  const yearMap = new Map();
  const normalizedSelectedModel = cleanVehicleModelLabel(selectedModel);

  products.forEach((product) => {
    if (!isCatalogVehicleModel(product?.model)) {
      return;
    }

    const modelLabel = cleanVehicleModelLabel(product.model);
    if (!modelLabel) {
      return;
    }

    const existing = modelMap.get(modelLabel) || { value: modelLabel, label: modelLabel, count: 0 };
    existing.count += 1;
    modelMap.set(modelLabel, existing);

    const years = extractCatalogVehicleYears(product);
    if (!yearMap.has(modelLabel)) {
      yearMap.set(modelLabel, new Set());
    }

    years.forEach((year) => {
      yearMap.get(modelLabel).add(year);
    });
  });

  const models = Array.from(modelMap.values())
    .sort((left, right) => Number(right.count ?? 0) - Number(left.count ?? 0) || left.label.localeCompare(right.label))
    .map(({ count, ...model }) => model);

  const modelYears = Array.from(yearMap.entries()).reduce((result, [modelLabel, yearsForModel]) => {
    result[modelLabel] = Array.from(yearsForModel)
      .sort((left, right) => right - left)
      .map((year) => ({ value: String(year), label: String(year) }));
    return result;
  }, {});

  const years = normalizedSelectedModel && modelYears[normalizedSelectedModel]
    ? modelYears[normalizedSelectedModel]
    : [];

  return { models, years, modelYears };
}

function buildVehicleFitmentOptionsFromFitments(fitments = [], selectedModel = '') {
  const modelMap = new Map();
  const yearMap = new Map();
  const normalizedSelectedModel = cleanVehicleModelLabel(selectedModel);

  fitments.forEach((fitment) => {
    const modelLabel = cleanVehicleModelLabel(fitment.modelName || fitment.vehicleFamily);

    if (!modelLabel) {
      return;
    }

    const existing = modelMap.get(modelLabel) || {
      value: modelLabel,
      label: modelLabel,
      count: 0,
      sortOrder: Number(fitment.sortOrder ?? 100),
    };

    existing.count += 1;
    existing.sortOrder = Math.min(existing.sortOrder, Number(fitment.sortOrder ?? 100));
    modelMap.set(modelLabel, existing);

    if (!yearMap.has(modelLabel)) {
      yearMap.set(modelLabel, new Set());
    }

    const year = Number(fitment.year ?? 0);
    if (Number.isFinite(year) && year > 0) {
      yearMap.get(modelLabel).add(year);
    }
  });

  const models = Array.from(modelMap.values())
    .sort((left, right) => Number(left.sortOrder ?? 100) - Number(right.sortOrder ?? 100) || left.label.localeCompare(right.label))
    .map(({ count: _count, sortOrder: _sortOrder, ...model }) => model);

  const modelYears = Array.from(yearMap.entries()).reduce((result, [modelLabel, yearsForModel]) => {
    result[modelLabel] = Array.from(yearsForModel)
      .sort((left, right) => right - left)
      .map((year) => ({ value: String(year), label: String(year) }));
    return result;
  }, {});

  const years = normalizedSelectedModel && modelYears[normalizedSelectedModel]
    ? modelYears[normalizedSelectedModel]
    : [];

  return { models, years, modelYears };
}

























async function fetchProductCatalogPage({ page, pageSize, searchQuery = null, selectedCategory = 'all', sortBy = 'name-asc', stockFilter = 'all' }) {
  try {
    return await callRpc('get_inventory_catalog_page', {
      p_page: page,
      p_page_size: pageSize,
      p_search: searchQuery || null,
      p_category: selectedCategory,
      p_sort_by: sortBy,
      p_stock_filter: stockFilter,
    });
  } catch (error) {
    // Older/staging databases may not yet have the paging RPC. Keep catalog
    // search available while the migration is being applied by using the
    // already cached catalog source as a compatibility path.
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    const missingRpc = ['42883', 'PGRST202', 'PGRST204', '42P01', '42702', '42703', '42804'].includes(code)
      || message.includes('get_inventory_catalog_page')
      || message.includes('schema cache');
    if (!missingRpc) throw error;

    const catalog = await getCachedProductCatalog();
    const normalizedSearch = normalizePostgrestSearchTerm(searchQuery);
    const filtered = (catalog || []).filter((product) => {
      if (selectedCategory && selectedCategory !== 'all' && product.category !== selectedCategory) return false;
      const matchesSearch = !normalizedSearch || [product.sku, product.name, product.model_name, product.source_category]
        .some((value) => String(value || '').toLowerCase().includes(normalizedSearch.toLowerCase()));
      const stock = Number(product.stock ?? product.quantity ?? 0);
      const matchesStock = stockFilter === 'all'
        || (stockFilter === 'available' && stock > 0)
        || (stockFilter === 'out' && stock <= 0)
        || (stockFilter === 'low' && stock > 0 && stock <= 5)
        || (stockFilter === 'medium' && stock >= 6 && stock <= 20)
        || (stockFilter === 'high' && stock > 20);
      return matchesSearch && matchesStock;
    });
    const sorted = sortCatalogProducts(filtered, sortBy);
    const start = (Math.max(page, 1) - 1) * pageSize;
    const rows = sorted.slice(start, start + pageSize).map((product) => ({
      ...product,
      model: product.model ?? product.model_name ?? null,
      total_count: sorted.length,
    }));
    return rows;
  }
}

async function getArchivedProductIds() {
  const now = Date.now();
  if (archivedProductIdsCache.data && (now - archivedProductIdsCache.fetchedAt) < PRODUCT_CATALOG_CACHE_TTL_MS) {
    return archivedProductIdsCache.data;
  }

  if (archivedProductIdsPromise) {
    return archivedProductIdsPromise;
  }

  archivedProductIdsPromise = (async () => {
    try {
      const { data, error } = await supabaseAdmin
        .schema('catalog')
        .from('products')
        .select('id')
        .eq('is_active', false);

      if (error) {
        if (isPrivateSchemaAccessError(error) || String(error.message || '').includes('is_active')) {
          archivedProductIdsCache = {
            data: new Set(),
            fetchedAt: Date.now(),
          };
          return archivedProductIdsCache.data;
        }
        throw error;
      }

      archivedProductIdsCache = {
        data: new Set((data ?? []).map((product) => product.id).filter(Boolean)),
        fetchedAt: Date.now(),
      };
      return archivedProductIdsCache.data;
    } finally {
      archivedProductIdsPromise = null;
    }
  })();

  return archivedProductIdsPromise;
}

async function filterActiveCatalogProducts(products = []) {
  const archivedProductIds = await getArchivedProductIds();
  if (!archivedProductIds.size) {
    return products;
  }
  return products.filter((product) => !archivedProductIds.has(product.id));
}

async function fetchProductCatalogCategories({ searchQuery = null }) {
  try {
    return await callRpc('get_product_catalog_categories', {
      p_search: searchQuery || null,
    });
  } catch (error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    const missingRpc = ['42883', 'PGRST202', 'PGRST204', '42P01', '42702', '42703', '42804'].includes(code)
      || message.includes('get_product_catalog_categories')
      || message.includes('schema cache');
    if (!missingRpc) throw error;
    const catalog = await getCachedProductCatalog();
    const normalizedSearch = normalizePostgrestSearchTerm(searchQuery).toLowerCase();
    const counts = new Map();
    (catalog || []).forEach((product) => {
      if (normalizedSearch && ![product.sku, product.name, product.model_name, product.source_category]
        .some((value) => String(value || '').toLowerCase().includes(normalizedSearch))) return;
      const value = String(product.category || 'Uncategorized');
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([value, count]) => ({ value, label: value, count }));
  }
}

function normalizePostgrestSearchTerm(value) {
  return String(value || '')
    .trim()
    .replace(/[%_]/g, '')
    .replace(/,/g, ' ');
}

function applyPricelistCatalogFilters(query, { searchQuery = '', selectedCategory = 'all' } = {}) {
  let nextQuery = query;
  const normalizedSearch = normalizePostgrestSearchTerm(searchQuery);

  if (selectedCategory && selectedCategory !== 'all') {
    nextQuery = nextQuery.eq('category', selectedCategory);
  }

  if (normalizedSearch) {
    const pattern = `*${normalizedSearch}*`;
    nextQuery = nextQuery.or([
      `sku.ilike.${pattern}`,
      `name.ilike.${pattern}`,
      `model_name.ilike.${pattern}`,
      `category.ilike.${pattern}`,
      `source_category.ilike.${pattern}`,
      `pcc.ilike.${pattern}`,
    ].join(','));
  }

  return nextQuery;
}

function applyPricelistCatalogSort(query, sortBy = 'name-asc') {
  switch (sortBy) {
    case 'name-desc':
      return query
        .order('name', { ascending: false })
        .order('sku', { ascending: true })
        .order('source_line_number', { ascending: true });
    case 'price-asc':
      return query
        .order('price', { ascending: true })
        .order('name', { ascending: true })
        .order('source_line_number', { ascending: true });
    case 'price-desc':
      return query
        .order('price', { ascending: false })
        .order('name', { ascending: true })
        .order('source_line_number', { ascending: true });
    default:
      return query
        .order('name', { ascending: true })
        .order('sku', { ascending: true })
        .order('source_line_number', { ascending: true });
  }
}

function buildVehiclePricelistModelPatterns(vehicleContext) {
  const modelTerms = new Set([
    ...(vehicleContext?.modelAliases ?? []),
    vehicleContext?.family,
    ...GENERAL_FITMENT_TERMS,
  ].filter(Boolean));

  return Array.from(modelTerms)
    .map(normalizePostgrestSearchTerm)
    .filter((term) => term.length >= 3)
    .map((term) => `model_name.ilike.*${term}*`);
}

function applyVehiclePricelistCandidateFilters(query, { vehicleContext } = {}) {
  const modelPatterns = buildVehiclePricelistModelPatterns(vehicleContext);
  if (!modelPatterns.length) {
    return query;
  }

  return query.or(modelPatterns.join(','));
}

async function fetchVehiclePricelistCatalog({ searchQuery = '', selectedCategory = 'all', sortBy = 'name-asc', vehicleContext, enrichInventory = false, estimateScope = null }) {
  if (estimateScope && !estimateScope.versionId) {
    return { sourceAvailable: true, scopedProducts: [], categoryScopedProducts: [] };
  }
  let query = supabaseAdmin
    .schema('catalog')
    .from('pricelist_import_staging')
    .select(`
      id,
      source_sheet,
      source_line_number,
      sku,
      name,
      model_name,
      uom,
      pcc,
      price,
      status,
      category,
      source_category,
      classification_version,
      classification_confidence,
      classification_strategy,
      classification_rule_key,
      classification_tokens
    `);

  if (estimateScope) query = applyEstimatePricelistScope(query, estimateScope.versionId);
  query = searchLooksLikePartNumber(searchQuery)
    ? applyPricelistCatalogFilters(query, { searchQuery, selectedCategory: 'all' })
    : applyVehiclePricelistCandidateFilters(query, { vehicleContext });
  query = applyPricelistCatalogSort(query, sortBy).limit(VEHICLE_PRICELIST_CANDIDATE_LIMIT);

  const { data, error } = await query;
  if (error) {
    if (estimateScope) throw error;
    const message = String(error.message || '');
    if (message.includes('pricelist_import_staging') || message.includes('does not exist') || isPrivateSchemaAccessError(error)) {
      return null;
    }
    throw error;
  }

  // Vehicle packages feed directly into the public quote builder. Resolve
  // staging rows to their active catalogue UUIDs even when inventory
  // enrichment is not requested; otherwise package items retain synthetic
  // `staging-*` IDs and are rejected during quote validation.
  const products = enrichInventory
    ? await mapPricelistStagingRowsWithInventory(data ?? [])
    : await enrichPricelistCatalogProducts((data ?? []).map((row) => mapPricelistStagingRow(row)));
  if (!products) {
    return null;
  }

  return {
    sourceAvailable: true,
    ...splitVehicleScopedCatalogProducts(products, {
      searchQuery,
      selectedCategory,
      vehicleContext,
    }),
  };
}

async function fetchPricelistCatalogPage({ page, pageSize, searchQuery = '', selectedCategory = 'all', sortBy = 'name-asc', estimateScope = null }) {
  if (estimateScope && !estimateScope.versionId) {
    return { sourceAvailable: true, products: [], totalCount: 0 };
  }
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = supabaseAdmin
    .schema('catalog')
    .from('pricelist_import_staging')
    .select(`
      id,
      source_sheet,
      source_line_number,
      sku,
      name,
      model_name,
      uom,
      pcc,
      price,
      status,
      category,
      source_category,
      classification_version,
      classification_confidence,
      classification_strategy,
      classification_rule_key,
      classification_tokens
    `, { count: 'exact' });

  if (estimateScope) query = applyEstimatePricelistScope(query, estimateScope.versionId);
  query = applyPricelistCatalogFilters(query, { searchQuery, selectedCategory });
  query = applyPricelistCatalogSort(query, sortBy).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    if (estimateScope) throw error;
    const message = String(error.message || '');
    if (message.includes('pricelist_import_staging') || message.includes('does not exist') || isPrivateSchemaAccessError(error)) {
      return null;
    }
    throw error;
  }

  const stagingRows = data ?? [];
  if (!stagingRows.length && Number(count ?? 0) === 0) {
    return {
      products: [],
      totalCount: 0,
      sourceAvailable: true,
    };
  }

  const products = await mapPricelistStagingRowsWithInventory(stagingRows);
  if (!products) {
    return null;
  }

  return {
    products,
    totalCount: Number(count ?? stagingRows.length),
    sourceAvailable: true,
  };
}

async function getCachedProductCatalog() {
  const now = Date.now();
  if (productCatalogCache.data && (now - productCatalogCache.fetchedAt) < PRODUCT_CATALOG_CACHE_TTL_MS) {
    return productCatalogCache.data;
  }

  if (productCatalogCachePromise) {
    return productCatalogCachePromise;
  }

  productCatalogCachePromise = (async () => {
    try {
      const rows = await callRpc('get_full_product_catalog');
      const products = (rows ?? []).map(mapCatalogRow);
      productCatalogCache = {
        data: products,
        fetchedAt: Date.now(),
      };

      return productCatalogCache.data;
    } finally {
      productCatalogCachePromise = null;
    }
  })();

  return productCatalogCachePromise;
}

function calculateInventoryValue(products = []) {
  return products.reduce((sum, product) => {
    const unitPrice = Number(product.price ?? 0);
    const stockOnHand = Number(product.stock ?? product.quantity ?? 0);

    if (!Number.isFinite(unitPrice) || !Number.isFinite(stockOnHand)) {
      return sum;
    }

    return sum + (unitPrice * stockOnHand);
  }, 0);
}

async function getCatalogStockSummarySafely() {
  try {
    const summaryRows = await callRpc('get_catalog_summary');
    const summary = Array.isArray(summaryRows) ? (summaryRows[0] ?? null) : summaryRows;

    return {
      inStockProducts: Number(summary?.in_stock_products ?? 0),
      inventoryValue: Number(summary?.inventory_value ?? 0),
    };
  } catch (error) {
    if (!isPrivateSchemaAccessError(error)) {
      console.warn('Unable to calculate stock summary for catalog:', error?.message || error);
    }
    return {
      inStockProducts: 0,
      inventoryValue: 0,
    };
  }
}

async function getCatalogSummaryData() {
  const now = Date.now();
  if (catalogSummaryCache.data && (now - catalogSummaryCache.fetchedAt) < CATALOG_SUMMARY_CACHE_TTL_MS) {
    return catalogSummaryCache.data;
  }

  if (catalogSummaryCachePromise) {
    return catalogSummaryCachePromise;
  }

  catalogSummaryCachePromise = (async () => {
    try {
      try {
        const summaryRows = await callRpc('get_catalog_summary');
        const summary = Array.isArray(summaryRows) ? (summaryRows[0] ?? null) : summaryRows;
        const stockSummary = summary?.in_stock_products !== undefined && summary?.inventory_value !== undefined
          ? {
            inStockProducts: Number(summary.in_stock_products ?? 0),
            inventoryValue: Number(summary.inventory_value ?? 0),
          }
          : await getCatalogStockSummarySafely();

        return {
          totalProducts: Math.max(Number(summary?.total_products ?? 0), Number(summary?.pricelist_rows ?? 0)),
          pricelistRows: Number(summary?.pricelist_rows ?? 0),
          uniqueProducts: Number(summary?.unique_products ?? 0),
          currentPrices: Number(summary?.current_prices ?? 0),
          inStockProducts: stockSummary.inStockProducts,
          inventoryValue: stockSummary.inventoryValue,
        };
      } catch (error) {
        const message = String(error?.message || error || '');
        if (!message.includes('get_catalog_summary') && !isPrivateSchemaAccessError(error)) {
          throw error;
        }
      }

      const products = await getCachedProductCatalog();
      const totalProducts = Number(products?.length ?? 0);

      return {
        totalProducts,
        pricelistRows: totalProducts,
        uniqueProducts: totalProducts,
        currentPrices: totalProducts,
        inStockProducts: products.filter((product) => Number(product.stock ?? product.quantity ?? 0) > 0).length,
        inventoryValue: calculateInventoryValue(products),
      };
    } finally {
      catalogSummaryCachePromise = null;
    }
  })();

  const summary = await catalogSummaryCachePromise;
  catalogSummaryCache = {
    data: summary,
    fetchedAt: Date.now(),
  };
  return summary;
}

async function getCachedServiceCatalog() {
  const now = Date.now();
  if (serviceCatalogCache.data && (now - serviceCatalogCache.fetchedAt) < SERVICE_CATALOG_CACHE_TTL_MS) {
    return serviceCatalogCache.data;
  }

  if (serviceCatalogCachePromise) {
    return serviceCatalogCachePromise;
  }

  serviceCatalogCachePromise = (async () => {
    try {
      const services = await callRpc('get_service_catalog');
      const mappedServices = (services ?? []).map(mapServiceRow);

      serviceCatalogCache = {
        data: mappedServices,
        fetchedAt: Date.now(),
      };

      return serviceCatalogCache.data;
    } finally {
      serviceCatalogCachePromise = null;
    }
  })();

  return serviceCatalogCachePromise;
}

router.get('/vehicle-fitment/options', async (req, res, next) => {
  try {
    const selectedModel = String(req.query.model || '').trim();
    const fitments = await getCachedVehicleFitments();

    if (fitments.length > 0) {
      res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      res.json(buildVehicleFitmentOptionsFromFitments(fitments, selectedModel));
      return;
    }

    const catalog = await getCachedProductCatalog();
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
    res.json(buildVehicleFitmentOptions(catalog, selectedModel));
  } catch (error) {
    next(error);
  }
});

router.get("/vehicle-packages", (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(410).json({ error: 'This older package view has been replaced. Refresh the page to browse current published packages.', code: 'PACKAGE_VIEW_REPLACED' });
});

router.get('/suppliers', requireRole('admin', 'stock_clerk'), async (_req, res, next) => {
  try {
    res.json({ suppliers: await listSupplierRows() });
  } catch (error) {
    next(error);
  }
});

router.post('/suppliers', requireRole('admin'), async (req, res, next) => {
  try {
    const name = normalizeRequiredText(req.body?.name, 180);
    if (!name) {
      res.status(400).json({ error: 'Supplier name is required.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const supplierCode = normalizeSku(req.body?.supplierId, 'SUP');
    const { data, error } = await supabaseAdmin
      .schema('catalog')
      .from('suppliers')
      .insert({
        supplier_code: supplierCode,
        name,
        contact_name: normalizeOptionalText(req.body?.contactName, 160),
        phone: normalizeOptionalText(req.body?.phone, 80),
        email: normalizeOptionalText(req.body?.email, 160),
        address: normalizeOptionalText(req.body?.address, 500),
        notes: normalizeOptionalText(req.body?.notes, 1000),
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, supplier_code, name, contact_name, phone, email, address, notes, created_at, updated_at')
      .single();

    if (error) {
      throw error;
    }

    invalidateProductCatalogCache();
    res.status(201).json({ supplier: mapSupplierRow(data) });
  } catch (error) {
    next(error);
  }
});

router.patch('/suppliers/:supplierId', requireRole('admin'), async (req, res, next) => {
  try {
    const supplierId = String(req.params.supplierId || '').trim();
    const name = normalizeRequiredText(req.body?.name, 180);
    if (!supplierId || !name) {
      res.status(400).json({ error: 'Supplier and supplier name are required.' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .schema('catalog')
      .from('suppliers')
      .update({
        name,
        contact_name: normalizeOptionalText(req.body?.contactName, 160),
        phone: normalizeOptionalText(req.body?.phone, 80),
        email: normalizeOptionalText(req.body?.email, 160),
        address: normalizeOptionalText(req.body?.address, 500),
        notes: normalizeOptionalText(req.body?.notes, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', supplierId)
      .select('id, supplier_code, name, contact_name, phone, email, address, notes, created_at, updated_at')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      res.status(404).json({ error: 'Supplier was not found.' });
      return;
    }

    invalidateProductCatalogCache();
    res.json({ supplier: mapSupplierRow(data) });
  } catch (error) {
    next(error);
  }
});

router.delete('/suppliers/:supplierId', requireRole('admin'), async (req, res, next) => {
  try {
    const supplierId = String(req.params.supplierId || '').trim();
    if (!supplierId) {
      res.status(400).json({ error: 'Supplier is required.' });
      return;
    }

    const { data: supplierLinks, error: linkError } = await supabaseAdmin
      .schema('catalog')
      .from('product_supplier_links')
      .select('product_id')
      .eq('supplier_id', supplierId).limit(1);

    if (linkError) throw linkError;
    if (supplierLinks?.length) {
      res.status(409).json({ error: 'This supplier is linked to products. Update those product suppliers before deleting it.' });
      return;
    }

    const { error } = await supabaseAdmin.schema('catalog').from('suppliers').delete().eq('id', supplierId);
    if (error) {
      throw error;
    }

    invalidateProductCatalogCache();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/categories', requireRole('admin', 'stock_clerk'), async (_req, res, next) => {
  try {
    res.json({ categories: await listCategoryRows() });
  } catch (error) {
    next(error);
  }
});

router.post('/categories', requireRole('admin'), async (req, res, next) => {
  try {
    const name = normalizeRequiredText(req.body?.name, 140);
    if (!name) {
      res.status(400).json({ error: 'Category name is required.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .schema('catalog')
      .from('categories')
      .insert({
        name,
        description: normalizeOptionalText(req.body?.description, 500),
        color: normalizeOptionalText(req.body?.color, 20) || '#1d4ed8',
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, name, description, color, created_at, updated_at')
      .single();

    if (error) {
      throw error;
    }

    invalidateProductCatalogCache();
    res.status(201).json({ category: mapCategoryRow(data) });
  } catch (error) {
    next(error);
  }
});

router.patch('/categories/:categoryId', requireRole('admin'), async (req, res, next) => {
  try {
    const categoryId = String(req.params.categoryId || '').trim();
    const name = normalizeRequiredText(req.body?.name, 140);
    if (!categoryId || !name) {
      res.status(400).json({ error: 'Category and category name are required.' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .schema('catalog')
      .from('categories')
      .update({
        name,
        description: normalizeOptionalText(req.body?.description, 500),
        color: normalizeOptionalText(req.body?.color, 20) || '#1d4ed8',
        updated_at: new Date().toISOString(),
      })
      .eq('id', categoryId)
      .select('id, name, description, color, created_at, updated_at')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      res.status(404).json({ error: 'Category was not found.' });
      return;
    }

    invalidateProductCatalogCache();
    res.json({ category: mapCategoryRow(data) });
  } catch (error) {
    next(error);
  }
});

router.delete('/categories/:categoryId', requireRole('admin'), async (req, res, next) => {
  try {
    const categoryId = String(req.params.categoryId || '').trim();
    const { data: category, error: categoryError } = await supabaseAdmin.schema('catalog').from('categories').select('name').eq('id', categoryId).maybeSingle();
    if (categoryError) throw categoryError;
    if (!category) { res.status(404).json({ error: 'Category was not found.' }); return; }
    const { data: products, error: productsError } = await supabaseAdmin.schema('catalog').from('products').select('id').eq('category', category.name).limit(1);
    if (productsError) throw productsError;
    if (products?.length) { res.status(409).json({ error: 'This category is used by products. Reassign those products before deleting it.' }); return; }
    const { error } = await supabaseAdmin.schema('catalog').from('categories').delete().eq('id', categoryId);
    if (error) {
      throw error;
    }

    invalidateProductCatalogCache();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/products', async (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1, 10000);
    const pageSize = parsePositiveInteger(req.query.pageSize, 10, 250);
    const searchQuery = String(req.query.q || '').trim();
    const selectedCategory = String(req.query.category || 'all');
    const sortBy = String(req.query.sortBy || 'name-asc');
    const requestedStockFilter = String(req.query.stockFilter || 'all');
    const validStockFilters = new Set(['all', 'available', 'high', 'medium', 'low', 'out']);
    const stockFilter = validStockFilters.has(requestedStockFilter) ? requestedStockFilter : 'all';
    const vehicleModel = String(req.query.vehicleModel || '').trim();
    const vehicleYear = String(req.query.vehicleYear || '').trim();
    const includeCategories = String(req.query.includeCategories || 'true').trim().toLowerCase() !== 'false';
    const source = String(req.query.source || '').trim().toLowerCase();
    const estimateOnly = source === 'estimate';
    const useStagingCatalog = source === 'staging' || estimateOnly;
    const estimateScope = estimateOnly ? await getActiveEstimatePricelist(supabaseAdmin) : null;
    const vehicleContext = vehicleModel
      ? buildVehicleFilterContext({
        vehicleModel,
        vehicleYear,
        vehicleFamily: extractVehicleFamily(vehicleModel),
      })
      : null;
    let products = [];
    let categories = [];
    let totalCount = 0;
    let totalPages = 1;

    if (!vehicleContext) {
      const [catalogPage, categoryRows] = await Promise.all([
        useStagingCatalog
          ? fetchPricelistCatalogPage({
            estimateScope,
            page,
            pageSize,
            searchQuery,
            selectedCategory,
            sortBy,
          })
          : fetchProductCatalogPage({
            page,
            pageSize,
            searchQuery,
            selectedCategory,
            sortBy,
            stockFilter,
          }),
        includeCategories
          ? fetchProductCatalogCategories({ searchQuery })
          : Promise.resolve([]),
      ]);

      if (useStagingCatalog && catalogPage?.sourceAvailable) {
        products = catalogPage.products;
        totalCount = catalogPage.totalCount;
      } else {
        const pageRows = Array.isArray(catalogPage) ? catalogPage : [];
        products = await filterActiveCatalogProducts((pageRows ?? []).map(mapCatalogRow));
        totalCount = Number(pageRows?.[0]?.total_count ?? 0);
      }
      products = await enrichCatalogProducts(products);

      totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

      if (includeCategories) {
        const normalizedCategoryRows = (categoryRows ?? []).map((row) => ({
          value: row.value,
          label: row.label,
          count: Number(row.count ?? 0),
        }));
        const categoryCountTotal = normalizedCategoryRows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
        categories = [
          { value: 'all', label: 'All Categories', count: totalCount || categoryCountTotal },
          ...normalizedCategoryRows,
        ];
      }
    } else {
      let scopedProducts = [];
      let categoryScopedProducts = [];
      let usingVehiclePricelist = false;

      if (useStagingCatalog) {
        const vehiclePricelist = await fetchVehiclePricelistCatalog({
          estimateScope,
          searchQuery,
          selectedCategory,
          sortBy,
          vehicleContext,
        });

        if (vehiclePricelist?.sourceAvailable) {
          scopedProducts = vehiclePricelist.scopedProducts;
          categoryScopedProducts = vehiclePricelist.categoryScopedProducts;
          usingVehiclePricelist = true;
        }
      }

      if (!useStagingCatalog || (!estimateOnly && scopedProducts.length === 0 && !searchQuery)) {
        const catalog = await getCachedProductCatalog();
        const scopedCatalog = splitVehicleScopedCatalogProducts(catalog, {
          searchQuery,
          selectedCategory,
          vehicleContext,
        });
        scopedProducts = scopedCatalog.scopedProducts;
        categoryScopedProducts = scopedCatalog.categoryScopedProducts;
        usingVehiclePricelist = false;
      }

      const stockFilteredProducts = stockFilter === 'available'
        ? scopedProducts.filter((product) => Number(product.availableStock ?? product.stock ?? product.quantity ?? 0) > 0)
        : stockFilter === 'out'
          ? scopedProducts.filter((product) => Number(product.availableStock ?? product.stock ?? product.quantity ?? 0) <= 0)
          : scopedProducts;
      const sortedProducts = sortCatalogProducts(stockFilteredProducts, sortBy);
      const pageProducts = sortedProducts.slice((page - 1) * pageSize, page * pageSize);

      totalCount = sortedProducts.length;
      totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      products = usingVehiclePricelist
        ? await enrichCatalogProducts(await enrichPricelistCatalogProducts(pageProducts))
        : await enrichCatalogProducts(pageProducts);

      if (includeCategories) {
        const categoryRows = buildCategoryRows(categoryScopedProducts);
        const categoryCountTotal = categoryRows.reduce((sum, row) => sum + Number(row.count ?? 0), 0);
        categories = [
          { value: 'all', label: 'All Categories', count: categoryCountTotal || totalCount },
          ...categoryRows,
        ];
      }
    }

    res.json({
      products: canViewInternalCatalogFields(req)
        ? products
        : products.map(mapPublicCatalogProduct),
      categories,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/products/all', requireRole('admin', 'stock_clerk'), async (_req, res, next) => {
  try {
    const products = await getCachedProductCatalog();
    res.json({ products: products ?? [] });
  } catch (error) {
    next(error);
  }
});

router.get('/products/part-number/:partNumber', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const sku = normalizePartNumber(req.params.partNumber);
    const optional = String(req.query.optional || '').toLowerCase() === 'true';

    if (!sku) {
      res.status(400).json({ error: 'Part number is required.' });
      return;
    }

    const product = await getProductByPartNumber(sku);

    if (!product) {
      if (optional) {
        res.json({ product: null, available: true });
        return;
      }

      res.status(404).json({ error: 'No product matched that part number.' });
      return;
    }

    res.json({ product, available: false });
  } catch (error) {
    next(error);
  }
});

router.get('/products/:productId/stock-history', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const productId = String(req.params.productId || '').trim();
    const limit = parsePositiveInteger(req.query.limit, 20, 100);
    const { data: movements, error: movementsError } = await supabaseAdmin
      .schema('catalog')
      .from('inventory_movements')
      .select('id, product_id, movement_type, quantity, reference_type, reference_id, notes, performed_by, business_date, created_at')
      .eq('product_id', productId)
      .neq('movement_type', 'reservation')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (movementsError) {
      throw movementsError;
    }

    const userIds = [...new Set((movements ?? []).map((movement) => movement.performed_by).filter(Boolean))];
    const { data: profiles, error: profilesError } = userIds.length > 0
      ? await supabaseAdmin.schema('core').from('user_profiles').select('user_id, full_name, email').in('user_id', userIds)
      : { data: [], error: null };

    if (profilesError && !isPrivateSchemaAccessError(profilesError)) {
      throw profilesError;
    }

    const profileMap = new Map((profilesError ? [] : (profiles ?? [])).map((profile) => [profile.user_id, profile]));

    res.json({
      history: (movements ?? []).map((movement) => {
        const profile = profileMap.get(movement.performed_by) ?? {};
        return {
          id: movement.id,
          productId: movement.product_id,
          movementType: movement.movement_type,
          quantity: Number(movement.quantity ?? 0),
          referenceType: movement.reference_type,
          referenceId: movement.reference_id,
          notes: movement.notes,
          performedBy: profile.full_name || profile.email || 'System',
          businessDate: movement.business_date,
          createdAt: movement.created_at,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/summary', requireRole('admin', 'stock_clerk'), async (_req, res, next) => {
  try {
    res.json({
      summary: await getCatalogSummaryData(),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/stock/receive', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const idempotencyKey = requireIdempotencyKey(req.get('Idempotency-Key'));
    const productId = String(req.body?.productId || '').trim();
    const quantity = parsePositiveStockQuantity(req.body?.quantity);
    const supplierId = String(req.body?.supplierId || '').trim() || null;
    const supplierName = String(req.body?.supplierName || '').trim();
    const referenceNumber = String(req.body?.referenceNumber || '').trim() || `RCV-${idempotencyKey.slice(0, 60)}`;
    const reason = String(req.body?.reason || '').trim();

    if (!productId) {
      res.status(400).json({ error: 'Product is required.' });
      return;
    }

    if (quantity === null) {
      res.status(400).json({ error: 'Quantity must be greater than zero.' });
      return;
    }

    const receipt = await receiveCatalogStock({
      payload: {
        productId,
        quantity,
        supplierId,
        supplierName,
        supplierContact: normalizeOptionalText(req.body?.supplierContact, 80),
        supplierAddress: normalizeOptionalText(req.body?.supplierAddress, 500),
        referenceNumber,
        receivedDate: String(req.body?.receivedDate || '').trim() || null,
        reason: reason || null,
      },
      performedBy: req.user?.id || null,
      idempotencyKey,
      invokeRpc: callRpc,
    });

    invalidateProductCatalogCache();

    res
      .set('Idempotency-Key', idempotencyKey)
      .status(receipt?.idempotentReplay ? 200 : 201)
      .json(receipt);
  } catch (error) {
    next(error);
  }
});

router.post('/stock/receive-batch', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const key = requireIdempotencyKey(req.get('Idempotency-Key'));
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length < 1 || items.length > 100
      || items.some((item) => !/^[0-9a-f-]{36}$/i.test(String(item.productId || '')) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 1000000)) {
      return res.status(400).json({ error: 'Choose 1–100 products and enter a whole-number quantity from 1 to 1,000,000 for each.' });
    }
    const receipt = await callRpc('receive_catalog_stock_batch', {
      p_payload: {
        items: items.map((item) => ({ productId: item.productId, quantity: Number(item.quantity) })),
        supplierId: normalizeOptionalText(req.body.supplierId, 80),
        supplierName: normalizeOptionalText(req.body.supplierName, 180),
        referenceNumber: normalizeOptionalText(req.body.referenceNumber, 120),
        receivedDate: normalizeOptionalText(req.body.receivedDate, 10),
        reason: normalizeOptionalText(req.body.reason, 1000),
      }, p_performed_by: req.user.id, p_idempotency_key: key,
    });
    invalidateProductCatalogCache();
    return res.set('Idempotency-Key', key).status(receipt?.idempotentReplay ? 200 : 201).json(receipt);
  } catch (error) { next(error.statusCode ? error : mapStockReceiptError(error)); }
});

router.post('/stock/receive-invoice', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const idempotencyKey = requireIdempotencyKey(req.get('Idempotency-Key'));
    const receipt = await receiveSupplierInvoiceStock({
      invoice: req.body,
      performedBy: req.user?.id ?? null,
      idempotencyKey,
      allowNewProducts: req.body?.allowNewProducts !== false,
      invokeRpc: callRpc,
    });

    invalidateProductCatalogCache();

    res
      .set('Idempotency-Key', idempotencyKey)
      .status(receipt?.idempotentReplay ? 200 : 201)
      .json({
        receipt,
        items: receipt?.items ?? [],
      });
  } catch (error) {
    next(error);
  }
});

router.post('/stock/invoice-ocr', requireRole('admin', 'stock_clerk'), invoiceUpload.single('invoice'), async (req, res, next) => {
  try {
    const result = await analyzeSupplierInvoiceImage(req.file, { requestId: req.requestId });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/products', requireRole('admin'), async (req, res, next) => {
  try {
    const name = normalizeRequiredText(req.body?.name, 220);
    const sku = normalizePartNumber(req.body?.sku);
    const category = normalizeRequiredText(req.body?.category, 140);
    const modelName = normalizeOptionalText(req.body?.model, 140);
    const brand = normalizeOptionalText(req.body?.brand, 80) || 'Mitsubishi';
    const uom = normalizeOptionalText(req.body?.uom, 20) || 'PC';
    const sourceCategory = normalizeOptionalText(req.body?.sourceCategory, 140);
    const supplierId = normalizeOptionalText(req.body?.supplierId, 80);
    const supplierName = normalizeOptionalText(req.body?.supplierName, 180);
    const imageUrl = normalizeOptionalText(req.body?.imageUrl, 1000);
    const price = parsePrice(req.body?.price);
    const requestedStock = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'stock')
      ? parseStockLevel(req.body?.stock)
      : null;

    if (!name || !category || !sku) {
      res.status(400).json({ error: 'Product name, part number, and category are required.' });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'stock') && requestedStock === null) {
      res.status(400).json({ error: 'Stock quantity must be zero or greater.' });
      return;
    }

    if (price === null) {
      res.status(400).json({ error: 'Retail price must be zero or greater.' });
      return;
    }

    const existingProduct = await getProductByPartNumber(sku);
    if (existingProduct) {
      sendDuplicateProductResponse(res, existingProduct, sku);
      return;
    }

    const nowIso = new Date().toISOString();
    const businessDate = nowIso.slice(0, 10);
    const initialStock = requestedStock ?? 0;
    const classification = classifyInventoryItem({
      sku,
      name,
      model_name: modelName,
      category,
      sourceCategory,
      metadata: { sourceCategory },
    });

    const { data: product, error: productError } = await supabaseAdmin
      .schema('catalog')
      .from('products')
      .insert({
        sku,
        name,
        model_name: modelName,
        category: classification.category,
        brand,
        uom,
        status: getStatusForStockLevel(initialStock),
        source_category: sourceCategory,
        metadata: {
          sourceCategory,
          supplierId,
          supplierName,
          imageUrl,
          classification: classification.trace,
        },
      })
      .select('id, sku, name, model_name, category, brand, uom, status, source_category, metadata, created_at')
      .single();

    if (productError) {
      if (productError.code === '23505') {
        const duplicateProduct = await getProductByPartNumber(sku);
        sendDuplicateProductResponse(res, duplicateProduct, sku);
        return;
      }
      throw productError;
    }

    const { error: priceError } = await supabaseAdmin
      .schema('catalog')
      .from('product_prices')
      .insert({
        product_id: product.id,
        price_type: 'retail',
        amount: price,
        currency: 'PHP',
        effective_from: businessDate,
        effective_to: null,
        is_current: true,
        business_date: businessDate,
      });

    if (priceError) {
      throw priceError;
    }

    const { error: balanceError } = await supabaseAdmin
      .schema('catalog')
      .from('inventory_balances')
      .insert({
        product_id: product.id,
        on_hand: initialStock,
        reserved: 0,
        reorder_point: 5,
        reorder_quantity: 10,
        location: { floor: 1, section: 'GEN' },
        as_of_date: businessDate,
        business_date: businessDate,
      });

    if (balanceError) {
      throw balanceError;
    }

    await linkProductSupplier(product.id, supplierId);
    await upsertProductImage(product.id, imageUrl);

    invalidateProductCatalogCache();

    res.status(201).json({
      product: (await enrichCatalogProducts([mapCatalogRow({
        id: product.id,
        sku: product.sku,
        name: product.name,
        model: product.model_name,
        category: product.category,
        source_category: product.source_category,
        price,
        stock: initialStock,
        status: product.status,
        uom: product.uom,
        brand: product.brand,
        created_at: product.created_at,
        metadata: product.metadata ?? {},
      })]))[0],
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/products/:productId', requireRole('admin'), async (req, res, next) => {
  try {
    const productId = String(req.params.productId || '').trim();
    const name = normalizeRequiredText(req.body?.name, 220);
    const sku = normalizePartNumber(req.body?.sku);
    const category = normalizeRequiredText(req.body?.category, 140);
    const modelName = normalizeOptionalText(req.body?.model, 140);
    const brand = normalizeOptionalText(req.body?.brand, 80) || 'Mitsubishi';
    const uom = normalizeOptionalText(req.body?.uom, 20) || 'PC';
    const status = normalizeOptionalText(req.body?.status, 40) || 'in_stock';
    const sourceCategory = normalizeOptionalText(req.body?.sourceCategory, 140);
    const supplierId = normalizeOptionalText(req.body?.supplierId, 80);
    const supplierName = normalizeOptionalText(req.body?.supplierName, 180);
    const imageUrl = normalizeOptionalText(req.body?.imageUrl, 1000);
    const price = parsePrice(req.body?.price);
    const requestedStock = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'stock')
      ? parseStockLevel(req.body?.stock)
      : null;

    if (!productId) {
      res.status(400).json({ error: 'Product is required.' });
      return;
    }

    if (!name || !category || !sku) {
      res.status(400).json({ error: 'Product name, part number, and category are required.' });
      return;
    }

    if (!['in_stock', 'low_stock', 'out_of_stock', 'discontinued'].includes(status)) {
      res.status(400).json({ error: 'Invalid product status.' });
      return;
    }

    if (price === null) {
      res.status(400).json({ error: 'Retail price must be zero or greater.' });
      return;
    }

    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'stock') && requestedStock === null) {
      res.status(400).json({ error: 'Stock available must be zero or greater.' });
      return;
    }

    const existingProduct = await getProductByPartNumber(sku);
    if (existingProduct && existingProduct.id !== productId) {
      sendDuplicateProductResponse(res, existingProduct, sku);
      return;
    }

    const nowIso = new Date().toISOString();
    const businessDate = nowIso.slice(0, 10);
    const classification = classifyInventoryItem({
      sku,
      name,
      model_name: modelName,
      category,
      sourceCategory,
      metadata: { sourceCategory },
    });

    const { data: currentProduct, error: currentProductError } = await supabaseAdmin
      .schema('catalog')
      .from('products')
      .select('metadata')
      .eq('id', productId)
      .maybeSingle();

    if (currentProductError) {
      throw currentProductError;
    }

    const { data: currentBalance, error: currentBalanceError } = await supabaseAdmin
      .schema('catalog')
      .from('inventory_balances')
      .select('on_hand')
      .eq('product_id', productId)
      .maybeSingle();

    if (currentBalanceError) {
      throw currentBalanceError;
    }

    const targetStock = requestedStock ?? Number(currentBalance?.on_hand ?? 0);
    let stockAdjustment = null;

    if (requestedStock !== null && requestedStock !== Number(currentBalance?.on_hand ?? 0)) {
      stockAdjustment = await callRpc('set_product_stock_level', {
        p_product_id: productId,
        p_stock: requestedStock,
        p_reason: 'Manual stock available edit from Inventory Details',
        p_performed_by: req.user?.id ?? null,
      });
    }

    const { data: product, error: productError } = await supabaseAdmin
      .schema('catalog')
      .from('products')
      .update({
        sku,
        name,
        model_name: modelName,
        category,
        brand,
        uom,
        status: requestedStock !== null ? getStatusForStockLevel(stockAdjustment?.updatedStock ?? targetStock) : status,
        source_category: sourceCategory,
        metadata: mergeProductMetadata(currentProduct?.metadata, {
          sourceCategory,
          supplierId,
          supplierName,
          imageUrl,
          classification: classification.trace,
        }),
        updated_at: nowIso,
      })
      .eq('id', productId)
      .select('id, sku, name, model_name, category, brand, uom, status, source_category, metadata, created_at')
      .maybeSingle();

    if (productError) {
      if (productError.code === '23505') {
        const duplicateProduct = await getProductByPartNumber(sku);
        sendDuplicateProductResponse(res, duplicateProduct, sku);
        return;
      }
      throw productError;
    }

    if (!product) {
      res.status(404).json({ error: 'Product was not found in the catalog.' });
      return;
    }

    await saveCurrentRetailPrice(productId, price, businessDate, nowIso);

    await linkProductSupplier(productId, supplierId);
    await upsertProductImage(productId, imageUrl);

    invalidateProductCatalogCache();

    res.json({
      product: (await enrichCatalogProducts([mapCatalogRow({
        id: product.id,
        sku: product.sku,
        name: product.name,
        model: product.model_name,
        category: product.category,
        source_category: product.source_category,
        price,
        stock: Number(stockAdjustment?.updatedStock ?? targetStock),
        status: product.status,
        uom: product.uom,
        brand: product.brand,
        created_at: product.created_at,
        metadata: product.metadata ?? {},
      })]))[0],
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/products/:productId/archive', requireRole('admin'), async (req, res, next) => {
  try {
    const productId = String(req.params.productId || '').trim();
    const archive = req.body?.archive !== false;
    const reason = String(req.body?.reason || '').trim();

    if (!productId) {
      res.status(400).json({ error: 'Product is required.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const { data: product, error: updateError } = await supabaseAdmin
      .schema('catalog')
      .from('products')
      .update({
        is_active: !archive,
        updated_at: nowIso,
      })
      .eq('id', productId)
      .select('id, sku, name, is_active')
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    if (!product) {
      res.status(404).json({ error: 'Product was not found in the catalog.' });
      return;
    }

    const notes = [
      archive ? 'Reason: Product archived' : 'Reason: Product restored',
      reason ? `Details: ${reason}` : null,
    ].filter(Boolean).join(' | ');

    const { error: movementError } = await supabaseAdmin
      .schema('catalog')
      .from('inventory_movements')
      .insert({
        product_id: productId,
        movement_type: 'adjustment',
        quantity: 0,
        reference_type: archive ? 'product_archive' : 'product_restore',
        reference_id: null,
        notes,
        performed_by: req.user?.id || null,
        business_date: nowIso.slice(0, 10),
      });

    if (movementError) {
      throw movementError;
    }

    invalidateProductCatalogCache();

    res.json({
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        isActive: Boolean(product.is_active),
      },
      archived: archive,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/products/:productId', requireRole('admin'), async (req, res, next) => {
  try {
    const productId = String(req.params.productId || '').trim();
    const confirmSku = String(req.body?.confirmSku || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId) || !confirmSku) {
      res.status(400).json({ error: 'Select an archived product and confirm its part number.' });
      return;
    }
    const result = await callRpc('delete_archived_catalog_product', {
      p_product_id: productId, p_actor_user_id: req.user.id, p_confirm_sku: confirmSku,
    });
    if (!result?.deleted) {
      res.status(result?.reason === 'not_found' ? 404 : 409).json({ error: 'The archived product was not found. Refresh the list.' });
      return;
    }
    invalidateProductCatalogCache();
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/products/archived', requireRole('admin'), async (req, res, next) => {
  try {
    const limit = parsePositiveInteger(req.query.limit, 250, 250);
    const { data: products, error: productsError } = await supabaseAdmin
      .schema('catalog')
      .from('products')
      .select('id, sku, name, category, model_name, brand, uom, updated_at')
      .eq('is_active', false)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (productsError) {
      if (isPrivateSchemaAccessError(productsError)) {
        res.json({ products: [] });
        return;
      }
      throw productsError;
    }

    const productIds = (products ?? []).map((product) => product.id);
    const [{ data: prices, error: pricesError }, { data: balances, error: balancesError }] = await Promise.all([
      productIds.length > 0
        ? supabaseAdmin
          .schema('catalog')
          .from('product_prices')
          .select('product_id, amount')
          .eq('price_type', 'retail')
          .eq('is_current', true)
          .in('product_id', productIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length > 0
        ? supabaseAdmin
          .schema('catalog')
          .from('inventory_balances')
          .select('product_id, on_hand, reserved')
          .in('product_id', productIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (pricesError) {
      if (isPrivateSchemaAccessError(pricesError)) {
        res.json({ products: [] });
        return;
      }
      throw pricesError;
    }

    if (balancesError) {
      if (isPrivateSchemaAccessError(balancesError)) {
        res.json({ products: [] });
        return;
      }
      throw balancesError;
    }

    const priceMap = new Map((prices ?? []).map((price) => [price.product_id, Number(price.amount ?? 0)]));
    const balanceMap = new Map((balances ?? []).map((balance) => [balance.product_id, Number(balance.on_hand ?? 0)]));
    res.json({
      products: (products ?? []).map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        model: product.model_name,
        category: product.category,
        brand: product.brand,
        uom: product.uom,
        price: priceMap.get(product.id) ?? 0,
        stock: balanceMap.get(product.id) ?? 0,
        reserved: 0,
        archivedAt: product.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stock/movements', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const result = await callRpc('get_inventory_movement_page', {
      p_limit: parsePositiveInteger(req.query.limit, 50, 500),
      p_page: parsePositiveInteger(req.query.page, 1, 1000000),
      p_search: String(req.query.search || '').trim().slice(0, 180),
      p_type: String(req.query.type || 'all').slice(0, 40),
      p_start_date: req.query.startDate || null, p_end_date: req.query.endDate || null,
    });
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/services', async (_req, res, next) => {
  try {
    const services = await getCachedServiceCatalog();

    res.json({
      services,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/prices/current', requireRole('admin'), async (_req, res, next) => {
  try {
    let activeVersion = null;
    try {
      const { data, error } = await supabaseAdmin
        .schema('catalog')
        .from('pricelist_versions')
        .select('id, version_year, effective_from, status, is_active, row_count, activated_at')
        .eq('price_type', 'retail')
        .eq('is_active', true)
        .maybeSingle();
      if (error && !isPrivateSchemaAccessError(error)) {
        throw error;
      }
      activeVersion = data ?? null;
    } catch (versionError) {
      if (!isPrivateSchemaAccessError(versionError)) {
        throw versionError;
      }
    }

    let priceList = [];
    if (activeVersion?.id) {
      const { data: versionItems, error: versionItemsError } = await supabaseAdmin
        .schema('catalog')
        .from('pricelist_version_items')
        .select('id, product_id, sku, name, model_name, category, price')
        .eq('pricelist_version_id', activeVersion.id)
        .order('name', { ascending: true })
        .order('sku', { ascending: true });

      if (versionItemsError && !isPrivateSchemaAccessError(versionItemsError)) {
        throw versionItemsError;
      }

      if (!versionItemsError) {
        priceList = (versionItems ?? []).map((item) => ({
          id: item.product_id ?? item.id,
          sku: item.sku,
          name: item.name,
          model: item.model_name,
          category: item.category,
          price: Number(item.price ?? 0),
        }));
      }
    }

    // Keep the endpoint usable while a staged rollout has not applied the
    // versioned migration yet, or if an older database has no active snapshot.
    if (priceList.length === 0) {
      const products = await getCachedProductCatalog();
      priceList = (products ?? []).map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        model: product.model,
        category: product.category,
        price: Number(product.price ?? 0),
      }));
    }

    res.json({
      priceList,
      activeVersion: activeVersion ? {
        id: activeVersion.id,
        versionYear: Number(activeVersion.version_year),
        effectiveFrom: activeVersion.effective_from,
        status: activeVersion.status,
        isActive: Boolean(activeVersion.is_active),
        rowCount: Number(activeVersion.row_count ?? 0),
        activatedAt: activeVersion.activated_at,
      } : null,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/prices/versions', requireRole('admin'), async (_req, res, next) => {
  try {
    const { data: versions, error: versionsError } = await supabaseAdmin
      .schema('catalog')
      .from('pricelist_versions')
      .select('id, price_type, version_year, revision, effective_from, effective_to, status, is_active, source_filename, row_count, created_at, activated_at')
      .eq('price_type', 'retail')
      .order('version_year', { ascending: false })
      .order('effective_from', { ascending: false });

    if (versionsError) {
      if (isPrivateSchemaAccessError(versionsError)) {
        res.json({ versions: [] });
        return;
      }
      throw versionsError;
    }

    res.json({
      versions: (versions ?? []).map((version) => ({
        id: version.id,
        priceType: version.price_type,
        versionYear: Number(version.version_year),
        revision: Number(version.revision ?? 1),
        effectiveFrom: version.effective_from,
        effectiveTo: version.effective_to,
        status: version.status,
        isActive: Boolean(version.is_active),
        sourceFilename: version.source_filename,
        rowCount: Number(version.row_count ?? 0),
        createdAt: version.created_at,
        activatedAt: version.activated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/prices/versions/:versionId/items', requireRole('admin'), async (req, res, next) => {
  try {
    const versionId = String(req.params.versionId || '').trim();
    const limit = parsePositiveInteger(req.query.limit, 1000, 5000);
    const search = normalizePostgrestSearchTerm(req.query.q || '');
    const skuFilter = String(req.query.skus || '')
      .split(',')
      .map((sku) => normalizePriceListPartNumber(sku))
      .filter(Boolean)
      .slice(0, 250);
    let query = supabaseAdmin
      .schema('catalog')
      .from('pricelist_version_items')
      .select('id, pricelist_version_id, product_id, source_line_number, sku, name, model_name, uom, pcc, price, category, source_category, status')
      .eq('pricelist_version_id', versionId)
      .order('name', { ascending: true })
      .order('sku', { ascending: true })
      .limit(limit);

    if (search) {
      query = query.or(`sku.ilike.*${search}*,name.ilike.*${search}*,model_name.ilike.*${search}*`);
    }
    if (skuFilter.length > 0) {
      query = query.in('sku', skuFilter);
    }

    const { data, error } = await query;
    if (error) {
      if (isPrivateSchemaAccessError(error)) {
        res.status(404).json({ error: 'Price list versioning is not available yet.' });
        return;
      }
      throw error;
    }

    res.json({
      items: (data ?? []).map((item) => ({
        id: item.id,
        versionId: item.pricelist_version_id,
        productId: item.product_id,
        sourceLineNumber: item.source_line_number,
        sku: item.sku,
        name: item.name,
        model: item.model_name,
        uom: item.uom,
        pcc: item.pcc,
        price: Number(item.price ?? 0),
        category: item.category,
        sourceCategory: item.source_category,
        status: item.status,
      })),
      limit,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/prices/versions/:versionId/activate', requireRole('admin'), async (req, res, next) => {
  try {
    const versionId = String(req.params.versionId || '').trim();
    const { data, error } = await supabaseAdmin.rpc('activate_retail_pricelist_version', {
      p_version_id: versionId,
      p_actor_id: req.user?.id ?? null,
    });

    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('function') && message.includes('does not exist')) {
        error.statusCode = 503;
        error.publicMessage = 'Apply the versioned price list migration before activating a saved list.';
      }
      throw error;
    }

    invalidateProductCatalogCache();
    res.json({
      ...(data ?? {}),
      versionId: data?.versionId ?? versionId,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/prices/bulk-replace', requireRole('admin'), async (req, res, next) => {
  try {
    const items = normalizePriceListItems(req.body?.items);
    const effectiveFrom = req.body?.effectiveFrom || new Date().toISOString().slice(0, 10);
    const result = await replaceRetailPrices(items, effectiveFrom, {
      versionYear: req.body?.versionYear,
      activate: parsePriceListActivation(req.body?.activate, true),
      actorId: req.user?.id,
    });

    if (req.timedOut || res.headersSent) {
      return;
    }

    res.json(result);
  } catch (error) {
    if (req.timedOut || res.headersSent) {
      return;
    }
    next(error);
  }
});

router.post('/prices/bulk-replace-file', requireRole('admin'), handlePriceListUpload, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Upload a CSV or Excel price list file.' });
    }

    const items = parsePriceListUpload(req.file);
    const effectiveFrom = req.body?.effectiveFrom || new Date().toISOString().slice(0, 10);
    const result = await replaceRetailPrices(items, effectiveFrom, {
      versionYear: req.body?.versionYear,
      activate: parsePriceListActivation(req.body?.activate, true),
      sourceFilename: req.file.originalname,
      actorId: req.user?.id,
    });

    if (req.timedOut || res.headersSent) {
      return;
    }

    res.json(result);
  } catch (error) {
    if (req.timedOut || res.headersSent) {
      return;
    }
    next(error);
  }
});

async function replaceRetailPrices(items, effectiveFrom, options = {}) {
  if (items.length === 0) {
    const error = new Error('Provide at least one valid part number and price.');
    error.statusCode = 400;
    throw error;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effectiveFrom || ''))) {
    const error = new Error('Choose a valid effective date before applying the price list.');
    error.statusCode = 400;
    throw error;
  }

  const versionYear = parsePriceListVersionYear(options.versionYear, effectiveFrom);
  if (!versionYear) {
    const error = new Error('Choose a valid four-digit price list year.');
    error.statusCode = 400;
    throw error;
  }

  const { data, error: rpcError } = await supabaseAdmin.rpc('import_retail_pricelist_version', {
    p_items: items,
    p_version_year: versionYear,
    p_effective_from: effectiveFrom,
    p_source_filename: options.sourceFilename || null,
    p_activate: options.activate !== false,
    p_actor_id: options.actorId || null,
  });

  if (rpcError) {
    const message = String(rpcError.message || '').toLowerCase();
    annotatePriceListImportError(rpcError);
    if (message.includes('function') && message.includes('does not exist')) {
      rpcError.statusCode = 503;
      rpcError.publicMessage = 'Apply the versioned price list migration before uploading a list.';
    }
    throw rpcError;
  }

  invalidateProductCatalogCache();

  return {
    ...(data ?? {}),
    skippedItems: Array.isArray(data?.skippedItems) ? data.skippedItems : [],
    priceChanges: Array.isArray(data?.priceChanges) ? data.priceChanges : [],
    effectiveFrom: data?.effectiveFrom || effectiveFrom,
    versionYear: Number(data?.versionYear ?? versionYear),
    versionId: data?.versionId ?? null,
  };
}

// Kept as a reference implementation for rollback/debugging. Production uploads
// use the single-transaction RPC above so large workbooks do not time out.
async function replaceRetailPricesLegacy(items, effectiveFrom) {
  if (items.length === 0) {
    const error = new Error('Provide at least one valid part number and price.');
    error.statusCode = 400;
    throw error;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effectiveFrom || ''))) {
    const error = new Error('Choose a valid effective date before applying the price list.');
    error.statusCode = 400;
    throw error;
  }

  const uniqueItems = Array.from(
    items.reduce((map, item) => map.set(item.sku, item), new Map()).values()
  );

  const skuList = uniqueItems.map((item) => item.sku);
  const currentProducts = [];

  for (const skuChunk of chunkArray(skuList, PRICE_LIST_LOOKUP_BATCH_SIZE)) {
    const { data, error: productsError } = await supabaseAdmin
      .schema('catalog')
      .from('products')
      .select('id, sku, name, model_name, category, brand, uom, status, source_category, metadata')
      .in('sku', skuChunk);

    if (productsError) {
      throw productsError;
    }

    currentProducts.push(...(data ?? []));
  }

  let productMap = new Map((currentProducts ?? []).map((product) => [product.sku, product]));
  const existingProductIds = new Set((currentProducts ?? []).map((product) => product.id));
  const nowIso = new Date().toISOString();
  const businessDate = effectiveFrom;
  let newProductsCount = 0;
  let stockRowsCreated = 0;
  const productRows = uniqueItems
    .filter((item) => !productMap.has(item.sku))
    .map((item) => {
      const currentProduct = productMap.get(item.sku) ?? {};
      const sourceCategory = item.sourceCategory || item.category || currentProduct.source_category || '';
      const name = item.name || currentProduct.name || item.sku;
      const modelName = item.model || currentProduct.model_name || '';
      const classification = classifyInventoryItem({
        sku: item.sku,
        name,
        model_name: modelName,
        category: item.category || currentProduct.category || sourceCategory,
        sourceCategory,
        metadata: { sourceCategory },
      });

      return {
        sku: item.sku,
        name,
        model_name: modelName || null,
        category: classification.category,
        brand: currentProduct.brand || 'Mitsubishi',
        uom: currentProduct.uom || 'PC',
        status: currentProduct.status || 'out_of_stock',
        source_category: sourceCategory || null,
        metadata: mergeProductMetadata(currentProduct.metadata, {
          sourceCategory,
          classification: classification.trace,
          priceListUpload: {
            source: 'bulk_replace',
            effectiveFrom: businessDate,
            uploadedAt: nowIso,
          },
        }),
        is_active: true,
        updated_at: nowIso,
      };
    });

  if (productRows.length > 0) {
    const upsertedProducts = [];

    for (const productChunk of chunkArray(productRows)) {
      const { data, error: upsertError } = await supabaseAdmin
        .schema('catalog')
        .from('products')
        .upsert(productChunk, { onConflict: 'sku' })
        .select('id, sku, name, model_name, category, source_category, metadata');

      if (upsertError) {
        throw upsertError;
      }

      upsertedProducts.push(...(data ?? []));
    }

    productMap = new Map([
      ...productMap,
      ...(upsertedProducts ?? []).map((product) => [product.sku, product]),
    ]);

    const newBalanceRows = (upsertedProducts ?? [])
      .filter((product) => !existingProductIds.has(product.id))
      .map((product) => ({
        product_id: product.id,
        on_hand: 0,
        reserved: 0,
        reorder_point: 0,
        reorder_quantity: 0,
        location: {},
        as_of_date: businessDate,
        business_date: businessDate,
      }));

    newProductsCount = newBalanceRows.length;

    if (newBalanceRows.length > 0) {
      // Price-list replacement must never overwrite stock. Existing balances are left untouched.
      for (const balanceChunk of chunkArray(newBalanceRows)) {
        const { error: balanceError } = await supabaseAdmin
          .schema('catalog')
          .from('inventory_balances')
          .upsert(balanceChunk, { onConflict: 'product_id', ignoreDuplicates: true });

        if (balanceError) {
          throw balanceError;
        }
      }

      stockRowsCreated = newBalanceRows.length;
    }
  }

  const matchedItems = uniqueItems.filter((item) => productMap.has(item.sku));
  const skippedItems = uniqueItems.filter((item) => !productMap.has(item.sku));

  if (matchedItems.length === 0) {
    const error = new Error('No matching part numbers were found in the catalog.');
    error.statusCode = 404;
    error.skippedItems = skippedItems;
    throw error;
  }

  const matchedProductIds = matchedItems.map((item) => productMap.get(item.sku).id);
  const previousDate = getPreviousDate(effectiveFrom);
  const previousPriceMap = new Map();

  for (const productIdChunk of chunkArray(matchedProductIds, PRICE_LIST_LOOKUP_BATCH_SIZE)) {
    const { data: currentPrices, error: currentPricesError } = await supabaseAdmin
      .schema('catalog')
      .from('product_prices')
      .select('product_id, amount')
      .eq('price_type', 'retail')
      .eq('is_current', true)
      .in('product_id', productIdChunk);

    if (currentPricesError) {
      throw currentPricesError;
    }

    (currentPrices ?? []).forEach((price) => {
      previousPriceMap.set(price.product_id, Number(price.amount ?? 0));
    });
  }

  const itemsToUpdate = matchedItems.filter((item) => {
    const product = productMap.get(item.sku);
    const previousPrice = previousPriceMap.has(product.id) ? Number(previousPriceMap.get(product.id) ?? 0) : null;
    const newPrice = Number(item.price ?? 0);

    return previousPrice === null || Number(previousPrice.toFixed(2)) !== Number(newPrice.toFixed(2));
  });
  const productIdsToUpdate = itemsToUpdate.map((item) => productMap.get(item.sku).id);

  for (const productIdChunk of chunkArray(productIdsToUpdate, PRICE_LIST_LOOKUP_BATCH_SIZE)) {
    const { error: archiveError } = await supabaseAdmin
      .schema('catalog')
      .from('product_prices')
      .update({
        is_current: false,
        effective_to: previousDate,
        updated_at: nowIso,
      })
      .eq('price_type', 'retail')
      .eq('is_current', true)
      .in('product_id', productIdChunk);

    if (archiveError) {
      throw archiveError;
    }
  }

  const newPrices = itemsToUpdate.map((item) => ({
    product_id: productMap.get(item.sku).id,
    price_type: 'retail',
    amount: item.price,
    currency: 'PHP',
    effective_from: effectiveFrom,
    effective_to: null,
    is_current: true,
    business_date: effectiveFrom,
  }));

  for (const priceChunk of chunkArray(newPrices)) {
    const { error: insertError } = await supabaseAdmin
      .schema('catalog')
      .from('product_prices')
      .insert(priceChunk);

    if (insertError) {
      throw insertError;
    }
  }

  invalidateProductCatalogCache();

  const uploadedSkuSet = new Set(productRows.map((product) => product.sku));
  const allPriceChanges = matchedItems.map((item) => {
    const product = productMap.get(item.sku);
    const previousPrice = previousPriceMap.has(product.id) ? previousPriceMap.get(product.id) : null;
    const newPrice = Number(item.price ?? 0);
    const status = uploadedSkuSet.has(item.sku)
      ? 'new_part'
      : previousPrice === null
        ? 'new_price'
        : previousPrice === newPrice
          ? 'unchanged'
          : 'changed';

    return {
      sku: item.sku,
      name: product.name || item.name || item.sku,
      model: product.model_name || item.model || '',
      category: product.category || item.category || '',
      previousPrice,
      newPrice,
      difference: previousPrice === null ? null : Number((newPrice - previousPrice).toFixed(2)),
      status,
    };
  });
  const changedCount = allPriceChanges.filter((item) => item.status === 'changed' || item.status === 'new_part' || item.status === 'new_price').length;
  const unchangedCount = allPriceChanges.filter((item) => item.status === 'unchanged').length;
  const priceChanges = allPriceChanges.slice(0, PRICE_LIST_CHANGE_PREVIEW_LIMIT);

  return {
    updatedCount: matchedItems.length,
    changedCount,
    unchangedCount,
    skippedCount: skippedItems.length,
    skippedItems,
    priceChanges,
    priceChangesPreviewLimit: PRICE_LIST_CHANGE_PREVIEW_LIMIT,
    priceChangesTotalCount: allPriceChanges.length,
    createdOrUpdatedProducts: productRows.length,
    newProductsCount,
    stockRowsCreated,
    receivedCount: items.length,
    uniqueCount: uniqueItems.length,
    effectiveFrom,
  };
}

router.get("/products/:productId/recommendations", (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(410).json({ error: 'This older package view has been replaced. Refresh the page to browse current published packages.', code: 'PACKAGE_VIEW_REPLACED' });
});

export default router;

















