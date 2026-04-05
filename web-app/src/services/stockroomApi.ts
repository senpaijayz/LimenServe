import apiClient, { extractApiError } from './apiClient';
import type {
  StockroomBootstrap,
  StockroomItemDetails,
  StockroomLayout,
  StockroomLayoutSummary,
  StockroomMasterItem,
  StockroomSearchResult,
} from '../modules/stockroom/types';

export async function getStockroomBootstrap(layoutId?: string | null): Promise<StockroomBootstrap> {
  try {
    const { data } = await apiClient.get('/stockroom/bootstrap', {
      params: layoutId ? { layoutId } : {},
    });
    return data as StockroomBootstrap;
  } catch (error) {
    extractApiError(error, 'Failed to load stockroom layout.');
  }
}

export async function searchStockroomItems(query: string): Promise<StockroomSearchResult[]> {
  try {
    const { data } = await apiClient.get('/stockroom/search', {
      params: { q: query },
    });
    return (data.results ?? []) as StockroomSearchResult[];
  } catch (error) {
    extractApiError(error, 'Failed to search stockroom items.');
  }
}

export async function getStockroomItemDetails(productId: string, currentFloor: number): Promise<StockroomItemDetails> {
  try {
    const { data } = await apiClient.get(`/stockroom/items/${productId}`, {
      params: { currentFloor },
    });
    return data as StockroomItemDetails;
  } catch (error) {
    extractApiError(error, 'Failed to load item routing details.');
  }
}

export async function getStockroomLayouts(): Promise<StockroomLayoutSummary[]> {
  try {
    const { data } = await apiClient.get('/stockroom/layouts');
    return (data.layouts ?? []) as StockroomLayoutSummary[];
  } catch (error) {
    extractApiError(error, 'Failed to load saved layouts.');
  }
}

export async function createStockroomLayout(payload: { name: string; sourceLayoutId?: string | null }): Promise<StockroomLayoutSummary> {
  try {
    const { data } = await apiClient.post('/stockroom/layouts', payload);
    return data.layout as StockroomLayoutSummary;
  } catch (error) {
    extractApiError(error, 'Failed to create a layout version.');
  }
}

export async function updateStockroomLayout(layoutId: string, payload: Record<string, unknown>): Promise<StockroomLayout> {
  try {
    const { data } = await apiClient.put(`/stockroom/layouts/${layoutId}`, payload);
    return data.layout as StockroomLayout;
  } catch (error) {
    extractApiError(error, 'Failed to update layout metadata.');
  }
}

export async function publishStockroomLayout(layoutId: string): Promise<StockroomLayoutSummary> {
  try {
    const { data } = await apiClient.post(`/stockroom/layouts/${layoutId}/publish`);
    return data.layout as StockroomLayoutSummary;
  } catch (error) {
    extractApiError(error, 'Failed to publish the layout.');
  }
}

export async function getStockroomMasterItems(params: Record<string, unknown> = {}): Promise<StockroomMasterItem[]> {
  try {
    const { data } = await apiClient.get('/stockroom/master-items', { params });
    return (data.items ?? []) as StockroomMasterItem[];
  } catch (error) {
    extractApiError(error, 'Failed to load stockroom item master data.');
  }
}

export async function updateStockroomMasterItem(productId: string, payload: Record<string, unknown>): Promise<StockroomMasterItem> {
  try {
    const { data } = await apiClient.put(`/stockroom/master-items/${productId}`, payload);
    return data.item as StockroomMasterItem;
  } catch (error) {
    extractApiError(error, 'Failed to update stockroom item metadata.');
  }
}

export async function updateStockroomZone(zoneId: string, payload: Record<string, unknown>) {
  try {
    const { data } = await apiClient.put(`/stockroom/zones/${zoneId}`, payload);
    return data.zone;
  } catch (error) {
    extractApiError(error, 'Failed to update zone.');
  }
}

export async function createStockroomShelf(payload: Record<string, unknown>) {
  try {
    const { data } = await apiClient.post('/stockroom/shelves', payload);
    return data.shelf;
  } catch (error) {
    extractApiError(error, 'Failed to create shelf.');
  }
}

export async function updateStockroomShelf(shelfId: string, payload: Record<string, unknown>) {
  try {
    const { data } = await apiClient.put(`/stockroom/shelves/${shelfId}`, payload);
    return data.shelf;
  } catch (error) {
    extractApiError(error, 'Failed to update shelf.');
  }
}

export async function deleteStockroomShelf(shelfId: string) {
  try {
    await apiClient.delete(`/stockroom/shelves/${shelfId}`);
  } catch (error) {
    extractApiError(error, 'Failed to delete shelf.');
  }
}

export async function updateStockroomItemLocation(productId: string, payload: Record<string, unknown>) {
  try {
    const { data } = await apiClient.put(`/stockroom/item-locations/${productId}`, payload);
    return data.itemLocation;
  } catch (error) {
    extractApiError(error, 'Failed to save item location.');
  }
}

export async function deleteStockroomItemLocation(productId: string, layoutId?: string | null) {
  try {
    await apiClient.delete(`/stockroom/item-locations/${productId}`, {
      params: layoutId ? { layoutId } : {},
    });
  } catch (error) {
    extractApiError(error, 'Failed to delete item location.');
  }
}
