import apiClient, { clearApiClientCache, extractApiError } from '../../../services/apiClient';
import type {
  CmsFeaturedCatalogItem,
  CmsRecommendationPackage,
} from '../types/cmsCatalogTypes';
import {
  normalizeFeaturedCatalogItem,
  normalizeRecommendationPackage,
} from '../catalog-content/cmsCatalogContentModel';

export async function getCmsCatalogContent(): Promise<{
  featuredItems: CmsFeaturedCatalogItem[];
  recommendationPackages: CmsRecommendationPackage[];
}> {
  try {
    const { data } = await apiClient.get('/cms/catalog-content');
    return {
      featuredItems: (data.featuredItems ?? []).map(normalizeFeaturedCatalogItem),
      recommendationPackages: (data.recommendationPackages ?? []).map(normalizeRecommendationPackage),
    };
  } catch (error) {
    extractApiError(error, 'Failed to load CMS catalog content.');
  }
}

export async function saveCmsFeaturedCatalogItem(payload: CmsFeaturedCatalogItem): Promise<CmsFeaturedCatalogItem> {
  try {
    const { data } = await apiClient.post('/cms/featured-catalog-items', payload);
    clearApiClientCache((key: string) => key.startsWith('/public/'));
    return normalizeFeaturedCatalogItem(data.item ?? {});
  } catch (error) {
    extractApiError(error, 'Failed to save featured product.');
  }
}

export async function deleteCmsFeaturedCatalogItem(id: string): Promise<void> {
  try {
    await apiClient.delete(`/cms/featured-catalog-items/${encodeURIComponent(id)}`);
    clearApiClientCache((key: string) => key.startsWith('/public/'));
  } catch (error) {
    extractApiError(error, 'Failed to remove featured product.');
  }
}

export async function saveCmsRecommendationPackage(payload: CmsRecommendationPackage): Promise<CmsRecommendationPackage> {
  try {
    const { data } = await apiClient.post('/cms/recommendation-packages', payload);
    clearApiClientCache((key: string) => key.startsWith('/public/') || key.startsWith('/catalog/products/'));
    return normalizeRecommendationPackage(data.package ?? {});
  } catch (error) {
    extractApiError(error, 'Failed to save recommendation package.');
  }
}

export async function deleteCmsRecommendationPackage(id: string): Promise<void> {
  try {
    await apiClient.delete(`/cms/recommendation-packages/${encodeURIComponent(id)}`);
    clearApiClientCache((key: string) => key.startsWith('/public/') || key.startsWith('/catalog/products/'));
  } catch (error) {
    extractApiError(error, 'Failed to remove recommendation package.');
  }
}

export async function getPublicFeaturedCatalogItems(placementKey = 'home_best_sellers'): Promise<CmsFeaturedCatalogItem[]> {
  try {
    const { data } = await apiClient.get('/public/catalog/featured', {
      params: { placementKey },
    });
    return (data.items ?? []).map(normalizeFeaturedCatalogItem);
  } catch (error) {
    extractApiError(error, 'Failed to load featured products.');
  }
}
