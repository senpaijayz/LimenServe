import apiClient, { extractApiError } from './apiClient';

export async function getProductCatalog() {
  try {
    const { data } = await apiClient.get('/catalog/products');
    return data.products ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load product catalog.');
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
