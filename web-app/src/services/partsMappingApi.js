import apiClient, { STOCKROOM_API_TIMEOUT_MS, extractApiError } from './apiClient';

export async function getPartsMappingLayouts() {
  try {
    const { data } = await apiClient.get('/parts-mapping/layouts', {
      timeout: STOCKROOM_API_TIMEOUT_MS,
    });
    return data.layouts ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load saved layouts.');
  }
}

export async function createPartsMappingLayout(payload) {
  try {
    const { data } = await apiClient.post('/parts-mapping/layouts', payload, {
      timeout: STOCKROOM_API_TIMEOUT_MS,
    });
    return data.layout;
  } catch (error) {
    extractApiError(error, 'Failed to save layout.');
  }
}

export async function updatePartsMappingLayout(layoutId, payload) {
  try {
    const { data } = await apiClient.put(`/parts-mapping/layouts/${layoutId}`, payload, {
      timeout: STOCKROOM_API_TIMEOUT_MS,
    });
    return data.layout;
  } catch (error) {
    extractApiError(error, 'Failed to update layout.');
  }
}

export async function deletePartsMappingLayout(layoutId) {
  try {
    await apiClient.delete(`/parts-mapping/layouts/${layoutId}`, {
      timeout: STOCKROOM_API_TIMEOUT_MS,
    });
  } catch (error) {
    extractApiError(error, 'Failed to delete layout.');
  }
}

export async function setPriorityPartsMappingLayout(layoutId) {
  try {
    const { data } = await apiClient.post(`/parts-mapping/layouts/${layoutId}/priority`, null, {
      timeout: STOCKROOM_API_TIMEOUT_MS,
    });
    return data.layout;
  } catch (error) {
    extractApiError(error, 'Failed to set priority layout.');
  }
}
