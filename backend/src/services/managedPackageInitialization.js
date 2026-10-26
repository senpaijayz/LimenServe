import { createHash } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { normalizeManagedPackageDraft, packageError, priceManagedPackageVariant } from './managedPackageDomain.js';
import { loadManagedPackageReferences, previewManagedPackage, saveManagedPackage } from './managedPackageService.js';

// Stable identities are derived from source identities, never display labels or
// mutable prices. Initialization does not update an existing package, including
// an archived one. The database provenance uniqueness is the final race guard.
function stableId(value) {
  const hash = createHash('sha256').update(`limen-managed-package-v1:${value}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
const sorted = (values) => [...new Set(values.filter(Boolean))].sort();
const checked = ({ data, error }) => { if (error) throw error; return data || []; };
const sourceRecord = (table, key, record) => ({ table, key, record });
const vehicleScope = (row) => JSON.stringify([
  String(row.vehicle_model_name || '').trim().toLowerCase(),
  String(row.vehicle_family || '').trim().toLowerCase(),
]);

function candidateDefinition(key, name, description, items, fields = {}) {
  return normalizeManagedPackageDraft({
    id: stableId(key), packageKey: key, name: name.slice(0, 180), description: description.slice(0, 2000),
    type: items.every((item) => item.kind === 'service') ? 'service'
      : items.every((item) => item.kind === 'product') && items.length > 1 ? 'parts'
        : items.some((item) => item.kind === 'service') ? 'combination' : 'custom',
    expectedRevision: 0, ...fields,
    eligibility: [{ id: stableId(`${key}:eligibility`), mode: 'unverified', verified: false,
      evidence: 'Source relationships were imported for review. Vehicle compatibility has not been approved.' }],
    variants: [{ id: stableId(`${key}:complete`), key: 'complete', label: 'Complete package', active: true,
      pricing: { mode: 'catalog', strategy: 'live', value: 0 }, eligibility: [],
      items: items.map((item, index) => ({ ...item, id: stableId(`${key}:${item.kind}:${item.productId || item.serviceId}`),
        quantity: 1, displayOrder: index, required: true, active: true, priceMode: 'catalog' })) }],
  });
}

async function discoverCandidates() {
  const [ruleResult, groupResult, serviceResult, exampleResult, ownershipResult] = await Promise.all([
    supabaseAdmin.schema('reco').from('quote_recommendation_rules').select('*').order('id').limit(401),
    supabaseAdmin.schema('reco').from('service_recommendation_groups').select('*').order('service_group').order('service_id').limit(401),
    supabaseAdmin.schema('operations').from('services')
      .select('id,code,name,description,standard_price,is_active').order('id').limit(1001),
    // This SKU is the explicitly requested real-catalog demonstration, not a
    // permanent package definition. Its price and identity come from the DB.
    supabaseAdmin.schema('catalog').from('products').select('id,sku,name,is_active').eq('sku', '1100A197').limit(2),
    supabaseAdmin.schema('cms').from('package_seed_sources').select('source_key,package_id,source_records').limit(1001),
  ]);
  const rules = checked(ruleResult); const groups = checked(groupResult);
  const services = checked(serviceResult); const example = checked(exampleResult);
  const ownership = checked(ownershipResult);
  if (rules.length > 400 || groups.length > 400 || services.length > 1000 || ownership.length > 1000) {
    throw packageError('Starter discovery exceeds the safe review limit. Review source coverage before initializing.', 409);
  }
  const serviceMap = new Map(services.map((service) => [service.id, service]));
  const owned = new Map(ownership.map((row) => [row.source_key, row.package_id]));
  const ownedSources = new Map(ownership.flatMap((row) => (row.source_records || [])
    .filter((source) => source.table && source.key)
    .map((source) => [`${source.table}:${source.key}`, row.package_id])));
  const legacyGroups = new Map();
  for (const rule of rules) {
    const key = rule.package_key || rule.id;
    if (!legacyGroups.has(key)) legacyGroups.set(key, []);
    legacyGroups.get(key).push(rule);
  }
  const candidates = []; const signatures = new Map();
  for (const rows of legacyGroups.values()) {
    // Preserve the entire legacy meaning. Inconsistent triggers stay outside
    // the migration rather than being broadened to an arbitrary SKU/vehicle.
    const triggerOf = (row) => JSON.stringify([row.anchor_type, row.anchor_product_id,
      row.anchor_category, row.vehicle_model_name, row.vehicle_family, row.service_group]);
    if (new Set(rows.map(triggerOf)).size !== 1) continue;
    const first = rows[0];
    if (!['category', 'product'].includes(first.anchor_type)) continue;
    const products = sorted(rows.map((row) => row.related_product_id));
    const serviceIds = sorted(rows.map((row) => row.related_service_id));
    if (!products.length && !serviceIds.length) continue;
    const signature = JSON.stringify([triggerOf(first), products, serviceIds]);
    const sources = rows.map((row) => sourceRecord('reco.quote_recommendation_rules', row.id, row));
    // Equivalent oil rules, for example, retain both original identities but
    // produce a single editable offer and migration map.
    if (signatures.has(signature)) {
      signatures.get(signature).sourceRecords.push(...sources);
      continue;
    }
    const key = `legacy-${fingerprint(sorted(rows.map((row) => row.id)))}`;
    const definition = candidateDefinition(key, first.package_name || serviceIds.map((id) => serviceMap.get(id)?.name || id).join(' + '),
      first.package_description || '', [
        ...products.map((productId) => ({ kind: 'product', productId })),
        ...serviceIds.map((serviceId) => ({ kind: 'service', serviceId })),
      ], { anchorProductId: first.anchor_product_id, anchorCategory: first.anchor_category || '',
        serviceGroup: first.service_group || '', priority: Math.max(0, first.priority || 100),
        internalNotes: 'Imported legacy recommendation. Review the actual included services, overlapping labor, and vehicle eligibility before publication.' });
    const candidate = { key, definition, sourceKind: 'legacy', sourceRecords: sources, vehicleScope: vehicleScope(first),
      reviewNotes: `Preserves ${first.anchor_type === 'category' ? `the ${first.anchor_category} category trigger` : 'the recorded product trigger'}. Original rules remain intact. Compatibility and labor scope require administrator review.`,
      sourceActive: rows.every((row) => row.is_active === true) };
    signatures.set(signature, candidate); candidates.push(candidate);
  }

  const grouped = new Map();
  for (const group of groups.filter((row) => row.is_active)) {
    const signature = JSON.stringify([group.service_group, vehicleScope(group)]);
    if (!grouped.has(signature)) grouped.set(signature, []);
    grouped.get(signature).push(group);
  }
  for (const rows of grouped.values()) {
    const serviceIds = sorted(rows.map((row) => row.service_id));
    const sources = rows.map((row) => sourceRecord('reco.service_recommendation_groups',
      JSON.stringify([row.service_group, row.service_id, row.vehicle_model_name, row.vehicle_family]), row));
    const existing = candidates.find((candidate) => {
      const items = candidate.definition.variants[0].items;
      return candidate.vehicleScope === vehicleScope(rows[0]) && items.every((item) => item.kind === 'service')
        && JSON.stringify(sorted(items.map((item) => item.serviceId))) === JSON.stringify(serviceIds);
    });
    if (existing) { existing.sourceRecords.push(...sources); continue; }
    // A group records alternatives as well as companions. Do not combine all
    // brake labor blindly: one overhaul can already include installation and
    // cleaning. Single-service candidates are safe to review, not auto-promoted.
    for (const serviceId of serviceIds) {
      const serviceSources = sources.filter((source) => source.record.service_id === serviceId);
      const single = candidates.find((candidate) => candidate.vehicleScope === vehicleScope(rows[0])
        && candidate.definition.variants[0].items.length === 1
        && candidate.definition.variants[0].items[0].serviceId === serviceId);
      if (single) {
        // Retain every imported mapping even when its service already belongs
        // to a legacy offer. Otherwise the migration map silently loses rows.
        single.sourceRecords.push(...serviceSources);
        continue;
      }
      const service = serviceMap.get(serviceId);
      if (!service) continue;
      const scope = vehicleScope(rows[0]);
      const key = `starter-service-${serviceId}${scope === '["",""]' ? '' : `-${fingerprint(scope)}`}`;
      candidates.push({ key, sourceKind: 'starter', sourceRecords: serviceSources, vehicleScope: scope,
        sourceActive: service.is_active === true && rows.every((row) => row.is_active === true),
        definition: candidateDefinition(key, service.name, service.description || '', [{ kind: 'service', serviceId }],
          { serviceGroup: rows[0].service_group || '', triggerServiceId: serviceId }),
        reviewNotes: 'Uses one actual service and its recorded group. Other services in the group may overlap; they were not automatically combined. Review eligible vehicles before publishing.' });
    }
  }
  if (example.length === 1 && example[0].is_active) {
    const product = example[0]; const key = `starter-product-${product.id}`;
    candidates.push({ key, sourceKind: 'starter', sourceActive: true,
      sourceRecords: [sourceRecord('catalog.products', product.id, product)],
      definition: candidateDefinition(key, `${product.sku} (${product.name})`, '', [{ kind: 'product', productId: product.id }],
        { anchorProductId: product.id }),
      reviewNotes: 'Requested catalog example. No verified related part, installation service, or vehicle fitment was found in the inspected sources. Keep as a draft until reviewed.' });
  }
  if (candidates.length > 40) throw packageError('More than 40 starter candidates need review. Narrow the source selection before initializing.', 409);
  const references = await loadManagedPackageReferences(candidates.map((candidate) => candidate.definition));
  return candidates.map((candidate) => {
    let pricing = null; let priceError = null;
    try { pricing = priceManagedPackageVariant(candidate.definition.variants[0], references); }
    catch (error) { if (!error.statusCode) throw error; priceError = error.publicMessage; }
    const existingPackageId = owned.get(candidate.key) || candidate.sourceRecords
      .map((source) => ownedSources.get(`${source.table}:${source.key}`)).find(Boolean) || null;
    return { ...candidate, pricing, priceError, alreadyExists: Boolean(existingPackageId), existingPackageId };
  });
}

export async function previewManagedPackageInitialization() {
  const candidates = await discoverCandidates();
  return { candidates: candidates.map((candidate) => ({ key: candidate.key,
    name: candidate.definition.name, type: candidate.definition.type,
    itemCount: candidate.definition.variants[0].items.length, alreadyExists: candidate.alreadyExists,
    publishable: false, packageTotal: candidate.pricing?.packageTotal ?? null,
    reviewNotes: [candidate.reviewNotes, candidate.priceError].filter(Boolean).join(' '),
    sourceCount: candidate.sourceRecords.length })),
    notes: [
      'Category and group relationships do not prove that a part fits a vehicle. Imported candidates remain drafts until their eligibility is explicitly reviewed.',
      'Catalog prices are preserved. No promotional discounts, inventory, payments, or sales are created.',
      'Equivalent source offers are deduplicated. Existing and archived seeded packages are never overwritten.',
    ] };
}

function applyPromotion(candidate, policy, actorId) {
  if (!policy) return candidate;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw packageError('Enter a valid approved starter pricing policy.');
  const copy = structuredClone(candidate);
  const variant = copy.definition.variants[0];
  variant.pricing = policy.pricing || variant.pricing;
  const overrides = policy.items || [];
  if (!Array.isArray(overrides) || overrides.length > 40) throw packageError('Choose at most 40 starter item pricing policies.');
  const seen = new Set();
  for (const override of overrides) {
    const item = variant.items.find((value) => value.id === override.itemId);
    if (!item || seen.has(item.id)) throw packageError('Starter item pricing must reference unique included items.');
    seen.add(item.id);
    item.priceMode = override.priceMode; item.priceOverride = override.priceOverride;
  }
  copy.definition = normalizeManagedPackageDraft(copy.definition);
  copy.sourceRecords.push({ table: 'administrator_seed_promotion_approval', key: actorId,
    policy: { pricing: copy.definition.variants[0].pricing, items: copy.definition.variants[0].items.map((item) => ({
      itemId: item.id, priceMode: item.priceMode, priceOverride: item.priceOverride,
    })) } });
  return copy;
}

export async function initializeManagedPackageCandidates(input, actorId) {
  const keys = input.candidateKeys;
  if (!Array.isArray(keys) || !keys.length || keys.length > 40 || keys.some((key) => typeof key !== 'string')
    || new Set(keys).size !== keys.length) throw packageError('Select between 1 and 40 unique starter candidates.');
  const policies = input.promotionPolicies || {};
  if (!policies || typeof policies !== 'object' || Array.isArray(policies)
    || Object.keys(policies).some((key) => !keys.includes(key))) throw packageError('Pricing policies must apply only to selected starter candidates.');
  const current = await discoverCandidates();
  const byKey = new Map(current.map((candidate) => [candidate.key, candidate]));
  if (keys.some((key) => !byKey.has(key))) throw packageError('A starter source changed. Refresh the preview before saving.', 409);
  const result = { created: 0, published: 0, drafts: 0, skipped: 0, failed: 0, byType: {}, packages: [], errors: [] };
  for (const key of keys) {
    const original = byKey.get(key);
    if (original.alreadyExists) { result.skipped += 1; continue; }
    try {
      const candidate = applyPromotion(original, policies[key], actorId);
      // Verify submitted promotion math against current catalog values. Invalid
      // policies cannot be silently saved as apparently approved seed pricing.
      const preview = await previewManagedPackage(candidate.definition);
      if (policies[key] && preview.variants.some((variant) => !variant.valid)) {
        throw packageError(preview.variants.find((variant) => !variant.valid).error);
      }
      const saved = await saveManagedPackage(candidate.definition, actorId, {
        sourceKind: candidate.sourceKind, seedKey: key, sourceRecords: candidate.sourceRecords,
        reviewNotes: [candidate.reviewNotes, !candidate.sourceActive ? 'Original source is inactive.' : '', preview.publicationError].filter(Boolean).join(' '),
      });
      result.created += 1; result.drafts += 1;
      result.byType[saved.type] = (result.byType[saved.type] || 0) + 1;
      result.packages.push({ id: saved.id, key, type: saved.type, status: 'draft', name: saved.name });
    } catch (error) {
      // A simultaneous initialization may win the unique source key. Only
      // classify it as skipped if provenance proves this exact candidate exists.
      if (error.statusCode === 409 || error.statusCode === 400) {
        const rows = checked(await supabaseAdmin.schema('cms').from('package_seed_sources').select('package_id').eq('source_key', key).limit(1));
        if (rows.length) { result.skipped += 1; continue; }
      }
      if (!error.statusCode) throw error;
      result.failed += 1; result.errors.push({ key, message: error.publicMessage || error.message });
    }
  }
  return result;
}
