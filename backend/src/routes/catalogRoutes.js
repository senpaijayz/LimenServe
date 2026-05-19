import { Router } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../config/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { clearPublicResponseCache } from '../middleware/cache.js';
import { analyzeSupplierInvoiceImage } from '../services/invoiceOcrService.js';
import { callRpc } from '../services/supabaseRpc.js';
import inventoryClassifier from '../../../scripts/lib/inventory-classifier.cjs';

const { CLASSIFIER_VERSION, classifyInventoryItem } = inventoryClassifier;

const router = Router();
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
const PRODUCT_CATALOG_CACHE_TTL_MS = 30 * 60 * 1000;
const FULL_CATALOG_PAGE_SIZE = 250;
const FULL_CATALOG_PAGE_BATCH_SIZE = 3;
const SERVICE_CATALOG_CACHE_TTL_MS = 30 * 60 * 1000;
const VEHICLE_FITMENT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_PART_LIMIT = 6;
const DEFAULT_SERVICE_LIMIT = 4;
const DEFAULT_PACKAGE_DESCRIPTION = 'Smart upsell bundle of Mitsubishi-matched parts and services for this vehicle.';
const SMART_PART_DISCOUNT_RATE = 0.05;
const SMART_SERVICE_DISCOUNT_RATE = 0.03;
const SMART_RECOMMENDATION_LABEL = 'Smart Recommendation';

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

const SERVICE_GROUP_CONFIG = {
  oil_change: {
    packageKey: 'oil-change-package',
    packageName: 'Smart Oil Care Bundle',
    packageDescription: 'Upsell bundle of oil, filter, washer, and labor with light package savings for this Mitsubishi model.',
    serviceKeywords: ['oil change', 'change oil', 'preventive maintenance'],
  },
  brake_service: {
    packageKey: 'brake-service-package',
    packageName: 'Smart Brake Care Bundle',
    packageDescription: 'Upsell bundle of brake parts, installation, and cleaning labor for this Mitsubishi model.',
    serviceKeywords: ['brake', 'installation', 'overhaul'],
  },
  cooling_service: {
    packageKey: 'cooling-service-package',
    packageName: 'Smart Cooling Care Bundle',
    packageDescription: 'Upsell bundle of cooling-system parts and labor with smart package pricing for this Mitsubishi model.',
    serviceKeywords: ['cooling', 'radiator', 'coolant'],
  },
  battery_service: {
    packageKey: 'battery-service-package',
    packageName: 'Smart Battery Care Bundle',
    packageDescription: 'Upsell bundle of battery, terminal, and electrical service recommendations for this Mitsubishi model.',
    serviceKeywords: ['battery', 'terminal', 'electrical'],
  },
  tune_up: {
    packageKey: 'tune-up-package',
    packageName: 'Smart Tune-Up Bundle',
    packageDescription: 'Upsell bundle of ignition, filter, and tune-up labor tailored to this Mitsubishi model.',
    serviceKeywords: ['tune', 'diagnostic', 'inspection', 'engine', 'injector', 'fuel', 'throttle', 'gasket', 'pcv'],
  },
  filter_service: {
    packageKey: 'filter-service-package',
    packageName: 'Smart Filter Service Bundle',
    packageDescription: 'Upsell bundle of replacement filters and labor with light package savings for this Mitsubishi model.',
    serviceKeywords: ['filter', 'maintenance', 'inspection'],
  },
  tire_service: {
    packageKey: 'tire-service-package',
    packageName: 'Smart Tire Care Bundle',
    packageDescription: 'Upsell bundle of tire, wheel, balancing, and alignment services for this Mitsubishi model.',
    serviceKeywords: ['tire', 'wheel alignment', 'wheel balancing', 'installation', 'alignment', 'balancing'],
  },
  general_service: {
    packageKey: 'general-service-package',
    packageName: 'Smart Inspection Bundle',
    packageDescription: 'General diagnostic and service labor for Mitsubishi parts that do not have a specific learned bundle yet.',
    serviceKeywords: ['diagnostic', 'inspection', 'service', 'installation', 'tuning', 'maintenance'],
  },
};

const VEHICLE_PACKAGE_ORDER = [
  'oil_change',
  'filter_service',
  'tune_up',
  'brake_service',
  'cooling_service',
  'battery_service',
  'tire_service',
  'general_service',
];

const PART_FUNCTION_RULES = [
  { partFunction: 'oil_filter', serviceGroup: 'oil_change', keywords: ['oil filter'] },
  { partFunction: 'engine_oil', serviceGroup: 'oil_change', keywords: ['engine oil', 'synthetic oil', 'motor oil'] },
  { partFunction: 'drain_washer', serviceGroup: 'oil_change', keywords: ['drain washer', 'drain plug washer'] },
  { partFunction: 'oil_pan_component', serviceGroup: 'oil_change', keywords: ['oil pan', 'oil level', 'oil pressure', 'eng oil pan', 'oil strainer'] },
  { partFunction: 'brake_pad', serviceGroup: 'brake_service', keywords: ['brake pad'] },
  { partFunction: 'brake_shoe', serviceGroup: 'brake_service', keywords: ['brake shoe'] },
  { partFunction: 'brake_fluid', serviceGroup: 'brake_service', keywords: ['brake fluid'] },
  { partFunction: 'brake_cleaner', serviceGroup: 'brake_service', keywords: ['brake cleaner'] },
  { partFunction: 'disc_rotor', serviceGroup: 'brake_service', keywords: ['disc rotor', 'rotor'] },
  { partFunction: 'spark_plug', serviceGroup: 'tune_up', keywords: ['spark plug', 'glow plug'] },
  { partFunction: 'ignition_coil', serviceGroup: 'tune_up', keywords: ['ignition coil'] },
  { partFunction: 'head_gasket', serviceGroup: 'tune_up', keywords: ['gasket,cylinder head', 'cylinder head gasket', 'head gasket'] },
  { partFunction: 'engine_gasket', serviceGroup: 'tune_up', keywords: ['gasket', 'o-ring', 'seal'] },
  { partFunction: 'breather_hose', serviceGroup: 'tune_up', keywords: ['breather hose', 'rocker cover breather'] },
  { partFunction: 'crank_bearing', serviceGroup: 'tune_up', keywords: ['crankshaft', 'connrod', 'bearing'] },
  { partFunction: 'fuel_injector', serviceGroup: 'tune_up', keywords: ['fuel injector', 'injector'] },
  { partFunction: 'air_intake', serviceGroup: 'tune_up', keywords: ['air cleaner', 'air clnr', 'throt body', 'throttle body', 'air guide', 'duct,air'] },
  { partFunction: 'pcv_component', serviceGroup: 'tune_up', keywords: ['pcv valve'] },
  { partFunction: 'air_filter', serviceGroup: 'filter_service', keywords: ['air filter'] },
  { partFunction: 'cabin_filter', serviceGroup: 'filter_service', keywords: ['cabin air filter', 'cabin filter'] },
  { partFunction: 'fuel_filter', serviceGroup: 'filter_service', keywords: ['fuel filter'] },
  { partFunction: 'battery', serviceGroup: 'battery_service', keywords: ['battery assy', 'battery'] },
  { partFunction: 'battery_terminal', serviceGroup: 'battery_service', keywords: ['battery terminal', 'terminal cleaner', 'terminal'] },
  { partFunction: 'radiator', serviceGroup: 'cooling_service', keywords: ['radiator assy', 'radiator'] },
  { partFunction: 'coolant', serviceGroup: 'cooling_service', keywords: ['coolant'] },
  { partFunction: 'thermostat', serviceGroup: 'cooling_service', keywords: ['thermostat'] },
  { partFunction: 'water_pump', serviceGroup: 'cooling_service', keywords: ['water pump'] },
  { partFunction: 'radiator_hose', serviceGroup: 'cooling_service', keywords: ['radiator hose', 'water feed', 'water pump inlet', 'hose,throt body water', 'hose'] },
  { partFunction: 'tire', serviceGroup: 'tire_service', keywords: ['tire', 'tyre'] },
  { partFunction: 'wheel', serviceGroup: 'tire_service', keywords: ['wheel'] },
  { partFunction: 'wheel_valve', serviceGroup: 'tire_service', keywords: ['valve'] },
  { partFunction: 'lug_nut', serviceGroup: 'tire_service', keywords: ['lug nut', 'wheel nut', 'lug bolt'] },
];

const COMPANION_FUNCTIONS = {
  oil_filter: ['engine_oil', 'drain_washer', 'oil_pan_component'],
  engine_oil: ['oil_filter', 'drain_washer', 'oil_pan_component'],
  drain_washer: ['engine_oil', 'oil_filter', 'oil_pan_component'],
  oil_pan_component: ['engine_oil', 'oil_filter', 'drain_washer'],
  brake_pad: ['disc_rotor', 'brake_cleaner', 'brake_fluid', 'brake_shoe'],
  brake_shoe: ['brake_cleaner', 'brake_fluid', 'brake_pad'],
  brake_fluid: ['brake_pad', 'brake_shoe', 'brake_cleaner'],
  brake_cleaner: ['brake_pad', 'brake_shoe', 'brake_fluid'],
  disc_rotor: ['brake_pad', 'brake_cleaner', 'brake_fluid'],
  spark_plug: ['air_filter', 'cabin_filter', 'fuel_filter', 'ignition_coil', 'fuel_injector'],
  ignition_coil: ['spark_plug', 'air_filter', 'fuel_injector'],
  head_gasket: ['engine_gasket', 'breather_hose', 'fuel_injector', 'air_intake'],
  engine_gasket: ['head_gasket', 'breather_hose', 'oil_pan_component', 'fuel_injector'],
  breather_hose: ['engine_gasket', 'air_intake', 'head_gasket'],
  crank_bearing: ['engine_gasket', 'oil_pan_component'],
  fuel_injector: ['air_intake', 'fuel_filter', 'spark_plug'],
  air_intake: ['fuel_injector', 'air_filter', 'spark_plug', 'pcv_component'],
  pcv_component: ['air_filter', 'engine_gasket', 'air_intake'],
  air_filter: ['cabin_filter', 'fuel_filter', 'spark_plug', 'air_intake'],
  cabin_filter: ['air_filter', 'fuel_filter'],
  fuel_filter: ['air_filter', 'cabin_filter', 'spark_plug', 'fuel_injector'],
  battery: ['battery_terminal'],
  battery_terminal: ['battery'],
  radiator: ['coolant', 'thermostat', 'water_pump', 'radiator_hose'],
  coolant: ['radiator', 'thermostat', 'radiator_hose'],
  thermostat: ['coolant', 'radiator', 'water_pump', 'radiator_hose'],
  water_pump: ['coolant', 'thermostat', 'radiator_hose', 'radiator'],
  radiator_hose: ['coolant', 'radiator', 'thermostat', 'water_pump'],
  tire: ['wheel', 'wheel_valve', 'lug_nut'],
  wheel: ['tire', 'wheel_valve', 'lug_nut'],
  wheel_valve: ['tire', 'wheel'],
  lug_nut: ['tire', 'wheel'],
};

