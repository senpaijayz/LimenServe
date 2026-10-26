import { randomUUID } from 'node:crypto';

export const PACKAGE_TYPES = Object.freeze(['parts', 'service', 'vehicle', 'combination', 'promotion', 'maintenance', 'custom']);
export const PACKAGE_STATUSES = Object.freeze(['draft', 'published', 'unpublished', 'archived']);
export const PACKAGE_PRICE_MODES = Object.freeze(['catalog', 'percentage', 'fixed_discount', 'fixed_price']);
export const PACKAGE_PRICE_STRATEGIES = Object.freeze(['live', 'snapshot', 'manual']);
export const PACKAGE_LIMITS = Object.freeze({ variants: 8, items: 40, totalItems: 120, eligibility: 30, quantity: 1000, money: 100000000 });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value) => String(value ?? '').trim();
const comparable = (value) => clean(value).toLowerCase().replace(/\s+/g, ' ');

export function packageError(message, statusCode = 400, code = 'PACKAGE_INVALID') {
  return Object.assign(new Error(message), { statusCode, code, publicMessage: message });
}

function fail(message) { throw packageError(message); }
function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}
function text(value, label, max = 180, required = false) {
  if (value !== null && value !== undefined && typeof value !== 'string') fail(`${label} must be text.`);
  const result = clean(value);
  const unsafeControls = max >= 1000 ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if ((required && !result) || result.length > max || unsafeControls.test(result)) fail(`${label} is invalid.`);
  return result;
}
function choice(value, allowed, label, fallback) {
  const result = value ?? fallback;
  if (!allowed.includes(result)) fail(`${label} is invalid.`);
  return result;
}
function integer(value, label, min = 0, max = 1000000) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail(`${label} must be a whole number between ${min} and ${max}.`);
  return value;
}
function id(value, label, optional = false) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string' || !UUID.test(value)) fail(`${label} must reference a saved record.`);
  return value.toLowerCase();
}
function list(value, label, max) {
  if (!Array.isArray(value) || value.length > max) fail(`${label} must contain at most ${max} entries.`);
  return value;
}
function uniqueIds(rows, label) {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) fail(`${label} contain duplicate identities.`);
}

// Decimal amounts are parsed, not multiplied as floating point. Monetary
// calculations and allocations below operate exclusively on safe integer cents.
export function packageMoneyToCents(value, label = 'Price') {
  if (typeof value !== 'number' && typeof value !== 'string') fail(`${label} is missing or invalid.`);
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) fail(`${label} must be a nonnegative amount with at most two decimals.`);
  const [whole, fraction = ''] = raw.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > PACKAGE_LIMITS.money * 100) fail(`${label} exceeds the allowed amount.`);
  return cents;
}
const amount = (cents) => Number((cents / 100).toFixed(2));

export function normalizeManagedPackageSelections(input = []) {
  const seen = new Set();
  return list(input, 'Quotation packages', 12).map((raw) => {
    const value = record(raw, 'Package selection');
    if (Object.keys(value).some((key) => !['packageId', 'revisionId', 'variantId', 'quantity'].includes(key))) fail('A package selection contains unsupported details.');
    const packageId = id(value.packageId, 'Package');
    if (seen.has(packageId)) fail('The same package cannot be added twice. Change its package quantity instead.');
    seen.add(packageId);
    return { packageId, revisionId: id(value.revisionId, 'Published revision'), variantId: id(value.variantId, 'Package option'),
      quantity: integer(value.quantity ?? 1, 'Package quantity', 1, 1000) };
  });
}

export function normalizeManagedPackageRepriceIds(input = []) {
  const ids = list(input, 'Packages to reprice', 12).map((value) => id(value, 'Package to reprice'));
  if (new Set(ids).size !== ids.length) fail('Choose each package to reprice only once.');
  return ids;
}

function normalizeEligibility(input = []) {
  return list(input, 'Compatibility rules', PACKAGE_LIMITS.eligibility).map((raw) => {
    const rule = record(raw, 'Compatibility rule');
    const mode = choice(rule.mode, ['unverified', 'universal', 'exact', 'model_year', 'family'], 'Compatibility mode', 'unverified');
    const yearFrom = rule.yearFrom == null || rule.yearFrom === '' ? null : integer(rule.yearFrom, 'First year', 1900, 2200);
    const yearTo = rule.yearTo == null || rule.yearTo === '' ? null : integer(rule.yearTo, 'Last year', 1900, 2200);
    if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) fail('The first compatible year must not be after the last year.');
    return {
      id: rule.id ? id(rule.id, 'Compatibility rule') : randomUUID(), mode,
      fitmentId: id(rule.fitmentId, 'Vehicle configuration', true),
      make: text(rule.make, 'Make', 80), model: text(rule.model, 'Model', 120),
      family: text(rule.family, 'Vehicle family', 120), engine: text(rule.engine, 'Engine', 120),
      variant: text(rule.variant, 'Vehicle variant', 120), yearFrom, yearTo,
      verified: rule.verified === true && mode !== 'unverified',
      evidence: text(rule.evidence, 'Compatibility evidence', 1000),
    };
  });
}

