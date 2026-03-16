import apiClient, { extractApiError } from './apiClient';

export async function getProductCatalog(params = {}) {
  try {
    const { data } = await apiClient.get('/catalog/products', { params });
    return {
      products: data.products ?? [],
      pagination: data.pagination ?? { page: 1, pageSize: 12, totalCount: 0, totalPages: 1 },
      categories: data.categories ?? [],
    };
  } catch (error) {
    extractApiError(error, 'Failed to load product catalog.');
  }
}

export async function getFullProductCatalog() {
  try {
    const { data } = await apiClient.get('/catalog/products/all');
    return data.products ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load full product catalog.');
  }
}

export async function getCatalogSummary() {
  try {
    const { data } = await apiClient.get('/catalog/summary');
    return data.summary ?? {
      totalProducts: 0,
      pricelistRows: 0,
      uniqueProducts: 0,
      currentPrices: 0,
    };
  } catch (error) {
    extractApiError(error, 'Failed to load catalog summary.');
  }
}

export async function getServiceCatalog() {
  try {
    const { data } = await apiClient.get('/catalog/services');
    return data.services ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load service catalog.');
  }
}

export async function getCurrentRetailPriceList() {
  try {
    const { data } = await apiClient.get('/catalog/prices/current');
    return data.priceList ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load the current price list.');
  }
}

export async function replaceRetailPriceList(items, effectiveFrom) {
  try {
    const { data } = await apiClient.post('/catalog/prices/bulk-replace', {
      items,
      effectiveFrom,
    });

    return data;
  } catch (error) {
    extractApiError(error, 'Failed to replace the price list.');
  }
}

export async function getAnalyticsRefreshRuns(limitCount = 10) {
  try {
    const { data } = await apiClient.get('/analytics/refresh-runs', {
      params: { limit: limitCount },
    });
    return data.refreshRuns ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load analytics refresh runs.');
  }
}
