import apiClient, { extractApiError } from './apiClient';

export async function listServiceOrders(params = {}) {
  try {
    const { data } = await apiClient.get('/service-orders', { params });
    return data.orders ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load service orders.');
  }
}

export async function getServiceOrderQueue(params = {}) {
  try {
    const { data } = await apiClient.get('/service-orders/queue', { params });
    return data;
  } catch (error) {
    extractApiError(error, 'Failed to load the service queue.');
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

export async function getServiceScheduleSlots(params) {
  try {
    const { data } = await apiClient.get('/service-orders/schedule/slots', { params });
    return data;
  } catch (error) {
    extractApiError(error, 'Unable to load appointment times.');
  }
}

export async function getServiceScheduleDay(date) {
  try {
    const { data } = await apiClient.get('/service-orders/schedule/day', { params: { date } });
    return data;
  } catch (error) {
    extractApiError(error, 'Unable to load the daily schedule.');
  }
}

export async function getServiceWork(orderId) {
  try {
    const { data } = await apiClient.get(`/service-orders/${orderId}/work`);
    return data;
  } catch (error) {
    extractApiError(error, 'Unable to load workshop progress.');
  }
}

export async function recordServiceWorkEvent(orderId, eventType, note = '') {
  try {
    const { data } = await apiClient.post(`/service-orders/${orderId}/work/events`, { eventType, note });
    return data;
  } catch (error) {
    extractApiError(error, 'Unable to save this work update.');
  }
}

export async function saveServiceWorkLines(orderId, lines) {
  try {
    const { data } = await apiClient.put(`/service-orders/${orderId}/work/lines`, { lines });
    return data;
  } catch (error) {
    extractApiError(error, 'Unable to save actual parts and labor.');
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

export async function completeServiceOrder(orderId, paymentDetails) {
  try {
    const { data } = await apiClient.post(`/service-orders/${orderId}/complete`, paymentDetails);
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
