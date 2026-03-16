import apiClient, { extractApiError } from './apiClient';

export async function runFullAnalyticsRefresh(notes = null) {
  try {
    const { data } = await apiClient.post('/analytics/refresh', { notes });
    return data.refreshRunId;
  } catch (error) {
    extractApiError(error, 'Failed to trigger analytics refresh.');
  }
}

export async function getProductUpsellRecommendations(productId, vehicleModelId = null, limitCount = 5) {
  try {
    const { data } = await apiClient.get(`/catalog/products/${productId}/recommendations`, {
      params: {
        vehicleModelId,
        limit: limitCount,
      },
    });
    return data.recommendations ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load upsell recommendations.');
  }
}

export async function getMonthlyProductForecasts(targetMonth = null) {
  try {
    const { data } = await apiClient.get('/analytics/forecasts/products', {
      params: { targetMonth },
    });
    return data.forecasts ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load product forecasts.');
  }
}

export async function getMonthlyServiceForecasts(targetMonth = null) {
  try {
    const { data } = await apiClient.get('/analytics/forecasts/services', {
      params: { targetMonth },
    });
    return data.forecasts ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load service forecasts.');
  }
}

export async function getAnalyticsDashboardSnapshot() {
  try {
    const { data } = await apiClient.get('/analytics/dashboard');
    return data ?? {};
  } catch (error) {
    extractApiError(error, 'Failed to load analytics dashboard snapshot.');
  }
}
