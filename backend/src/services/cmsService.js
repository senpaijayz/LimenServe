import { supabaseAdmin } from '../config/supabase.js';
import { callRpc } from './supabaseRpc.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_NAV_STATUSES = new Set(['draft', 'published', 'archived']);
const ALLOWED_NAV_GROUPS = new Set(['primary', 'footer_shop', 'footer_company']);
const ALLOWED_RECOMMENDATION_ITEM_KINDS = new Set(['product', 'service']);
const ALLOWED_RECOMMENDATION_PRICE_MODES = new Set(['catalog', 'complimentary', 'override']);

function normalizeJsonPayload(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  return value;
}

export async function getPublishedCmsSite() {
  const site = await callRpc('get_published_cms_site');
  return normalizeJsonPayload(site, {
    settings: {},
    navigation: [],
    announcements: [],
  });
}

export async function getPublishedCmsPage(slug) {
  const page = await callRpc('get_published_cms_page', {
    p_slug: slug,
  });

  return normalizeJsonPayload(page, null);
}

export async function listCmsPages() {
  const pages = await callRpc('cms_admin_list_pages');
  return Array.isArray(pages) ? pages : [];
}

export async function getCmsPage(slug) {
  const page = await callRpc('cms_admin_get_page', {
    p_slug: slug,
  });

  return normalizeJsonPayload(page, null);
}

export async function saveCmsPage(payload, actorId) {
  return callRpc('cms_admin_save_page', {
    p_payload: payload,
    p_actor_id: actorId || null,
  });
}

export async function saveCmsSiteSettings(payload, actorId) {
  return callRpc('cms_admin_save_site_settings', {
    p_payload: payload,
    p_actor_id: actorId || null,
  });
}

function normalizeActorId(actorId) {
  return UUID_PATTERN.test(String(actorId || '')) ? actorId : null;
}

function assertUuid(value, message) {
  const normalizedValue = String(value || '').trim();
  if (!UUID_PATTERN.test(normalizedValue)) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
  return normalizedValue;
}

function normalizeOptionalUuid(value) {
  const normalizedValue = String(value || '').trim();
  return UUID_PATTERN.test(normalizedValue) ? normalizedValue : null;
}

function normalizeText(value, fallback = '', maxLength = 240) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function normalizeInteger(value, fallback = 100) {
  const normalizedValue = Number.parseInt(value, 10);
  return Number.isFinite(normalizedValue) ? normalizedValue : fallback;
}

function normalizeBoolean(value, fallback = true) {
  return typeof value === 'boolean' ? value : fallback;
}

function isMissingCmsCatalogContentError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return [
    'featured_catalog_items',
    'recommendation_packages',
    'recommendation_package_items',
    'get_featured_catalog_items',
    'get_cms_recommendation_packages',
    'could not find a relationship',
    'schema cache',
  ].some((token) => message.includes(token));
}

async function getCatalogProductsById(productIds = []) {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .schema('catalog')
    .from('products')
    .select('id, sku, name, category')
    .in('id', ids);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((product) => [product.id, product]));
}

async function getServicesById(serviceIds = []) {
  const ids = [...new Set(serviceIds.filter(Boolean))];
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .schema('app')
    .from('services')
    .select('id, code, name')
    .in('id', ids);

  if (error) {
    if (isMissingCmsCatalogContentError(error) || String(error?.message || '').toLowerCase().includes('services')) {
      console.warn('CMS recommendation services lookup is not ready yet:', error.message || error);
      return new Map();
    }
    throw error;
  }

  return new Map((data ?? []).map((service) => [service.id, service]));
}

function mapFeaturedCatalogItem(row = {}) {
  const product = row.products ?? row.product ?? {};
  return {
    id: row.id,
    placementKey: row.placement_key,
    productId: row.product_id,
    sku: row.sku ?? product.sku ?? '',
    name: row.name ?? product.name ?? '',
    category: row.category ?? product.category ?? '',
    label: row.label ?? '',
    badge: row.badge ?? '',
    sortOrder: Number(row.sort_order ?? 100),
    isActive: row.is_active !== false,
  };
}

function mapRecommendationPackageItem(row = {}) {
  const product = row.products ?? row.product ?? {};
  const service = row.services ?? row.service ?? {};
  return {
    id: row.id,
    itemKind: row.item_kind,
    productId: row.product_id ?? '',
    serviceId: row.service_id ?? '',
    productName: product.name ?? row.product_name ?? '',
    serviceName: service.name ?? row.service_name ?? '',
    reasonLabel: row.reason_label ?? '',
    displayPriority: Number(row.display_priority ?? 100),
    priceMode: row.price_mode ?? 'catalog',
    priceOverride: row.price_override === null || row.price_override === undefined ? null : Number(row.price_override),
    isActive: row.is_active !== false,
  };
}

