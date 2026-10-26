import { normalizeManagedPackageRepriceIds, normalizeManagedPackageSelections, packageError, packageMoneyToCents } from './managedPackageDomain.js';
import { assertRequestedManagedLinesMatch, assertManagedPackageQualifications, MANAGED_BUNDLE_PREFIX, managedPackageBundleKey, resolveNewManagedPackageSelections } from './managedPackageQuotePricing.js';

const money = (cents) => Number((cents / 100).toFixed(2));
const comparable = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sameSelection = (selection, snapshot) => ['packageId', 'revisionId', 'variantId', 'quantity'].every((key) => selection[key] === snapshot[key]);
function sameVehicle(vehicle, context) {
  if (!context) return false;
  const year = vehicle?.year == null || vehicle.year === '' ? null : Number(vehicle.year);
  const fitmentId = vehicle?.fitmentId || vehicle?.metadata?.fitmentId || null;
  const variant = vehicle?.variant || vehicle?.metadata?.variant;
  const sameEngine = comparable(vehicle?.engine) === comparable(context.engine)
    || (!vehicle?.engine && fitmentId && fitmentId === context.fitmentId);
  return comparable(vehicle?.model_name ?? vehicle?.model) === comparable(context.model)
    && year === (context.year == null ? null : Number(context.year))
    && sameEngine && comparable(variant) === comparable(context.variant)
    && comparable(vehicle?.make) === comparable(context.make)
    && (!fitmentId || fitmentId === context.fitmentId);
}

// Legacy offers are no longer a source of new discounts. An authorized quote
// may retain an unchanged, fully recorded old group without looking it up in
// current recommendation rules. Missing historical evidence fails closed.
function retainedLegacyItems(requestedGroups, existingQuote, vehicle) {
  if (!requestedGroups.size) return [];
  const recordedVehicle = existingQuote?.vehicle;
  const vehicleSignature = (value) => JSON.stringify([
    comparable(value?.model_name ?? value?.model), value?.year ? Number(value.year) : null,
    comparable(value?.engine), comparable(value?.variant ?? value?.metadata?.variant),
  ]);
  if (!existingQuote?.estimate || vehicleSignature(vehicle) !== vehicleSignature(recordedVehicle)) {
    throw packageError('This older package cannot be used for a new quote or a different vehicle. Choose a current published package.', 409, 'LEGACY_PACKAGE_REVIEW_REQUIRED');
  }
  const result = [];
  for (const [key, requested] of requestedGroups) {
    const saved = (existingQuote.items || []).filter((line) => line.bundle_key === key);
    if (!saved.length) throw packageError('This older package is no longer offered. Remove it and choose a current published package.', 409, 'LEGACY_PACKAGE_REVIEW_REQUIRED');
    assertRequestedManagedLinesMatch(requested, saved);
    for (const line of saved) {
      const unit = packageMoneyToCents(line.unit_price);
      const catalog = packageMoneyToCents(line.catalog_unit_price);
      if (catalog < unit) throw packageError('The saved package price needs review before this quotation can be edited.', 409);
      result.push({ line_type: line.line_type,
        ...(line.line_type === 'product' ? { product_id: line.product_id, product_name: line.product_name, product_sku: line.product_sku } : { service_id: line.service_id, service_name: line.service_name }),
        quantity: line.quantity, unit_price: money(unit), catalog_unit_price: money(catalog), line_total: money(unit * line.quantity),
        bundle_key: key, bundle_name: line.bundle_name, bundle_tier_label: line.bundle_tier_label,
        recommendation_rule_id: line.recommendation_rule_id || null, is_upsell: line.is_upsell === true,
      });
    }
  }
  return result;
}

/** Public and internal quote flows share this package authority. Historical
 * snapshots can only be supplied by the route's authorized quote reader. */