function normalizePricing(raw = {}) {
  record(raw, 'Pricing');
  const mode = choice(raw.mode, PACKAGE_PRICE_MODES, 'Pricing method', 'catalog');
  const strategy = choice(raw.strategy, PACKAGE_PRICE_STRATEGIES, 'Price update strategy', 'live');
  const value = mode === 'catalog' ? 0 : amount(packageMoneyToCents(raw.value, 'Pricing value'));
  if (mode === 'percentage' && value > 100) fail('A percentage discount cannot exceed 100%.');
  return { mode, strategy, value };
}

function normalizeItem(raw, index) {
  record(raw, 'Package item');
  const kind = choice(raw.kind, ['product', 'service'], 'Item kind');
  const priceMode = choice(raw.priceMode, ['catalog', 'override', 'complimentary'], 'Item pricing', 'catalog');
  if (priceMode === 'complimentary' && kind !== 'service') fail('Only a service can be marked complimentary.');
  return {
    id: raw.id ? id(raw.id, 'Package item') : randomUUID(), kind,
    productId: kind === 'product' ? id(raw.productId, 'Product') : null,
    serviceId: kind === 'service' ? id(raw.serviceId, 'Service') : null,
    quantity: integer(raw.quantity ?? 1, 'Item quantity', 1, PACKAGE_LIMITS.quantity),
    displayOrder: integer(raw.displayOrder ?? index, 'Item order'),
    required: raw.required !== false, active: raw.active !== false, priceMode,
    priceOverride: priceMode === 'override' ? amount(packageMoneyToCents(raw.priceOverride, 'Item override')) : null,
    reason: text(raw.reason, 'Item description', 300),
  };
}

export function normalizeManagedPackageDraft(input) {
  const raw = record(input, 'Package');
  const packageId = raw.id ? id(raw.id, 'Package') : randomUUID();
  const packageKey = text(raw.packageKey, 'Package key', 120, true);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(packageKey)) fail('Package key must use lowercase letters, numbers, hyphens, or underscores.');
  const variants = list(raw.variants ?? [], 'Package variants', PACKAGE_LIMITS.variants).map((value, index) => {
    const variant = record(value, 'Variant');
    const items = list(variant.items ?? [], 'Package items', PACKAGE_LIMITS.items).map(normalizeItem);
    uniqueIds(items, 'Package items');
    const references = items.filter((item) => item.active).map((item) => `${item.kind}:${item.productId || item.serviceId}`);
    if (new Set(references).size !== references.length) fail('A variant cannot include the same product or service twice. Change its quantity instead.');
    return {
      id: variant.id ? id(variant.id, 'Variant') : randomUUID(),
      key: text(variant.key || 'complete', 'Variant key', 80, true),
      label: text(variant.label || 'Complete package', 'Variant label', 120, true),
      description: text(variant.description, 'Variant description', 1000),
      displayOrder: integer(variant.displayOrder ?? index, 'Variant order'), active: variant.active !== false,
      pricing: normalizePricing(variant.pricing), eligibility: normalizeEligibility(variant.eligibility), items,
    };
  });
  uniqueIds(variants, 'Variants');
  if (new Set(variants.map((variant) => variant.key)).size !== variants.length) fail('Variant keys must be unique within a package.');
  const allItemIds = variants.flatMap((variant) => variant.items.map((item) => item.id));
  if (allItemIds.length > PACKAGE_LIMITS.totalItems) fail(`A package can contain at most ${PACKAGE_LIMITS.totalItems} item definitions across its variants.`);
  if (new Set(allItemIds).size !== allItemIds.length) fail('Each variant must have its own item identities.');
  const eligibility = normalizeEligibility(raw.eligibility);
  uniqueIds([...eligibility, ...variants.flatMap((variant) => variant.eligibility)], 'Compatibility rules');
  const imageUrl = text(raw.imageUrl, 'Image URL', 2000);
  if (imageUrl && !/^https:\/\/[^\s]+$/i.test(imageUrl) && !/^\/(?!\/)[^\s]*$/.test(imageUrl)) fail('Choose an uploaded image or a valid HTTPS image URL.');
  return {
    id: packageId, packageKey,
    name: text(raw.name, 'Package name', 180, true), description: text(raw.description, 'Package description', 2000),
    type: choice(raw.type, PACKAGE_TYPES, 'Package type', 'custom'),
    category: text(raw.category, 'Category', 100), serviceGroup: text(raw.serviceGroup, 'Service group', 80),
    anchorProductId: id(raw.anchorProductId, 'Anchor product', true),
    anchorCategory: text(raw.anchorCategory, 'Trigger category', 100),
    triggerServiceId: id(raw.triggerServiceId, 'Trigger service', true),
    imageUrl, internalNotes: text(raw.internalNotes, 'Internal notes', 4000),
    priority: integer(raw.priority ?? 100, 'Display priority'),
    minAnchorQuantity: integer(raw.minAnchorQuantity ?? 1, 'Minimum anchor quantity', 1, PACKAGE_LIMITS.quantity),
    relationshipVerified: raw.relationshipVerified === true,
    relationshipEvidence: text(raw.relationshipEvidence, 'Item relationship evidence', 2000),
    expectedRevision: integer(raw.expectedRevision ?? 0, 'Expected revision'),
    eligibility, variants,
  };
}

