import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCT_PAGINATION,
  normalizeProductCatalogParams,
  normalizeProductCatalogResponse,
  productCatalogKeys,
} from '../modules/products/api/productCatalogQueries';

describe('product catalog query helpers', () => {
  it('normalizes search and vehicle filters before building query keys', () => {
    const params = normalizeProductCatalogParams({
      page: 2,
      pageSize: 24,
      searchQuery: ' 5370A737 ',
      selectedCategory: 'body',
      vehicleModel: ' Montero ',
      vehicleYear: 2014,
      source: ' staging ',
      refreshKey: 3,
    });

    expect(params).toEqual({
      page: 2,
      pageSize: 24,
      searchQuery: '5370A737',
      selectedCategory: 'body',
      sortBy: 'name-asc',
      vehicleModel: 'Montero',
      vehicleYear: '2014',
      source: 'staging',
      includeCategories: true,
      refreshKey: 3,
    });

    expect(productCatalogKeys.list(params)).toEqual(['product-catalog', 'list', params]);
  });

  it('keeps pagination stable when the catalog response is empty', () => {
    expect(normalizeProductCatalogResponse(null, { page: 4, pageSize: 50 })).toEqual({
      products: [],
      categories: [],
      pagination: {
        ...DEFAULT_PRODUCT_PAGINATION,
        page: 4,
        pageSize: 50,
      },
    });
  });
});
