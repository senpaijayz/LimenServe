import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();

function normalizeQuoteNumber(value) {
  return String(value || '').trim().toUpperCase();
}

async function findEstimateIdByQuoteNumber(estimateNumber) {
  const estimates = await callRpc('list_estimates', {
    p_search: estimateNumber,
    p_limit_count: 10,
  });

  return (estimates ?? []).find((estimate) => normalizeQuoteNumber(estimate.estimate_number) === estimateNumber)?.id ?? null;
}

async function createEstimatePersisted(payload) {
  return callRpc('create_estimate', { payload });
}

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
    const estimates = await callRpc('list_estimates', {
      p_search: req.query.search || null,
      p_limit_count: Math.max(Number(req.query.limit || 20) * 3, 20),
    });

    const limit = Number(req.query.limit || 20);
    res.json({ estimates: (estimates ?? []).filter((estimate) => !isDemoEstimate(estimate)).slice(0, limit) });
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

    createQuotationNotification(estimate).catch((error) => {
      console.error('Failed to create quotation notification:', error);
    });

    res.status(201).json({ estimateId, estimate });
  } catch (error) {
    next(error);
  }
});

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
