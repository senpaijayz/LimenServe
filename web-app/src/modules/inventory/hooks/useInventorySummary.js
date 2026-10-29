import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCatalogSummary } from '../../../services/catalogApi';

export default function useInventorySummary(ownerKey) {
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['inventory-summary', ownerKey],
    queryFn: ({ signal }) => getCatalogSummary(signal),
    enabled: Boolean(ownerKey),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const refresh = useCallback(() => refetch({ throwOnError: true }), [refetch]);
  return {
    summary: isFetching || error ? null : data ?? null,
    loading: isPending || isFetching,
    error: error?.message || '',
    refresh,
  };
}
