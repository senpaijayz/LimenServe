import { toNumber } from './smartBundleUtils';

export function roundCurrency(value) {
  return Number(toNumber(value, 0).toFixed(2));
}

function getBundleItemKind(item = {}) {
  return (item.consequentKind || item.consequent_kind) === 'service' || item.recommendedServiceId || item.recommended_service_id
    ? 'service'
    : 'product';
}

function getBundleItemId(item = {}) {
  return getBundleItemKind(item) === 'service'
    ? (item.recommendedServiceId || item.recommended_service_id || item.recommendedService?.id || item.id)
    : (item.recommendedProductId || item.recommended_product_id || item.recommendedProduct?.id || item.id);
}

function getBundleItemCatalogPrice(item = {}) {
  return roundCurrency(item.catalogPrice ?? item.catalog_price ?? item.recommendedPrice ?? item.recommended_price ?? item.recommendedProduct?.price ?? item.recommendedService?.price ?? item.price ?? 0);
}

function getBundleItemResolvedPrice(item = {}) {
  return roundCurrency(item.resolvedPrice ?? item.resolved_price ?? item.price ?? getBundleItemCatalogPrice(item));
}

export function buildBundleLineItems(pkg = {}, tier = {}) {
  const items = Array.isArray(tier.items) ? tier.items : [];
  const catalogTotal = roundCurrency(tier.catalogTotal ?? items.reduce((sum, item) => sum + getBundleItemCatalogPrice(item), 0));
  const smartTotal = roundCurrency(tier.smartTotal ?? items.reduce((sum, item) => sum + getBundleItemResolvedPrice(item), 0));
  const savingsAmount = roundCurrency(Math.max(catalogTotal - smartTotal, 0));
  const discountRatio = catalogTotal > 0 && smartTotal > 0 ? smartTotal / catalogTotal : 1;
  const bundleKey = `${pkg.packageKey || tier.packageKey || 'smart-bundle'}:${tier.tierKey || 'bundle'}`;
  const bundleMeta = {
    bundleKey,
    bundleName: pkg.packageName || tier.packageName || 'Smart bundle',
    bundleTierKey: tier.tierKey || null,
    bundleTierLabel: tier.badgeLabel || 'Bundle',
    bundleCatalogTotal: catalogTotal,
    bundleSmartTotal: smartTotal,
    bundleSavings: savingsAmount,
  };

  let assignedTotal = 0;

  return items.map((item, index) => {
    const catalogPrice = getBundleItemCatalogPrice(item);
    const resolvedPrice = getBundleItemResolvedPrice(item);
    const isLast = index === items.length - 1;
    const price = isLast
      ? roundCurrency(Math.max(smartTotal - assignedTotal, 0))
      : roundCurrency(Math.min(resolvedPrice, catalogPrice * discountRatio));

    assignedTotal = roundCurrency(assignedTotal + price);

    return {
      raw: item,
      id: getBundleItemId(item),
      kind: getBundleItemKind(item),
      price,
      catalogPrice,
      bundleMeta,
    };
  });
}

export function getAppliedBundleSummaries(lines = []) {
  const bundleMap = new Map();

  lines.forEach((line) => {
    if (!line?.bundleKey) {
      return;
    }

    const quantity = Math.max(Number(line.quantity ?? 1), 1);
    const lineSmartTotal = roundCurrency(toNumber(line.price, 0) * quantity);
    const lineCatalogTotal = roundCurrency(toNumber(line.catalogPrice ?? line.bundleCatalogTotal ?? line.price, 0) * quantity);

    if (!bundleMap.has(line.bundleKey)) {
      bundleMap.set(line.bundleKey, {
        bundleKey: line.bundleKey,
        bundleName: line.bundleName || 'Smart bundle',
        bundleTierLabel: line.bundleTierLabel || 'Bundle',
        catalogTotal: 0,
        smartTotal: 0,
        savings: 0,
      });
    }

    const bundle = bundleMap.get(line.bundleKey);
    bundle.catalogTotal = roundCurrency(bundle.catalogTotal + lineCatalogTotal);
    bundle.smartTotal = roundCurrency(bundle.smartTotal + lineSmartTotal);
    bundle.savings = roundCurrency(Math.max(bundle.catalogTotal - bundle.smartTotal, 0));
  });

  return Array.from(bundleMap.values());
}
