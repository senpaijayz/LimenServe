import apiClient, { extractApiError } from './apiClient';

export async function listServiceOrders(params = {}) {
  try {
    const { data } = await apiClient.get('/service-orders', { params });
    return data.orders ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load service orders.');
  }
}

export async function getServiceOrder(orderId) {
  try {
    const { data } = await apiClient.get(`/service-orders/${orderId}`);
    return data.order ?? null;
  } catch (error) {
    extractApiError(error, 'Failed to load the service order.');
  }
}

export async function createServiceOrder(payload) {
  try {
    const { data } = await apiClient.post('/service-orders', payload);
    return data.order;
  } catch (error) {
    extractApiError(error, 'Failed to create the service order.');
  }
}

export async function updateServiceOrder(orderId, payload) {
  try {
    const { data } = await apiClient.patch(`/service-orders/${orderId}`, payload);
    return data.order;
  } catch (error) {
    extractApiError(error, 'Failed to update the service order.');
  }
}