const RECOMMENDATION_STOP_WORDS = new Set([
  'assy', 'kit', 'set', 'rh', 'lh', 'upr', 'lwr', 'eng', 'body', 'case', 'cover', 'support', 'main', 'pc', 'md', 'for', 'the', 'and', 'with'
]);

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
let archivedProductIdsCache = {
  data: null,
  fetchedAt: 0,
};

let productCatalogCachePromise = null;
let serviceCatalogCachePromise = null;
let vehicleFitmentCachePromise = null;
let archivedProductIdsPromise = null;

function parsePrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Number(numeric.toFixed(2)) : null;
}

function normalizePriceListItems(items = []) {
  return items
    .map((item) => ({
      sku: String(item?.sku || '').trim().toUpperCase(),
      price: parsePrice(item?.price),
    }))
    .filter((item) => item.sku && item.price !== null);
}

function getPreviousDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function parsePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function roundCurrency(value, fallback = 0) {
  const parsed = parsePrice(value);
  return parsed === null ? fallback : parsed;
}

function normalizeOptionalText(value, maxLength = 160) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeRequiredText(value, maxLength = 160) {
  const text = normalizeOptionalText(value, maxLength);
  return text || null;
}

function shouldUseSmartPackageCopy(value) {
  const normalized = normalizeText(value);
  return !normalized
    || normalized.startsWith('compatible ')
    || normalized.startsWith('matched ')
    || normalized.startsWith('suggested ')
    || normalized.includes('parts and services for this vehicle');
}

function getServiceGroupConfig(serviceGroup) {
  return SERVICE_GROUP_CONFIG[serviceGroup] || null;
}

function buildSmartPackageCopy(serviceGroup, packageName, packageDescription) {
  const groupConfig = getServiceGroupConfig(serviceGroup);

  return {
    packageName: shouldUseSmartPackageCopy(packageName)
      ? (groupConfig?.packageName || 'Smart Mitsubishi Bundle')
      : packageName,
    packageDescription: shouldUseSmartPackageCopy(packageDescription)
      ? (groupConfig?.packageDescription || DEFAULT_PACKAGE_DESCRIPTION)
      : packageDescription,
  };
}

function getSmartDiscountRate({ consequentKind, serviceGroup, matchLevel }) {
  if (consequentKind === 'service') {
    return serviceGroup === 'brake_service' || serviceGroup === 'tire_service'
      ? SMART_PART_DISCOUNT_RATE
      : SMART_SERVICE_DISCOUNT_RATE;
  }

  return matchLevel === 'family_match' ? SMART_SERVICE_DISCOUNT_RATE : SMART_PART_DISCOUNT_RATE;
}

function resolveSmartPricing({ recommendation, matchedProduct = null, matchedService = null, consequentKind, serviceGroup, matchLevel, minAnchorQuantity }) {
  const serviceCode = recommendation.recommendedServiceCode
    ?? recommendation.recommended_service_code
    ?? matchedService?.code
    ?? null;
  const catalogPrice = roundCurrency(
    recommendation.catalogPrice
      ?? recommendation.catalog_price
      ?? recommendation.listPrice
      ?? recommendation.list_price
      ?? matchedProduct?.price
      ?? matchedService?.price
      ?? recommendation.recommendedCatalogPrice
      ?? recommendation.recommended_catalog_price
      ?? recommendation.recommendedPrice
      ?? recommendation.recommended_price
      ?? 0
  );
  const explicitPricingMode = recommendation.pricingMode ?? recommendation.pricing_mode ?? null;
  const explicitResolvedPrice = recommendation.resolvedPrice ?? recommendation.resolved_price ?? null;
  let pricingMode = explicitPricingMode;
  let resolvedPrice = explicitResolvedPrice !== null && explicitResolvedPrice !== undefined
    ? roundCurrency(explicitResolvedPrice)
    : null;

  if (!pricingMode) {
    if (consequentKind === 'service' && serviceGroup === 'oil_change' && serviceCode === 'SVC-OIL') {
      pricingMode = 'complimentary';
      resolvedPrice = 0;
    } else {
      const discountRate = getSmartDiscountRate({ consequentKind, serviceGroup, matchLevel });
      pricingMode = discountRate > 0 && catalogPrice > 0 ? 'override' : 'catalog';
      resolvedPrice = pricingMode === 'override'
        ? roundCurrency(catalogPrice * (1 - discountRate))
        : catalogPrice;
    }
  }

  if (pricingMode === 'complimentary') {
    resolvedPrice = 0;
  } else if (resolvedPrice === null) {
    const discountRate = getSmartDiscountRate({ consequentKind, serviceGroup, matchLevel });
    resolvedPrice = pricingMode === 'override' && catalogPrice > 0
      ? roundCurrency(catalogPrice * (1 - discountRate))
      : catalogPrice;
  }

  const savingsAmount = roundCurrency(Math.max(catalogPrice - resolvedPrice, 0));
  const discountPercent = catalogPrice > 0 && savingsAmount > 0
    ? Math.round((savingsAmount / catalogPrice) * 100)
    : 0;
  const fallbackDisplayLabel = pricingMode === 'complimentary'
    ? (Number(minAnchorQuantity ?? 1) > 1 ? `Free With ${minAnchorQuantity}x Part` : 'Free With Package')
    : pricingMode === 'override' && discountPercent > 0
      ? `Smart Save ${discountPercent}%`
      : pricingMode === 'override'
        ? 'Smart Package Rate'
        : null;
  const providedLabel = recommendation.displayPriceLabel ?? recommendation.display_price_label ?? null;

  return {
    catalogPrice,
    resolvedPrice,
    pricingMode,
    displayPriceLabel: providedLabel && providedLabel !== 'Package Rate' ? providedLabel : fallbackDisplayLabel,
    savingsAmount,
    discountPercent,
  };
}

function summarizePackagePricing(items = []) {
  const catalogTotal = roundCurrency(items.reduce((sum, item) => sum + Number(item.catalogPrice ?? item.resolvedPrice ?? 0), 0));
  const smartTotal = roundCurrency(items.reduce((sum, item) => sum + Number(item.resolvedPrice ?? 0), 0));
  const savingsAmount = roundCurrency(Math.max(catalogTotal - smartTotal, 0));
  const savingsPercent = catalogTotal > 0 && savingsAmount > 0
    ? Math.round((savingsAmount / catalogTotal) * 100)
    : 0;

  return {
    catalogTotal,
    smartTotal,
    savingsAmount,
    savingsPercent,
  };
}

