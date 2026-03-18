import { useDeferredValue, useEffect, useState } from 'react';
import { getProductCatalog } from '../services/catalogApi';

const useProductCatalog = ({
  page = 1,
  pageSize = 10,
  searchQuery = '',
  selectedCategory = 'all',
  sortBy = 'name-asc',
  vehicleModel = '',
  vehicleYear = '',
  vehicleEngine = '',
} = {}) => {
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize, totalCount: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    const loadCatalog = async () => {
      setLoading(true);
      setError(null);

      try {
        const catalog = await getProductCatalog({
          page,
          pageSize,
          q: deferredSearchQuery,
          category: selectedCategory,
          sortBy,
          vehicleModel,
          vehicleYear,
          vehicleEngine,
        });

        if (!active) {
          return;
        }

        setProducts(catalog.products);
        setCategories(catalog.categories);
        setPagination(catalog.pagination);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setProducts([]);
        setCategories([]);
        setPagination({ page: 1, pageSize, totalCount: 0, totalPages: 1 });
        setError(loadError.message || 'Failed to load product catalog.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadCatalog();

    return () => {
      active = false;
    };
  }, [page, pageSize, deferredSearchQuery, selectedCategory, sortBy, vehicleModel, vehicleYear, vehicleEngine]);

  return {
    products,
    categories,
    pagination,
    loading,
    error,
  };
};

export default useProductCatalog;
