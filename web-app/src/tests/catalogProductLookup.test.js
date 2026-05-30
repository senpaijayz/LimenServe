import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: {
    get: vi.fn(),
  },
}));

vi.mock('../services/apiClient', () => ({
  default: apiClientMock,
  cachedApiGet: vi.fn(),
  clearApiClientCache: vi.fn(),
  extractApiError: vi.fn((error, fallback) => {
    throw new Error(error?.response?.data?.error || fallback);
  }),
  INVENTORY_API_TIMEOUT_MS: 25000,
  PRICE_LIST_UPLOAD_TIMEOUT_MS: 180000,
}));

vi.mock('../data/productData', () => ({
  ALL_VEHICLE_MODELS: [],
  products: [],
}));

vi.mock('../lib/inventoryClassifier', () => ({
  default: {
    OPERATIONAL_CATEGORIES: [],
    classifyInventoryItem: vi.fn(() => ({ category: 'General Parts & Accessories' })),
  },
}));

import { getCatalogProductByPartNumber } from '../services/catalogApi';

describe('catalog product part-number lookup', () => {
  beforeEach(() => {
    apiClientMock.get.mockReset();
  });

  it('loads an exact existing product by encoded part number', async () => {
    apiClientMock.get.mockResolvedValue({
      data: {
        product: {
          id: 'product-1',
          sku: '5370A737',
          name: 'Shield, FR F',
        },
      },
    });

    const product = await getCatalogProductByPartNumber('5370A737 0001');

    expect(apiClientMock.get).toHaveBeenCalledWith('/catalog/products/part-number/5370A737%200001', {
      params: undefined,
      timeout: 25000,
    });
    expect(product.name).toBe('Shield, FR F');
  });

  it('returns null when no duplicate part number exists', async () => {
    apiClientMock.get.mockRejectedValue({
      response: {
        status: 404,
        data: { error: 'No product matched that part number.' },
      },
    });

    await expect(getCatalogProductByPartNumber('NEW-PART')).resolves.toBeNull();
  });

  it('can check availability without creating a red 404 request', async () => {
    apiClientMock.get.mockResolvedValue({
      data: {
        product: null,
        available: true,
      },
    });

    await expect(getCatalogProductByPartNumber('NEW-PART', { optional: true })).resolves.toBeNull();
    expect(apiClientMock.get).toHaveBeenCalledWith('/catalog/products/part-number/NEW-PART', {
      params: { optional: true },
      timeout: 25000,
    });
  });
});
