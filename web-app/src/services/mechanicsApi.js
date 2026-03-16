import apiClient, { extractApiError } from './apiClient';

export async function getPublicMechanics() {
  try {
    const { data } = await apiClient.get('/public/mechanics');
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
      return data.mechanicId;
    }

    const { data } = await apiClient.post('/mechanics', payload);
    return data.mechanicId;
  } catch (error) {
    extractApiError(error, 'Failed to save mechanic.');
  }
}

export async function deleteMechanic(mechanicId) {
  try {
    const { data } = await apiClient.delete(`/mechanics/${mechanicId}`);
    return Boolean(data.deleted);
  } catch (error) {
    extractApiError(error, 'Failed to delete mechanic.');
  }
}