function invalidateProductCatalogCache() {
  productCatalogCache = {
    data: null,
    fetchedAt: 0,
  };
  productCatalogCachePromise = null;
  archivedProductIdsCache = {
    data: null,
    fetchedAt: 0,
  };
  archivedProductIdsPromise = null;
  clearPublicResponseCache();
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

function buildStockReceiveNotes({ supplierName, referenceNumber, reason }) {
  return [
    supplierName ? `Supplier: ${supplierName}` : null,
    referenceNumber ? `Reference: ${referenceNumber}` : null,
    reason ? `Reason: ${reason}` : 'Reason: Stock receiving',
  ].filter(Boolean).join(' | ');
}

function buildOperationalReference(prefix = 'REF', date = new Date()) {
  const stamp = date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${prefix}-${stamp}`;
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
  const withoutBarcodeSuffix = normalizedScanValue.endsWith('0001') && normalizedScanValue.length > 4
    ? normalizedScanValue.slice(0, -4)
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
    stock: Number(row.stock ?? 0),
    status: row.status,
    uom: row.uom,
    brand: row.brand,
    location: row.location ?? {},
    supplierId: row.supplier_id ?? row.supplierId ?? row.metadata?.supplierId ?? null,
    supplierName: row.supplier_name ?? row.supplierName ?? row.metadata?.supplierName ?? null,
    categoryId: row.category_id ?? row.categoryId ?? row.metadata?.categoryId ?? null,
    imageUrl: row.image_url ?? row.imageUrl ?? row.metadata?.imageUrl ?? row.metadata?.primaryImageUrl ?? null,
    metadata: row.metadata ?? {},
  };
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

  const counts = buildCategoryRows(await getCachedProductCatalog());
  const countMap = new Map(counts.map((category) => [category.value, category.count]));
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

async function enrichCatalogProducts(products = []) {
  const productIds = [...new Set(products.map((product) => product.id).filter(Boolean))];
  if (productIds.length === 0) {
    return products;
  }

  const productById = new Map(products.map((product) => [product.id, { ...product }]));

  try {
    const { data: images, error: imagesError } = await supabaseAdmin
      .schema('catalog')
      .from('product_images')
      .select('product_id, image_url')
      .in('product_id', productIds)
      .eq('is_primary', true);

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
    const { data: links, error: linksError } = await supabaseAdmin
      .schema('catalog')
      .from('product_supplier_links')
      .select('product_id, supplier_id, suppliers(id, supplier_code, name)')
      .in('product_id', productIds);

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

function matchesAnyKeyword(text, keywords = []) {
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
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

function buildServiceSearchText(service) {
  return normalizeText([service.name, service.description, service.code].filter(Boolean).join(' '));
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
    end: match[2].toLowerCase() === 'present' ? new Date().getFullYear() : Number(match[2]),
  };
}

function productMentionsEngine(text) {
  return ENGINE_SIGNATURE_PATTERN.test(String(text || ''));
}

function buildVehicleFilterContext({ vehicleModel = '', vehicleYear = '', vehicleFamily = '' } = {}) {
  const model = normalizeVehicleSelectorValue(vehicleModel);
  const family = normalizeVehicleSelectorValue(vehicleFamily || extractVehicleFamily(vehicleModel));
  const parsedYear = Number.parseInt(vehicleYear, 10);

  return {
    rawModel: vehicleModel || '',
    rawYear: vehicleYear || '',
    model,
    family,
    year: Number.isFinite(parsedYear) ? parsedYear : null,
  };
}

function buildVehicleDisplayLabel({ model, year }) {
  return [model, year].filter(Boolean).join(' ').trim();
}

function matchesVehicleModel(productModel, context) {
  if (!context.model) {
    return true;
  }

  const normalizedModel = normalizeVehicleSelectorValue(productModel);
  if (!normalizedModel) {
    return false;
  }

  return normalizedModel.includes(context.model)
    || context.model.includes(normalizedModel)
    || Boolean(context.family && normalizedModel.includes(context.family));
}

function matchesVehicleFilters(product, context) {
  if (!context.model) {
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
  if (normalizedSearch) {
    const productSearchText = buildProductSearchText(product);
    if (!productSearchText.includes(normalizedSearch)) {
      return false;
    }
  }

  if (selectedCategory !== 'all' && product.category !== selectedCategory) {
    return false;
  }

  return !vehicleContext || matchesVehicleFilters(product, vehicleContext);
}

function sortCatalogProducts(products = [], sortBy = 'name-asc') {
  return [...products].sort((left, right) => {
    if (sortBy === 'name-desc') {
      return String(right.name || '').localeCompare(String(left.name || '')) || String(left.sku || '').localeCompare(String(right.sku || ''));
    }

    if (sortBy === 'price-asc') {
      return Number(left.price ?? 0) - Number(right.price ?? 0) || String(left.name || '').localeCompare(String(right.name || ''));
    }

    if (sortBy === 'price-desc') {
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

function buildVehiclePackageCopy(serviceGroup, fallbackName) {
  switch (serviceGroup) {
    case 'oil_change':
      return {
        packageName: 'Oil Change Package',
        packageDescription: 'Fresh oil, filter, washer, and labor grouped for a cleaner maintenance stop.',
      };
    case 'brake_service':
      return {
        packageName: 'Brake Refresh Package',
        packageDescription: 'Brake parts and labor bundled to restore stopping confidence for this Mitsubishi.',
      };
    case 'cooling_service':
      return {
        packageName: 'Cooling System Restore',
        packageDescription: 'Cooling-system parts plus labor bundled to reduce heat-related breakdown risk.',
      };
    case 'battery_service':
      return {
        packageName: 'Battery + Charging Check',
        packageDescription: 'Battery support parts and electrical labor grouped into one practical service package.',
      };
    case 'tune_up':
      return {
        packageName: 'Tune-Up Package',
        packageDescription: 'Ignition and intake maintenance bundled with labor for smoother daily driving.',
      };
    case 'filter_service':
      return {
        packageName: 'Filter Service Package',
        packageDescription: 'Replacement filters and service labor grouped into one cleaner maintenance visit.',
      };
    case 'tire_service':
      return {
        packageName: 'Tire Care Package',
        packageDescription: 'Tire support parts with balancing and alignment-ready labor for steadier road feel.',
      };
    default:
      return {
        packageName: fallbackName || 'Smart Mitsubishi Bundle',
        packageDescription: DEFAULT_PACKAGE_DESCRIPTION,
      };
  }
}

function getVehicleProductMatchLevel(product, context) {
  const normalizedModel = normalizeVehicleSelectorValue(product.model);
  if (context.model && normalizedModel.includes(context.model)) {
    return 'exact_model';
  }

  if (context.family && normalizedModel.includes(context.family)) {
    return 'family_match';
  }

  return null;
}

function scoreVehiclePackageCandidate(candidate) {
  const matchScore = candidate.matchLevel === 'exact_model' ? 0 : 1;
  const stockScore = Number(candidate.product.stock ?? 0) * -1;
  const priceScore = Number(candidate.product.price ?? 0);
  return matchScore * 10000 + stockScore * 10 + priceScore;
}

function pickVehiclePackageProducts({ catalog, vehicleContext, serviceGroup, limitCount = 4 }) {
  const candidates = catalog
    .map((product) => ({
      product,
      profile: inferProductProfile(product),
      matchLevel: getVehicleProductMatchLevel(product, vehicleContext),
    }))
    .filter((candidate) => candidate.profile.serviceGroup === serviceGroup && candidate.matchLevel && matchesVehicleFilters(candidate.product, vehicleContext))
    .sort((left, right) => scoreVehiclePackageCandidate(left) - scoreVehiclePackageCandidate(right));

  const selected = [];
  const seenFunctions = new Set();

  candidates.forEach((candidate) => {
    if (selected.length >= limitCount) {
      return;
    }

    const functionKey = candidate.profile.partFunction || candidate.product.id;
    if (seenFunctions.has(functionKey)) {
      return;
    }

    seenFunctions.add(functionKey);
    selected.push(candidate);
  });

  if (selected.length < Math.min(limitCount, candidates.length)) {
    candidates.forEach((candidate) => {
      if (selected.length >= limitCount) {
        return;
      }

      if (selected.some((picked) => picked.product.id === candidate.product.id)) {
        return;
      }

      selected.push(candidate);
    });
  }

  return selected;
}

function buildVehiclePackageProductItem(candidate, vehicleContext, serviceGroup, index) {
  const pricing = resolveSmartPricing({
    recommendation: {
      catalogPrice: candidate.product.price,
      recommendedPrice: candidate.product.price,
    },
    matchedProduct: candidate.product,
    consequentKind: 'product',
    serviceGroup,
    matchLevel: candidate.matchLevel,
    minAnchorQuantity: 1,
  });

  return {
    consequentKind: 'product',
    packageItemId: 'vehicle-part-' + candidate.product.id,
    recommendedProductId: candidate.product.id,
    recommendedProductName: candidate.product.name,
    recommendedProductSku: candidate.product.sku,
    recommendedProduct: candidate.product,
    reasonLabel: candidate.matchLevel === 'exact_model'
      ? 'Matched core part for the exact Mitsubishi model you selected'
      : 'Matched core part for the same Mitsubishi vehicle family',
    vehicleModelName: vehicleContext.rawModel,
    vehicleFamily: vehicleContext.family,
    serviceGroup,
    matchLevel: candidate.matchLevel,
    displayPriority: index + 1,
    pricingMode: pricing.pricingMode,
    catalogPrice: pricing.catalogPrice,
    recommendedPrice: pricing.resolvedPrice,
    resolvedPrice: pricing.resolvedPrice,
    displayPriceLabel: pricing.displayPriceLabel,
    savingsAmount: pricing.savingsAmount,
    discountPercent: pricing.discountPercent,
  };
}

function buildVehiclePackageServiceItem(service, vehicleContext, serviceGroup, index) {
  const pricing = resolveSmartPricing({
    recommendation: {
      catalogPrice: service.price,
      recommendedPrice: service.price,
      recommendedServiceCode: service.code,
    },
    matchedService: service,
    consequentKind: 'service',
    serviceGroup,
    matchLevel: 'service_bundle',
    minAnchorQuantity: 1,
  });

  return {
    consequentKind: 'service',
    packageItemId: 'vehicle-service-' + service.id,
    recommendedServiceId: service.id,
    recommendedServiceName: service.name,
    recommendedServiceCode: service.code,
    recommendedService: service,
    reasonLabel: 'Recommended labor pairing for the selected Mitsubishi service package',
    vehicleModelName: vehicleContext.rawModel,
    vehicleFamily: vehicleContext.family,
    serviceGroup,
    matchLevel: 'service_bundle',
    displayPriority: index + 1,
    pricingMode: pricing.pricingMode,
    catalogPrice: pricing.catalogPrice,
    recommendedPrice: pricing.resolvedPrice,
    resolvedPrice: pricing.resolvedPrice,
    displayPriceLabel: pricing.displayPriceLabel,
    savingsAmount: pricing.savingsAmount,
    discountPercent: pricing.discountPercent,
  };
}

function buildVehiclePackages({ catalog, serviceCatalog, vehicleContext }) {
  return VEHICLE_PACKAGE_ORDER
    .map((serviceGroup, index) => {
      const products = pickVehiclePackageProducts({ catalog, vehicleContext, serviceGroup, limitCount: 4 });
      const services = findMatchingServices({ serviceCatalog, serviceGroup, limitCount: 2 });

      if (products.length === 0 && services.length === 0) {
        return null;
      }

      const packageCopy = buildVehiclePackageCopy(serviceGroup, SERVICE_GROUP_CONFIG[serviceGroup]?.packageName);
      const partItems = products.map((candidate, itemIndex) => buildVehiclePackageProductItem(candidate, vehicleContext, serviceGroup, itemIndex));
      const serviceItems = services.map((service, itemIndex) => buildVehiclePackageServiceItem(service, vehicleContext, serviceGroup, itemIndex));
      const packagePricing = summarizePackagePricing([...partItems, ...serviceItems]);

      return {
        packageId: null,
        packageKey: 'vehicle-' + serviceGroup,
        packageName: packageCopy.packageName,
        packageDescription: packageCopy.packageDescription,
        serviceGroup,
        vehicleModelName: vehicleContext.rawModel,
        vehicleFamily: vehicleContext.family,
        minAnchorQuantity: 1,
        priority: index + 1,
        recommendationMode: 'vehicle_bundle',
        recommendationLabel: 'Best for your vehicle',
        itemCount: partItems.length + serviceItems.length,
        parts: partItems,
        services: serviceItems,
        ...packagePricing,
      };
    })
    .filter(Boolean);
}

function inferHeuristicServiceGroup(text) {
  if (matchesAnyKeyword(text, ['radiator', 'coolant', 'thermostat', 'water pump', 'water feed', 'hose'])) {
    return 'cooling_service';
  }
  if (matchesAnyKeyword(text, ['brake', 'rotor'])) {
    return 'brake_service';
  }
  if (matchesAnyKeyword(text, ['battery', 'terminal'])) {
    return 'battery_service';
  }
  if (matchesAnyKeyword(text, ['tire', 'tyre', 'wheel', 'lug', 'valve'])) {
    return 'tire_service';
  }
  if (matchesAnyKeyword(text, ['filter'])) {
    return 'filter_service';
  }
  if (matchesAnyKeyword(text, ['oil', 'drain'])) {
    return 'oil_change';
  }
  if (matchesAnyKeyword(text, ['gasket', 'injector', 'throt body', 'throttle body', 'air cleaner', 'pcv', 'bearing', 'crankshaft', 'connrod', 'mounting', 'breather'])) {
    return 'tune_up';
  }
  return null;
}

function extractMeaningfulTokens(text) {
  return Array.from(new Set(
    normalizeText(text)
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !RECOMMENDATION_STOP_WORDS.has(token))
  ));
}

function inferProductProfile(product) {
  const text = buildProductSearchText(product);
  const matchingRule = PART_FUNCTION_RULES.find((rule) => matchesAnyKeyword(text, rule.keywords));
  const normalizedModel = normalizeText(product.model);
  const vehicleFamily = extractVehicleFamily(product.model);

  return {
    productId: product.id,
    sku: product.sku,
    modelName: product.model || null,
    normalizedModel,
    vehicleFamily,
    normalizedVehicleFamily: normalizeText(vehicleFamily),
    partFunction: matchingRule?.partFunction || null,
    serviceGroup: matchingRule?.serviceGroup || inferHeuristicServiceGroup(text),
    keywords: extractMeaningfulTokens([product.name, product.model].filter(Boolean).join(' ')),
    isVehicleSpecific: Boolean(product.model && !normalizeText(product.model).includes('various') && !normalizeText(product.model).includes('universal')),
  };
}

function findMatchingServices({ serviceCatalog, serviceGroup, limitCount = DEFAULT_SERVICE_LIMIT }) {
  const groupConfig = SERVICE_GROUP_CONFIG[serviceGroup];

  if (!groupConfig) {
    return [];
  }

  return serviceCatalog
    .map((service) => ({
      service,
      text: buildServiceSearchText(service),
    }))
    .filter(({ text }) => matchesAnyKeyword(text, groupConfig.serviceKeywords))
    .sort((left, right) => left.service.name.localeCompare(right.service.name))
    .slice(0, limitCount)
    .map(({ service }) => service);
}

function dedupeRecommendations(recommendations = []) {
  const seen = new Set();

  return recommendations.filter((item) => {
    const key = item.recommendedProductId
      ? `product:${item.recommendedProductId}`
      : `service:${item.recommendedServiceId}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function scoreCandidate(candidate, desiredFunction, matchLevel) {
  const stockScore = Number(candidate.product.stock ?? 0);
  const exactFunctionBonus = candidate.profile.partFunction === desiredFunction ? 1000 : 0;
  const matchBonus = matchLevel === 'exact_model' ? 500 : 250;
  return exactFunctionBonus + matchBonus + stockScore;
}

function scoreKeywordCandidate(candidate, clickedKeywords, matchLevel, preferredServiceGroup) {
  const overlap = candidate.profile.keywords.filter((token) => clickedKeywords.includes(token)).length;
  const stockScore = Number(candidate.product.stock ?? 0);
  const groupBonus = preferredServiceGroup && candidate.profile.serviceGroup === preferredServiceGroup ? 200 : 0;
  const matchBonus = matchLevel === 'exact_model' ? 300 : 150;
  return overlap * 100 + stockScore + groupBonus + matchBonus;
}

function pickKeywordClusterProducts({ clickedProduct, catalog, clickedProfile, limitCount }) {
  const clickedKeywords = clickedProfile.keywords || [];

  if (!clickedProfile.modelName || clickedKeywords.length === 0) {
    return [];
  }

  const catalogProfiles = catalog.map((product) => ({ product, profile: inferProductProfile(product) }));
  const matchByTokens = (targetMatchLevel) => catalogProfiles
    .filter(({ product, profile }) => product.id !== clickedProduct.id)
    .filter(({ profile }) => {
      if (targetMatchLevel === 'exact_model') {
        return profile.normalizedModel && profile.normalizedModel === clickedProfile.normalizedModel;
      }
      return profile.normalizedVehicleFamily && profile.normalizedVehicleFamily === clickedProfile.normalizedVehicleFamily;
    })
    .map((candidate) => ({
      ...candidate,
      overlap: candidate.profile.keywords.filter((token) => clickedKeywords.includes(token)).length,
    }))
    .filter((candidate) => candidate.overlap > 0)
    .sort((left, right) => scoreKeywordCandidate(right, clickedKeywords, targetMatchLevel, clickedProfile.serviceGroup) - scoreKeywordCandidate(left, clickedKeywords, targetMatchLevel, clickedProfile.serviceGroup));

  const exactMatches = matchByTokens('exact_model').slice(0, limitCount).map(({ product }) => ({
    ruleId: null,
    consequentKind: 'product',
    recommendedProductId: product.id,
    recommendedProductName: product.name,
    recommendedServiceId: null,
    recommendedServiceName: null,
    recommendedPrice: Number(product.price ?? 0),
    support: null,
    confidence: null,
    lift: null,
    sampleCount: null,
    reasonLabel: 'Smart upsell add-on for the same exact Mitsubishi model',
    packageKey: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageKey || 'vehicle-package',
    packageName: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageName || 'Compatible Mitsubishi Package',
    packageDescription: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageDescription || 'Compatible Mitsubishi parts and services for this vehicle.',
    matchLevel: 'exact_model',
    vehicleModelName: clickedProfile.modelName,
    vehicleFamily: clickedProfile.vehicleFamily,
    serviceGroup: clickedProfile.serviceGroup,
  }));

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return matchByTokens('family_match').slice(0, limitCount).map(({ product }) => ({
    ruleId: null,
    consequentKind: 'product',
    recommendedProductId: product.id,
    recommendedProductName: product.name,
    recommendedServiceId: null,
    recommendedServiceName: null,
    recommendedPrice: Number(product.price ?? 0),
    support: null,
    confidence: null,
    lift: null,
    sampleCount: null,
    reasonLabel: 'Smart upsell add-on for the same Mitsubishi family',
    packageKey: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageKey || 'vehicle-package',
    packageName: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageName || 'Compatible Mitsubishi Package',
    packageDescription: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageDescription || 'Compatible Mitsubishi parts and services for this vehicle family.',
    matchLevel: 'family_match',
    vehicleModelName: clickedProfile.modelName,
    vehicleFamily: clickedProfile.vehicleFamily,
    serviceGroup: clickedProfile.serviceGroup,
  }));
}

function pickCompanionProducts({ clickedProduct, catalog, clickedProfile, limitCount }) {
  const companionFunctions = COMPANION_FUNCTIONS[clickedProfile.partFunction] || [];

  if (!clickedProfile.modelName || companionFunctions.length === 0) {
    return [];
  }

  const catalogProfiles = catalog.map((product) => ({ product, profile: inferProductProfile(product) }));
  const exactModelMatches = [];
  const familyMatches = [];
  const usedProductIds = new Set([clickedProduct.id]);

  for (const desiredFunction of companionFunctions) {
    const exactCandidate = catalogProfiles
      .filter(({ product, profile }) => !usedProductIds.has(product.id))
      .filter(({ profile }) => profile.partFunction === desiredFunction)
      .filter(({ profile }) => profile.normalizedModel && profile.normalizedModel === clickedProfile.normalizedModel)
      .sort((left, right) => scoreCandidate(right, desiredFunction, 'exact_model') - scoreCandidate(left, desiredFunction, 'exact_model'))[0];

    if (exactCandidate) {
      usedProductIds.add(exactCandidate.product.id);
      exactModelMatches.push(exactCandidate);
      continue;
    }

    const familyCandidate = catalogProfiles
      .filter(({ product, profile }) => !usedProductIds.has(product.id))
      .filter(({ profile }) => profile.partFunction === desiredFunction)
      .filter(({ profile }) => profile.normalizedVehicleFamily && profile.normalizedVehicleFamily === clickedProfile.normalizedVehicleFamily)
      .sort((left, right) => scoreCandidate(right, desiredFunction, 'family_match') - scoreCandidate(left, desiredFunction, 'family_match'))[0];

    if (familyCandidate) {
      usedProductIds.add(familyCandidate.product.id);
      familyMatches.push(familyCandidate);
    }
  }

  const exactRecommendations = exactModelMatches.map(({ product, profile }) => ({
    ruleId: null,
    consequentKind: 'product',
    recommendedProductId: product.id,
    recommendedProductName: product.name,
    recommendedServiceId: null,
    recommendedServiceName: null,
    recommendedPrice: Number(product.price ?? 0),
    support: null,
    confidence: null,
    lift: null,
    sampleCount: null,
    reasonLabel: `Smart bundle add-on: ${profile.partFunction?.replace(/_/g, ' ') || 'part'} for the same vehicle`,
    packageKey: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageKey || `${clickedProfile.serviceGroup || 'vehicle'}-package`,
    packageName: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageName || 'Compatible Mitsubishi Package',
    packageDescription: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageDescription || 'Compatible Mitsubishi parts and services for this vehicle.',
    matchLevel: 'exact_model',
    vehicleModelName: clickedProfile.modelName,
    vehicleFamily: clickedProfile.vehicleFamily,
    serviceGroup: clickedProfile.serviceGroup,
  }));

  if (exactRecommendations.length > 0) {
    return exactRecommendations.slice(0, limitCount);
  }

  return familyMatches.map(({ product }) => ({
    ruleId: null,
    consequentKind: 'product',
    recommendedProductId: product.id,
    recommendedProductName: product.name,
    recommendedServiceId: null,
    recommendedServiceName: null,
    recommendedPrice: Number(product.price ?? 0),
    support: null,
    confidence: null,
    lift: null,
    sampleCount: null,
    reasonLabel: `Smart bundle add-on for ${clickedProfile.vehicleFamily}`,
    packageKey: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageKey || `${clickedProfile.serviceGroup || 'vehicle'}-package`,
    packageName: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageName || 'Compatible Mitsubishi Package',
    packageDescription: SERVICE_GROUP_CONFIG[clickedProfile.serviceGroup]?.packageDescription || 'Compatible Mitsubishi parts and services for this vehicle family.',
    matchLevel: 'family_match',
    vehicleModelName: clickedProfile.modelName,
    vehicleFamily: clickedProfile.vehicleFamily,
    serviceGroup: clickedProfile.serviceGroup,
  })).slice(0, limitCount);
}

function pickFallbackServiceGroup(clickedProduct, clickedProfile) {
  if (clickedProfile.serviceGroup) {
    return clickedProfile.serviceGroup;
  }

  const text = buildProductSearchText(clickedProduct);
  const category = normalizeText(clickedProduct?.category);

  if (category.includes('tire') || category.includes('wheel')) {
    return 'tire_service';
  }
  if (category.includes('brake')) {
    return 'brake_service';
  }
  if (category.includes('battery') || category.includes('electrical')) {
    return 'battery_service';
  }
  if (category.includes('cooling') || category.includes('radiator')) {
    return 'cooling_service';
  }
  if (category.includes('filter')) {
    return 'filter_service';
  }
  if (category.includes('oil') || category.includes('lubricant')) {
    return 'oil_change';
  }

  return inferHeuristicServiceGroup(text) || 'general_service';
}

function buildVehicleMatchedRecommendations({ clickedProduct, catalog, serviceCatalog, partLimit, serviceLimit }) {
  const clickedProfile = inferProductProfile(clickedProduct);
  const fallbackServiceGroup = pickFallbackServiceGroup(clickedProduct, clickedProfile);

  const directFunctionRecommendations = clickedProfile.modelName && clickedProfile.partFunction
    ? pickCompanionProducts({
        clickedProduct,
        catalog,
        clickedProfile,
        limitCount: partLimit,
      })
    : [];

  const keywordClusterRecommendations = clickedProfile.modelName && directFunctionRecommendations.length === 0
    ? pickKeywordClusterProducts({
        clickedProduct,
        catalog,
        clickedProfile,
        limitCount: partLimit,
      })
    : [];

  const partRecommendations = [...directFunctionRecommendations, ...keywordClusterRecommendations].slice(0, partLimit);

  const services = fallbackServiceGroup
    ? findMatchingServices({
        serviceCatalog,
        serviceGroup: fallbackServiceGroup,
        limitCount: serviceLimit,
      })
    : [];

  const serviceRecommendations = services.map((service) => ({
    ruleId: null,
    consequentKind: 'service',
    recommendedProductId: null,
    recommendedProductName: null,
    recommendedServiceId: service.id,
    recommendedServiceName: service.name,
    recommendedPrice: Number(service.price ?? 0),
        support: null,
    confidence: null,
    lift: null,
    sampleCount: null,
    reasonLabel: clickedProfile.partFunction
      ? 'Smart service bundle for ' + clickedProfile.partFunction.replace(/_/g, ' ')
      : 'Recommended service labor based on this Mitsubishi part',
    packageKey: SERVICE_GROUP_CONFIG[fallbackServiceGroup]?.packageKey || 'vehicle-service-package',
    packageName: SERVICE_GROUP_CONFIG[fallbackServiceGroup]?.packageName || 'Smart Mitsubishi Service Bundle',
    packageDescription: SERVICE_GROUP_CONFIG[fallbackServiceGroup]?.packageDescription || DEFAULT_PACKAGE_DESCRIPTION,
    matchLevel: 'service_bundle',
    vehicleModelName: clickedProfile.modelName,
    vehicleFamily: clickedProfile.vehicleFamily,
    serviceGroup: fallbackServiceGroup,
    minAnchorQuantity: fallbackServiceGroup === 'oil_change' && clickedProfile.partFunction === 'engine_oil' ? 4 : 1,
  }));

  return [...partRecommendations, ...serviceRecommendations];
}
function normalizeMatchMetadata(recommendation, clickedProduct, recommendedProduct) {
  const clickedProfile = inferProductProfile(clickedProduct);
  const recommendedProfile = recommendedProduct ? inferProductProfile(recommendedProduct) : null;
  const isExactModel = Boolean(
    recommendedProfile?.normalizedModel &&
    clickedProfile.normalizedModel &&
    recommendedProfile.normalizedModel === clickedProfile.normalizedModel
  );
  const isFamilyMatch = Boolean(
    !isExactModel &&
    recommendedProfile?.normalizedVehicleFamily &&
    clickedProfile.normalizedVehicleFamily &&
    recommendedProfile.normalizedVehicleFamily === clickedProfile.normalizedVehicleFamily
  );

  return {
    ...recommendation,
    matchLevel: recommendation.matchLevel || (isExactModel ? 'exact_model' : isFamilyMatch ? 'family_match' : 'curated_override'),
    vehicleModelName: recommendation.vehicleModelName || clickedProduct.model || null,
    vehicleFamily: recommendation.vehicleFamily || clickedProfile.vehicleFamily || null,
    serviceGroup: recommendation.serviceGroup || clickedProfile.serviceGroup || null,
  };
}

function normalizeRecommendationRecord({ recommendation, clickedProduct, matchedProduct = null, matchedService = null }) {
  const clickedProfile = inferProductProfile(clickedProduct);
  const consequentKind = recommendation.consequentKind
    ?? recommendation.consequent_kind
    ?? recommendation.itemKind
    ?? recommendation.item_kind
    ?? ((recommendation.recommendedServiceId ?? recommendation.recommended_service_id) ? 'service' : 'product');
  const packageItemId = recommendation.packageItemId ?? recommendation.package_item_id ?? recommendation.ruleId ?? recommendation.rule_id ?? null;
  const minAnchorQuantity = Number(recommendation.minAnchorQuantity ?? recommendation.min_anchor_quantity ?? recommendation.packageMinAnchorQuantity ?? 1);
  const rawServiceGroup = recommendation.serviceGroup ?? recommendation.service_group ?? clickedProfile.serviceGroup ?? null;
  const basePackageCopy = buildSmartPackageCopy(
    rawServiceGroup,
    recommendation.packageName ?? recommendation.package_name ?? null,
    recommendation.packageDescription ?? recommendation.package_description ?? null,
  );
  const baseRecord = {
    ...recommendation,
    packageId: recommendation.packageId ?? recommendation.package_id ?? null,
    packageKey: recommendation.packageKey ?? recommendation.package_key ?? recommendation.packageName ?? recommendation.package_name ?? null,
    packageName: basePackageCopy.packageName,
    packageDescription: basePackageCopy.packageDescription,
    minAnchorQuantity,
    priority: Number(recommendation.priority ?? recommendation.packagePriority ?? recommendation.package_priority ?? 100),
    recommendationMode: recommendation.recommendationMode ?? recommendation.recommendation_mode ?? 'smart_bundle',
    recommendationLabel: recommendation.recommendationLabel ?? recommendation.recommendation_label ?? SMART_RECOMMENDATION_LABEL,
    packageItemId,
    ruleId: packageItemId,
    consequentKind,
    recommendedProductId: recommendation.recommendedProductId ?? recommendation.recommended_product_id ?? null,
    recommendedProductName: recommendation.recommendedProductName ?? recommendation.recommended_product_name ?? matchedProduct?.name ?? null,
    recommendedServiceId: recommendation.recommendedServiceId ?? recommendation.recommended_service_id ?? null,
    recommendedServiceName: recommendation.recommendedServiceName ?? recommendation.recommended_service_name ?? matchedService?.name ?? null,
    reasonLabel: recommendation.reasonLabel ?? recommendation.reason_label ?? 'Smart Mitsubishi upsell recommendation',
    vehicleModelName: recommendation.vehicleModelName ?? recommendation.vehicle_model_name ?? clickedProduct.model ?? null,
    vehicleFamily: recommendation.vehicleFamily ?? recommendation.vehicle_family ?? null,
    serviceGroup: rawServiceGroup,
    matchLevel: recommendation.matchLevel ?? recommendation.match_level ?? null,
    recommendedProduct: matchedProduct ?? recommendation.recommendedProduct ?? null,
    recommendedService: matchedService ?? recommendation.recommendedService ?? null,
    recommendedProductSku: recommendation.recommendedProductSku ?? recommendation.recommended_product_sku ?? matchedProduct?.sku ?? null,
    recommendedServiceCode: recommendation.recommendedServiceCode ?? recommendation.recommended_service_code ?? matchedService?.code ?? null,
  };
  const normalizedRecord = normalizeMatchMetadata(baseRecord, clickedProduct, matchedProduct);
  const smartPricing = resolveSmartPricing({
    recommendation: normalizedRecord,
    matchedProduct,
    matchedService,
    consequentKind: normalizedRecord.consequentKind,
    serviceGroup: normalizedRecord.serviceGroup,
    matchLevel: normalizedRecord.matchLevel,
    minAnchorQuantity: normalizedRecord.minAnchorQuantity,
  });
  const refinedPackageCopy = buildSmartPackageCopy(
    normalizedRecord.serviceGroup,
    normalizedRecord.packageName,
    normalizedRecord.packageDescription,
  );

  return {
    ...normalizedRecord,
    packageName: refinedPackageCopy.packageName,
    packageDescription: refinedPackageCopy.packageDescription,
    recommendedProduct: matchedProduct ?? recommendation.recommendedProduct ?? null,
    recommendedService: matchedService ?? recommendation.recommendedService ?? null,
    recommendedProductSku: normalizedRecord.recommendedProductSku,
    recommendedServiceCode: normalizedRecord.recommendedServiceCode,
    pricingMode: smartPricing.pricingMode,
    catalogPrice: smartPricing.catalogPrice,
    recommendedPrice: smartPricing.resolvedPrice,
    resolvedPrice: smartPricing.resolvedPrice,
    displayPriceLabel: smartPricing.displayPriceLabel,
    savingsAmount: smartPricing.savingsAmount,
    discountPercent: smartPricing.discountPercent,
    minAnchorQuantity: normalizedRecord.minAnchorQuantity,
    packageItemId,
    ruleId: packageItemId,
    priority: normalizedRecord.priority,
    recommendationMode: normalizedRecord.recommendationMode,
    recommendationLabel: normalizedRecord.recommendationLabel,
  };
}

function groupPackageRecommendations(recommendations = [], partLimit = DEFAULT_PART_LIMIT, serviceLimit = DEFAULT_SERVICE_LIMIT) {
  const groupedPackages = new Map();

  recommendations.forEach((recommendation, index) => {
    const packageKey = recommendation.packageKey || recommendation.packageName || ('suggested-package-' + index);

    if (!groupedPackages.has(packageKey)) {
      const packageCopy = buildSmartPackageCopy(
        recommendation.serviceGroup || null,
        recommendation.packageName || null,
        recommendation.packageDescription || null,
      );

      groupedPackages.set(packageKey, {
        packageId: recommendation.packageId ?? null,
        packageKey,
        packageName: packageCopy.packageName || 'Smart Mitsubishi Bundle',
        packageDescription: packageCopy.packageDescription || DEFAULT_PACKAGE_DESCRIPTION,
        serviceGroup: recommendation.serviceGroup || null,
        vehicleModelName: recommendation.vehicleModelName || null,
        vehicleFamily: recommendation.vehicleFamily || null,
        minAnchorQuantity: Number(recommendation.minAnchorQuantity ?? 1),
        priority: Number(recommendation.priority ?? 100),
        recommendationMode: recommendation.recommendationMode ?? 'smart_bundle',
        recommendationLabel: recommendation.recommendationLabel ?? SMART_RECOMMENDATION_LABEL,
        parts: [],
        services: [],
      });
    }

    const targetPackage = groupedPackages.get(packageKey);
    const isService = recommendation.consequentKind === 'service';
    const targetItems = isService ? targetPackage.services : targetPackage.parts;
    const itemLimit = isService ? serviceLimit : partLimit;
    const itemId = isService ? recommendation.recommendedServiceId : recommendation.recommendedProductId;

    targetPackage.minAnchorQuantity = Math.max(targetPackage.minAnchorQuantity, Number(recommendation.minAnchorQuantity ?? 1));
    targetPackage.priority = Math.min(targetPackage.priority, Number(recommendation.priority ?? 100));

    if (itemId && targetItems.some((item) => (isService ? item.recommendedServiceId : item.recommendedProductId) === itemId)) {
      return;
    }

    if (targetItems.length >= itemLimit) {
      return;
    }

    targetItems.push(recommendation);
  });

  return Array.from(groupedPackages.values())
    .filter((pkg) => pkg.parts.length > 0 || pkg.services.length > 0)
    .map((pkg) => {
      const packageCopy = buildSmartPackageCopy(pkg.serviceGroup, pkg.packageName, pkg.packageDescription);
      const packageItems = [...pkg.parts, ...pkg.services];

      return {
        ...pkg,
        packageName: packageCopy.packageName,
        packageDescription: packageCopy.packageDescription,
        itemCount: packageItems.length,
        recommendationMode: pkg.recommendationMode || 'smart_bundle',
        recommendationLabel: pkg.recommendationLabel || SMART_RECOMMENDATION_LABEL,
        ...summarizePackagePricing(packageItems),
      };
    })
    .sort((left, right) => Number(left.priority ?? 100) - Number(right.priority ?? 100));
}

function flattenPackageRecommendations(packages = []) {

  return packages.flatMap((pkg) => [...pkg.parts, ...pkg.services]);
}

function buildPackageResponse({ recommendationRows = [], clickedProduct, productMap, serviceMap, partLimit, serviceLimit }) {
  const normalizedRecommendations = recommendationRows
    .map((recommendation) => {
      const matchedProduct = (recommendation.recommendedProductId ?? recommendation.recommended_product_id)
        ? productMap.get(recommendation.recommendedProductId ?? recommendation.recommended_product_id) ?? null
        : null;
      const matchedService = (recommendation.recommendedServiceId ?? recommendation.recommended_service_id)
        ? serviceMap.get(recommendation.recommendedServiceId ?? recommendation.recommended_service_id) ?? null
        : null;

      return normalizeRecommendationRecord({
        recommendation,
        clickedProduct,
        matchedProduct,
        matchedService,
      });
    })
    .filter((recommendation) => recommendation.consequentKind === 'service' || recommendation.recommendedProduct);

  const packages = groupPackageRecommendations(normalizedRecommendations, partLimit, serviceLimit);

  return {
    packages,
    recommendations: flattenPackageRecommendations(packages),
  };
}

async function getOptionalCuratedRecommendations(productId, vehicleModelId, limitCount) {
  try {
    const rows = await callRpc('get_curated_quote_recommendations', {
      p_product_id: productId,
      p_vehicle_model_name: vehicleModelId,
      p_limit_count: limitCount,
    });

    return rows ?? [];
  } catch (error) {
    const message = String(error?.message || error || '');

    if (message.includes('get_curated_quote_recommendations') || message.includes('schema cache')) {
      return [];
    }

    throw error;
  }
}

async function getOptionalPackageRecommendationRows(productId, vehicleModelId, partLimit, serviceLimit) {
  try {
    const rows = await callRpc('get_product_recommendation_packages', {
      p_product_id: productId,
      p_vehicle_model_name: vehicleModelId,
      p_part_limit: partLimit,
      p_service_limit: serviceLimit,
    });

    return rows ?? [];
  } catch (error) {
    const message = String(error?.message || error || '');

    if (message.includes('get_product_recommendation_packages') || message.includes('schema cache')) {
      return [];
    }

    throw error;
  }
}

async function fetchProductCatalogPage({ page, pageSize, searchQuery = null, selectedCategory = 'all', sortBy = 'name-asc' }) {
  return callRpc('get_product_catalog_page', {
    p_page: page,
    p_page_size: pageSize,
    p_search: searchQuery || null,
    p_category: selectedCategory,
    p_sort_by: sortBy,
  });
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
  return callRpc('get_product_catalog_categories', {
    p_search: searchQuery || null,
  });
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

async function fetchPricelistCatalogPage({ page, pageSize, searchQuery = '', selectedCategory = 'all', sortBy = 'name-asc' }) {
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

  query = applyPricelistCatalogFilters(query, { searchQuery, selectedCategory });
  query = applyPricelistCatalogSort(query, sortBy).range(from, to);

  const { data, error, count } = await query;

  if (error) {
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

  const skus = [...new Set(stagingRows.map((row) => row.sku).filter(Boolean))];
  const { data: productRows, error: productsError } = skus.length
    ? await supabaseAdmin
      .schema('catalog')
      .from('products')
      .select('id, sku, brand, uom, status, metadata')
      .in('sku', skus)
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
    ? await supabaseAdmin
      .schema('catalog')
      .from('inventory_balances')
      .select('product_id, on_hand, location')
      .in('product_id', productIds)
    : { data: [], error: null };

  if (balancesError) {
    if (isPrivateSchemaAccessError(balancesError)) {
      return null;
    }
    throw balancesError;
  }

  const balanceByProductId = new Map((balanceRows ?? []).map((balance) => [balance.product_id, balance]));

  return {
    products: stagingRows.map((row) => mapPricelistStagingRow(row, productBySku, balanceByProductId)),
    totalCount: Number(count ?? stagingRows.length),
    sourceAvailable: true,
  };
}

async function fetchRemainingCatalogPagesInBatches(totalPages) {
  const allRows = [];

  for (let page = 2; page <= totalPages; page += FULL_CATALOG_PAGE_BATCH_SIZE) {
    const pageRequests = Array.from(
      { length: Math.min(FULL_CATALOG_PAGE_BATCH_SIZE, totalPages - page + 1) },
      (_, index) => fetchProductCatalogPage({
        page: page + index,
        pageSize: FULL_CATALOG_PAGE_SIZE,
      })
    );
    const pageResults = await Promise.all(pageRequests);
    allRows.push(...pageResults.flat());
  }

  return allRows;
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
      const firstPageRows = await fetchProductCatalogPage({
        page: 1,
        pageSize: FULL_CATALOG_PAGE_SIZE,
      });

      const totalCount = Number(firstPageRows?.[0]?.total_count ?? 0);
      const totalPages = Math.max(1, Math.ceil(totalCount / FULL_CATALOG_PAGE_SIZE));

      let allRows = firstPageRows ?? [];

      if (totalPages > 1) {
        const remainingRows = await fetchRemainingCatalogPagesInBatches(totalPages);
        allRows = allRows.concat(remainingRows);
      }

      const products = await filterActiveCatalogProducts(allRows.map(mapCatalogRow));
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

async function getCatalogInventoryValueSafely() {
  try {
    return calculateInventoryValue(await getCachedProductCatalog());
  } catch (error) {
    if (!isPrivateSchemaAccessError(error)) {
      console.warn('Unable to calculate inventory value for catalog summary:', error?.message || error);
    }
    return 0;
  }
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

router.get('/vehicle-packages', async (req, res, next) => {
  try {
    const vehicleModel = String(req.query.vehicleModel || '').trim();
    const vehicleYear = String(req.query.vehicleYear || '').trim();

    if (!vehicleModel) {
      res.json({ vehicleContext: null, packages: [] });
      return;
    }

    const [catalog, serviceCatalog] = await Promise.all([
      getCachedProductCatalog(),
      getCachedServiceCatalog(),
    ]);

    const vehicleContext = buildVehicleFilterContext({
      vehicleModel,
      vehicleYear,
      vehicleFamily: extractVehicleFamily(vehicleModel),
    });
    const packages = buildVehiclePackages({ catalog, serviceCatalog, vehicleContext });

    res.json({
      vehicleContext: {
        model: vehicleModel,
        year: vehicleYear || '',
        vehicleFamily: extractVehicleFamily(vehicleModel),
        displayLabel: buildVehicleDisplayLabel({ model: vehicleModel, year: vehicleYear }),
      },
      packages,
    });
  } catch (error) {
    next(error);
  }
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

    const { error: unlinkError } = await supabaseAdmin
      .schema('catalog')
      .from('product_supplier_links')
      .delete()
      .eq('supplier_id', supplierId);

    if (unlinkError && !isPrivateSchemaAccessError(unlinkError) && !String(unlinkError.message || '').includes('product_supplier_links')) {
      throw unlinkError;
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
    const vehicleModel = String(req.query.vehicleModel || '').trim();
    const vehicleYear = String(req.query.vehicleYear || '').trim();
    const includeCategories = String(req.query.includeCategories || 'true').trim().toLowerCase() !== 'false';
    const useStagingCatalog = String(req.query.source || '').trim().toLowerCase() === 'staging';
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
      const catalog = await getCachedProductCatalog();
      const scopedProducts = catalog.filter((product) => matchesCatalogFilters(product, {
        searchQuery,
        selectedCategory,
        vehicleContext,
      }));
      const categoryScopedProducts = catalog.filter((product) => matchesCatalogFilters(product, {
        searchQuery,
        selectedCategory: 'all',
        vehicleContext,
      }));
      const sortedProducts = sortCatalogProducts(scopedProducts, sortBy);

      totalCount = sortedProducts.length;
      totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      products = await enrichCatalogProducts(sortedProducts.slice((page - 1) * pageSize, page * pageSize));

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
      products,
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

router.get('/products/all', async (_req, res, next) => {
  try {
    const products = await enrichCatalogProducts(await getCachedProductCatalog());
    res.json({ products: products ?? [] });
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
      .select('id, product_id, movement_type, quantity, reference_type, notes, performed_by, business_date, created_at')
      .eq('product_id', productId)
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
    const inventoryValue = await getCatalogInventoryValueSafely();

    try {
      const summaryRows = await callRpc('get_catalog_summary');
      const summary = Array.isArray(summaryRows) ? (summaryRows[0] ?? null) : summaryRows;

      res.json({
        summary: {
          totalProducts: Math.max(Number(summary?.total_products ?? 0), Number(summary?.pricelist_rows ?? 0)),
          pricelistRows: Number(summary?.pricelist_rows ?? 0),
          uniqueProducts: Number(summary?.unique_products ?? 0),
          currentPrices: Number(summary?.current_prices ?? 0),
          inventoryValue,
        },
      });
      return;
    } catch (error) {
      const message = String(error?.message || error || '');
      if (!message.includes('get_catalog_summary') && !isPrivateSchemaAccessError(error)) {
        throw error;
      }
    }

    const products = await getCachedProductCatalog();
    const totalProducts = Number(products?.length ?? 0);

    res.json({
      summary: {
        totalProducts,
        pricelistRows: totalProducts,
        uniqueProducts: totalProducts,
        currentPrices: totalProducts,
        inventoryValue,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/stock/receive', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const productId = String(req.body?.productId || '').trim();
    const quantity = parsePositiveStockQuantity(req.body?.quantity);
    const supplierId = String(req.body?.supplierId || '').trim() || null;
    const supplierName = String(req.body?.supplierName || '').trim();
    const referenceNumber = String(req.body?.referenceNumber || '').trim() || buildOperationalReference('RCV');
    const reason = String(req.body?.reason || '').trim();

    if (!productId) {
      res.status(400).json({ error: 'Product is required.' });
      return;
    }

    if (quantity === null) {
      res.status(400).json({ error: 'Quantity must be greater than zero.' });
      return;
    }

    if (!supplierName) {
      res.status(400).json({ error: 'Supplier name is required for stock receiving.' });
      return;
    }

    const { data: product, error: productError } = await supabaseAdmin
      .schema('catalog')
      .from('products')
      .select('id, sku, name')
      .eq('id', productId)
      .maybeSingle();

    if (productError) {
      throw productError;
    }

    if (!product) {
      res.status(404).json({ error: 'Product was not found in the catalog.' });
      return;
    }

    const { data: currentBalance, error: balanceError } = await supabaseAdmin
      .schema('catalog')
      .from('inventory_balances')
      .select('product_id, on_hand, reserved, reorder_point, reorder_quantity, location')
      .eq('product_id', productId)
      .maybeSingle();

    if (balanceError) {
      throw balanceError;
    }

    const previousStock = Number(currentBalance?.on_hand ?? 0);
    const updatedStock = Number((previousStock + quantity).toFixed(2));
    const nowIso = new Date().toISOString();
    let effectiveSupplierId = supplierId;

    const { error: upsertError } = await supabaseAdmin
      .schema('catalog')
      .from('inventory_balances')
      .upsert({
        product_id: productId,
        on_hand: updatedStock,
        reserved: Number(currentBalance?.reserved ?? 0),
        reorder_point: Number(currentBalance?.reorder_point ?? 0),
        reorder_quantity: Number(currentBalance?.reorder_quantity ?? 0),
        location: currentBalance?.location ?? {},
        as_of_date: nowIso.slice(0, 10),
        business_date: nowIso.slice(0, 10),
        updated_at: nowIso,
      }, { onConflict: 'product_id' });

    if (upsertError) {
      throw upsertError;
    }

    if (!effectiveSupplierId && supplierName) {
      try {
        const { data: supplier, error: supplierError } = await supabaseAdmin
          .schema('catalog')
          .from('suppliers')
          .upsert({
            supplier_code: normalizeSku(`SUP-${supplierName}`, 'SUP'),
            name: supplierName,
            phone: normalizeOptionalText(req.body?.supplierContact, 80),
            address: normalizeOptionalText(req.body?.supplierAddress, 500),
            updated_at: nowIso,
          }, { onConflict: 'supplier_code' })
          .select('id')
          .single();

        if (supplierError && !isPrivateSchemaAccessError(supplierError)) {
          throw supplierError;
        }

        effectiveSupplierId = supplier?.id ?? effectiveSupplierId;
      } catch (error) {
        if (!String(error.message || '').includes('suppliers')) {
          throw error;
        }
      }
    }

    await linkProductSupplier(productId, effectiveSupplierId);

    const { data: movement, error: movementError } = await supabaseAdmin
      .schema('catalog')
      .from('inventory_movements')
      .insert({
        product_id: productId,
        movement_type: 'stock_in',
        quantity,
        reference_type: 'supplier_receipt',
        reference_id: null,
        notes: buildStockReceiveNotes({ supplierName, referenceNumber, reason }),
        performed_by: req.user?.id || null,
        business_date: nowIso.slice(0, 10),
      })
      .select('id, created_at')
      .single();

    if (movementError) {
      throw movementError;
    }

    try {
      await supabaseAdmin.schema('catalog').from('stock_receiving_logs').insert({
        product_id: productId,
        supplier_id: effectiveSupplierId,
        quantity_added: quantity,
        previous_stock: previousStock,
        updated_stock: updatedStock,
        reference_number: referenceNumber,
        received_date: req.body?.receivedDate || nowIso.slice(0, 10),
        notes: reason || null,
        performed_by: req.user?.id || null,
        movement_id: movement.id,
      });
    } catch (error) {
      if (!isPrivateSchemaAccessError(error) && !String(error.message || '').includes('stock_receiving_logs')) {
        throw error;
      }
    }

    invalidateProductCatalogCache();

    res.status(201).json({
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
      },
      movement: {
        id: movement.id,
        createdAt: movement.created_at,
      },
      previousStock,
      quantityAdded: quantity,
      updatedStock,
      supplierName,
      referenceNumber,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/stock/receive-invoice', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const rpcName = req.body?.allowNewProducts === false
      ? 'receive_existing_supplier_invoice_stock'
      : 'receive_supplier_invoice_stock';
    const receipt = await callRpc(rpcName, {
      p_invoice: req.body,
      p_performed_by: req.user?.id ?? null,
    });

    invalidateProductCatalogCache();

    res.status(201).json({
      receipt,
      items: receipt?.items ?? [],
    });
  } catch (error) {
    next(error);
  }
});

router.post('/stock/invoice-ocr', requireRole('admin', 'stock_clerk'), invoiceUpload.single('invoice'), async (req, res, next) => {
  try {
    const result = await analyzeSupplierInvoiceImage(req.file);

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
    const requestedStock = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'stock')
      ? parseStockLevel(req.body?.stock)
      : null;
    const sourceCategory = normalizeOptionalText(req.body?.sourceCategory, 140);
    const supplierId = normalizeOptionalText(req.body?.supplierId, 80);
    const supplierName = normalizeOptionalText(req.body?.supplierName, 180);
    const imageUrl = normalizeOptionalText(req.body?.imageUrl, 1000);
    const price = parsePrice(req.body?.price);

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
      .select('id, sku, name, model_name, category, brand, uom, status, source_category, metadata')
      .single();

    if (productError) {
      if (productError.code === '23505') {
        res.status(409).json({ error: 'A product with this part number already exists.' });
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
        category: classification.category,
        brand,
        uom,
        status: getStatusForStockLevel(stockAdjustment?.updatedStock ?? targetStock),
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
      .select('id, sku, name, model_name, category, brand, uom, status, source_category, metadata')
      .maybeSingle();

    if (productError) {
      throw productError;
    }

    if (!product) {
      res.status(404).json({ error: 'Product was not found in the catalog.' });
      return;
    }

    const { error: closePriceError } = await supabaseAdmin
      .schema('catalog')
      .from('product_prices')
      .update({
        is_current: false,
        effective_to: businessDate,
        updated_at: nowIso,
      })
      .eq('product_id', productId)
      .eq('price_type', 'retail')
      .eq('is_current', true);

    if (closePriceError) {
      throw closePriceError;
    }

    const { error: priceError } = await supabaseAdmin
      .schema('catalog')
      .from('product_prices')
      .insert({
        product_id: productId,
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

router.get('/products/archived', requireRole('admin'), async (req, res, next) => {
  try {
    const limit = parsePositiveInteger(req.query.limit, 8, 50);
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
          .select('product_id, on_hand')
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
        archivedAt: product.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stock/movements', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const limit = parsePositiveInteger(req.query.limit, 12, 100);
    const { data: movements, error: movementsError } = await supabaseAdmin
      .schema('catalog')
      .from('inventory_movements')
      .select('id, product_id, movement_type, quantity, reference_type, notes, performed_by, business_date, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (movementsError) {
      if (isPrivateSchemaAccessError(movementsError)) {
        res.json({ movements: [] });
        return;
      }
      throw movementsError;
    }

    const productIds = [...new Set((movements ?? []).map((movement) => movement.product_id).filter(Boolean))];
    const userIds = [...new Set((movements ?? []).map((movement) => movement.performed_by).filter(Boolean))];

    const [{ data: products, error: productsError }, { data: profiles, error: profilesError }] = await Promise.all([
      productIds.length > 0
        ? supabaseAdmin.schema('catalog').from('products').select('id, sku, name').in('id', productIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length > 0
        ? supabaseAdmin.schema('core').from('user_profiles').select('user_id, full_name, email').in('user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (productsError) {
      if (isPrivateSchemaAccessError(productsError)) {
        res.json({ movements: [] });
        return;
      }
      throw productsError;
    }

    if (profilesError && !isPrivateSchemaAccessError(profilesError)) {
      throw profilesError;
    }

    const productMap = new Map((products ?? []).map((product) => [product.id, product]));
    const profileMap = new Map((profilesError ? [] : (profiles ?? [])).map((profile) => [profile.user_id, profile]));

    res.json({
      movements: (movements ?? []).map((movement) => {
        const product = productMap.get(movement.product_id) ?? {};
        const profile = profileMap.get(movement.performed_by) ?? {};

        return {
          id: movement.id,
          productId: movement.product_id,
          sku: product.sku ?? '',
          productName: product.name ?? 'Unknown product',
          movementType: movement.movement_type,
          quantity: Number(movement.quantity ?? 0),
          referenceType: movement.reference_type,
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
    const products = await getCachedProductCatalog();
    const priceList = (products ?? []).map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      model: product.model,
      category: product.category,
      price: Number(product.price ?? 0),
    }));

    res.json({ priceList });
  } catch (error) {
    next(error);
  }
});

router.post('/prices/bulk-replace', requireRole('admin'), async (req, res, next) => {
  try {
    const items = normalizePriceListItems(req.body?.items);
    const effectiveFrom = req.body?.effectiveFrom || new Date().toISOString().slice(0, 10);

    if (items.length === 0) {
      return res.status(400).json({ error: 'Provide at least one valid part number and price.' });
    }

    const uniqueItems = Array.from(
      items.reduce((map, item) => map.set(item.sku, item), new Map()).values()
    );

    const skuList = uniqueItems.map((item) => item.sku);
    const { data: products, error: productsError } = await supabaseAdmin
      .schema('catalog')
      .from('products')
      .select('id, sku, name')
      .in('sku', skuList);

    if (productsError) {
      throw productsError;
    }

    const productMap = new Map((products ?? []).map((product) => [product.sku, product]));
    const matchedItems = uniqueItems.filter((item) => productMap.has(item.sku));
    const skippedItems = uniqueItems.filter((item) => !productMap.has(item.sku));

    if (matchedItems.length === 0) {
      return res.status(404).json({ error: 'No matching part numbers were found in the catalog.', skippedItems });
    }

    const matchedProductIds = matchedItems.map((item) => productMap.get(item.sku).id);
    const previousDate = getPreviousDate(effectiveFrom);

    const { error: archiveError } = await supabaseAdmin
      .schema('catalog')
      .from('product_prices')
      .update({
        is_current: false,
        effective_to: previousDate,
        updated_at: new Date().toISOString(),
      })
      .eq('price_type', 'retail')
      .eq('is_current', true)
      .in('product_id', matchedProductIds);

    if (archiveError) {
      throw archiveError;
    }

    const newPrices = matchedItems.map((item) => ({
      product_id: productMap.get(item.sku).id,
      price_type: 'retail',
      amount: item.price,
      currency: 'PHP',
      effective_from: effectiveFrom,
      effective_to: null,
      is_current: true,
      business_date: effectiveFrom,
    }));

    const { error: insertError } = await supabaseAdmin
      .schema('catalog')
      .from('product_prices')
      .insert(newPrices);

    if (insertError) {
      throw insertError;
    }

    invalidateProductCatalogCache();

    res.json({
      updatedCount: matchedItems.length,
      skippedCount: skippedItems.length,
      skippedItems,
      effectiveFrom,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/products/:productId/recommendations', async (req, res, next) => {
  try {
    const limitCount = parsePositiveInteger(req.query.limit, DEFAULT_PART_LIMIT, 24);
    const partLimit = parsePositiveInteger(req.query.partLimit, limitCount, 24);
    const serviceLimit = parsePositiveInteger(req.query.serviceLimit, limitCount, 24);
    const vehicleModelId = req.query.vehicleModelId || null;

    const [catalog, serviceCatalog] = await Promise.all([
      getCachedProductCatalog(),
      getCachedServiceCatalog(),
    ]);

    const clickedProduct = catalog.find((product) => product.id === req.params.productId);

    if (!clickedProduct) {
      return res.json({ packages: [], recommendations: [] });
    }

    const productMap = new Map(catalog.map((product) => [product.id, product]));
    const serviceMap = new Map(serviceCatalog.map((service) => [service.id, service]));
    const packageRows = await getOptionalPackageRecommendationRows(req.params.productId, vehicleModelId, partLimit, serviceLimit);

    if (packageRows.length > 0) {
      const packageResponse = buildPackageResponse({
        recommendationRows: packageRows,
        clickedProduct,
        productMap,
        serviceMap,
        partLimit,
        serviceLimit,
      });

      if (packageResponse.packages.length > 0) {
        return res.json(packageResponse);
      }
    }

    const mergedLimit = Math.min(partLimit + serviceLimit, 24);
    const [directRecommendations, curatedRecommendations] = await Promise.all([
      callRpc('get_product_upsell_recommendations', {
        product_id: req.params.productId,
        vehicle_model_id: vehicleModelId,
        limit_count: mergedLimit,
      }).catch(() => []),
      getOptionalCuratedRecommendations(req.params.productId, vehicleModelId, mergedLimit),
    ]);

    const fallbackRecommendations = buildVehicleMatchedRecommendations({
      clickedProduct,
      catalog,
      serviceCatalog,
      partLimit,
      serviceLimit,
    });

    const normalizeExternalRecommendations = (recommendations = []) => recommendations
      .map((recommendation) => {
        const matchedProduct = (recommendation.recommendedProductId ?? recommendation.recommended_product_id)
          ? productMap.get(recommendation.recommendedProductId ?? recommendation.recommended_product_id) ?? null
          : null;
        const matchedService = (recommendation.recommendedServiceId ?? recommendation.recommended_service_id)
          ? serviceMap.get(recommendation.recommendedServiceId ?? recommendation.recommended_service_id) ?? null
          : null;

        return normalizeRecommendationRecord({
          recommendation,
          clickedProduct,
          matchedProduct,
          matchedService,
        });
      })
      .filter((recommendation) => recommendation.consequentKind === 'service' || recommendation.recommendedProduct);

    const mergedRecommendations = dedupeRecommendations([
      ...normalizeExternalRecommendations(curatedRecommendations ?? []),
      ...fallbackRecommendations,
      ...normalizeExternalRecommendations(directRecommendations ?? []),
    ]);

    res.json(buildPackageResponse({
      recommendationRows: mergedRecommendations,
      clickedProduct,
      productMap,
      serviceMap,
      partLimit,
      serviceLimit,
    }));
  } catch (error) {
    next(error);
  }
});

export default router;

















