import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();
const ALLOWED_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
const SALES_SCHEMA_CANDIDATES = ['operations', 'app'];
const SERVICE_ORDER_SCHEMA_CANDIDATES = ['operations', 'app'];

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

function normalizeServiceOrderError(error) {
  const message = String(error?.message || '');

  if (
    message.includes('Service order not found') ||
    message.includes('A sale must include at least one line item') ||
    message.includes('Sale subtotal does not match') ||
    message.includes('Sale totals are inconsistent') ||
    message.includes('Cash received must be greater') ||
    message.includes('missing product') ||
    message.includes('missing service') ||
    message.includes('Insufficient stock')
  ) {
    error.statusCode = error.statusCode || 400;
  }

  return error;
}

function isDemoServiceOrderEntry(order) {
  const orderNumber = String(order?.orderNumber ?? order?.order_number ?? '');
  const customerName = String(order?.customerName ?? order?.customer_name ?? '');
  const description = String(order?.description ?? order?.note ?? '');

  return orderNumber.toUpperCase().startsWith('SVC-DEMO-')
    || customerName.toLowerCase().startsWith('demo customer')
    || description.toLowerCase().includes('demo service order');
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pickFirstString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
}

function buildServiceSaleReference(order) {
  return `SERVICE-${order?.orderNumber || order?.order_number || order?.id}`;
}

function normalizeServiceOrderItems(order) {
  const sourceItems = Array.isArray(order?.items)
    ? order.items
    : Array.isArray(order?.lineItems)
      ? order.lineItems
      : Array.isArray(order?.serviceItems)
        ? order.serviceItems
        : [];

  const normalizedItems = sourceItems
    .map((item) => {
      const productId = item?.productId ?? item?.product_id ?? null;
      const serviceId = item?.serviceId ?? item?.service_id ?? null;
      const displayName = pickFirstString(item?.displayName, item?.display_name, item?.itemName, item?.item_name, item?.name);
      const lineType = item?.lineType ?? item?.line_type ?? (serviceId || !productId ? 'service' : 'product');
      const quantity = Math.max(toNumber(item?.quantity, 1), 0);
      const unitPrice = Math.max(toNumber(item?.unitPrice ?? item?.unit_price ?? item?.price), 0);
      const lineTotal = Math.max(toNumber(item?.lineTotal ?? item?.line_total, quantity * unitPrice), 0);

      return {
        lineType: lineType === 'service' ? 'service' : 'product',
        productId: lineType === 'service' ? null : productId,
        serviceId: lineType === 'service' ? serviceId : null,
        quantity: quantity || 1,
        unitPrice,
        lineTotal,
        displayName,
        sku: pickFirstString(item?.sku, item?.code, item?.itemSku, item?.item_sku),
      };
    })
    .filter((item) => item.quantity > 0 && item.unitPrice >= 0 && (item.productId || item.serviceId || item.displayName));

  const orderTotal = Math.max(toNumber(
    order?.totalAmount
      ?? order?.total_amount
      ?? order?.estimatedCost
      ?? order?.estimated_cost
      ?? order?.amount
      ?? order?.total,
  ), 0);

  if (normalizedItems.length > 0) {
    return normalizedItems;
  }

  return [{
    lineType: 'service',
    productId: null,
    serviceId: null,
    quantity: 1,
    unitPrice: orderTotal,
    lineTotal: orderTotal,
    displayName: pickFirstString(order?.description, order?.note, 'Completed service order'),
    sku: order?.orderNumber || order?.order_number || 'SERVICE',
  }];
}

