import apiClient, { extractApiError } from './apiClient';

export async function getProductCatalog() {
  try {
    const { data } = await apiClient.get('/catalog/products');
    return data.products ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load product catalog.');
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
