import apiClient, { clearApiClientCache, extractApiError } from './apiClient';

export async function listMyReservations() {
  try {
    const { data } = await apiClient.get('/reservations/mine');
    return data.reservations ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load your part reservations.');
  }
}

export async function createPartReservation(payload) {
  try {
    const { data } = await apiClient.post('/reservations', payload);
    return data.reservation;
  } catch (error) {
    extractApiError(error, 'Failed to create the part reservation.');
  }
}

export async function cancelMyReservation(reservationId, note = '') {
  try {
    const { data } = await apiClient.post(`/reservations/${reservationId}/cancel`, { note });
    return data.reservation;
  } catch (error) {
    extractApiError(error, 'Failed to cancel the reservation.');
  }
}

export async function listReservations(params = {}) {
  try {
    const { data } = await apiClient.get('/reservations', { params });
    return data;
  } catch (error) {
    extractApiError(error, 'Failed to load the reservation queue.');
  }
}

export async function getReservation(reservationId) {
  try {
    const { data } = await apiClient.get(`/reservations/${reservationId}`);
    return data.reservation;
  } catch (error) {
    extractApiError(error, 'Failed to load reservation activity.');
  }
}

export async function processReservation(reservationId, payload) {
  try {
    const { data } = await apiClient.patch(`/reservations/${reservationId}`, payload);
    clearApiClientCache('/catalog/products');
    return data.reservation;
  } catch (error) {
    extractApiError(error, 'Failed to update the reservation.');
  }
}