function buildServiceSalePayload(order) {
  const items = normalizeServiceOrderItems(order);
  const rawSubtotal = items.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
  const tax = Math.max(toNumber(order?.taxTotal ?? order?.tax_total), 0);
  const discountAmount = Math.max(toNumber(order?.discountTotal ?? order?.discount_total), 0);
  const total = Math.max(rawSubtotal - discountAmount + tax, 0);

  return {
    customerName: pickFirstString(order?.customerName, order?.customer_name, 'Walk-in Customer'),
    paymentMethod: 'cash',
    cashReceived: total,
    changeDue: 0,
    discountPercent: rawSubtotal > 0 ? Number(((discountAmount / rawSubtotal) * 100).toFixed(2)) : 0,
    totals: {
      rawSubtotal: Number(rawSubtotal.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      total: Number(total.toFixed(2)),
    },
    items,
  };
}

async function findExistingServiceSale(reference) {
  for (const schema of SALES_SCHEMA_CANDIDATES) {
    const { data, error } = await supabaseAdmin
      .schema(schema)
      .from('sales_transactions')
      .select('id, transaction_number, total_amount, status, created_at, original_reference, source_type')
      .eq('original_reference', reference)
      .maybeSingle();

    if (!error) {
      return data;
    }
  }

  return null;
}

async function tagServiceSale(saleId, reference) {
  for (const schema of SALES_SCHEMA_CANDIDATES) {
    const { data, error } = await supabaseAdmin
      .schema(schema)
      .from('sales_transactions')
      .update({
        source_type: 'service_order',
        original_reference: reference,
        inventory_applied: true,
        sale_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', saleId)
      .select('id, transaction_number, total_amount, status, created_at, original_reference, source_type')
      .maybeSingle();

    if (!error) {
      return data;
    }
  }

  return null;
}

async function persistServiceCompletion(orderId) {
  const patch = {
    status: 'completed',
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  for (const schema of SERVICE_ORDER_SCHEMA_CANDIDATES) {
    const { error } = await supabaseAdmin
      .schema(schema)
      .from('service_orders')
      .update(patch)
      .eq('id', orderId);

    if (!error) {
      return;
    }
  }
}

async function completeServiceOrder(orderId, operatorId) {
  const currentOrder = await loadOrder(orderId);

  if (!currentOrder || isDemoServiceOrderEntry(currentOrder)) {
    const error = new Error('Service order not found.');
    error.statusCode = 404;
    throw error;
  }

  const reference = buildServiceSaleReference(currentOrder);
  let sale = await findExistingServiceSale(reference);
  let saleCreated = false;

  if (!sale) {
    const payload = buildServiceSalePayload(currentOrder);
    const saleId = await callRpc('create_pos_sale', {
      payload,
      p_operator_id: operatorId ?? null,
    });

    sale = await tagServiceSale(saleId, reference) || { id: saleId };
    saleCreated = true;
  }

  await callRpc('limen_update_service_order', {
    p_order_id: orderId,
    p_payload: {
      status: 'completed',
      completedAt: new Date().toISOString(),
      paymentStatus: 'paid',
      archived: true,
      salesReference: reference,
      saleId: sale?.id ?? null,
    },
  });

  await persistServiceCompletion(orderId);

  return {
    order: await loadOrder(orderId),
    sale,
    saleCreated,
    archiveReference: reference,
  };
}

router.use(requireRole('admin', 'cashier'));

router.get('/', async (req, res, next) => {
  try {
    const orders = await loadOrders({
      search: req.query.search,
      status: req.query.status,
      limit: req.query.limit,
    });
    const includeArchived = String(req.query.includeArchived || '').toLowerCase() === 'true';
    const visibleOrders = orders
      .filter((order) => !isDemoServiceOrderEntry(order))
      .filter((order) => includeArchived || order.status !== 'completed');

    res.json({ orders: visibleOrders });
  } catch (error) {
    next(normalizeServiceOrderError(error));
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
    next(normalizeServiceOrderError(error));
  }
});

router.post('/', async (req, res, next) => {
  try {
    const order = await callRpc('limen_create_service_order', {
      p_payload: req.body ?? {},
    });
    res.status(201).json({ order });
  } catch (error) {
    next(normalizeServiceOrderError(error));
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
    next(normalizeServiceOrderError(error));
  }
});

router.post('/:orderId/complete', requireRole('admin', 'cashier'), async (req, res, next) => {
  try {
    const result = await completeServiceOrder(req.params.orderId, req.user?.id ?? null);
    res.json(result);
  } catch (error) {
    next(normalizeServiceOrderError(error));
  }
});

export default router;