function referencedRow(references, item) {
  const map = item.kind === 'product' ? references.products : references.services;
  return map instanceof Map ? map.get(item.productId || item.serviceId) : map?.[item.productId || item.serviceId];
}

// Largest-remainder allocation preserves the approved total down to the cent.
function allocateCents(total, weights) {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  if (!sum) return weights.map(() => 0);
  const denominator = BigInt(sum);
  const rows = weights.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight);
    return { index, cents: Number(numerator / denominator), remainder: numerator % denominator };
  });
  let remaining = total - rows.reduce((acc, row) => acc + row.cents, 0);
  [...rows].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1).forEach((row) => {
    if (remaining > 0) { rows[row.index].cents += 1; remaining -= 1; }
  });
  return rows.map((row) => row.cents);
}

export function priceManagedPackageVariant(variant, references, { publishedBasePrices = null } = {}) {
  const pricing = normalizePricing(variant.pricing);
  const lines = variant.items.filter((item) => item.active !== false).map((item) => {
    const source = referencedRow(references, item);
    if (!source || (source.isActive ?? source.is_active) !== true || source.status === 'discontinued') fail('A package item is missing, inactive, or discontinued.');
    const livePrice = source.price ?? source.standard_price;
    const basePrice = pricing.strategy === 'live' ? livePrice : publishedBasePrices?.[item.id] ?? livePrice;
    const catalogUnitCents = packageMoneyToCents(basePrice, `${source.sku || source.code || source.name} catalog price`);
    if (item.kind === 'product' && catalogUnitCents === 0) fail('A product needs a positive verified catalog price before it can be packaged.');
    const quantity = integer(item.quantity, 'Item quantity', 1, PACKAGE_LIMITS.quantity);
    const effectiveUnitCents = item.priceMode === 'complimentary' ? 0
      : item.priceMode === 'override' ? packageMoneyToCents(item.priceOverride, 'Item override') : catalogUnitCents;
    if (item.priceMode === 'complimentary' && item.kind !== 'service') fail('Only services can be complimentary.');
    if (effectiveUnitCents > catalogUnitCents) fail('A package override cannot silently increase the catalog price. Review and reprice this package.');
    return {
      itemId: item.id, kind: item.kind, productId: item.productId, serviceId: item.serviceId,
      sku: source.sku || source.code || '', name: source.name, quantity, required: item.required !== false,
      priceMode: item.priceMode, catalogUnitCents, baseTotalCents: catalogUnitCents * quantity,
      itemTotalCents: effectiveUnitCents * quantity,
      stock: item.kind === 'product' && source.stock !== undefined && source.stock !== null ? Number(source.stock) : null,
    };
  });
  if (!lines.length) fail('Add at least one active item to the package.');
  const catalogCents = lines.reduce((sum, line) => sum + line.baseTotalCents, 0);
  const itemCents = lines.reduce((sum, line) => sum + line.itemTotalCents, 0);
  if (!Number.isSafeInteger(catalogCents) || catalogCents > PACKAGE_LIMITS.money * 100) fail('Package total exceeds the supported amount.');
  const valueCents = packageMoneyToCents(pricing.value, 'Pricing value');
  let totalCents = itemCents;
  if (pricing.mode === 'percentage') totalCents = Number((BigInt(itemCents) * BigInt(10000 - valueCents) + 5000n) / 10000n);
  if (pricing.mode === 'fixed_discount') {
    if (valueCents > itemCents) fail('The discount exceeds the package subtotal.');
    totalCents = itemCents - valueCents;
  }
  if (pricing.mode === 'fixed_price') {
    if (valueCents > itemCents) fail('The fixed package price exceeds the item subtotal. Review and reprice this package.');
    totalCents = valueCents;
  }
  const allocated = allocateCents(totalCents, lines.map((line) => line.itemTotalCents));
  const pricedLines = lines.map((line, index) => ({
    ...line, catalogUnitPrice: amount(line.catalogUnitCents), catalogTotal: amount(line.baseTotalCents),
    effectiveTotal: amount(allocated[index]), savings: amount(line.baseTotalCents - allocated[index]),
    // A fixed total may not divide evenly by quantity at 2-decimal unit prices.
    // Split only the price allocation, never lose units or a rounding cent.
    allocations: (() => {
      const low = Math.floor(allocated[index] / line.quantity);
      const highQuantity = allocated[index] % line.quantity;
      return [
        { quantity: line.quantity - highQuantity, unitPrice: amount(low) },
        { quantity: highQuantity, unitPrice: amount(low + 1) },
      ].filter((entry) => entry.quantity > 0);
    })(),
  }));
  const productLines = pricedLines.filter((line) => line.kind === 'product');
  const known = productLines.filter((line) => Number.isFinite(line.stock));
  const stocked = known.filter((line) => line.stock >= line.quantity);
  const availability = !productLines.length || stocked.length === productLines.length ? 'available'
    : !known.length ? 'unknown' : known.every((line) => line.stock <= 0) && known.length === productLines.length ? 'out_of_stock' : 'partially_available';
  const taxCents = Number((BigInt(totalCents) * 12n + 50n) / 100n);
  return {
    variantId: variant.id, label: variant.label, pricing, lines: pricedLines, availability,
    catalogTotal: amount(catalogCents), packageTotal: amount(totalCents), savings: amount(catalogCents - totalCents),
    taxRate: 0.12, tax: amount(taxCents),
    grandTotal: amount(totalCents + taxCents),
  };
}

