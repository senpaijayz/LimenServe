import { supabaseAdmin } from '../config/supabase.js';
import { loadManagedPackageReferences } from './managedPackageService.js';
import { managedPackageMatchesVehicle, PACKAGE_TYPES, packageError } from './managedPackageDomain.js';
import { pricePublishedManagedVariant } from './publishedManagedPackagePricing.js';
export { pricePublishedManagedVariant };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const comparable = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const resultRows = ({ data, error }) => { if (error) throw error; return data || []; };
function idList(value, name, maximum = 40) {
  const values = typeof value === 'string' ? value.split(',').filter(Boolean) : value ?? [];
  if (!Array.isArray(values) || values.length > maximum || values.some((id) => typeof id !== 'string' || !UUID.test(id))) {
    throw packageError(`${name} must contain at most ${maximum} saved identifiers.`);
  }
  return [...new Set(values.map((id) => id.toLowerCase()))];
}
function boundedText(value, name) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) throw packageError(`${name} is invalid.`);
  return value.trim();
}

export async function listPackageVehicleConfigurations(query = {}) {
  const model = boundedText(query.model, 'Vehicle model');
  const year = typeof query.year === 'string' || typeof query.year === 'number' ? Number(query.year) : NaN;
  if (!model || !Number.isSafeInteger(year) || year < 1900 || year > 2200) throw packageError('Choose a model and year before selecting an engine.');
  const rows = resultRows(await supabaseAdmin.schema('catalog').from('public_vehicle_fitments')
    .select('id,model_name,year,engine,vehicle_family').eq('is_active', true).eq('model_name', model).eq('year', year)
    .order('engine').order('id').limit(201));
  if (rows.length > 200) throw packageError('This model has too many recorded configurations. Please contact the shop to confirm the engine.');
  return rows.map((row) => ({ id: row.id, model: row.model_name, year: row.year, engine: row.engine || '', family: row.vehicle_family || '' }));
}

export async function resolveManagedPackageContext(input = {}, { maximumItems = 100 } = {}) {
  const productIds = idList(input.productIds, 'Selected parts', maximumItems);
  const serviceIds = idList(input.serviceIds, 'Selected services', maximumItems);
  const model = boundedText(input.vehicleModel ?? input.model, 'Vehicle model');
  const engine = boundedText(input.vehicleEngine ?? input.engine, 'Vehicle engine');
  const variant = boundedText(input.vehicleVariant ?? input.variant, 'Vehicle variant');
  const make = boundedText(input.vehicleMake ?? input.make, 'Vehicle make');
  const rawYear = input.vehicleYear ?? input.year;
  if (rawYear != null && typeof rawYear !== 'number' && typeof rawYear !== 'string') throw packageError('Choose a valid vehicle year.');
  const year = rawYear == null || rawYear === '' ? null : Number(rawYear);
  if (year !== null && (!Number.isSafeInteger(year) || year < 1900 || year > 2200)) throw packageError('Choose a valid vehicle year.');
  const fitmentId = input.fitmentId ? idList([input.fitmentId], 'Vehicle configuration')[0] : null;
  if (!model && (year !== null || engine) && !fitmentId) throw packageError('Choose the vehicle model before its year or engine.');
  const fitmentRequest = supabaseAdmin.schema('catalog').from('public_vehicle_fitments')
    .select('id,model_name,year,engine,vehicle_family').eq('is_active', true);
  if (fitmentId) fitmentRequest.eq('id', fitmentId);
  else if (model) fitmentRequest.eq('model_name', model);
  if (year !== null) fitmentRequest.eq('year', year);
  if (engine) fitmentRequest.eq('engine', engine);
  const [products, services, fitments] = await Promise.all([
    productIds.length ? supabaseAdmin.schema('catalog').from('products').select('id,category,is_active,status').in('id', productIds).then(resultRows) : [],
    serviceIds.length ? supabaseAdmin.schema('operations').from('services').select('id,is_active').in('id', serviceIds).then(resultRows) : [],
    model || fitmentId ? fitmentRequest.limit(1001).then(resultRows) : [],
  ]);
  if (products.length !== productIds.length || products.some((row) => !row.is_active || row.status === 'discontinued')) throw packageError('A selected part is no longer available.');
  if (services.length !== serviceIds.length || services.some((row) => !row.is_active)) throw packageError('A selected service is no longer available.');
  if ((model || fitmentId) && (!fitments.length || fitments.length > 1000)) throw packageError('Choose an active recorded vehicle configuration.');
  if (fitmentId && model && comparable(fitments[0].model_name) !== comparable(model)) throw packageError('The selected vehicle and configuration do not match.');
  // A model/year alone is not the customer's confirmation of an engine.
  // Only an explicitly selected configuration or engine can yield an exact ID.
  const exact = fitments.length === 1 && (fitmentId || (year !== null && engine)) ? fitments[0] : null;
  const families = [...new Set(fitments.map((row) => row.vehicle_family).filter(Boolean))];
  return {
    productIds, serviceIds,
    categories: [...new Set(products.map((row) => comparable(row.category)).filter(Boolean))],
    productCategories: Object.fromEntries(products.map((row) => [row.id, comparable(row.category)])),
    vehicle: { model: exact?.model_name || model, year: exact?.year ?? year,
      engine: exact?.engine || engine, fitmentId: exact?.id || fitmentId,
      family: families.length === 1 && fitments.every((row) => row.vehicle_family) ? families[0] : '', make, variant },
  };
}