function mapRecommendationPackage(row = {}) {
  const anchorProduct = row.products ?? row.anchor_product ?? {};
  return {
    id: row.id,
    anchorProductId: row.anchor_product_id,
    anchorProductName: anchorProduct.name ?? row.anchor_product_name ?? '',
    anchorProductSku: anchorProduct.sku ?? row.anchor_product_sku ?? '',
    vehicleModelName: row.vehicle_model_name ?? '',
    vehicleFamily: row.vehicle_family ?? '',
    serviceGroup: row.service_group ?? 'maintenance',
    packageKey: row.package_key ?? '',
    packageName: row.package_name ?? '',
    packageDescription: row.package_description ?? '',
    minAnchorQuantity: Number(row.min_anchor_quantity ?? 1),
    priority: Number(row.priority ?? 100),
    isActive: row.is_active !== false,
    items: (row.recommendation_package_items ?? row.items ?? []).map(mapRecommendationPackageItem),
  };
}

function normalizeFeaturedCatalogItemPayload(payload = {}, actorId = null) {
  const normalizedActorId = normalizeActorId(actorId);
  const id = normalizeOptionalUuid(payload.id);
  return {
    ...(id ? { id } : {}),
    placement_key: normalizeText(payload.placementKey ?? payload.placement_key, 'home_best_sellers', 80) || 'home_best_sellers',
    product_id: assertUuid(payload.productId ?? payload.product_id, 'Choose a valid product for the featured item.'),
    label: normalizeText(payload.label, '', 120) || null,
    badge: normalizeText(payload.badge, '', 80) || null,
    sort_order: normalizeInteger(payload.sortOrder ?? payload.sort_order, 100),
    is_active: normalizeBoolean(payload.isActive ?? payload.is_active, true),
    metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata) ? payload.metadata : {},
    updated_by: normalizedActorId,
    ...(id ? {} : { created_by: normalizedActorId }),
  };
}

function normalizeRecommendationPackagePayload(payload = {}, actorId = null) {
  const normalizedActorId = normalizeActorId(actorId);
  const id = normalizeOptionalUuid(payload.id);
  const packageName = normalizeText(payload.packageName ?? payload.package_name, '', 180);
  const packageKey = normalizeText(payload.packageKey ?? payload.package_key, '', 120)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!packageName || !packageKey) {
    const error = new Error('Package key and package name are required.');
    error.statusCode = 400;
    throw error;
  }

  return {
    ...(id ? { id } : {}),
    anchor_product_id: assertUuid(payload.anchorProductId ?? payload.anchor_product_id, 'Choose a valid anchor product.'),
    vehicle_model_name: normalizeText(payload.vehicleModelName ?? payload.vehicle_model_name, '', 120) || null,
    vehicle_family: normalizeText(payload.vehicleFamily ?? payload.vehicle_family, '', 120) || null,
    service_group: normalizeText(payload.serviceGroup ?? payload.service_group, 'maintenance', 80) || 'maintenance',
    package_key: packageKey,
    package_name: packageName,
    package_description: normalizeText(payload.packageDescription ?? payload.package_description, '', 500) || null,
    min_anchor_quantity: Math.max(1, normalizeInteger(payload.minAnchorQuantity ?? payload.min_anchor_quantity, 1)),
    priority: normalizeInteger(payload.priority, 100),
    is_active: normalizeBoolean(payload.isActive ?? payload.is_active, true),
    metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata) ? payload.metadata : {},
    updated_by: normalizedActorId,
    ...(id ? {} : { created_by: normalizedActorId }),
  };
}

function normalizeRecommendationPackageItemPayload(payload = {}, packageId, actorId = null, index = 0) {
  const normalizedActorId = normalizeActorId(actorId);
  const itemKind = normalizeText(payload.itemKind ?? payload.item_kind, 'product', 20);
  const priceMode = normalizeText(payload.priceMode ?? payload.price_mode, 'catalog', 20);

  if (!ALLOWED_RECOMMENDATION_ITEM_KINDS.has(itemKind)) {
    const error = new Error('Recommendation item must be a product or service.');
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_RECOMMENDATION_PRICE_MODES.has(priceMode)) {
    const error = new Error('Recommendation item has an invalid price mode.');
    error.statusCode = 400;
    throw error;
  }

  const priceOverride = payload.priceOverride ?? payload.price_override;
  const normalizedPriceOverride = priceOverride === null || priceOverride === undefined || priceOverride === ''
    ? null
    : Number(priceOverride);

  return {
    package_id: packageId,
    item_kind: itemKind,
    product_id: itemKind === 'product' ? assertUuid(payload.productId ?? payload.product_id, 'Choose a valid product recommendation item.') : null,
    service_id: itemKind === 'service' ? assertUuid(payload.serviceId ?? payload.service_id, 'Choose a valid service recommendation item.') : null,
    item_role: itemKind === 'service' ? 'service' : 'part',
    reason_label: normalizeText(payload.reasonLabel ?? payload.reason_label, '', 220) || null,
    display_priority: normalizeInteger(payload.displayPriority ?? payload.display_priority, (index + 1) * 10),
    price_mode: priceMode,
    price_override: Number.isFinite(normalizedPriceOverride) ? normalizedPriceOverride : null,
    is_active: normalizeBoolean(payload.isActive ?? payload.is_active, true),
    metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata) ? payload.metadata : {},
    created_by: normalizedActorId,
    updated_by: normalizedActorId,
  };
}

