import { supabaseAdmin } from '../config/supabase.js';
import { normalizeManagedPackageSelections, packageError, packageMoneyToCents } from './managedPackageDomain.js';
import { loadManagedPackageReferences } from './managedPackageService.js';
import { managedPackageMatchesContext, pricePublishedManagedVariant, resolveManagedPackageContext } from './publishedManagedPackages.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MANAGED_BUNDLE_PREFIX = 'pkg:';
export const managedPackageBundleKey = (packageId) => `${MANAGED_BUNDLE_PREFIX}${packageId}`;
const money = (cents) => Number((cents / 100).toFixed(2));
const readRows = ({ data, error }) => { if (error) throw error; return data || []; };

export function assertManagedPackageQualifications(snapshot, quoteItems) {
  const definition = snapshot.definition;
  const minimum = definition.minAnchorQuantity * snapshot.quantity;
  const units = (ids) => quoteItems.filter((item) => ids.includes(item.product_id)).reduce((sum, item) => sum + item.quantity, 0);
  if (definition.anchorProductId && units([definition.anchorProductId]) < minimum)
    throw packageError(`This package requires at least ${minimum} units of its qualifying part. Keep those parts or review/remove the package.`, 409, 'PACKAGE_QUALIFICATION_CHANGED');
  if (definition.anchorCategory && (!Array.isArray(snapshot.qualifyingProductIds)
    || units(snapshot.qualifyingProductIds) < (definition.anchorProductId ? 1 : minimum)))
    throw packageError('The qualifying parts for this saved package changed. Review its current offer or remove the package.', 409, 'PACKAGE_QUALIFICATION_CHANGED');
  if (definition.triggerServiceId && !quoteItems.some((item) => item.service_id === definition.triggerServiceId))
    throw packageError('This package requires its qualifying service. Keep that service or review/remove the package.', 409, 'PACKAGE_QUALIFICATION_CHANGED');
}

function canonicalLines(selection, publication, priced) {
  const name = publication.definition.name;
  return priced.lines.flatMap((line) => line.allocations.map((allocation, allocationIndex) => {
    const quantity = allocation.quantity * selection.quantity;
    if (!Number.isSafeInteger(quantity) || quantity > 1000) throw packageError('The package quantity exceeds the supported number of units per line.');
    return {
      line_type: line.kind,
      ...(line.kind === 'product'
        ? { product_id: line.productId, product_name: line.name, product_sku: line.sku }
        : { service_id: line.serviceId, service_name: line.name }),
      quantity, unit_price: allocation.unitPrice,
      line_total: money(packageMoneyToCents(allocation.unitPrice) * quantity),
      catalog_unit_price: line.catalogUnitPrice,
      recommendation_rule_id: null, is_upsell: true,
      bundle_key: managedPackageBundleKey(selection.packageId), bundle_name: name, bundle_tier_label: priced.label,
      managed_package_id: selection.packageId, managed_package_revision_id: selection.revisionId,
      managed_package_variant_id: selection.variantId, managed_package_item_id: line.itemId,
      managed_package_allocation: allocationIndex,
    };
  }));
}

/** Only for newly added/repriced offers. Historical quote edits must load their
 * own authorized saved snapshot; never pass an arbitrary old publication here.
 * Every amount and label below is rebuilt from server-loaded records. */
