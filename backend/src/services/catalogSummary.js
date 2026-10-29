const fields = {
  totalProducts: 'total_products', pricelistRows: 'pricelist_rows',
  uniqueProducts: 'unique_products', currentPrices: 'current_prices',
  inStockProducts: 'in_stock_products', inventoryValue: 'inventory_value',
};

function unavailable(message = 'Inventory totals are unavailable. Refresh totals to try again.') {
  const error = new Error(message);
  error.statusCode = 503;
  error.publicMessage = message;
  return error;
}

export function normalizeCatalogSummary(row) {
  const summary = {};
  for (const [target, source] of Object.entries(fields)) {
    const raw = row?.[source];
    if ((typeof raw !== 'number' && typeof raw !== 'string') || String(raw).trim() === '') throw unavailable();
    const value = Number(raw);
    if (!Number.isFinite(value) || (target !== 'inventoryValue' && (!Number.isSafeInteger(value) || value < 0))) throw unavailable();
    summary[target] = value;
  }
  if (summary.inStockProducts > summary.totalProducts) throw unavailable();
  return summary;
}

// Never replace a failed aggregate with a product page or imported-row count.
// Invalidation also prevents an older in-flight read from repopulating the cache.
export function createCatalogSummaryReader(load, { ttlMs = 30000 } = {}) {
  let cache = null, pending = null, generation = 0;
  return {
    invalidate() { generation += 1; cache = null; pending = null; },
    read() {
      if (cache && Date.now() - cache.time < ttlMs) return Promise.resolve(cache.data);
      if (pending) return pending;
      const expectedGeneration = generation;
      const request = Promise.resolve().then(load).then((rows) => {
        if (expectedGeneration !== generation) throw unavailable('The catalog changed while totals were loading. Refresh totals to try again.');
        const summary = normalizeCatalogSummary(Array.isArray(rows) ? rows[0] : rows);
        const time = Date.now();
        const data = { ...summary, scope: 'active_products', fetchedAt: new Date(time).toISOString(), cacheMaxAgeSeconds: ttlMs / 1000 };
        cache = { data, time };
        return data;
      }).finally(() => { if (pending === request) pending = null; });
      pending = request;
      return request;
    },
  };
}