function normalizeNavigationRow(item = {}, index = 0) {
  const label = String(item.label || '').trim() || 'Untitled link';
  const href = String(item.href || '').trim() || '/';
  const status = String(item.status || 'published').trim();
  const groupKey = String(item.groupKey || item.group_key || 'primary').trim();
  const sortOrder = Number.parseInt(item.sortOrder ?? item.sort_order ?? (index + 1) * 10, 10);
  const id = String(item.id || '').trim();

  if (!ALLOWED_NAV_STATUSES.has(status)) {
    const error = new Error(`Navigation link "${label}" has an invalid status.`);
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_NAV_GROUPS.has(groupKey)) {
    const error = new Error(`Navigation link "${label}" has an invalid group.`);
    error.statusCode = 400;
    throw error;
  }

  if (id && !UUID_PATTERN.test(id)) {
    const error = new Error(`Navigation link "${label}" has an invalid saved ID. Remove and add it again.`);
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(sortOrder)) {
    const error = new Error(`Navigation link "${label}" has an invalid order.`);
    error.statusCode = 400;
    throw error;
  }

  return {
    ...(id ? { id } : {}),
    label,
    href,
    group_key: groupKey,
    sort_order: sortOrder,
    is_visible: item.isVisible ?? item.is_visible ?? true,
    opens_new_tab: item.opensNewTab ?? item.opens_new_tab ?? false,
    status,
    metadata: item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) ? item.metadata : {},
  };
}

