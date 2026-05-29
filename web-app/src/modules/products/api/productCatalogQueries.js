import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getProductCatalog } from '../../../services/catalogApi';

export const DEFAULT_PRODUCT_PAGINATION = {
  page: 1,
  pageSize: 10,
  totalCount: 0,
  totalPages: 1,
};

export function normalizeProductCatalogParams({
  page = 1,
  pageSize = 10,
  searchQuery = '',
  selectedCategory = 'all',
  sortBy = 'name-asc',
  vehicleModel = '',
  vehicleYear = '',
  source = '',
  includeCategories = true,
  refreshKey = 0,
} = {}) {
  return {
    page,
    pageSize,
    searchQuery: String(searchQuery || '').trim(),
    selectedCategory,
    sortBy,
    vehicleModel: String(vehicleModel || '').trim(),
    vehicleYear: String(vehicleYear || '').trim(),
    source: String(source || '').trim(),
    includeCategories,
    refreshKey,
  };
}

export const productCatalogKeys = {
  all: ['product-catalog'],
  list: (params = {}) => [productCatalogKeys.all[0], 'list', normalizeProductCatalogParams(params)],
};

export function normalizeProductCatalogResponse(catalog, params = {}) {
  const normalizedParams = normalizeProductCatalogParams(params);

  return {
    products: catalog?.products ?? [],
    categories: catalog?.categories ?? [],
    pagination: catalog?.pagination ?? {
      ...DEFAULT_PRODUCT_PAGINATION,
      page: normalizedParams.page,
      pageSize: normalizedParams.pageSize,
    },
  };
}

export function useProductCatalogQuery(params = {}) {
  const normalizedParams = normalizeProductCatalogParams(params);

  return useQuery({
    queryKey: productCatalogKeys.list(normalizedParams),
    queryFn: () => getProductCatalog({
      page: normalizedParams.page,
      pageSize: normalizedParams.pageSize,
      q: normalizedParams.searchQuery,
      category: normalizedParams.selectedCategory,
      sortBy: normalizedParams.sortBy,
      vehicleModel: normalizedParams.vehicleModel,
      vehicleYear: normalizedParams.vehicleYear,
      source: normalizedParams.source,
      includeCategories: normalizedParams.includeCategories,
      cacheBust: normalizedParams.refreshKey,
    }),
    placeholderData: keepPreviousData,
    select: (catalog) => normalizeProductCatalogResponse(catalog, normalizedParams),
  });
}

export function invalidateProductCatalog(queryClient) {
  return queryClient.invalidateQueries({ queryKey: productCatalogKeys.all });
}
