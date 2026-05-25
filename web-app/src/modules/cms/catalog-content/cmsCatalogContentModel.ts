import type {
  CmsFeaturedCatalogItem,
  CmsRecommendationPackage,
  CmsRecommendationPackageItem,
  RecommendationItemKind,
  RecommendationPriceMode,
} from '../types/cmsCatalogTypes';

function stringValue(value: unknown): string {
  return String(value ?? '').trim();
}

function numberValue(value: unknown, fallback = 0): number {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function booleanValue(value: unknown, fallback = true): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeFeaturedCatalogItem(row: Record<string, unknown> = {}): CmsFeaturedCatalogItem {
  return {
    id: stringValue(row.id),
    placementKey: stringValue(row.placementKey ?? row.placement_key) || 'home_best_sellers',
    productId: stringValue(row.productId ?? row.product_id),
    sku: stringValue(row.sku),
    name: stringValue(row.name),
    category: stringValue(row.category),
    label: stringValue(row.label),
    badge: stringValue(row.badge),
    sortOrder: numberValue(row.sortOrder ?? row.sort_order, 100),
    isActive: booleanValue(row.isActive ?? row.is_active, true),
  };
}

export function normalizeRecommendationPackageItem(row: Record<string, unknown> = {}): CmsRecommendationPackageItem {
  const itemKind = stringValue(row.itemKind ?? row.item_kind) === 'service' ? 'service' : 'product';
  const priceMode = stringValue(row.priceMode ?? row.price_mode) as RecommendationPriceMode;
  const priceOverride = row.priceOverride ?? row.price_override;

  return {
    id: stringValue(row.id),
    itemKind: itemKind as RecommendationItemKind,
    productId: stringValue(row.productId ?? row.product_id),
    serviceId: stringValue(row.serviceId ?? row.service_id),
    productName: stringValue(row.productName ?? row.product_name),
    serviceName: stringValue(row.serviceName ?? row.service_name),
    reasonLabel: stringValue(row.reasonLabel ?? row.reason_label),
    displayPriority: numberValue(row.displayPriority ?? row.display_priority, 100),
    priceMode: ['catalog', 'complimentary', 'override'].includes(priceMode) ? priceMode : 'catalog',
    priceOverride: priceOverride === null || priceOverride === undefined ? null : numberValue(priceOverride, 0),
    isActive: booleanValue(row.isActive ?? row.is_active, true),
  };
}

export function normalizeRecommendationPackage(row: Record<string, unknown> = {}): CmsRecommendationPackage {
  const items = Array.isArray(row.items) ? row.items : [];

  return {
    id: stringValue(row.id),
    anchorProductId: stringValue(row.anchorProductId ?? row.anchor_product_id),
    anchorProductName: stringValue(row.anchorProductName ?? row.anchor_product_name),
    anchorProductSku: stringValue(row.anchorProductSku ?? row.anchor_product_sku),
    vehicleModelName: stringValue(row.vehicleModelName ?? row.vehicle_model_name),
    vehicleFamily: stringValue(row.vehicleFamily ?? row.vehicle_family),
    serviceGroup: stringValue(row.serviceGroup ?? row.service_group),
    packageKey: stringValue(row.packageKey ?? row.package_key),
    packageName: stringValue(row.packageName ?? row.package_name),
    packageDescription: stringValue(row.packageDescription ?? row.package_description),
    minAnchorQuantity: numberValue(row.minAnchorQuantity ?? row.min_anchor_quantity, 1),
    priority: numberValue(row.priority, 100),
    isActive: booleanValue(row.isActive ?? row.is_active, true),
    items: items.map((item) => normalizeRecommendationPackageItem(item as Record<string, unknown>)),
  };
}

export function createEmptyFeaturedCatalogItem(sortOrder = 100): CmsFeaturedCatalogItem {
  return normalizeFeaturedCatalogItem({ sortOrder });
}

export function createEmptyRecommendationPackage(): CmsRecommendationPackage {
  return normalizeRecommendationPackage({
    serviceGroup: 'maintenance',
    packageKey: '',
    packageName: '',
    minAnchorQuantity: 1,
    priority: 100,
    isActive: true,
    items: [],
  });
}