export async function saveCmsNavigation(payload, actorId) {
  if (!Array.isArray(payload)) {
    const error = new Error('Navigation payload must include a navigation array.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedActorId = normalizeActorId(actorId);
  const nowIso = new Date().toISOString();
  const rows = payload.map((item, index) => ({
    ...normalizeNavigationRow(item, index),
    updated_by: normalizedActorId,
    created_by: normalizedActorId,
    updated_at: nowIso,
  }));

  const { error: archiveError } = await supabaseAdmin
    .schema('cms')
    .from('navigation_links')
    .update({
      status: 'archived',
      updated_by: normalizedActorId,
      updated_at: nowIso,
    })
    .neq('status', 'archived');

  if (archiveError) {
    throw archiveError;
  }

  const existingRows = rows.filter((row) => row.id);
  const newRows = rows.filter((row) => !row.id);

  if (existingRows.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .schema('cms')
      .from('navigation_links')
      .upsert(existingRows, { onConflict: 'id' });

    if (upsertError) {
      throw upsertError;
    }
  }

  if (newRows.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .schema('cms')
      .from('navigation_links')
      .insert(newRows);

    if (insertError) {
      throw insertError;
    }
  }

  return getPublishedCmsSite();
}

export async function listCmsFeaturedCatalogItems() {
  const { data, error } = await supabaseAdmin
    .schema('cms')
    .from('featured_catalog_items')
    .select('id, placement_key, product_id, label, badge, sort_order, is_active')
    .order('placement_key', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    if (isMissingCmsCatalogContentError(error)) {
      console.warn('CMS catalog content tables are not ready yet:', error.message || error);
      return [];
    }
    throw error;
  }

  const productMap = await getCatalogProductsById((data ?? []).map((item) => item.product_id));
  return (data ?? []).map((item) => mapFeaturedCatalogItem({
    ...item,
    product: productMap.get(item.product_id) ?? null,
  }));
}

export async function saveCmsFeaturedCatalogItem(payload, actorId) {
  const row = normalizeFeaturedCatalogItemPayload(payload, actorId);
  const { data, error } = await supabaseAdmin
    .schema('cms')
    .from('featured_catalog_items')
    .upsert(row, { onConflict: row.id ? 'id' : 'placement_key,product_id' })
    .select('id, placement_key, product_id, label, badge, sort_order, is_active')
    .single();

  if (error) {
    throw error;
  }

  const productMap = await getCatalogProductsById([data.product_id]);
  return mapFeaturedCatalogItem({
    ...data,
    product: productMap.get(data.product_id) ?? null,
  });
}

export async function deleteCmsFeaturedCatalogItem(id) {
  const itemId = assertUuid(id, 'Featured item is required.');
  const { error } = await supabaseAdmin
    .schema('cms')
    .from('featured_catalog_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    throw error;
  }
}

export async function listCmsRecommendationPackages() {
  const { data: packageRows, error } = await supabaseAdmin
    .schema('cms')
    .from('recommendation_packages')
    .select('id, anchor_product_id, vehicle_model_name, vehicle_family, service_group, package_key, package_name, package_description, min_anchor_quantity, priority, is_active')
    .order('priority', { ascending: true });

  if (error) {
    if (isMissingCmsCatalogContentError(error)) {
      console.warn('CMS recommendation package tables are not ready yet:', error.message || error);
      return [];
    }
    throw error;
  }

  const packageIds = (packageRows ?? []).map((item) => item.id);
  const { data: itemRows, error: itemError } = packageIds.length
    ? await supabaseAdmin
      .schema('cms')
      .from('recommendation_package_items')
      .select('id, package_id, item_kind, product_id, service_id, reason_label, display_priority, price_mode, price_override, is_active')
      .in('package_id', packageIds)
      .order('display_priority', { ascending: true })
    : { data: [], error: null };

  if (itemError) {
    if (isMissingCmsCatalogContentError(itemError)) {
      console.warn('CMS recommendation package item table is not ready yet:', itemError.message || itemError);
      return (packageRows ?? []).map(mapRecommendationPackage);
    }
    throw itemError;
  }

  const productMap = await getCatalogProductsById([
    ...(packageRows ?? []).map((item) => item.anchor_product_id),
    ...(itemRows ?? []).map((item) => item.product_id),
  ]);
  const serviceMap = await getServicesById((itemRows ?? []).map((item) => item.service_id));
  const itemsByPackageId = (itemRows ?? []).reduce((map, item) => {
    const nextItems = map.get(item.package_id) ?? [];
    nextItems.push({
      ...item,
      product: productMap.get(item.product_id) ?? null,
      service: serviceMap.get(item.service_id) ?? null,
    });
    map.set(item.package_id, nextItems);
    return map;
  }, new Map());

  return (packageRows ?? []).map((item) => mapRecommendationPackage({
    ...item,
    anchor_product: productMap.get(item.anchor_product_id) ?? null,
    items: itemsByPackageId.get(item.id) ?? [],
  }));
}

export async function saveCmsRecommendationPackage(payload, actorId) {
  const packageRow = normalizeRecommendationPackagePayload(payload, actorId);
  const { data: savedPackage, error: packageError } = await supabaseAdmin
    .schema('cms')
    .from('recommendation_packages')
    .upsert(packageRow, { onConflict: packageRow.id ? 'id' : 'package_key' })
    .select('id')
    .single();

  if (packageError) {
    throw packageError;
  }

  const packageId = savedPackage.id;
  const { error: deleteItemsError } = await supabaseAdmin
    .schema('cms')
    .from('recommendation_package_items')
    .delete()
    .eq('package_id', packageId);

  if (deleteItemsError) {
    throw deleteItemsError;
  }

  const itemRows = (Array.isArray(payload.items) ? payload.items : [])
    .filter((item) => item?.isActive !== false)
    .map((item, index) => normalizeRecommendationPackageItemPayload(item, packageId, actorId, index));

  if (itemRows.length > 0) {
    const { error: insertItemsError } = await supabaseAdmin
      .schema('cms')
      .from('recommendation_package_items')
      .insert(itemRows);

    if (insertItemsError) {
      throw insertItemsError;
    }
  }

  const packages = await listCmsRecommendationPackages();
  return packages.find((item) => item.id === packageId) ?? null;
}

export async function deleteCmsRecommendationPackage(id) {
  const packageId = assertUuid(id, 'Recommendation package is required.');
  const { error } = await supabaseAdmin
    .schema('cms')
    .from('recommendation_packages')
    .delete()
    .eq('id', packageId);

  if (error) {
    throw error;
  }
}

export async function getPublishedFeaturedCatalogItems(placementKey) {
  try {
    const rows = await callRpc('get_featured_catalog_items', {
      p_placement_key: placementKey,
    });
    return (Array.isArray(rows) ? rows : []).map(mapFeaturedCatalogItem);
  } catch (error) {
    if (isMissingCmsCatalogContentError(error)) {
      console.warn('Published featured catalog RPC is not ready yet:', error.message || error);
      return [];
    }
    throw error;
  }
}
