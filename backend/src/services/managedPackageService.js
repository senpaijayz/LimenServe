import { supabaseAdmin } from '../config/supabase.js';
import { selectByInChunks } from '../utils/supabaseBatchSelect.js';
import {
  assertManagedPackagePublishable,
  PACKAGE_STATUSES,
  PACKAGE_TYPES,
  normalizeManagedPackageDraft,
  packageError,
  packageMoneyToCents,
  priceManagedPackageVariant,
} from './managedPackageDomain.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requireId = (id) => {
  if (typeof id !== 'string' || !UUID.test(id)) throw packageError('Choose a valid saved package.');
  return id;
};

function paginationInput(query = {}, maximum = 40) {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 12);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > maximum) {
    throw packageError(`Choose a valid page and a page size of at most ${maximum}.`);
  }
  const search = String(query.search ?? '').trim();
  if (search.length > 120) throw packageError('Search must be 120 characters or fewer.');
  return { page, pageSize, search };
}

function completePagination(pagination = {}) {
  const totalCount = Number(pagination.totalCount ?? 0);
  const pageSize = Number(pagination.pageSize ?? 12);
  return { ...pagination, totalCount, pageSize, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) };
}

async function cmsRpc(name, args) {
  const { data, error } = await supabaseAdmin.schema('cms').rpc(name, args);
  if (error) {
    if (error.code === '40001') throw packageError('This package changed in another session. Reload it before saving.', 409, 'PACKAGE_CONFLICT');
    if (error.code === '23505') throw packageError('This package key or item is already in use. Choose a unique key and remove duplicate items.', 409, 'PACKAGE_DUPLICATE');
    if (error.code === '23503') throw packageError('A selected product, service, or vehicle is no longer available. Review the package before saving.', 409, 'PACKAGE_REFERENCE');
    if (error.code === '42501') throw packageError('An active administrator is required.', 403, 'PACKAGE_FORBIDDEN');
    if (error.code === '22023' || error.code === '23514') throw packageError(error.message || 'Review the package values.');
    throw error;
  }
  return data;
}

async function selectReferences(schema, table, columns, column, ids, apply) {
  const { data, error } = await selectByInChunks({
    client: supabaseAdmin, schema, table, select: columns, column, values: ids, chunkSize: 75, apply,
  });
  if (error) throw error;
  return data ?? [];
}

export async function loadManagedPackageReferences(definitions) {
  const rows = Array.isArray(definitions) ? definitions : [definitions];
  const items = rows.flatMap((definition) => definition.variants.flatMap((variant) => variant.items));
  const productIds = [...new Set([...items.map((item) => item.productId), ...rows.map((row) => row.anchorProductId)].filter(Boolean))];
  const serviceIds = [...new Set([...items.map((item) => item.serviceId), ...rows.map((row) => row.triggerServiceId)].filter(Boolean))];
  const [products, prices, balances, services] = await Promise.all([
    selectReferences('catalog', 'products', 'id,sku,name,model_name,brand,category,status,is_active', 'id', productIds),
    selectReferences('catalog', 'product_prices', 'product_id,amount,currency,effective_from,created_at', 'product_id', productIds,
      (query) => query.eq('price_type', 'retail').eq('is_current', true).eq('currency', 'PHP').order('effective_from', { ascending: false }).order('created_at', { ascending: false })),
    selectReferences('catalog', 'inventory_balances', 'product_id,on_hand', 'product_id', productIds),
    selectReferences('operations', 'services', 'id,code,name,description,standard_price,estimated_duration_minutes,is_active', 'id', serviceIds),
  ]);
  const latestPrices = new Map();
  for (const price of prices) if (!latestPrices.has(price.product_id)) latestPrices.set(price.product_id, price.amount);
  const stock = new Map(balances.map((balance) => [balance.product_id, balance.on_hand]));
  return {
    products: new Map(products.map((product) => [product.id, {
      ...product, price: latestPrices.get(product.id) ?? null, stock: stock.get(product.id) ?? null,
    }])),
    services: new Map(services.map((service) => [service.id, { ...service, price: service.standard_price }])),
  };
}

