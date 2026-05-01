import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();
const ALLOWED_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);

function normalizeStatus(value, fallback = 'pending') {
  return ALLOWED_STATUSES.has(value) ? value : fallback;
}

async function loadOrders({ search = '', status = 'all', limit = 50 } = {}) {
  const orders = await callRpc('limen_list_service_orders', {
    p_search: String(search || ''),
    p_status: normalizeStatus(status, 'all'),
    p_limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
  });

  return Array.isArray(orders) ? orders : [];
}

async function loadOrder(orderId) {
  return callRpc('limen_get_service_order', {
    p_order_id: orderId,
  });
}

router.use(requireRole('admin', 'cashier', 'stock_clerk'));

router.get('/', async (req, res, next) => {
  try {
    const orders = await loadOrders({
      search: req.query.search,
      status: req.query.status,
      limit: req.query.limit,
    });
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

router.get('/:orderId', async (req, res, next) => {
  try {
    const order = await loadOrder(req.params.orderId);
    if (!order) {
      res.status(404).json({ error: 'Service order not found.' });
      return;
    }
    res.json({ order });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const order = await callRpc('limen_create_service_order', {
      p_payload: req.body ?? {},
    });
    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});

router.patch('/:orderId', async (req, res, next) => {
  try {
    const order = await callRpc('limen_update_service_order', {
      p_order_id: req.params.orderId,
      p_payload: req.body ?? {},
    });
    if (!order) {
      res.status(404).json({ error: 'Service order not found.' });
      return;
    }

    res.json({ order });
  } catch (error) {
    next(error);
  }
});

export default router;
