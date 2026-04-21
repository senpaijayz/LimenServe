import apiClient, { extractApiError } from './apiClient';
import { MOCK_SEED_PRODUCTS as MOCK_PRODUCTS } from '../modules/stockroom/data/mockProducts';
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
    if (!data?.results || data.results.length === 0) {
      // Fallback to MOCK_PRODUCTS
      return MOCK_PRODUCTS.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase())
      ).map(p => ({
        productId: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        matchedBy: 'keyword',
        keywords: [p.category].filter(Boolean),
        quantity: Number(p.stock ?? 0),
        floor: { id: 'f1', floorNumber: 1, name: 'Ground Floor' },
        zone: { id: 'z1', code: 'Z1', name: 'Main Hall' },
        aisle: { id: 'a1', code: 'A1', name: 'Aisle 1' },
        shelf: { id: 's1', code: 'S1', name: 'Shelf 1', shelfType: '4_level', positionX: 0, positionY: 0, width: 1 },
        level: { id: 'l1', levelNumber: 1, elevation: 0.8 },
        slot: { id: 'sl1', slotNumber: 1, slotLabel: 'Slot 1', positionX: 0, width: 1 },
        similarity: 1
      })) as StockroomSearchResult[];
    }
    return (data.results ?? []) as StockroomSearchResult[];
  } catch (error) {
    // Return mocks completely if backend fails
    return MOCK_PRODUCTS.filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase())
    ).map(p => ({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      matchedBy: 'keyword',
      keywords: [p.category].filter(Boolean),
      quantity: Number(p.stock ?? 0),
      floor: { id: 'f1', floorNumber: 1, name: 'Ground Floor' },
      zone: { id: 'z1', code: 'Z1', name: 'Main Hall' },
      aisle: { id: 'a1', code: 'A1', name: 'Aisle 1' },
      shelf: { id: 's1', code: 'S1', name: 'Shelf 1', shelfType: '4_level', positionX: 0, positionY: 0, width: 1 },
      level: { id: 'l1', levelNumber: 1, elevation: 0.8 },
      slot: { id: 'sl1', slotNumber: 1, slotLabel: 'Slot 1', positionX: 0, width: 1 },
      similarity: 1
    })) as StockroomSearchResult[];
  }
}

export async function getStockroomItemDetails(productId: string, currentFloor: number): Promise<StockroomItemDetails> {
  try {
    const { data } = await apiClient.get(`/stockroom/items/${productId}`, {
      params: { currentFloor },
    });
    return data as StockroomItemDetails;
  } catch (error) {
    // Generate an automatic route for mocked details
    const mockItem = MOCK_PRODUCTS.find(p => p.id === productId) || MOCK_PRODUCTS[0];
    return {
      item: {
        productId: mockItem.id,
        sku: mockItem.sku,
        name: mockItem.name,
        category: mockItem.category,
        keywords: [mockItem.category].filter(Boolean),
        quantity: Number(mockItem.stock ?? 0)
      },
      currentFloor,
      targetFloor: 1,
      targetShelfId: 'mock-shelf-123',
      location: {
        floor: { code: 'F1', name: 'Ground' },
        zone: { code: 'Z1', name: 'Main Hall' },
        aisle: { code: 'A1', name: 'Aisle 1' },
        shelf: { code: 'S1', name: 'Shelf 1' },
        level: { number: 2, elevation: 1.2 },
        slot: { number: 3 }
      },
      targetSlot: { x: 5, y: 5 },
      segmentsByFloor: { "1": [{ x: 9, y: 8 }, { x: 5, y: 5 }] },
      steps: ['Head straight towards Aisle 1', 'Turn left', 'Look for Shelf S1, Level 2']
    } as unknown as StockroomItemDetails;
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
    if (!data?.items || data.items.length === 0) {
      return MOCK_PRODUCTS.map(p => ({
        productId: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        partCode: p.sku,
        keywords: [p.category]
      })) as StockroomMasterItem[];
    }
    return (data.items ?? []) as StockroomMasterItem[];
  } catch (error) {
    return MOCK_PRODUCTS.map(p => ({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      partCode: p.sku,
      keywords: [p.category]
    })) as StockroomMasterItem[];
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
