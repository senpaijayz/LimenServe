import apiClient, { cachedApiGet, clearApiClientCache, extractApiError } from './apiClient';
import { normalizeMechanicSaveResult } from '../modules/users/utils/mechanicVisibilityModel';

export async function getPublicMechanics() {
  try {
    const { data } = await cachedApiGet('/public/mechanics');
    return data.mechanics ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load mechanics.');
  }
}

export async function listMechanics() {
  try {
    const { data } = await apiClient.get('/mechanics');
    return data.mechanics ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load mechanics.');
  }
}

export async function upsertMechanic(payload) {
  try {
    if (payload?.id) {
      const { data } = await apiClient.patch(`/mechanics/${payload.id}`, payload);
      clearApiClientCache('/public/mechanics');
      return normalizeMechanicSaveResult(data, payload);
    }

    const { data } = await apiClient.post('/mechanics', payload);
    clearApiClientCache('/public/mechanics');
    return normalizeMechanicSaveResult(data, payload);
  } catch (error) {
    extractApiError(error, 'Failed to save mechanic.');
  }
}

export async function deleteMechanic(mechanicId) {
  try {
    const { data } = await apiClient.delete(`/mechanics/${mechanicId}`);
    clearApiClientCache('/public/mechanics');
    return Boolean(data.deleted);
  } catch (error) {
    extractApiError(error, 'Failed to delete mechanic.');
  }
}