export async function getManagedPackage(packageId) {
  const definition = await cmsRpc('managed_package_definition', { p_package_id: requireId(packageId) });
  if (!definition) throw packageError('This package was not found.', 404, 'PACKAGE_NOT_FOUND');
  const { data, error } = await supabaseAdmin.schema('cms').from('recommendation_packages')
    .select('publication_status,published_revision_id,published_at,source_kind,seed_key,seed_customized,updated_at')
    .eq('id', packageId).single();
  if (error) throw error;
  const references = await loadManagedPackageReferences(definition);
  return { ...definition, ...data, variants: definition.variants.map((variant) => ({ ...variant, items: variant.items.map((item) => {
    const source = (item.kind === 'product' ? references.products : references.services).get(item.productId || item.serviceId);
    return { ...item, display: source ? { name: source.name, sku: source.sku || source.code, price: source.price, model: source.model_name, category: source.category, stock: source.stock, isActive: source.is_active } : null };
  }) })) };
}

export async function previewManagedPackage(input) {
  const definition = normalizeManagedPackageDraft(input);
  const references = await loadManagedPackageReferences(definition);
  const variants = definition.variants.map((variant) => {
    try { return { ...priceManagedPackageVariant(variant, references), valid: true }; }
    catch (error) {
      if (!error.statusCode) throw error;
      return { variantId: variant.id, label: variant.label, valid: false, error: error.publicMessage };
    }
  });
  let publicationError = null;
  try {
    assertManagedPackagePublishable(definition, references);
    await validateManagedPackageVehicleSources(definition);
  } catch (error) {
    if (!error.statusCode) throw error;
    publicationError = error.publicMessage;
  }
  return { definition, variants, publishable: !publicationError, publicationError };
}

export async function validateManagedPackageVehicleSources(definition) {
  const rules = [...definition.eligibility, ...definition.variants.flatMap((variant) => variant.eligibility)];
  const verified = rules.filter((rule) => rule.verified && rule.mode !== 'universal' && rule.mode !== 'unverified');
  if (!verified.length) return;
  const { data: fitments, error } = await supabaseAdmin.schema('catalog').from('public_vehicle_fitments')
    .select('id,model_name,vehicle_family,year,engine,is_active').eq('is_active', true).limit(1000);
  if (error) throw error;
  const equal = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  for (const rule of verified) {
    const supported = (fitments || []).filter((fitment) => {
      if (rule.engine && !equal(rule.engine, fitment.engine)) return false;
      if (rule.yearFrom != null && fitment.year < rule.yearFrom) return false;
      if (rule.yearTo != null && fitment.year > rule.yearTo) return false;
      if (rule.mode === 'exact') return fitment.id === rule.fitmentId;
      if (rule.mode === 'model_year') return equal(rule.model, fitment.model_name);
      return equal(rule.family, fitment.vehicle_family);
    });
    if (!supported.length) throw packageError('A compatibility rule does not match an active vehicle configuration. Keep it unverified until reviewed.');
    if (rule.mode === 'model_year') {
      const supportedYears = new Set(supported.map((row) => row.year));
      for (let year = rule.yearFrom; year <= rule.yearTo; year += 1) {
        if (!supportedYears.has(year)) throw packageError(`The selected vehicle source does not support year ${year}. Use the verified range only.`);
      }
    }
    // The selector proves that a configuration exists, not product fitment.
    // Product compatibility still requires the separately reviewed evidence.
  }
}

export async function saveManagedPackage(input, actorId, { sourceKind = 'manual', seedKey = null, sourceRecords = [], reviewNotes = '' } = {}) {
  const definition = normalizeManagedPackageDraft(input);
  return cmsRpc('save_managed_package', {
    p_definition: definition, p_actor_id: actorId, p_expected_revision: definition.expectedRevision,
    p_source_kind: sourceKind, p_seed_key: seedKey,
    p_source_records: sourceRecords, p_review_notes: reviewNotes,
  });
}