export function managedPackageMatchesVehicle(rules, vehicle = {}) {
  return rules.some((rule) => {
    if (!rule.verified || !clean(rule.evidence)) return false;
    if (rule.mode === 'universal') return true;
    if (rule.make && comparable(rule.make) !== comparable(vehicle.make)) return false;
    if (rule.engine && comparable(rule.engine) !== comparable(vehicle.engine)) return false;
    if (rule.variant && comparable(rule.variant) !== comparable(vehicle.variant)) return false;
    const year = Number(vehicle.year);
    if (rule.yearFrom != null && (!Number.isInteger(year) || year < rule.yearFrom)) return false;
    if (rule.yearTo != null && (!Number.isInteger(year) || year > rule.yearTo)) return false;
    if (rule.mode === 'exact') return Boolean(rule.fitmentId && rule.fitmentId === vehicle.fitmentId);
    if (rule.mode === 'model_year') return Boolean(rule.model && comparable(rule.model) === comparable(vehicle.model));
    if (rule.mode === 'family') return Boolean(rule.family && comparable(rule.family) === comparable(vehicle.family));
    return false;
  });
}

export function assertManagedPackagePublishable(definition, references) {
  if (!definition.variants.some((variant) => variant.active)) fail('Create at least one active package variant before publishing.');
  const activeVariants = definition.variants.filter((variant) => variant.active);
  const previews = activeVariants.map((variant) => {
    const items = variant.items.filter((item) => item.active);
    const products = items.filter((item) => item.kind === 'product');
    const services = items.filter((item) => item.kind === 'service');
    if (definition.type === 'parts' && (products.length < 2 || services.length)) fail('A parts bundle requires at least two different products and no labor lines.');
    if (definition.type === 'service' && (!services.length || products.length)) fail('A service package must contain actual services and no product lines.');
    if (definition.type === 'combination' && (!products.length || !services.length)) fail('A combination package requires both parts and labor.');
    if (products.length && (!definition.relationshipVerified || !definition.relationshipEvidence)) fail('Review the relationship and compatibility of the selected items before publishing.');
    const rules = variant.eligibility.length ? variant.eligibility : definition.eligibility;
    if (!rules.length || rules.some((rule) => !rule.verified || !rule.evidence || rule.mode === 'unverified')) fail('Every published variant needs reviewed compatibility rules and supporting evidence.');
    if (definition.type === 'vehicle' && rules.some((rule) => rule.mode === 'universal')) fail('A car package needs explicit compatible vehicles, not universal eligibility.');
    for (const rule of rules) {
      if (rule.mode === 'exact' && !rule.fitmentId) fail('Exact compatibility needs an actual saved vehicle configuration.');
      if (rule.mode === 'model_year' && (!rule.model || rule.yearFrom == null || rule.yearTo == null)) fail('Model compatibility needs a model and an approved year range.');
      if (rule.mode === 'family' && !rule.family) fail('Family compatibility needs a verified vehicle family.');
    }
    return priceManagedPackageVariant(variant, references);
  });
  return previews;
}
