export type FeaturedPlacementKey = 'home_best_sellers' | 'catalog_featured' | 'estimate_recommended';

export type CmsFeaturedCatalogItem = {
  id: string;
  placementKey: FeaturedPlacementKey | string;
  productId: string;
  sku: string;
  name: string;
  category: string;
  label: string;
  badge: string;
  sortOrder: number;
  isActive: boolean;
};

export type RecommendationItemKind = 'product' | 'service';
export type RecommendationPriceMode = 'catalog' | 'complimentary' | 'override';

export type CmsRecommendationPackageItem = {
  id: string;
  itemKind: RecommendationItemKind;
  productId: string;
  serviceId: string;
  productName: string;
  serviceName: string;
  reasonLabel: string;
  displayPriority: number;
  priceMode: RecommendationPriceMode;
  priceOverride: number | null;
  isActive: boolean;
};

export type CmsRecommendationPackage = {
  id: string;
  anchorProductId: string;
  anchorProductName: string;
  anchorProductSku: string;
  vehicleModelName: string;
  vehicleFamily: string;
  serviceGroup: string;
  packageKey: string;
  packageName: string;
  packageDescription: string;
  minAnchorQuantity: number;
  priority: number;
  isActive: boolean;
  items: CmsRecommendationPackageItem[];
};
