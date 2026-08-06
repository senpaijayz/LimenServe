import apiClient, { extractApiError } from './apiClient';

export async function listServiceOrders(params = {}) {
  try {
    const { data } = await apiClient.get('/service-orders', { params });
    return data.orders ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load service orders.');
  }
}

export async function listMyServiceOrders() {
  try {
    const { data } = await apiClient.get('/service-orders/customer/mine');
    return data.orders ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load your service orders.');
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

export async function completeServiceOrder(orderId) {
  try {
    const { data } = await apiClient.post(`/service-orders/${orderId}/complete`);
    return data;
  } catch (error) {
    extractApiError(error, 'Failed to complete and archive the service order.');
  }
}

export async function assignMechanicToServiceOrder(orderId, payload) {
  try {
    const { data } = await apiClient.post(`/service-orders/${orderId}/assignment`, payload);
    return data.order;
  } catch (error) {
    extractApiError(error, 'Failed to assign the mechanic.');
  }
}

export async function removeMechanicFromServiceOrder(orderId, note = '') {
  try {
    const { data } = await apiClient.delete(`/service-orders/${orderId}/assignment`, {
      data: { note },
    });
    return data.order;
  } catch (error) {
    extractApiError(error, 'Failed to remove the mechanic assignment.');
  }
}
