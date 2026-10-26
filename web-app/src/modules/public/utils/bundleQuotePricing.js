import { toNumber } from './smartBundleUtils';

let quoteLineSequence = 0;

export function createQuoteLineKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  quoteLineSequence += 1;
  return `quote-line-${Date.now()}-${quoteLineSequence}`;
}

export function clearBundlePricing(line = {}) {
  const {
    bundleKey: _bundleKey,
    bundleName: _bundleName,
    bundleTierKey: _bundleTierKey,
    bundleTierLabel: _bundleTierLabel,
    bundleCatalogTotal: _bundleCatalogTotal,
    bundleSmartTotal: _bundleSmartTotal,
    bundleSavings: _bundleSavings,
    displayBundleMeta: _displayBundleMeta,
    ...remaining
  } = line;

  const catalogPrice = roundCurrency(line.catalogPrice ?? line.price ?? 0);
  return {
    ...remaining,
    price: catalogPrice,
    catalogPrice,
    isUpsell: false,
    recommendationRuleId: null,
  };
}

export function roundCurrency(value) {
  return centsToCurrency(currencyToCents(value));
}

function currencyToCents(value) {
  const amount = toNumber(value, 0);
  return Math.round((amount + (Number.EPSILON * Math.sign(amount))) * 100);
}

function centsToCurrency(value) {
  return Number((Math.trunc(value) / 100).toFixed(2));
}

function sumLineAmountsCents(lines = [], priceKey = 'price') {
  return lines.reduce((sum, line) => {
    const quantity = Math.max(toNumber(line.quantity, 1), 1);
    const lineCents = currencyToCents(toNumber(line[priceKey] ?? (priceKey === 'catalogPrice' ? line.price : 0), 0) * quantity);
    return sum + lineCents;
  }, 0);
}






export function getAppliedBundleSummaries(lines = []) {
  const bundleMap = new Map();

  lines.forEach((line) => {
    if (!line?.bundleKey) {
      return;
    }

    const quantity = Math.max(Number(line.quantity ?? 1), 1);
    const lineSmartTotal = centsToCurrency(currencyToCents(toNumber(line.price, 0) * quantity));
    const lineCatalogTotal = centsToCurrency(currencyToCents(toNumber(line.catalogPrice ?? line.bundleCatalogTotal ?? line.price, 0) * quantity));

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

export function calculateQuoteTotals(parts = [], services = [], taxRate = 0.12) {
  const partsCatalogSubtotal = centsToCurrency(sumLineAmountsCents(parts, 'catalogPrice'));
  const servicesCatalogSubtotal = centsToCurrency(sumLineAmountsCents(services, 'catalogPrice'));
  const partsSubtotal = centsToCurrency(sumLineAmountsCents(parts));
  const servicesSubtotal = centsToCurrency(sumLineAmountsCents(services));
  const subtotalCents = currencyToCents(partsSubtotal) + currencyToCents(servicesSubtotal);
  const subtotal = centsToCurrency(subtotalCents);
  const appliedBundles = getAppliedBundleSummaries([...parts, ...services]);
  const bundleDiscountTotal = roundCurrency(appliedBundles.reduce((sum, bundle) => sum + bundle.savings, 0));
  const subtotalBeforeDiscount = centsToCurrency(currencyToCents(subtotal) + currencyToCents(bundleDiscountTotal));
  const vat = centsToCurrency(Math.round(subtotalCents * toNumber(taxRate, 0)));

  return {
    partsCatalogSubtotal,
    servicesCatalogSubtotal,
    partsSubtotal,
    servicesSubtotal,
    subtotalBeforeDiscount,
    bundleDiscountTotal,
    subtotal,
    vat,
    total: centsToCurrency(subtotalCents + currencyToCents(vat)),
    appliedBundles,
  };
}

// Display metadata is intentionally separate from persisted pricing metadata.
// Vehicle packages can use synthetic recommendation IDs; they may be shown to
// the customer, but their discount metadata must still be omitted from payloads.
export function getAppliedBundleDisplaySummaries(lines = []) {
  const bundleMap = new Map();

  lines.forEach((line) => {
    const display = line?.displayBundleMeta;
    const bundleKey = display?.bundleKey || line?.bundleKey;
    if (!bundleKey) {
      return;
    }

    const quantity = Math.max(Number(line.quantity ?? 1), 1);
    const lineTotal = centsToCurrency(currencyToCents(toNumber(line.price, 0) * quantity));
    if (!bundleMap.has(bundleKey)) {
      bundleMap.set(bundleKey, {
        bundleKey,
        bundleName: display?.bundleName || line.bundleName || 'Smart bundle',
        bundleTierLabel: display?.bundleTierLabel || line.bundleTierLabel || 'Bundle',
        lineCount: 0,
        total: 0,
      });
    }

    const bundle = bundleMap.get(bundleKey);
    bundle.lineCount += 1;
    bundle.total = roundCurrency(bundle.total + lineTotal);
  });

  return Array.from(bundleMap.values());
}
