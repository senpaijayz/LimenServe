import { describe, expect, it } from 'vitest';
import {
  hasValidRecommendationPackageItems,
  normalizeFeaturedCatalogItem,
  normalizeRecommendationPackage,
} from '../modules/cms/catalog-content/cmsCatalogContentModel';

describe('CMS catalog content model', () => {
  it('normalizes featured catalog item API rows for forms', () => {
    expect(normalizeFeaturedCatalogItem({
      placement_key: 'home_best_sellers',
      product_id: 'product-1',
      sku: ' 5370A737 ',
      name: 'Shield',
      sort_order: '20',
      is_active: false,
    })).toEqual({
      id: '',
      placementKey: 'home_best_sellers',
      productId: 'product-1',
      sku: '5370A737',
      name: 'Shield',
      category: '',
      label: '',
      badge: '',
      sortOrder: 20,
      isActive: false,
    });
  });

  it('defaults new featured products to the public Genuine Parts placement', () => {
    expect(normalizeFeaturedCatalogItem({}).placementKey).toBe('catalog_featured');
  });

  it('normalizes recommendation packages with editable item rows', () => {
    expect(normalizeRecommendationPackage({
      package_key: 'brake-care',
      package_name: 'Brake Care',
      service_group: 'brake_service',
      priority: '5',
      items: [
        { item_kind: 'product', product_id: 'part-1', display_priority: '1', price_mode: 'catalog' },
        { item_kind: 'service', service_id: 'service-1', display_priority: '2', price_mode: 'override', price_override: '300' },
      ],
    })).toMatchObject({
      packageKey: 'brake-care',
      packageName: 'Brake Care',
      serviceGroup: 'brake_service',
      priority: 5,
      isActive: true,
      items: [
        { itemKind: 'product', productId: 'part-1', displayPriority: 1, priceMode: 'catalog' },
        { itemKind: 'service', serviceId: 'service-1', displayPriority: 2, priceMode: 'override', priceOverride: 300 },
      ],
    });
  });

  it('detects recommendation packages that have no selectable content', () => {
    expect(hasValidRecommendationPackageItems(normalizeRecommendationPackage({
      package_key: 'empty',
      package_name: 'Empty package',
      items: [],
    }))).toBe(false);

    expect(hasValidRecommendationPackageItems(normalizeRecommendationPackage({
      package_key: 'ready',
      package_name: 'Ready package',
      items: [
        { item_kind: 'product', product_id: 'part-1', is_active: true },
      ],
    }))).toBe(true);
  });
});
