import apiClient, { extractApiError } from './apiClient';
import { invalidateCatalogClientCaches } from './catalogApi';

export async function createPartReservation(payload) {
  try {
    const { data } = await apiClient.post('/reservations', payload);
    return data.reservation;
  } catch (error) {
    extractApiError(error, 'Failed to create the part reservation.');
  }
}

export async function createAdminReservation(payload) {
  try {
    const { data } = await apiClient.post('/reservations/admin', payload);
    return data;
  } catch (error) {
    extractApiError(error, 'Failed to create the reservation.');
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
    void invalidateCatalogClientCaches();
    return data.reservation;
  } catch (error) {
    extractApiError(error, 'Failed to update the reservation.');
  }
}