export function managedPackageMatchesContext(definition, variant, context) {
  if (!variant?.active) return false;
  if (definition.anchorProductId && !context.productIds.includes(definition.anchorProductId)) return false;
  if (definition.anchorCategory && !context.categories.includes(comparable(definition.anchorCategory))) return false;
  if (definition.triggerServiceId && !context.serviceIds.includes(definition.triggerServiceId)) return false;
  return managedPackageMatchesVehicle(variant.eligibility.length ? variant.eligibility : definition.eligibility, context.vehicle);
}

function publicRule(rule) {
  // Evidence and internal review notes belong to CMS, not the public response.
  return { mode: rule.mode, verified: rule.verified === true, model: rule.model, family: rule.family, engine: rule.engine,
    make: rule.make, variant: rule.variant, yearFrom: rule.yearFrom, yearTo: rule.yearTo };
}
export function publicManagedPackageDefinition(definition) {
  return {
    id: definition.id, packageKey: definition.packageKey, name: definition.name,
    description: definition.description, type: definition.type, imageUrl: definition.imageUrl,
    category: definition.category, minAnchorQuantity: definition.minAnchorQuantity,
    anchorProductId: definition.anchorProductId, anchorCategory: definition.anchorCategory, triggerServiceId: definition.triggerServiceId,
    eligibility: definition.eligibility.map(publicRule),
    variants: definition.variants.map((variant) => ({ id: variant.id, key: variant.key,
      label: variant.label, description: variant.description, active: variant.active,
      eligibility: (variant.eligibility.length ? variant.eligibility : definition.eligibility).map(publicRule) })),
  };
}

function presentPublication(publication, references, context) {
  const definition = { ...publication.definition, variants: publication.definition.variants.filter((variant) => managedPackageMatchesContext(publication.definition, variant, context)) };
  const prices = definition.variants.map((variant) => {
    try { return pricePublishedManagedVariant(publication, variant, references); }
    catch (error) {
      if (!error.statusCode) throw error;
      return { variantId: variant.id, label: variant.label, valid: false, error: error.publicMessage };
    }
  });
  return { revisionId: publication.revisionId, revisionNumber: publication.revisionNumber, definition: publicManagedPackageDefinition(definition), prices };
}

export async function getPublishedManagedPackage(packageId, query = {}) {
  if (typeof packageId !== 'string' || !UUID.test(packageId)) throw packageError('Choose a valid published package.');
  const context = await resolveManagedPackageContext(query);
  const { data: root, error: rootError } = await supabaseAdmin.schema('cms').from('recommendation_packages')
    .select('id,published_revision_id').eq('id', packageId).eq('publication_status', 'published').maybeSingle();
  if (rootError) throw rootError;
  if (!root?.published_revision_id) throw packageError('This package is no longer available for a new price. Your saved quotation has not changed.', 404, 'PACKAGE_NOT_AVAILABLE');
  const { data: revision, error } = await supabaseAdmin.schema('cms').from('package_revisions')
    .select('id,revision_number,definition,pricing_snapshot').eq('id', root.published_revision_id).eq('package_id', root.id).single();
  if (error) throw error;
  const publication = { revisionId: revision.id, revisionNumber: revision.revision_number, definition: revision.definition, pricingSnapshot: revision.pricing_snapshot };
  const references = await loadManagedPackageReferences(publication.definition);
  const presented = presentPublication(publication, references, context);
  if (!presented.definition.variants.length) throw packageError('This package no longer matches the selected vehicle, parts, or services. Your saved quotation has not changed.', 409, 'PACKAGE_NOT_ELIGIBLE');
  return presented;
}

export async function listPublishedManagedPackages(query = {}) {
  if (query.packageId) {
    const publication = await getPublishedManagedPackage(query.packageId, query);
    return { packages: [publication], pagination: { page: 1, pageSize: 1, totalCount: 1, totalPages: 1 } };
  }
  const page = Number(query.page ?? 1); const pageSize = Number(query.pageSize ?? 6);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 12) throw packageError('Choose a valid package page of at most 12 offers.');
  if (query.type && !PACKAGE_TYPES.includes(query.type)) throw packageError('Choose a valid package type.');
  const context = await resolveManagedPackageContext(query);
  const { data, error } = await supabaseAdmin.schema('cms').rpc('published_managed_package_page', {
    p_vehicle: context.vehicle, p_product_ids: context.productIds, p_categories: context.categories,
    p_service_ids: context.serviceIds, p_type: query.type || null, p_page: page, p_page_size: pageSize,
  });
  if (error) throw error;
  const publications = data?.packages || [];
  const references = publications.length ? await loadManagedPackageReferences(publications.map((row) => row.definition)) : { products: new Map(), services: new Map() };
  const packages = publications.map((publication) => presentPublication(publication, references, context))
    .filter((publication) => publication.definition.variants.length);
  const totalCount = Number(data?.pagination?.totalCount || 0);
  return { packages, pagination: { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) } };
}
