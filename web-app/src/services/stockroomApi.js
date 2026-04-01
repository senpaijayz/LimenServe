import apiClient, { extractApiError } from './apiClient';

export async function getStockroomBootstrap(layoutId) {
  try {
    const { data } = await apiClient.get('/stockroom/bootstrap', {
      params: layoutId ? { layoutId } : {},
    });
    return data;
  } catch (error) {
    extractApiError(error, 'Failed to load stockroom layout.');
  }
}

export async function searchStockroomItems(query) {
  try {
    const { data } = await apiClient.get('/stockroom/search', {
      params: { q: query },
    });
    return data.results ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to search stockroom items.');
  }
}

export async function getStockroomItemDetails(productId, currentFloor) {
  try {
    const { data } = await apiClient.get(`/stockroom/items/${productId}`, {
      params: { currentFloor },
    });
    return data;
  } catch (error) {
    extractApiError(error, 'Failed to load item routing details.');
  }
}

export async function getStockroomLayouts() {
  try {
    const { data } = await apiClient.get('/stockroom/layouts');
    return data.layouts ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load saved layouts.');
  }
}

export async function createStockroomLayout(payload) {
  try {
    const { data } = await apiClient.post('/stockroom/layouts', payload);
    return data.layout;
  } catch (error) {
    extractApiError(error, 'Failed to create a layout version.');
  }
}

export async function updateStockroomLayout(layoutId, payload) {
  try {
    const { data } = await apiClient.put(`/stockroom/layouts/${layoutId}`, payload);
    return data.layout;
  } catch (error) {
    extractApiError(error, 'Failed to update layout metadata.');
  }
}

export async function publishStockroomLayout(layoutId) {
  try {
    const { data } = await apiClient.post(`/stockroom/layouts/${layoutId}/publish`);
    return data.layout;
  } catch (error) {
    extractApiError(error, 'Failed to publish the layout.');
  }
}

export async function getStockroomMasterItems(params = {}) {
  try {
    const { data } = await apiClient.get('/stockroom/master-items', {
      params,
    });
    return data.items ?? [];
  } catch (error) {
    extractApiError(error, 'Failed to load stockroom item master data.');
  }
}

export async function updateStockroomMasterItem(productId, payload) {
  try {
    const { data } = await apiClient.put(`/stockroom/master-items/${productId}`, payload);
    return data.item;
  } catch (error) {
    extractApiError(error, 'Failed to update stockroom item metadata.');
  }
}

export async function createStockroomZone(payload) {
  try {
    const { data } = await apiClient.post('/stockroom/zones', payload);
    return data.zone;
  } catch (error) {
    extractApiError(error, 'Failed to create zone.');
  }
}

export async function updateStockroomZone(zoneId, payload) {
  try {
    const { data } = await apiClient.put(`/stockroom/zones/${zoneId}`, payload);
    return data.zone;
  } catch (error) {
    extractApiError(error, 'Failed to update zone.');
  }
}

export async function deleteStockroomZone(zoneId) {
  try {
    await apiClient.delete(`/stockroom/zones/${zoneId}`);
  } catch (error) {
    extractApiError(error, 'Failed to delete zone.');
  }
}

export async function createStockroomAisle(payload) {
  try {
    const { data } = await apiClient.post('/stockroom/aisles', payload);
    return data.aisle;
  } catch (error) {
    extractApiError(error, 'Failed to create aisle.');
  }
}

export async function updateStockroomAisle(aisleId, payload) {
  try {
    const { data } = await apiClient.put(`/stockroom/aisles/${aisleId}`, payload);
    return data.aisle;
  } catch (error) {
    extractApiError(error, 'Failed to update aisle.');
  }
}

export async function deleteStockroomAisle(aisleId) {
  try {
    await apiClient.delete(`/stockroom/aisles/${aisleId}`);
  } catch (error) {
    extractApiError(error, 'Failed to delete aisle.');
  }
}

export async function createStockroomShelf(payload) {
  try {
    const { data } = await apiClient.post('/stockroom/shelves', payload);
    return data.shelf;
  } catch (error) {
    extractApiError(error, 'Failed to create shelf.');
  }
}

export async function updateStockroomShelf(shelfId, payload) {
  try {
    const { data } = await apiClient.put(`/stockroom/shelves/${shelfId}`, payload);
    return data.shelf;
  } catch (error) {
    extractApiError(error, 'Failed to update shelf.');
  }
}

export async function deleteStockroomShelf(shelfId) {
  try {
    await apiClient.delete(`/stockroom/shelves/${shelfId}`);
  } catch (error) {
    extractApiError(error, 'Failed to delete shelf.');
  }
}

export async function updateStockroomItemLocation(productId, payload) {
  try {
    const { data } = await apiClient.put(`/stockroom/item-locations/${productId}`, payload);
    return data.itemLocation;
  } catch (error) {
    extractApiError(error, 'Failed to save item location.');
  }
}

export async function deleteStockroomItemLocation(productId, layoutId) {
  try {
    await apiClient.delete(`/stockroom/item-locations/${productId}`, {
      params: { layoutId },
    });
  } catch (error) {
    extractApiError(error, 'Failed to delete item location.');
  }
}
