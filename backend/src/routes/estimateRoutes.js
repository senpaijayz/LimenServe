import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
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

async function loadEstimateSnapshot(estimateId) {
  return callRpc('get_estimate_detail', {
    p_estimate_id: estimateId,
  });
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
