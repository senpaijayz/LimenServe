import { useDeferredValue } from 'react';
import {
  DEFAULT_PRODUCT_PAGINATION,
  useProductCatalogQuery,
} from '../modules/products/api/productCatalogQueries';

const useProductCatalog = ({
  page = 1,
  pageSize = 10,
  searchQuery = '',
  selectedCategory = 'all',
  sortBy = 'name-asc',
  vehicleModel = '',
  vehicleYear = '',
  includeCategories = true,
  refreshKey = 0,
} = {}) => {
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const catalogQuery = useProductCatalogQuery({
    page,
    pageSize,
    searchQuery: deferredSearchQuery,
    selectedCategory,
    sortBy,
    vehicleModel,
    vehicleYear,
    includeCategories,
    refreshKey,
  });

  const catalog = catalogQuery.data ?? {
    products: [],
    categories: [],
    pagination: {
      ...DEFAULT_PRODUCT_PAGINATION,
      page,
      pageSize,
    },
  };

  return {
    products: catalog.products,
    categories: catalog.categories,
    pagination: catalog.pagination,
    loading: catalogQuery.isPending,
    isFetching: catalogQuery.isFetching,
    error: catalogQuery.error?.message ?? null,
    refetch: catalogQuery.refetch,
  };
};

export default useProductCatalog;
