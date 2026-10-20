import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CatalogContentCmsPanel from '../modules/cms/catalog-content/CatalogContentCmsPanel';

const api = vi.hoisted(() => ({
  getProductCatalog: vi.fn(),
  getServiceCatalog: vi.fn(),
  getCmsCatalogContent: vi.fn(),
  deleteCmsFeaturedCatalogItem: vi.fn(),
  deleteCmsRecommendationPackage: vi.fn(),
  saveCmsFeaturedCatalogItem: vi.fn(),
  saveCmsRecommendationPackage: vi.fn(),
}));

vi.mock('../services/catalogApi', () => ({
  getProductCatalog: api.getProductCatalog,
  getServiceCatalog: api.getServiceCatalog,
}));

vi.mock('../modules/cms/api/cmsCatalogApi', () => ({
  getCmsCatalogContent: api.getCmsCatalogContent,
  deleteCmsFeaturedCatalogItem: api.deleteCmsFeaturedCatalogItem,
  deleteCmsRecommendationPackage: api.deleteCmsRecommendationPackage,
  saveCmsFeaturedCatalogItem: api.saveCmsFeaturedCatalogItem,
  saveCmsRecommendationPackage: api.saveCmsRecommendationPackage,
}));

vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getProductCatalog.mockResolvedValue({ products: [] });
  api.getServiceCatalog.mockResolvedValue([]);
  api.getCmsCatalogContent.mockResolvedValue({ featuredItems: [], recommendationPackages: [] });
});

afterEach(() => cleanup());

describe('catalog CMS loading', () => {
  it('loads its catalog sources once under React StrictMode', async () => {
    render(<StrictMode><CatalogContentCmsPanel /></StrictMode>);

    expect(await screen.findByRole('tab', { name: /Featured Products/ })).toBeTruthy();
    await waitFor(() => {
      expect(api.getCmsCatalogContent).toHaveBeenCalledTimes(1);
      expect(api.getProductCatalog).toHaveBeenCalledTimes(1);
      expect(api.getServiceCatalog).toHaveBeenCalledTimes(1);
    });
  });
});
