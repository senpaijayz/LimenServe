import { Router } from 'express';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { getDefaultRateLimitKey } from '../middleware/rateLimit.js';
import {
  createInMemoryRateLimitStore,
  createStoreBackedRateLimiter,
  createSupabaseRateLimitStore,
} from '../middleware/sharedRateLimit.js';
import { logger } from '../observability/logger.js';
import {
  applyToPublicEstimateCreators,
  createPublicEstimateCreateHandler,
  getPublicEstimatePhoneRateLimitKey,
  isTrustedEstimateCreator,
} from '../services/publicEstimateCreate.js';
import { createPublicEstimateLookupHandler } from '../services/publicEstimateLookup.js';
import { createPublicEstimatePricingResolver } from '../services/publicEstimatePricing.js';
import { callRpc } from '../services/supabaseRpc.js';
import { filterActiveEstimates } from '../services/estimateValidity.js';

const router = Router();
const ESTIMATE_STATUS_FILTERS = new Set(['draft', 'sent', 'approved', 'converted_sale', 'converted_service', 'expired', 'rejected']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const publicEstimateRateLimitStore = env.publicRateLimitStore === 'supabase'
  ? createSupabaseRateLimitStore({ supabase: supabaseAdmin })
  : createInMemoryRateLimitStore({ maxEntries: env.globalRateLimitMaxEntries });

function createPublicEstimateRateLimiter(options) {
  return createStoreBackedRateLimiter({
    store: publicEstimateRateLimitStore,
    ...options,
    // Domain-separated HMAC prevents stored IP/phone keys from being reversed.
    // Rotation of the service-role key safely starts a fresh limiter window.
    hashSecret: env.supabaseServiceRoleKey,
    onLimitReached(req, details) {
      (req.log || logger).warn('rate_limit.exceeded', {
        requestId: req.requestId,
        clientIp: req.ip,
        path: req.path,
        scope: details.scope,
        limit: details.limit,
        windowMs: details.windowMs,
        resetSeconds: details.resetSeconds,
      });
    },
    onStoreError(req, details) {
      (req.log || logger).error('rate_limit.store_failed', {
        requestId: req.requestId,
        path: req.path,
        scope: details.scope,
        error: details.error,
      });
    },
  });
}

function normalizeQuoteNumber(value) {
  return String(value || '').trim().toUpperCase();
}

async function createEstimatePersisted(payload) {
  return callRpc('create_estimate', { payload });
}

function isOptionalRecommendationSourceError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('schema cache')
    || message.includes('could not find the function')
    || message.includes('does not exist');
}

