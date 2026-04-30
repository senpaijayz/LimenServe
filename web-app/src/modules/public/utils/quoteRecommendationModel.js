import {
  buildPackageTiers,
  getDefaultHighlightedTier,
  groupRecommendations,
  normalizePackage,
  toNumber,
} from './smartBundleUtils';

const VAT_RATE = 0.12;
const NO_PRODUCT_REASON = 'Choose a part to unlock smart recommendations.';
const NO_BUNDLE_REASON = 'No automatic bundle found for this product yet. You can still request a custom quotation.';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function roundCurrency(value) {
  return Number(toNumber(value, 0).toFixed(2));
}

function getRawItemKind(item = {}) {
  return (item.consequentKind || item.consequent_kind) === 'service' || item.recommendedServiceId || item.recommended_service_id
    ? 'service'
    : 'product';
}

function getRawItemId(item = {}) {
  return getRawItemKind(item) === 'service'
    ? (item.recommendedServiceId || item.recommended_service_id || item.id)
    : (item.recommendedProductId || item.recommended_product_id || item.id);
}

export function getRecommendationItemKey(item = {}) {
  const kind = item.kind || getRawItemKind(item);
  const id = item.id || getRawItemId(item);
  return id ? `${kind}:${id}` : `${kind}:unknown`;
}

function getRawItemName(item = {}) {
  return getRawItemKind(item) === 'service'
    ? (item.recommendedServiceName || item.recommended_service_name || item.name || 'Recommended labor')
    : (item.recommendedProductName || item.recommended_product_name || item.name || 'Recommended part');
}

function getRawItemPrice(item = {}) {
  return roundCurrency(item.resolvedPrice ?? item.resolved_price ?? item.recommendedPrice ?? item.recommended_price ?? item.price ?? 0);
}

function normalizeQuoteItem(item = {}, source = 'recommendation') {
  const kind = getRawItemKind(item);
  const id = getRawItemId(item);
  const price = getRawItemPrice(item);
  const catalogPrice = roundCurrency(item.catalogPrice ?? item.catalog_price ?? price);

  return {
    key: getRecommendationItemKey({ kind, id }),
    id,
    kind,
    source,
    name: getRawItemName(item),
    sku: item.recommendedProductSku || item.recommended_product_sku || item.sku || null,
    code: item.recommendedServiceCode || item.recommended_service_code || item.code || null,
    price,
    catalogPrice,
    savingsAmount: roundCurrency(item.savingsAmount ?? item.savings_amount ?? Math.max(catalogPrice - price, 0)),
    reasonLabel: item.reasonLabel || item.reason_label || null,
    matchLevel: item.matchLevel || item.match_level || null,
    serviceGroup: item.serviceGroup || item.service_group || null,
    displayPriceLabel: item.displayPriceLabel || item.display_price_label || null,
    raw: item,
  };
}

function dedupeItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.key || seen.has(item.key)) {
      return false;
    }

    seen.add(item.key);
    return true;
  });
}

function normalizeQuotePackages(packages = [], recommendations = []) {
  const sourcePackages = asArray(packages).length > 0
    ? asArray(packages).map((pkg, index) => normalizePackage(pkg, index))
    : groupRecommendations(asArray(recommendations)).map((pkg, index) => normalizePackage(pkg, index));

  return sourcePackages
    .filter((pkg) => asArray(pkg.parts).length > 0 || asArray(pkg.services).length > 0)
    .sort((left, right) => Number(left.priority ?? 100) - Number(right.priority ?? 100));
}

function calculateLineSubtotal(lines = []) {
  return roundCurrency(asArray(lines).reduce((sum, line) => {
    const quantity = Math.max(Number(line.quantity ?? 1), 1);
    return sum + (toNumber(line.price, 0) * quantity);
  }, 0));
}

function buildOptionalAddOns(packages, activeTier, selectedProduct) {
  const activeKeys = new Set(asArray(activeTier?.items).map(getRecommendationItemKey));
  const selectedProductId = selectedProduct?.id || null;
  const allItems = packages.flatMap((pkg) => [
    ...asArray(pkg.parts),
    ...asArray(pkg.services),
  ]);

  return dedupeItems(
    allItems
      .map((item) => normalizeQuoteItem(item, 'optional_add_on'))
      .filter((item) => !activeKeys.has(item.key))
      .filter((item) => !(selectedProductId && item.kind === 'product' && item.id === selectedProductId))
  );
}

export function buildSmartQuoteModel({
  selectedProduct = null,
  selectedParts = [],
  selectedServices = [],
  packages = [],
  recommendations = [],
  activeTierKey = null,
  optionalAddOnIds = [],
} = {}) {
  const normalizedPackages = normalizeQuotePackages(packages, recommendations);
  const bestPackage = normalizedPackages[0] || null;
  const tiers = bestPackage ? buildPackageTiers(bestPackage) : [];
  const defaultTierKey = getDefaultHighlightedTier(tiers);
  const resolvedTierKey = tiers.some((tier) => tier.tierKey === activeTierKey) ? activeTierKey : defaultTierKey;
  const activeTier = tiers.find((tier) => tier.tierKey === resolvedTierKey) || null;
  const includedParts = asArray(activeTier?.parts).map((item) => normalizeQuoteItem(item, 'included_bundle_part'));
  const includedLabor = asArray(activeTier?.services).map((item) => normalizeQuoteItem(item, 'included_labor'));
  const optionalAddOns = buildOptionalAddOns(normalizedPackages, activeTier, selectedProduct);
  const optionalAddOnSet = new Set(optionalAddOnIds);
  const selectedOptionalAddOns = optionalAddOns.filter((item) => optionalAddOnSet.has(item.key) || optionalAddOnSet.has(item.id));
  const partsSubtotal = calculateLineSubtotal(selectedParts);
  const servicesSubtotal = calculateLineSubtotal(selectedServices);
  const optionalAddOnsSubtotal = roundCurrency(selectedOptionalAddOns.reduce((sum, item) => sum + item.price, 0));
  const subtotal = roundCurrency(partsSubtotal + servicesSubtotal + optionalAddOnsSubtotal);
  const vat = roundCurrency(subtotal * VAT_RATE);
  const estimatedTotal = roundCurrency(subtotal + vat);

  return {
    selectedProduct,
    packages: normalizedPackages,
    bestPackage,
    tiers,
    activeTier,
    includedParts,
    includedLabor,
    optionalAddOns,
    selectedOptionalAddOns,
    badges: [
      ...(bestPackage ? ['Best Value', 'Recommended'] : []),
      ...(includedLabor.length > 0 ? ['Includes Labor'] : []),
      ...(toNumber(activeTier?.savingsAmount, 0) > 0 ? ['Save More'] : []),
      ...(optionalAddOns.length > 0 ? ['Optional Upgrade'] : []),
    ],
    emptyReason: !selectedProduct ? NO_PRODUCT_REASON : bestPackage ? '' : NO_BUNDLE_REASON,
    totals: {
      partsSubtotal,
      servicesSubtotal,
      bundleSubtotal: roundCurrency(activeTier?.smartTotal ?? 0),
      bundleCatalogSubtotal: roundCurrency(activeTier?.catalogTotal ?? 0),
      bundleSavings: roundCurrency(activeTier?.savingsAmount ?? 0),
      optionalAddOnsSubtotal,
      subtotal,
      vat,
      estimatedTotal,
    },
  };
}