export function createUnifiedEstimatePricingResolver({ resolveRegularPricing,
  resolveNewPackages = resolveNewManagedPackageSelections } = {}) {
  if (typeof resolveRegularPricing !== 'function' || typeof resolveNewPackages !== 'function') throw new TypeError('Quotation pricing readers are required.');
  return async function resolveUnifiedEstimatePricing({ items = [], requestedItems = [], requestedEstimate = {}, vehicle = null,
    selections: rawSelections = [], repricePackageIds: rawRepriceIds = [], existingQuote = null } = {}) {
    try {
      if (!Array.isArray(items) || !Array.isArray(requestedItems) || items.length !== requestedItems.length || items.length > 100) throw packageError('The quotation item collection is inconsistent.');
      const selections = normalizeManagedPackageSelections(rawSelections);
      const repriceIds = new Set(normalizeManagedPackageRepriceIds(rawRepriceIds));
      if ([...repriceIds].some((id) => !selections.some((selection) => selection.packageId === id))) throw packageError('Only selected packages can be repriced.');
      const groups = new Map(selections.map((selection) => [managedPackageBundleKey(selection.packageId), []]));
      const legacyGroups = new Map();
      const ordinaryItems = []; const ordinaryRequested = [];
      requestedItems.forEach((requested, index) => {
        const key = String(requested?.bundle_key || '');
        if (key.startsWith(MANAGED_BUNDLE_PREFIX)) {
          if (!groups.has(key)) throw packageError('A quotation line has no selected approved package.');
          groups.get(key).push(requested);
        } else if (key) {
          if (!legacyGroups.has(key)) legacyGroups.set(key, []);
          legacyGroups.get(key).push(requested);
        } else { ordinaryItems.push(items[index]); ordinaryRequested.push(requested); }
      });
      const legacyItems = retainedLegacyItems(legacyGroups, existingQuote, vehicle);
      const existing = Array.isArray(existingQuote?._managed_package_snapshots) ? existingQuote._managed_package_snapshots : [];
      const existingMap = new Map(existing.map((snapshot) => [snapshot.packageId, snapshot]));
      const retained = []; const freshSelections = [];
      for (const selection of selections) {
        const saved = existingMap.get(selection.packageId);
        if (saved && !repriceIds.has(selection.packageId)) {
          if (!sameSelection(selection, saved) || !sameVehicle(vehicle, saved.vehicleContext)) {
            throw packageError('This package was already quoted at a saved price. Review and explicitly reprice it before changing its option, quantity, or vehicle.', 409, 'PACKAGE_REPRICE_REQUIRED');
          }
          // No current publication/catalog lookup: adding an unrelated item must
          // not erase an issued discount, including after unpublish/archive.
          retained.push({ ...structuredClone(saved), reusedFromRevision: existingQuote._managed_package_snapshot_revision });
        } else freshSelections.push(selection);
      }
      const regular = await resolveRegularPricing({ items: ordinaryItems, requestedItems: ordinaryRequested,
        requestedEstimate, vehicle, validateTotals: false });
      if (!regular?.ok) return regular;
      const fresh = await resolveNewPackages({ selections: freshSelections,
        regularItems: [...regular.items, ...legacyItems, ...retained.flatMap((snapshot) => snapshot.items)], vehicle: vehicle || {} });
      const snapshots = [...retained, ...fresh.snapshots];
      const managedItems = snapshots.flatMap((snapshot) => snapshot.items);
      const allQuoteItems = [...regular.items, ...legacyItems, ...managedItems];
      if (regular.items.length + legacyItems.length + managedItems.length > 100) throw packageError('This quotation exceeds 100 lines. Choose fewer packages.');
      for (const snapshot of snapshots) {
        assertRequestedManagedLinesMatch(groups.get(snapshot.bundleKey), snapshot.items);
        assertManagedPackageQualifications(snapshot, allQuoteItems);
      }
      const sumSnapshots = (key) => snapshots.reduce((sum, snapshot) => sum + packageMoneyToCents(snapshot[key]), 0);
      const legacyGross = legacyItems.reduce((sum, line) => sum + packageMoneyToCents(line.catalog_unit_price) * line.quantity, 0);
      const legacyNet = legacyItems.reduce((sum, line) => sum + packageMoneyToCents(line.unit_price) * line.quantity, 0);
      const gross = packageMoneyToCents(regular.totals.subtotal) + legacyGross + sumSnapshots('catalogTotal');
      const net = packageMoneyToCents(regular.totals.subtotal) - packageMoneyToCents(regular.totals.discount_total) + legacyNet + sumSnapshots('effectiveTotal');
      if (gross > 10000000000 || net < 0 || net > gross) throw packageError('The quotation total exceeds the supported amount.');
      const tax = Number((BigInt(net) * 12n + 50n) / 100n);
      const totals = { subtotal: money(gross), discount_total: money(gross - net), tax_total: money(tax), grand_total: money(net + tax) };
      if (Object.keys(totals).some((key) => packageMoneyToCents(requestedEstimate[key]) !== packageMoneyToCents(totals[key]))) {
        throw packageError('Quotation prices changed. Review the current package totals before saving.', 409, 'QUOTE_PRICE_CHANGED');
      }
      return { ok: true, items: [...regular.items, ...legacyItems, ...managedItems], totals, snapshots };
    } catch (error) {
      if (!error.statusCode || !error.publicMessage) throw error;
      return { ok: false, statusCode: error.statusCode, error: error.publicMessage, code: error.code };
    }
  };
}
