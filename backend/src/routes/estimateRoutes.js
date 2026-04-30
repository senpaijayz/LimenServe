import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();

function normalizeQuoteNumber(value) {
  return String(value || '').trim().toUpperCase();
}

function shouldUseDirectEstimateFallback(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('app.') && message.includes('does not exist')
  ) || message.includes('create_estimate_internal')
    || (message.includes('could not find') && message.includes('create_estimate'));
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toMoney(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function generateEstimateNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `EST-${datePart}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function fetchSingleRow(schema, table, select, column, value) {
  if (!value) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .schema(schema)
    .from(table)
    .select(select)
    .eq(column, value)
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0] ?? null;
}

async function findEstimateIdByQuoteNumber(estimateNumber) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .schema('operations')
    .from('estimates')
    .select('id')
    .eq('estimate_number', estimateNumber)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0]?.id ?? null;
}

async function loadEstimateSnapshot(estimateId) {
  const estimate = await fetchSingleRow('operations', 'estimates', '*', 'id', estimateId);

  if (!estimate) {
    return null;
  }

  const [customer, vehicle, lineResult] = await Promise.all([
    fetchSingleRow('operations', 'customers', '*', 'id', estimate.customer_id),
    fetchSingleRow('operations', 'vehicles', '*', 'id', estimate.vehicle_id),
    supabaseAdmin
      .schema('operations')
      .from('estimate_items')
      .select('*')
      .eq('estimate_id', estimateId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
  ]);

  if (lineResult.error) {
    throw lineResult.error;
  }

  const itemRows = lineResult.data ?? [];
  const productIds = [...new Set(itemRows.map((item) => item.product_id).filter(Boolean))];
  const serviceIds = [...new Set(itemRows.map((item) => item.service_id).filter(Boolean))];

  const [productResult, serviceResult] = await Promise.all([
    productIds.length
      ? supabaseAdmin
        .schema('catalog')
        .from('products')
        .select('id, sku, name')
        .in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length
      ? supabaseAdmin
        .schema('operations')
        .from('services')
        .select('id, code, name')
        .in('id', serviceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productResult.error) {
    throw productResult.error;
  }

  if (serviceResult.error) {
    throw serviceResult.error;
  }

  const productsById = new Map((productResult.data ?? []).map((product) => [product.id, product]));
  const servicesById = new Map((serviceResult.data ?? []).map((service) => [service.id, service]));
  const items = itemRows.map((item) => {
    const product = item.product_id ? productsById.get(item.product_id) : null;
    const service = item.service_id ? servicesById.get(item.service_id) : null;

    return {
      ...item,
      product_name: product?.name ?? null,
      product_sku: product?.sku ?? null,
      service_name: service?.name ?? null,
      service_code: service?.code ?? null,
    };
  });

  return {
    estimate,
    customer,
    vehicle,
    items,
  };
}

async function createEstimateDirectly(payload = {}) {
  const businessDate = payload.estimate?.business_date || new Date().toISOString().slice(0, 10);
  const customerPayload = payload.customer ?? {};
  const customerName = String(customerPayload.name || '').trim();
  let customerId = null;

  if (customerName) {
    const { data, error } = await supabaseAdmin
      .schema('operations')
      .from('customers')
      .insert({
        customer_type: customerPayload.customer_type || 'walk_in',
        name: customerName,
        phone: customerPayload.phone || null,
        email: customerPayload.email || null,
        metadata: customerPayload.metadata || {},
        business_date: businessDate,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    customerId = data.id;
  }

  const vehiclePayload = payload.vehicle ?? {};
  let vehicleId = null;

  if (vehiclePayload.model_name) {
    const { data, error } = await supabaseAdmin
      .schema('operations')
      .from('vehicles')
      .insert({
        customer_id: customerId,
        plate_no: vehiclePayload.plate_no || null,
        make: vehiclePayload.make || 'Mitsubishi',
        model_name: vehiclePayload.model_name,
        year: toNullableNumber(vehiclePayload.year),
        engine: vehiclePayload.engine || null,
        mileage: toNullableNumber(vehiclePayload.mileage),
        metadata: vehiclePayload.metadata || {},
        business_date: businessDate,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    vehicleId = data.id;
  }

  const estimatePayload = payload.estimate ?? {};
  const { data: estimateRow, error: estimateError } = await supabaseAdmin
    .schema('operations')
    .from('estimates')
    .insert({
      estimate_number: estimatePayload.estimate_number || generateEstimateNumber(),
      customer_id: customerId,
      vehicle_id: vehicleId,
      status: estimatePayload.status || 'sent',
      source: estimatePayload.source || 'public',
      note: estimatePayload.note || null,
      subtotal: toMoney(estimatePayload.subtotal),
      discount_total: toMoney(estimatePayload.discount_total),
      tax_total: toMoney(estimatePayload.tax_total),
      grand_total: toMoney(estimatePayload.grand_total),
      issued_at: estimatePayload.issued_at || new Date().toISOString(),
      valid_until: estimatePayload.valid_until || null,
      business_date: businessDate,
    })
    .select('id')
    .single();

  if (estimateError) {
    throw estimateError;
  }

  const estimateId = estimateRow.id;
  const lineItems = Array.isArray(payload.items) ? payload.items : [];
  const itemRows = lineItems.map((item) => {
    const lineType = item.line_type === 'service' ? 'service' : 'product';
    const quantity = Math.max(Number(item.quantity ?? 1), 1);
    const unitPrice = toMoney(item.unit_price);

    return {
      estimate_id: estimateId,
      line_type: lineType,
      product_id: lineType === 'product' && isUuid(item.product_id) ? item.product_id : null,
      service_id: lineType === 'service' && isUuid(item.service_id) ? item.service_id : null,
      quantity,
      unit_price: unitPrice,
      line_total: toMoney(item.line_total ?? unitPrice * quantity),
      recommendation_rule_id: isUuid(item.recommendation_rule_id) ? item.recommendation_rule_id : null,
      is_upsell: Boolean(item.is_upsell),
      business_date: businessDate,
    };
  });

  if (itemRows.length > 0) {
    const { error } = await supabaseAdmin
      .schema('operations')
      .from('estimate_items')
      .insert(itemRows);

    if (error) {
      throw error;
    }
  }

  const snapshot = await loadEstimateSnapshot(estimateId);
  const { error: revisionError } = await supabaseAdmin
    .schema('operations')
    .from('estimate_revisions')
    .insert({
      estimate_id: estimateId,
      revision_number: 1,
      change_note: estimatePayload.revision_note || 'Public quote created',
      estimate_snapshot: snapshot,
      business_date: businessDate,
    });

  if (revisionError) {
    throw revisionError;
  }

  return estimateId;
}

async function createEstimatePersisted(payload) {
  try {
    return await callRpc('create_estimate', { payload });
  } catch (error) {
    if (!shouldUseDirectEstimateFallback(error)) {
      throw error;
    }

    return createEstimateDirectly(payload);
  }
}

router.get('/', requireRole('admin', 'cashier', 'staff', 'stock_clerk'), async (req, res, next) => {
  try {
    const estimates = await callRpc('list_estimates', {
      p_search: req.query.search || null,
      p_limit_count: Number(req.query.limit || 20),
    });

    res.json({ estimates: estimates ?? [] });
  } catch (error) {
    next(error);
  }
});

router.post('/public/lookup', async (req, res, next) => {
  try {
    const estimateNumber = normalizeQuoteNumber(req.body?.estimateNumber);

    if (!estimateNumber) {
      res.status(400).json({ error: 'Quote number is required.' });
      return;
    }

    const estimateId = await findEstimateIdByQuoteNumber(estimateNumber);
    const estimate = estimateId ? await loadEstimateSnapshot(estimateId) : null;

    if (!estimate) {
      res.status(404).json({ error: 'No active quote matched that quote number.' });
      return;
    }

    res.json({ estimate });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const estimateId = await createEstimatePersisted(req.body);
    const estimate = await loadEstimateSnapshot(estimateId);

    res.status(201).json({ estimateId, estimate });
  } catch (error) {
    next(error);
  }
});

router.get('/:estimateId', requireRole('admin', 'cashier', 'staff', 'stock_clerk'), async (req, res, next) => {
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

router.get('/:estimateId/revisions', requireRole('admin', 'cashier', 'staff', 'stock_clerk'), async (req, res, next) => {
  try {
    const revisions = await callRpc('get_estimate_revisions', {
      p_estimate_id: req.params.estimateId,
    });

    res.json({ revisions: revisions ?? [] });
  } catch (error) {
    next(error);
  }
});

router.patch('/:estimateId', requireRole('admin', 'cashier', 'staff', 'stock_clerk'), async (req, res, next) => {
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

router.post('/:estimateId/revise', requireRole('admin', 'cashier', 'staff', 'stock_clerk'), async (req, res, next) => {
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

router.post('/:estimateId/convert-sale', requireAuth, async (req, res, next) => {
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

router.post('/:estimateId/convert-service-order', requireAuth, async (req, res, next) => {
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