async function loadActiveProducts(productIds) {
  if (productIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .schema('catalog')
    .from('products')
    .select('id, sku, status, is_active')
    .in('id', productIds);
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function loadCurrentProductPrices(productIds) {
  if (productIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .schema('catalog')
    .from('product_prices')
    .select('product_id, amount, is_current, effective_from, created_at')
    .in('product_id', productIds)
    .eq('price_type', 'retail')
    .eq('is_current', true);
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function loadCurrentStagingPrices(skus) {
  if (skus.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .schema('catalog')
    .from('pricelist_import_staging')
    .select('sku, price, status')
    .in('sku', skus);
  if (error) {
    if (isOptionalRecommendationSourceError(error)) {
      return [];
    }
    throw error;
  }
  return data ?? [];
}

async function loadActiveServices(serviceIds) {
  if (serviceIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .schema('operations')
    .from('services')
    .select('id, standard_price, is_active')
    .in('id', serviceIds);
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function callOptionalRecommendationRpc(name, params) {
  try {
    return await callRpc(name, params) ?? [];
  } catch (error) {
    if (isOptionalRecommendationSourceError(error)) {
      return [];
    }
    throw error;
  }
}

function normalizeApprovedRecommendation(row, anchorProductId, source) {
  const catalogPrice = Number(row.catalog_price ?? row.recommended_price ?? 0);
  let resolvedPrice = row.resolved_price;
  if (resolvedPrice === undefined || resolvedPrice === null) {
    const priceMode = row.price_mode ?? row.pricing_mode;
    resolvedPrice = priceMode === 'complimentary'
      ? 0
      : priceMode === 'override'
        ? row.price_override
        : catalogPrice;
  }

  return {
    id: row.package_item_id ?? row.rule_id,
    item_kind: row.item_kind ?? row.consequent_kind,
    product_id: row.recommended_product_id,
    service_id: row.recommended_service_id,
    package_key: row.package_key,
    anchor_product_id: anchorProductId,
    min_anchor_quantity: Number(row.min_anchor_quantity ?? 1),
    price_mode: row.price_mode ?? row.pricing_mode ?? 'catalog',
    price_override: row.price_override,
    catalog_price: catalogPrice,
    resolved_price: resolvedPrice === null || resolvedPrice === undefined
      ? null
      : Number(resolvedPrice),
    is_active: true,
    package_is_active: true,
    source,
  };
}

async function loadApprovedRecommendations({ anchorProductIds, vehicleModelName }) {
  const rows = await Promise.all(anchorProductIds.map(async (anchorProductId) => {
    const [cmsRows, generatedRows, curatedRows] = await Promise.all([
      callOptionalRecommendationRpc('get_cms_recommendation_packages', {
        p_anchor_product_id: anchorProductId,
        p_vehicle_model_name: vehicleModelName,
        p_part_limit: 100,
        p_service_limit: 100,
      }),
      callOptionalRecommendationRpc('get_product_recommendation_packages', {
        p_product_id: anchorProductId,
        p_vehicle_model_name: vehicleModelName,
        p_part_limit: 100,
        p_service_limit: 100,
      }),
      callOptionalRecommendationRpc('get_curated_quote_recommendations', {
        p_product_id: anchorProductId,
        p_vehicle_model_name: vehicleModelName,
        p_limit_count: 100,
      }),
    ]);

    return [
      ...cmsRows.map((row) => normalizeApprovedRecommendation(row, anchorProductId, 'cms')),
      ...generatedRows.map((row) => normalizeApprovedRecommendation(row, anchorProductId, 'generated')),
      ...curatedRows.map((row) => normalizeApprovedRecommendation(row, anchorProductId, 'curated')),
    ];
  }));

  return rows.flat();
}

const resolvePublicEstimatePricing = createPublicEstimatePricingResolver({
  loadProducts: loadActiveProducts,
  loadProductPrices: loadCurrentProductPrices,
  loadStagingPrices: loadCurrentStagingPrices,
  loadServices: loadActiveServices,
  loadRecommendations: loadApprovedRecommendations,
});

function isDemoEstimate(estimate) {
  const estimateNumber = normalizeQuoteNumber(estimate?.estimate_number);
  const customerName = String(estimate?.customer_name || estimate?.customer?.name || '').toLowerCase();

  return estimateNumber.startsWith('EST-DEMO-') || customerName.includes('demo customer');
}

async function loadEstimateSnapshot(estimateId) {
  const estimate = await callRpc('get_estimate_detail', {
    p_estimate_id: estimateId,
  });

  return enrichEstimateSnapshotItemLabels(estimate);
}

async function enrichEstimateSnapshotItemLabels(estimate) {
  const items = Array.isArray(estimate?.items) ? estimate.items : [];
  const productIds = [...new Set(items.map((item) => item.product_id).filter(Boolean))];
  const serviceIds = [...new Set(items.map((item) => item.service_id).filter(Boolean))];

  const [{ data: products, error: productsError }, { data: services, error: servicesError }] = await Promise.all([
    productIds.length > 0
      ? supabaseAdmin.schema('catalog').from('products').select('id, sku, name').in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length > 0
      ? supabaseAdmin.schema('operations').from('services').select('id, code, name').in('id', serviceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsError) {
    throw productsError;
  }

  if (servicesError) {
    throw servicesError;
  }

  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const serviceMap = new Map((services ?? []).map((service) => [service.id, service]));

  return {
    ...estimate,
    items: items.map((item) => {
      const product = productMap.get(item.product_id);
      const service = serviceMap.get(item.service_id);

      return {
        ...item,
        product_name: item.product_name || product?.name || null,
        product_sku: item.product_sku || product?.sku || null,
        service_name: item.service_name || service?.name || null,
        service_code: item.service_code || service?.code || null,
      };
    }),
  };
}

function formatCurrency(value) {
  const amount = Number(value ?? 0);

  return new Intl.NumberFormat('en-PH', {
    currency: 'PHP',
    style: 'currency',
  }).format(Number.isFinite(amount) ? amount : 0);
}

async function createQuotationNotification(estimate = {}) {
  const estimateNumber = estimate?.estimate?.estimate_number;
  const source = estimate?.estimate?.source || estimate?.customer?.metadata?.source;

  if (!estimateNumber || source !== 'public') {
    return;
  }

  const customerName = estimate?.customer?.name || 'Walk-in Customer';
  const total = formatCurrency(estimate?.estimate?.grand_total);
  const lineCount = Array.isArray(estimate?.items) ? estimate.items.length : 0;

  const { error } = await supabaseAdmin
    .schema('catalog')
    .from('admin_notifications')
    .insert({
      category: 'quotation',
      type: 'info',
      title: 'New Public Quotation',
      message: `${customerName} created quotation ${estimateNumber} for ${total}.`,
      target_path: '/quotation',
      metadata: {
        customerName,
        estimateId: estimate?.estimate?.id ?? null,
        estimateNumber,
        grandTotal: Number(estimate?.estimate?.grand_total ?? 0),
        lineCount,
        source,
      },
    });

  if (error) {
    throw error;
  }
}

router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const status = String(req.query.status || '').trim().toLowerCase();
    if (status && !ESTIMATE_STATUS_FILTERS.has(status)) {
      res.status(400).json({ error: 'Invalid estimate status filter.' });
      return;
    }

    const estimates = await callRpc('list_estimates', {
      p_search: req.query.search || null,
      p_limit_count: Math.max(Number(req.query.limit || 20) * 3, 20),
    });

    const limit = Number(req.query.limit || 20);
    const visibleEstimates = filterActiveEstimates(
      (estimates ?? []).filter((estimate) => !isDemoEstimate(estimate)),
    );
    const filteredEstimates = status
      ? visibleEstimates.filter((estimate) => String(estimate.status || '').toLowerCase() === status)
      : visibleEstimates;
    res.json({ estimates: filteredEstimates.slice(0, limit) });
  } catch (error) {
    next(error);
  }
});

const publicEstimateLookupRateLimiter = createPublicEstimateRateLimiter({
  scope: 'estimate.lookup.ip',
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: getDefaultRateLimitKey,
  message: 'Too many quote lookup attempts. Please try again later.',
});

router.post(
  '/public/lookup',
  publicEstimateLookupRateLimiter,
  createPublicEstimateLookupHandler({ rpc: callRpc }),
);

const publicEstimateCreateIpRateLimiter = createPublicEstimateRateLimiter({
  scope: 'estimate.create.ip',
  windowMs: 15 * 60 * 1000,
  limit: 6,
  keyGenerator: getDefaultRateLimitKey,
  message: 'Too many quotation requests. Please try again later.',
});
const publicEstimateCreatePhoneRateLimiter = createPublicEstimateRateLimiter({
  scope: 'estimate.create.phone',
  windowMs: 60 * 60 * 1000,
  limit: 3,
  keyGenerator: getPublicEstimatePhoneRateLimitKey,
  message: 'Too many quotation requests. Please try again later.',
});
const publicEstimateCreateHandler = createPublicEstimateCreateHandler({
  createEstimate: createEstimatePersisted,
  loadEstimate: loadEstimateSnapshot,
  resolvePricing: resolvePublicEstimatePricing,
  notify: createQuotationNotification,
  onNotificationError(error) {
    logger.error('estimate.notification_failed', { error });
  },
});

async function createTrustedEstimate(req, res, next) {
  try {
    const estimateId = await createEstimatePersisted(req.body);
    const estimate = await loadEstimateSnapshot(estimateId);

    createQuotationNotification(estimate).catch((error) => {
      logger.error('estimate.notification_failed', {
        requestId: req.requestId,
        estimateId,
        error,
      });
    });

    res.status(201).json({ estimateId, estimate });
  } catch (error) {
    next(error);
  }
}

router.post(
  '/',
  applyToPublicEstimateCreators(publicEstimateCreateIpRateLimiter),
  applyToPublicEstimateCreators(publicEstimateCreatePhoneRateLimiter),
  (req, res, next) => (isTrustedEstimateCreator(req.user)
    ? createTrustedEstimate(req, res, next)
    : publicEstimateCreateHandler(req, res, next)),
);

router.get('/:estimateId', requireRole('admin'), async (req, res, next) => {
  try {
    const estimate = await callRpc('get_estimate_detail', {
      p_estimate_id: req.params.estimateId,
    });

    if (!estimate) {
      res.status(404).json({ error: 'Estimate not found.' });
      return;
    }

    res.json({ estimate });
  } catch (error) {
    next(error);
  }
});

router.delete('/:estimateId', requireRole('admin'), async (req, res, next) => {
  const estimateId = String(req.params.estimateId || '').trim();
  if (!UUID_PATTERN.test(estimateId)) {
    res.status(400).json({ error: 'A valid quotation identifier is required.' });
    return;
  }

  try {
    const result = await callRpc('delete_draft_estimate', {
      p_estimate_id: estimateId,
    });

    if (result?.reason === 'not_found') {
      res.status(404).json({ error: 'Quotation not found.' });
      return;
    }

    if (result?.reason === 'not_draft') {
      res.status(409).json({ error: 'Only draft quotations can be deleted.' });
      return;
    }

    if (!result?.deleted) {
      res.status(409).json({ error: 'This quotation could not be deleted.' });
      return;
    }

    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

router.patch('/:estimateId/archive', requireRole('admin'), async (req, res, next) => {
  const estimateId = String(req.params.estimateId || '').trim();
  if (!UUID_PATTERN.test(estimateId)) {
    res.status(400).json({ error: 'A valid quotation identifier is required.' });
    return;
  }

  try {
    const result = await callRpc('archive_estimate', {
      p_estimate_id: estimateId,
    });

    if (result?.reason === 'not_found') {
      res.status(404).json({ error: 'Quotation not found.' });
      return;
    }

    if (result?.reason === 'draft_only_delete') {
      res.status(409).json({ error: 'Draft quotations should be deleted instead of archived.' });
      return;
    }

    if (!result?.archived) {
      res.status(409).json({ error: 'This quotation could not be archived.' });
      return;
    }

    res.json({ archived: true });
  } catch (error) {
    next(error);
  }
});

router.get('/:estimateId/revisions', requireRole('admin'), async (req, res, next) => {
  try {
    const revisions = await callRpc('get_estimate_revisions', {
      p_estimate_id: req.params.estimateId,
    });

    res.json({ revisions: revisions ?? [] });
  } catch (error) {
    next(error);
  }
});

router.patch('/:estimateId', requireRole('admin'), async (req, res, next) => {
  try {
    const revisionId = await callRpc('revise_estimate', {
      p_estimate_id: req.params.estimateId,
      p_payload: req.body,
      p_editor_id: req.user?.id || null,
      p_change_note: req.body?.changeNote || null,
    });

    res.json({ revisionId });
  } catch (error) {
    next(error);
  }
});

router.post('/:estimateId/revise', requireRole('admin'), async (req, res, next) => {
  try {
    const revisionId = await callRpc('revise_estimate', {
      p_estimate_id: req.params.estimateId,
      p_payload: req.body,
      p_editor_id: req.user?.id || null,
      p_change_note: req.body?.changeNote || null,
    });

    res.status(201).json({ revisionId });
  } catch (error) {
    next(error);
  }
});

router.post('/:estimateId/convert-sale', requireRole('admin'), async (req, res, next) => {
  try {
    const saleId = await callRpc('convert_estimate_to_sale', {
      p_estimate_id: req.params.estimateId,
      p_payment_method: req.body?.paymentMethod || 'cash',
    });

    res.json({ saleId });
  } catch (error) {
    next(error);
  }
});

router.post('/:estimateId/convert-service-order', requireRole('admin'), async (req, res, next) => {
  try {
    const serviceOrderId = await callRpc('convert_estimate_to_service_order', {
      p_estimate_id: req.params.estimateId,
      p_assigned_to: req.body?.assignedTo || null,
    });

    res.json({ serviceOrderId });
  } catch (error) {
    next(error);
  }
});

router.post('/upsell-actions', async (req, res, next) => {
  try {
    const eventId = await callRpc('record_upsell_action', {
      p_context_type: req.body.contextType,
      p_context_id: req.body.contextId,
      p_product_id: req.body.productId,
      p_recommended_product_id: req.body.recommendedProductId || null,
      p_recommended_service_id: req.body.recommendedServiceId || null,
      p_action: req.body.action || 'shown',
      p_rule_id: req.body.ruleId || null,
      p_reason_label: req.body.reasonLabel || null,
    });

    res.status(201).json({ eventId });
  } catch (error) {
    next(error);
  }
});

export default router;