export async function publishManagedPackage(packageId, expectedRevision, actorId) {
  const definition = await getManagedPackage(packageId);
  if (definition.expectedRevision !== expectedRevision) throw packageError('This package changed. Reload it before publishing.', 409, 'PACKAGE_CONFLICT');
  const normalized = normalizeManagedPackageDraft(definition);
  const references = await loadManagedPackageReferences(normalized);
  await validateManagedPackageVehicleSources(normalized);
  const prices = assertManagedPackagePublishable(normalized, references);
  const revisionId = await cmsRpc('publish_managed_package', {
    p_package_id: packageId, p_expected_revision: expectedRevision, p_actor_id: actorId, p_pricing_snapshot: prices,
  });
  // The transaction confirms this exact reviewed revision. A later detail
  // fetch could fail (or return somebody else's newer draft) after publication
  // already committed, misleading the editor into reporting a failed publish.
  return { revisionId, package: {
    ...definition, publication_status: 'published', published_revision_id: revisionId,
  } };
}

export async function transitionManagedPackage(packageId, expectedRevision, actorId, action) {
  if (!['unpublish', 'archive', 'restore'].includes(action)) throw packageError('Choose a supported package action.');
  return cmsRpc('transition_managed_package', {
    p_package_id: requireId(packageId), p_expected_revision: expectedRevision, p_actor_id: actorId, p_action: action,
  });
}

export async function duplicateManagedPackage(packageId, actorId) {
  const source = await getManagedPackage(packageId);
  const copy = structuredClone(source);
  delete copy.id;
  copy.expectedRevision = 0;
  copy.name = `${source.name.slice(0, 170)} (copy)`;
  copy.packageKey = `${source.packageKey.slice(0, 95)}-copy-${Date.now().toString(36)}`;
  copy.eligibility.forEach((rule) => { delete rule.id; });
  copy.variants.forEach((variant) => {
    delete variant.id;
    variant.eligibility.forEach((rule) => { delete rule.id; });
    variant.items.forEach((item) => { delete item.id; });
  });
  // Copies are always new drafts; no publication pointer or seed ownership is
  // accepted by the draft normalizer.
  return saveManagedPackage(copy, actorId);
}

export async function listManagedPackages(query = {}) {
  const { page, pageSize, search } = paginationInput(query, 20);
  if (query.type && !PACKAGE_TYPES.includes(query.type)) throw packageError('Choose a valid package type.');
  if (query.status && !PACKAGE_STATUSES.includes(query.status)) throw packageError('Choose a valid publication status.');
  const result = await cmsRpc('managed_package_page', {
    p_search: search, p_type: query.type || null, p_status: query.status || null, p_page: page, p_page_size: pageSize,
  });
  const definitions = result?.packages || [];
  const publicationIds = definitions.map((definition) => definition.published_revision_id).filter(Boolean);
  const revisions = await selectReferences('cms', 'package_revisions', 'id,revision_number,definition,pricing_snapshot', 'id', publicationIds);
  const revisionMap = new Map(revisions.map((revision) => [revision.id, revision]));
  const visibleDefinition = (definition) => definition.publication_status === 'published' ? revisionMap.get(definition.published_revision_id)?.definition || definition : definition;
  const references = definitions.length ? await loadManagedPackageReferences(definitions.map(visibleDefinition)) : { products: new Map(), services: new Map() };
  const packages = definitions.map((definition) => {
    const revision = revisionMap.get(definition.published_revision_id);
    const displayDefinition = visibleDefinition(definition);
    const variants = displayDefinition.variants.filter((variant) => variant.active);
    const summaries = variants.map((variant) => {
      try {
        const approved = revision?.pricing_snapshot?.find((value) => value.variantId === variant.id);
        const publishedBasePrices = approved ? Object.fromEntries(approved.lines.map((line) => [line.itemId, line.catalogUnitPrice])) : null;
        const preview = priceManagedPackageVariant(variant, references, { publishedBasePrices });
        return { variantId: variant.id, label: variant.label, catalogTotal: preview.catalogTotal, packageTotal: preview.packageTotal, savings: preview.savings, availability: preview.availability };
      } catch (error) {
        if (!error.statusCode) throw error;
        return { variantId: variant.id, label: variant.label, error: error.publicMessage };
      }
    });
    return {
      id: definition.id, packageKey: definition.packageKey, name: definition.name, type: definition.type,
      description: definition.description, imageUrl: definition.imageUrl,
      status: definition.publication_status, expectedRevision: definition.expectedRevision,
      publishedRevisionId: definition.published_revision_id, updatedAt: definition.updated_at,
      publishedName: revision?.definition.name || null, publishedRevisionNumber: revision?.revision_number || null,
      hasUnpublishedChanges: Boolean(revision && revision.revision_number !== definition.expectedRevision),
      sourceKind: definition.source_kind, seedCustomized: definition.seed_customized,
      itemCount: variants.reduce((count, variant) => count + variant.items.filter((item) => item.active).length, 0),
      eligibility: [...displayDefinition.eligibility, ...variants.flatMap((variant) => variant.eligibility)],
      variants: summaries,
    };
  });
  return { packages, pagination: completePagination(result?.pagination) };
}

