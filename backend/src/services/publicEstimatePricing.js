const PUBLIC_QUOTE_TAX_RATE = 0.12;
const MONEY_TOLERANCE = 0.01;
export const MAX_PUBLIC_BUNDLE_LINES = 12;
export const MAX_PUBLIC_BUNDLE_PRODUCT_IDS = 8;

export const PUBLIC_ESTIMATE_PRICING_INVALID_MESSAGE = 'The selected items or prices are no longer available.';

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function isMoney(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return false;
  }

  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function sameMoney(left, right) {
  return Math.abs(roundMoney(left) - roundMoney(right)) <= MONEY_TOLERANCE;
}

function normalizedText(value) {
  return String(value ?? '').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function invalid(reason) {
  return {
    ok: false,
    error: PUBLIC_ESTIMATE_PRICING_INVALID_MESSAGE,
    reason,
  };
}

function findLatestCurrentPrice(rows, productId) {
  return rows
    .filter((row) => row.product_id === productId && row.is_current !== false && isMoney(row.amount))
    .sort((left, right) => {
      const effective = normalizedText(right.effective_from).localeCompare(normalizedText(left.effective_from));
      if (effective !== 0) {
        return effective;
      }
      return normalizedText(right.created_at).localeCompare(normalizedText(left.created_at));
    })[0] ?? null;
}

function getApprovedProductPrices({ product, currentPrices, stagingPrices }) {
  const prices = [];
  const latestRetail = findLatestCurrentPrice(currentPrices, product.id);
  if (latestRetail) {
    prices.push(roundMoney(latestRetail.amount));
  }

  stagingPrices
    .filter((row) => normalizedText(row.sku).toUpperCase() === normalizedText(product.sku).toUpperCase())
    .filter((row) => normalizedText(row.status).toLowerCase() !== 'discontinued')
    .filter((row) => isMoney(row.price))
    .forEach((row) => prices.push(roundMoney(row.price)));

  return unique(prices.map((price) => price.toFixed(2))).map(Number);
}

function getRequestedCatalogPrice(requestedItem) {
  if (isMoney(requestedItem?.catalog_unit_price)) {
    return roundMoney(requestedItem.catalog_unit_price);
  }

  return isMoney(requestedItem?.unit_price) ? roundMoney(requestedItem.unit_price) : null;
}

function recommendationMatchesItem(recommendation, item) {
  const kind = recommendation.item_kind ?? recommendation.consequent_kind;
  if (kind !== item.line_type) {
    return false;
  }

  const targetId = item.line_type === 'product'
    ? recommendation.product_id ?? recommendation.recommended_product_id
    : recommendation.service_id ?? recommendation.recommended_service_id;

  return targetId === (item.product_id ?? item.service_id);
}

function cartQuantity(items, productId) {
  return items
    .filter((item) => item.line_type === 'product' && item.product_id === productId)
    .reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
}

function findApprovedRecommendation({ recommendations, item, requestedItem, items }) {
  const ruleId = item.recommendation_rule_id;
  const bundleKey = normalizedText(requestedItem?.bundle_key);
  if (!ruleId || !bundleKey) {
    return null;
  }

  return recommendations.find((recommendation) => {
    const recommendationId = recommendation.id
      ?? recommendation.package_item_id
      ?? recommendation.rule_id;
    if (recommendationId !== ruleId || recommendation.is_active === false || recommendation.package_is_active === false) {
      return false;
    }

    if (!recommendationMatchesItem(recommendation, item)) {
      return false;
    }

    const packageKey = normalizedText(recommendation.package_key);
    if (!packageKey || (bundleKey !== packageKey && !bundleKey.startsWith(`${packageKey}:`))) {
      return false;
    }

    const anchorProductId = recommendation.anchor_product_id;
    const minimumAnchorQuantity = Math.max(Number(recommendation.min_anchor_quantity ?? 1), 1);
    return !anchorProductId || cartQuantity(items, anchorProductId) >= minimumAnchorQuantity;
  }) ?? null;
}

function canonicalRecommendationPrice(recommendation, catalogPrice) {
  const resolved = recommendation.resolved_price
    ?? recommendation.price_override
    ?? (recommendation.price_mode === 'complimentary' ? 0 : catalogPrice);

  if (!isMoney(resolved) || Number(resolved) > Number(catalogPrice) + MONEY_TOLERANCE) {
    return null;
  }

  return roundMoney(resolved);
}

function assertRequestedEstimateMatches(requestedEstimate, totals) {
  return sameMoney(requestedEstimate?.subtotal, totals.subtotal)
    && sameMoney(requestedEstimate?.discount_total, totals.discount_total)
    && sameMoney(requestedEstimate?.tax_total, totals.tax_total)
    && sameMoney(requestedEstimate?.grand_total, totals.grand_total);
}

/**
 * Builds the anonymous quote pricing gate with injected readers. The readers
 * are deliberately small so tests can prove fail-closed behavior without a
 * database, while production wires them to the service-role Supabase client.
 *
 * Discount policy: an unbundled line must exactly match an approved current
 * price. A bundled line must reference an active recommendation item and a
 * qualifying anchor. Since the UI redistributes bundle savings between lines,
 * individual submitted prices may vary from zero to catalogue price, but the
 * complete submitted bundle total must equal the sum of authoritative resolved
 * prices. Persisted lines and all estimate totals are always rebuilt here.
 */
export function createPublicEstimatePricingResolver({
  loadProducts,
  loadProductPrices,
  loadStagingPrices,
  loadServices,
  loadRecommendations,
} = {}) {
  const dependencies = [
    loadProducts,
    loadProductPrices,
    loadStagingPrices,
    loadServices,
    loadRecommendations,
  ];
  if (dependencies.some((dependency) => typeof dependency !== 'function')) {
    throw new TypeError('Public estimate pricing readers are required.');
  }

  return async function resolvePublicEstimatePricing({
    items = [],
    requestedItems = [],
    requestedEstimate = {},
    vehicle = null,
  } = {}) {
    if (!Array.isArray(items) || !Array.isArray(requestedItems) || items.length !== requestedItems.length) {
      return invalid('The quotation item collection is inconsistent.');
    }

    const productIds = unique(items.map((item) => item.product_id));
    const serviceIds = unique(items.map((item) => item.service_id));
    const bundleLineCount = requestedItems.filter((item) => normalizedText(item?.bundle_key)).length;
    if (bundleLineCount > MAX_PUBLIC_BUNDLE_LINES) {
      return invalid('The quotation contains too many bundle lines.');
    }
    if (bundleLineCount > 0 && productIds.length > MAX_PUBLIC_BUNDLE_PRODUCT_IDS) {
      return invalid('The quotation contains too many bundle anchor candidates.');
    }

    const [products, currentPrices, services] = await Promise.all([
      loadProducts(productIds),
      loadProductPrices(productIds),
      loadServices(serviceIds),
    ]);

    if (!Array.isArray(products) || !Array.isArray(currentPrices) || !Array.isArray(services)) {
      throw new TypeError('Public estimate pricing readers returned invalid data.');
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    const serviceMap = new Map(services.map((service) => [service.id, service]));
    const activeProducts = productIds.map((productId) => productMap.get(productId));
    const activeServices = serviceIds.map((serviceId) => serviceMap.get(serviceId));

    if (activeProducts.some((product) => !product || product.is_active === false || product.status === 'discontinued')) {
      return invalid('A product is missing or inactive.');
    }
    if (activeServices.some((service) => !service || service.is_active === false)) {
      return invalid('A service is missing or inactive.');
    }

    const hasBundlePricing = requestedItems.some((item) => normalizedText(item?.bundle_key));
    const [stagingPrices, recommendations] = await Promise.all([
      loadStagingPrices(unique(activeProducts.map((product) => product.sku))),
      hasBundlePricing
        ? loadRecommendations({
          anchorProductIds: productIds,
          vehicleModelName: vehicle?.model_name ?? null,
        })
        : Promise.resolve([]),
    ]);
    if (!Array.isArray(stagingPrices) || !Array.isArray(recommendations)) {
      throw new TypeError('Public estimate pricing readers returned invalid supplemental data.');
    }

    const canonicalItems = [];
    const bundleGroups = new Map();
    const usedRecommendationIds = new Set();
    let subtotal = 0;
    let pricedSubtotal = 0;

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const requestedItem = requestedItems[index];
      const requestedCatalogPrice = getRequestedCatalogPrice(requestedItem);
      const requestedUnitPrice = isMoney(requestedItem?.unit_price)
        ? roundMoney(requestedItem.unit_price)
        : null;
      const bundleKey = normalizedText(requestedItem?.bundle_key);
      let approvedCatalogPrices = [];

      if (item.line_type === 'product') {
        approvedCatalogPrices = getApprovedProductPrices({
          product: productMap.get(item.product_id),
          currentPrices,
          stagingPrices,
        });
      } else {
        const service = serviceMap.get(item.service_id);
        if (isMoney(service?.standard_price ?? service?.price)) {
          approvedCatalogPrices = [roundMoney(service.standard_price ?? service.price)];
        }
      }

      const catalogPrice = approvedCatalogPrices.find((price) => sameMoney(price, requestedCatalogPrice));
      if (catalogPrice === undefined || requestedUnitPrice === null) {
        return invalid(`Item ${index + 1} does not use an approved current price.`);
      }

      let unitPrice = catalogPrice;
      if (bundleKey) {
        if (item.quantity !== 1) {
          return invalid(`Item ${index + 1} bundle quantity must be one.`);
        }

        if (usedRecommendationIds.has(item.recommendation_rule_id)) {
          return invalid(`Item ${index + 1} reuses a bundle recommendation.`);
        }

        const recommendation = findApprovedRecommendation({
          recommendations,
          item,
          requestedItem,
          items,
        });
        if (!recommendation) {
          return invalid(`Item ${index + 1} does not belong to an active approved bundle.`);
        }
        usedRecommendationIds.add(item.recommendation_rule_id);

        unitPrice = canonicalRecommendationPrice(recommendation, catalogPrice);
        if (unitPrice === null || requestedUnitPrice < 0 || requestedUnitPrice > catalogPrice + MONEY_TOLERANCE) {
          return invalid(`Item ${index + 1} has an invalid bundle price.`);
        }

        const group = bundleGroups.get(bundleKey) ?? { requested: 0, canonical: 0 };
        group.requested = roundMoney(group.requested + (requestedUnitPrice * item.quantity));
        group.canonical = roundMoney(group.canonical + (unitPrice * item.quantity));
        bundleGroups.set(bundleKey, group);
      } else if (!sameMoney(requestedUnitPrice, catalogPrice)) {
        return invalid(`Item ${index + 1} price does not match the current catalogue.`);
      }

      const lineTotal = roundMoney(unitPrice * item.quantity);
      subtotal = roundMoney(subtotal + (catalogPrice * item.quantity));
      pricedSubtotal = roundMoney(pricedSubtotal + lineTotal);
      canonicalItems.push({
        ...item,
        recommendation_rule_id: bundleKey ? item.recommendation_rule_id : null,
        is_upsell: bundleKey ? item.is_upsell === true : false,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }

    for (const [bundleKey, group] of bundleGroups) {
      if (!sameMoney(group.requested, group.canonical)) {
        return invalid(`Bundle ${bundleKey} total does not match its approved price.`);
      }
    }

    const discountTotal = roundMoney(subtotal - pricedSubtotal);
    const taxTotal = roundMoney(pricedSubtotal * PUBLIC_QUOTE_TAX_RATE);
    const grandTotal = roundMoney(pricedSubtotal + taxTotal);
    const totals = {
      subtotal,
      discount_total: discountTotal,
      tax_total: taxTotal,
      grand_total: grandTotal,
    };

    if (!assertRequestedEstimateMatches(requestedEstimate, totals)) {
      return invalid('The quotation totals do not match the approved prices.');
    }

    return {
      ok: true,
      items: canonicalItems,
      totals,
    };
  };
}
