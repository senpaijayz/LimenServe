export function parseCatalogSummary(summary) {
  const countFields = ['totalProducts', 'pricelistRows', 'uniqueProducts', 'currentPrices', 'inStockProducts'];
  if (!summary || summary.scope !== 'active_products'
    || countFields.some((key) => !Number.isSafeInteger(summary[key]) || summary[key] < 0)
    || !Number.isFinite(summary.inventoryValue) || summary.inStockProducts > summary.totalProducts
    || typeof summary.fetchedAt !== 'string' || !Number.isFinite(Date.parse(summary.fetchedAt))
    || !Number.isFinite(summary.cacheMaxAgeSeconds) || summary.cacheMaxAgeSeconds < 0) {
    throw new Error('Inventory totals are unavailable. Refresh totals to try again.');
  }
  return summary;
}