export async function searchManagedPackageProducts(query) {
  const { page, pageSize, search } = paginationInput(query);
  const result = await cmsRpc('search_package_products', { p_search: search, p_page: page, p_page_size: pageSize });
  return { products: result?.products || [], pagination: completePagination(result?.pagination) };
}

// PostgREST OR expressions are constructed only from a restricted plain-text
// search term, never from raw punctuation/control characters supplied by users.
function simpleSearch(value) {
  return String(value || '').replace(/[^\p{L}\p{N}\s_-]/gu, ' ').trim().slice(0, 120);
}

export async function searchManagedPackageServices(query = {}) {
  const { page, pageSize, search } = paginationInput(query);
  let request = supabaseAdmin.schema('operations').from('services')
    .select('id,code,name,description,category,standard_price,estimated_duration_minutes,is_active', { count: 'exact' });
  const term = simpleSearch(search);
  if (term) request = request.or(`code.ilike.%${term}%,name.ilike.%${term}%,category.ilike.%${term}%`);
  request = request.order('name').order('id').range((page - 1) * pageSize, page * pageSize - 1);
  const { data, error, count } = await request;
  if (error) throw error;
  return { services: data || [], pagination: completePagination({ page, pageSize, totalCount: count }) };
}

export async function createManagedPackageService(input, actorId) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw packageError('Enter valid service details.');
  const code = String(input.code || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const description = String(input.description || '').trim();
  const category = String(input.category || '').trim();
  const durationMinutes = Number(input.durationMinutes);
  if (!/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(code) || !name || name.length > 180 || description.length > 2000 || category.length > 100
    || !Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) throw packageError('Enter a valid service code, name, description, category, and duration.');
  const price = packageMoneyToCents(input.price, 'Service price') / 100;
  return cmsRpc('save_package_service', { p_service: { code, name, description, category, durationMinutes, price }, p_actor_id: actorId });
}

export async function searchManagedPackageVehicles(query = {}) {
  const { page, pageSize, search } = paginationInput(query);
  let request = supabaseAdmin.schema('catalog').from('public_vehicle_fitments')
    .select('id,model_name,vehicle_family,year,engine', { count: 'exact' }).eq('is_active', true);
  const term = simpleSearch(search);
  if (term) request = request.or(`model_name.ilike.%${term}%,vehicle_family.ilike.%${term}%,engine.ilike.%${term}%`);
  const { data, error, count } = await request.order('model_name').order('year', { ascending: false }).order('engine').order('id')
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return {
    vehicles: (data || []).map((row) => ({ ...row, make: null, variant: null })),
    pagination: completePagination({ page, pageSize, totalCount: count }),
    sourceNote: 'Vehicle choices identify recorded configurations. They do not, by themselves, verify that a selected part fits. Make and variant are not recorded in this source.',
  };
}

export async function getManagedPackageHistory(packageId, query = {}) {
  const { page, pageSize } = paginationInput(query, 40);
  const { data, error, count } = await supabaseAdmin.schema('cms').from('package_activity')
    .select('id,action,draft_revision,actor_id,details,created_at', { count: 'exact' })
    .eq('package_id', requireId(packageId)).order('created_at', { ascending: false }).order('id')
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return { history: data || [], pagination: completePagination({ page, pageSize, totalCount: count }) };
}