export async function resolveNewManagedPackageSelections({ selections: rawSelections = [],
  regularItems = [], vehicle = {}, now = new Date() } = {}) {
  const selections = normalizeManagedPackageSelections(rawSelections);
  if (!Array.isArray(regularItems) || regularItems.length > 100 || regularItems.some((item) => !item
    || !['product', 'service'].includes(item.line_type) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000
    || (item.line_type === 'product' ? !UUID.test(item.product_id || '') || Boolean(item.service_id)
      : !UUID.test(item.service_id || '') || Boolean(item.product_id)))) throw packageError('The regular quotation items are invalid.');
  if (!selections.length) return { items: [], snapshots: [], catalogTotal: 0, effectiveTotal: 0, savings: 0 };
  const packageIds = selections.map((selection) => selection.packageId);
  const roots = readRows(await supabaseAdmin.schema('cms').from('recommendation_packages')
    .select('id,publication_status,published_revision_id').in('id', packageIds));
  const rootMap = new Map(roots.map((row) => [row.id, row]));
  for (const selection of selections) {
    const root = rootMap.get(selection.packageId);
    if (!root || root.publication_status !== 'published' || root.published_revision_id !== selection.revisionId) {
      throw packageError('A selected package changed or is no longer published. Review the current offer before saving.', 409, 'PACKAGE_PUBLICATION_CHANGED');
    }
  }
  const rows = readRows(await supabaseAdmin.schema('cms').from('package_revisions')
    .select('id,package_id,revision_number,definition,pricing_snapshot').in('id', selections.map((selection) => selection.revisionId)));
  const publicationMap = new Map(rows.map((row) => [row.id, {
    revisionId: row.id, packageId: row.package_id, revisionNumber: row.revision_number,
    definition: row.definition, pricingSnapshot: row.pricing_snapshot,
  }]));
  const picked = selections.map((selection) => {
    const publication = publicationMap.get(selection.revisionId);
    const variant = publication?.definition.variants.find((row) => row.id === selection.variantId && row.active);
    if (!publication || publication.packageId !== selection.packageId || !variant) throw packageError('A selected package option is no longer available.', 409);
    return { selection, publication, variant };
  });
  const allIncludedItems = picked.flatMap(({ selection, variant }) => variant.items.filter((item) => item.active)
    .map((item) => ({ line_type: item.kind, product_id: item.productId, service_id: item.serviceId, quantity: item.quantity * selection.quantity })));
  const allItems = [...regularItems, ...allIncludedItems];
  if (allItems.length > 100) throw packageError('This quotation exceeds 100 lines. Choose fewer packages or request separate quotations.');
  const context = await resolveManagedPackageContext({
    vehicleModel: vehicle.model_name ?? vehicle.model, vehicleYear: vehicle.year,
    vehicleEngine: vehicle.engine, vehicleVariant: vehicle.variant, vehicleMake: vehicle.make,
    fitmentId: vehicle.fitmentId,
    productIds: [...new Set(allItems.map((item) => item.product_id).filter(Boolean))],
    serviceIds: [...new Set(allItems.map((item) => item.service_id).filter(Boolean))],
  }, { maximumItems: 100 });
  const references = await loadManagedPackageReferences(picked.map(({ publication, variant }) => ({ ...publication.definition, variants: [variant] })));
  const productDemand = new Map();
  for (const item of allItems.filter((line) => line.line_type === 'product')) {
    productDemand.set(item.product_id, (productDemand.get(item.product_id) || 0) + item.quantity);
  }
  const snapshots = picked.map(({ selection, publication, variant }) => {
    if (!managedPackageMatchesContext(publication.definition, variant, context)) throw packageError('A selected package does not match this vehicle or the selected parts and services.');
    const priced = pricePublishedManagedVariant(publication, variant, references);
    const products = priced.lines.filter((line) => line.kind === 'product');
    const stocks = products.map((line) => references.products.get(line.productId)?.stock);
    const known = stocks.filter((stock) => stock !== null && stock !== undefined && Number.isFinite(Number(stock)));
    const stocked = products.filter((line) => {
      const stock = references.products.get(line.productId)?.stock;
      return stock != null && Number.isFinite(Number(stock)) && Number(stock) >= productDemand.get(line.productId);
    });
    const availability = !products.length || stocked.length === products.length ? 'available'
      : !known.length ? 'unknown'
        : known.length === products.length && known.every((stock) => Number(stock) <= 0) ? 'out_of_stock' : 'partially_available';
    const catalogCents = packageMoneyToCents(priced.catalogTotal) * selection.quantity;
    const effectiveCents = packageMoneyToCents(priced.packageTotal) * selection.quantity;
    if (catalogCents > 10000000000 || effectiveCents > 10000000000) throw packageError('Package total exceeds the supported quotation amount.');
    const items = canonicalLines(selection, publication, priced);
    const snapshot = {
      bundleKey: managedPackageBundleKey(selection.packageId), ...selection,
      revisionNumber: publication.revisionNumber, packageName: publication.definition.name,
      variantLabel: variant.label, approvedAt: now.toISOString(),
      vehicleContext: context.vehicle,
      qualifyingProductIds: publication.definition.anchorCategory
        ? context.productIds.filter((id) => context.productCategories[id] === publication.definition.anchorCategory.trim().toLowerCase().replace(/\s+/g, ' ')).sort()
        : publication.definition.anchorProductId ? [publication.definition.anchorProductId] : [],
      // This private definition supports future eligibility/history decisions.
      // Public lookups must expose only the approved display/pricing fields.
      definition: { ...publication.definition, variants: [variant] },
      unitPricing: priced, availability, catalogTotal: money(catalogCents), effectiveTotal: money(effectiveCents),
      savings: money(catalogCents - effectiveCents), items,
    };
    assertManagedPackageQualifications(snapshot, allItems);
    return snapshot;
  });
  const items = snapshots.flatMap((snapshot) => snapshot.items);
  if (items.length + regularItems.length > 100) throw packageError('This quotation exceeds 100 lines. Choose fewer package options or request separate quotations.');
  const sum = (key) => snapshots.reduce((total, snapshot) => total + packageMoneyToCents(snapshot[key]), 0);
  const catalogCents = sum('catalogTotal'); const effectiveCents = sum('effectiveTotal');
  if (catalogCents > 10000000000) throw packageError('Quotation total exceeds the supported amount.');
  return { items, snapshots, catalogTotal: money(catalogCents), effectiveTotal: money(effectiveCents), savings: money(catalogCents - effectiveCents) };
}

function lineFingerprint(line) {
  if (!line || !['product', 'service'].includes(line.line_type)
    || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 1000
    || (line.line_type === 'product' ? !line.product_id || Boolean(line.service_id) : !line.service_id || Boolean(line.product_id))) {
    throw packageError('The package contains an invalid item or quantity.');
  }
  return JSON.stringify([line.line_type, line.product_id || line.service_id,
    line.quantity, packageMoneyToCents(line.unit_price), packageMoneyToCents(line.catalog_unit_price)]);
}

export function assertRequestedManagedLinesMatch(requestedItems, approvedItems) {
  if (!Array.isArray(requestedItems) || requestedItems.length !== approvedItems.length) throw packageError('The package item list changed. Add the complete package again.');
  // Order is irrelevant; multiplicity is not. Both rounding allocations and all
  // required quantities must match exactly. A forged zero-price subset fails.
  const expected = approvedItems.map(lineFingerprint).sort();
  const requested = requestedItems.map(lineFingerprint).sort();
  if (expected.some((value, index) => value !== requested[index])) throw packageError('Package items, quantities, or prices no longer match the approved offer. Review the package before saving.');
}
