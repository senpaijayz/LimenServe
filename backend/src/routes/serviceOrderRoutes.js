import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();
const ALLOWED_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
const ALLOWED_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const SALES_SCHEMA_CANDIDATES = ['operations', 'app'];
const SERVICE_ORDER_SCHEMA_CANDIDATES = ['operations', 'app'];

function normalizeStatus(value, fallback = 'pending') {
  return ALLOWED_STATUSES.has(value) ? value : fallback;
}

function normalizeAssignmentError(error) {
  const message = String(error?.message || '');

  if (error?.code === '42501') {
    error.statusCode = 403;
  } else if (error?.code === '23P01' || message.includes('conflicting assignment')) {
    error.statusCode = 409;
  } else if (
    message.includes('required')
    || message.includes('cannot be assigned')
    || message.includes('Only active')
    || message.includes('not found')
  ) {
    error.statusCode = message.includes('not found') ? 404 : 400;
  }

  return error;
}

async function loadLatestAssignments(orderIds = []) {
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))];
  if (uniqueOrderIds.length === 0) return new Map();

  const { data: assignments, error } = await supabaseAdmin
    .schema('operations')
    .from('mechanic_assignments')
    .select('id, service_order_id, mechanic_id, status, scheduled_start, scheduled_end, assigned_by, assigned_at, note')
    .in('service_order_id', uniqueOrderIds)
    .in('status', ['assigned', 'completed', 'cancelled'])
    .order('assigned_at', { ascending: false });

  if (error) throw error;

  const mechanicIds = [...new Set((assignments ?? []).map((row) => row.mechanic_id).filter(Boolean))];
  const actorIds = [...new Set((assignments ?? []).map((row) => row.assigned_by).filter(Boolean))];
  const [mechanicResult, actorResult] = await Promise.all([
    mechanicIds.length
      ? supabaseAdmin
        .schema('operations')
        .from('mechanics')
        .select('id, full_name, specialization, availability_status, shift_label, location_name, photo_url, is_active')
        .in('id', mechanicIds)
      : Promise.resolve({ data: [], error: null }),
    actorIds.length
      ? supabaseAdmin
        .schema('core')
        .from('user_profiles')
        .select('user_id, full_name')
        .in('user_id', actorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (mechanicResult.error) throw mechanicResult.error;
  if (actorResult.error) throw actorResult.error;

  const mechanics = new Map((mechanicResult.data ?? []).map((row) => [row.id, row]));
  const actors = new Map((actorResult.data ?? []).map((row) => [row.user_id, row]));

  const assignmentMap = new Map();
  (assignments ?? []).forEach((row) => {
    if (assignmentMap.has(row.service_order_id)) return;
    const mechanic = mechanics.get(row.mechanic_id) ?? null;
    const actor = actors.get(row.assigned_by) ?? null;
    assignmentMap.set(row.service_order_id, {
      id: row.id,
      serviceOrderId: row.service_order_id,
      mechanicId: row.mechanic_id,
      status: row.status,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      assignedAt: row.assigned_at,
      note: row.note,
      mechanic: mechanic ? {
        id: mechanic.id,
        name: mechanic.full_name,
        specialization: mechanic.specialization,
        availabilityStatus: mechanic.availability_status,
        shiftLabel: mechanic.shift_label,
        locationName: mechanic.location_name,
        photoUrl: mechanic.photo_url,
        isActive: mechanic.is_active !== false,
      } : null,
      assignedBy: {
        id: row.assigned_by,
        name: actor?.full_name || 'Administrator',
      },
    });
  });

  return assignmentMap;
}

async function enrichOrdersWithAssignments(orders = []) {
  const orderIds = [...new Set(orders.map((order) => order?.id).filter(Boolean))];
  const { data: metadata, error: metadataError } = orderIds.length
    ? await supabaseAdmin.schema('operations').from('service_orders')
      .select('id, priority, payment_status, payment_method')
      .in('id', orderIds)
    : { data: [], error: null };
  if (metadataError?.code === '42703') {
    const { data: legacyRows, error: legacyError } = orderIds.length
      ? await supabaseAdmin.schema('operations').from('service_orders').select('id').in('id', orderIds)
      : { data: [], error: null };
    if (legacyError) throw legacyError;
    return enrichOrdersWithAssignmentsUsingMetadata(orders, new Map((legacyRows ?? []).map((row) => [row.id, {}])));
  }
  if (metadataError) throw metadataError;
  const metadataById = new Map((metadata ?? []).map((row) => [row.id, row]));
  return enrichOrdersWithAssignmentsUsingMetadata(orders, metadataById);
}

async function enrichOrdersWithAssignmentsUsingMetadata(orders, metadataById) {
  const assignments = await loadLatestAssignments(orders.map((order) => order?.id));
  return orders.map((order) => {
    const assignment = assignments.get(order?.id) ?? null;
    const orderMetadata = metadataById.get(order?.id) ?? {};
    return {
      ...order,
      priority: orderMetadata.priority ?? order.priority ?? 'normal',
      paymentStatus: orderMetadata.payment_status ?? order.paymentStatus ?? order.payment_status ?? 'unpaid',
      paymentMethod: orderMetadata.payment_method ?? order.paymentMethod ?? order.payment_method ?? null,
      assignment,
      assignedMechanic: assignment?.mechanic ?? null,
      scheduledStart: assignment?.scheduledStart
        ?? order?.scheduledStart
        ?? order?.scheduled_start
        ?? null,
      scheduledEnd: assignment?.scheduledEnd
        ?? order?.scheduledEnd
        ?? order?.scheduled_end
        ?? null,
    };
  });
}

async function loadOrders({ search = '', status = 'all', limit = 50 } = {}) {
  const orders = await callRpc('limen_list_service_orders', {
    p_search: String(search || ''),
    p_status: normalizeStatus(status, 'all'),
    p_limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
  });

  return enrichOrdersWithAssignments(Array.isArray(orders) ? orders : []);
}

async function loadOrder(orderId) {
  const order = await callRpc('limen_get_service_order', {
    p_order_id: orderId,
  });

  if (!order) return null;
  const [enriched] = await enrichOrdersWithAssignments([order]);
  return { ...enriched, items: normalizeServiceOrderItems(enriched) };
}

async function persistServiceOrderPriority(orderId, priority) {
  if (!ALLOWED_PRIORITIES.has(priority)) {
    const error = new Error('Choose a valid service priority.');
    error.statusCode = 400;
    throw error;
  }
  const { error } = await supabaseAdmin.schema('operations')
    .from('service_orders').update({ priority, updated_at: new Date().toISOString() }).eq('id', orderId);
  if (error?.code === '42703') return false;
  if (error) throw error;
  return true;
}

async function loadCustomerOrders(userId) {
  const { data: customer, error: customerError } = await supabaseAdmin
    .schema('operations')
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (customerError) throw customerError;
  if (!customer) return [];

  const { data, error } = await supabaseAdmin
    .schema('operations')
    .from('service_orders')
    .select('id, order_number, status, note, total_amount, started_at, completed_at, business_date, created_at, updated_at, scheduled_start, scheduled_end')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  const orders = (data ?? []).map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    description: row.note,
    totalAmount: Number(row.total_amount ?? 0),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    businessDate: row.business_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
  }));

  const enriched = await enrichOrdersWithAssignments(orders);
  return enriched.map((order) => ({
    ...order,
    assignment: order.assignment ? {
      id: order.assignment.id,
      status: order.assignment.status,
      scheduledStart: order.assignment.scheduledStart,
      scheduledEnd: order.assignment.scheduledEnd,
      assignedAt: order.assignment.assignedAt,
      mechanic: order.assignment.mechanic,
    } : null,
  }));
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
    || message.includes('Payment confirmation')
    || message.includes('Cash received')
    || message.includes('supported payment method')
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

function manilaParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function validateAssignmentWindow(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Choose a mechanic and valid service schedule.';
  }
  if (start.getTime() <= Date.now()) return 'Start time cannot be in the past.';
  if (end <= start) return 'End time must be later than the start time.';
  const startLocal = manilaParts(start);
  const endLocal = manilaParts(end);
  const todayLocal = manilaParts(new Date());
  const startDate = `${startLocal.year}-${startLocal.month}-${startLocal.day}`;
  const endDate = `${endLocal.year}-${endLocal.month}-${endLocal.day}`;
  const todayDate = `${todayLocal.year}-${todayLocal.month}-${todayLocal.day}`;
  if (startDate < todayDate) return 'Start date cannot be in the past.';
  if (startDate !== endDate) return 'End time must be on the same workday. Schedule separate workday assignments for multi-day jobs.';
  const startMinutes = Number(startLocal.hour) * 60 + Number(startLocal.minute);
  const endMinutes = Number(endLocal.hour) * 60 + Number(endLocal.minute);
  if (startMinutes < 8 * 60 || startMinutes >= 17 * 60 || endMinutes > 17 * 60) {
    return 'Workshop hours are 8:00 AM–5:00 PM, Philippine time.';
  }
  return '';
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

  const tax = Math.max(toNumber(order?.taxTotal ?? order?.tax_total), 0);
  const discount = Math.max(toNumber(order?.discountTotal ?? order?.discount_total), 0);
  const savedSubtotal = order?.subtotal ?? order?.subtotalAmount ?? order?.estimatedCost ?? order?.estimated_cost;
  const orderTotal = Math.max(toNumber(
    savedSubtotal
      ?? (toNumber(order?.totalAmount ?? order?.total_amount ?? order?.amount ?? order?.total) - tax + discount),
  ), 0);

  if (normalizedItems.length > 0) {
    const itemSubtotal = normalizedItems.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
    const remainingLabor = Number((orderTotal - itemSubtotal).toFixed(2));
    if (remainingLabor > 0.01) {
      normalizedItems.push({
        lineType: 'service',
        productId: null,
        serviceId: null,
        quantity: 1,
        unitPrice: remainingLabor,
        lineTotal: remainingLabor,
        displayName: 'Service labor / additional work',
        sku: 'LABOR',
      });
    }
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

function buildServiceSalePayload(order, paymentDetails) {
  const items = normalizeServiceOrderItems(order);
  const rawSubtotal = items.reduce((sum, item) => sum + toNumber(item.lineTotal), 0);
  const tax = Math.max(toNumber(order?.taxTotal ?? order?.tax_total), 0);
  const discountAmount = Math.max(toNumber(order?.discountTotal ?? order?.discount_total), 0);
  const total = Math.max(rawSubtotal - discountAmount + tax, 0);

  return {
    customerName: pickFirstString(order?.customerName, order?.customer_name, 'Walk-in Customer'),
    paymentMethod: paymentDetails.paymentMethod,
    cashReceived: paymentDetails.paymentMethod === 'cash' ? Number(paymentDetails.cashReceived) : 0,
    changeDue: paymentDetails.paymentMethod === 'cash' ? Number(paymentDetails.changeDue ?? 0) : 0,
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

async function persistServiceCompletion(orderId, paymentDetails) {
  const patch = {
    status: 'completed',
    payment_status: 'paid',
    payment_method: paymentDetails.paymentMethod,
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
    if (error.code === '42703') {
      const { error: legacyError } = await supabaseAdmin.schema(schema).from('service_orders').update({
        status: patch.status,
        completed_at: patch.completed_at,
        updated_at: patch.updated_at,
      }).eq('id', orderId);
      if (!legacyError) return;
    }
  }
  throw new Error('The service order could not be marked complete. The posted sale is safely linked and can be retried.');
}

async function completeServiceOrder(orderId, operatorId, paymentDetails = {}) {
  if (paymentDetails.paymentReceivedConfirmed !== true) {
    const error = new Error('Payment confirmation is required before finishing and posting this service order.');
    error.statusCode = 400;
    throw error;
  }
  if (!['cash', 'gcash', 'bank_transfer'].includes(paymentDetails.paymentMethod)) {
    const error = new Error('Choose a supported payment method.');
    error.statusCode = 400;
    throw error;
  }

  const currentOrder = await loadOrder(orderId);

  if (!currentOrder || isDemoServiceOrderEntry(currentOrder)) {
    const error = new Error('Service order not found.');
    error.statusCode = 404;
    throw error;
  }

  const reference = buildServiceSaleReference(currentOrder);
  let sale = await findExistingServiceSale(reference);
  let saleCreated = false;

  if (currentOrder.status === 'completed' && sale) {
    return { order: currentOrder, sale, saleCreated: false, archiveReference: reference };
  }

  const paymentPayload = {
    ...paymentDetails,
    cashReceived: toNumber(paymentDetails.cashReceived),
    changeDue: toNumber(paymentDetails.changeDue),
  };
  const payload = buildServiceSalePayload(currentOrder, paymentPayload);
  if (paymentPayload.paymentMethod === 'cash') {
    const total = payload.totals.total;
    if (paymentPayload.cashReceived < total) {
      const error = new Error('Cash received must be greater than or equal to the service total.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (!sale) {
    let saleId;
    try {
      saleId = await callRpc('create_service_order_sale', {
        payload,
        p_operator_id: operatorId ?? null,
        p_original_reference: reference,
      });
      sale = await findExistingServiceSale(reference) || { id: saleId };
    } catch (error) {
      const migrationPending = error?.code === 'PGRST202'
        || error?.code === '42883';
      if (!migrationPending) throw error;
      const legacySaleId = await callRpc('create_pos_sale', { payload, p_operator_id: operatorId ?? null });
      sale = await tagServiceSale(legacySaleId, reference) || { id: legacySaleId };
    }
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

  await persistServiceCompletion(orderId, paymentPayload);
  await callRpc('finish_mechanic_assignment', {
    p_service_order_id: orderId,
    p_actor_user_id: operatorId ?? null,
    p_outcome: 'completed',
  });

  return {
    order: await loadOrder(orderId),
    sale,
    saleCreated,
    archiveReference: reference,
  };
}

router.get('/customer/mine', requireRole('customer'), async (req, res, next) => {
  try {
    res.json({ orders: await loadCustomerOrders(req.user.id) });
  } catch (error) {
    next(normalizeServiceOrderError(error));
  }
});

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

router.post('/:orderId/assignment', requireRole('admin'), async (req, res, next) => {
  try {
    const mechanicId = String(req.body?.mechanicId || '').trim();
    const scheduledStart = new Date(req.body?.scheduledStart);
    const scheduledEnd = new Date(req.body?.scheduledEnd);

    const scheduleError = validateAssignmentWindow(scheduledStart, scheduledEnd);
    if (!mechanicId || scheduleError) {
      res.status(400).json({ error: scheduleError || 'Choose a mechanic and valid service schedule.' });
      return;
    }

    await callRpc('assign_mechanic_to_service_order', {
      p_service_order_id: req.params.orderId,
      p_mechanic_id: mechanicId,
      p_scheduled_start: scheduledStart.toISOString(),
      p_scheduled_end: scheduledEnd.toISOString(),
      p_actor_user_id: req.user.id,
      p_note: String(req.body?.note || '').trim().slice(0, 1000) || null,
    });

    res.json({ order: await loadOrder(req.params.orderId) });
  } catch (error) {
    next(normalizeAssignmentError(error));
  }
});

router.delete('/:orderId/assignment', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await callRpc('remove_mechanic_from_service_order', {
      p_service_order_id: req.params.orderId,
      p_actor_user_id: req.user.id,
      p_note: String(req.body?.note || '').trim().slice(0, 1000) || null,
    });

    res.json({
      result,
      order: await loadOrder(req.params.orderId),
    });
  } catch (error) {
    next(normalizeAssignmentError(error));
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (req.body?.priority && !ALLOWED_PRIORITIES.has(String(req.body.priority).toLowerCase())) {
      res.status(400).json({ error: 'Choose a valid service priority.' });
      return;
    }
    const order = await callRpc('limen_create_service_order', {
      p_payload: req.body ?? {},
    });
    if (order?.id && req.body?.priority) await persistServiceOrderPriority(order.id, String(req.body.priority).toLowerCase());
    res.status(201).json({ order: order?.id ? await loadOrder(order.id) : order });
  } catch (error) {
    next(normalizeServiceOrderError(error));
  }
});

router.patch('/:orderId', async (req, res, next) => {
  try {
    if (req.body?.priority !== undefined && !ALLOWED_PRIORITIES.has(String(req.body.priority).toLowerCase())) {
      res.status(400).json({ error: 'Choose a valid service priority.' });
      return;
    }
    if (req.body?.status) {
      const current = await loadOrder(req.params.orderId);
      if (!current) {
        res.status(404).json({ error: 'Service order not found.' });
        return;
      }
      const permitted = {
        pending: new Set(['pending', 'in_progress', 'cancelled']),
        in_progress: new Set(['in_progress', 'cancelled']),
        completed: new Set(['completed']),
        cancelled: new Set(['cancelled']),
      };
      if (req.body.status === 'completed') {
        res.status(409).json({ error: 'Use the receipt review and payment confirmation to finish and post a service order.' });
        return;
      }
      if (!permitted[current.status]?.has(req.body.status)) {
        res.status(409).json({ error: 'This service order status change is not allowed. Orders move from Pending to In Progress, then through the completion review.' });
        return;
      }
    }
    const order = await callRpc('limen_update_service_order', {
      p_order_id: req.params.orderId,
      p_payload: req.body ?? {},
    });
    if (!order) {
      res.status(404).json({ error: 'Service order not found.' });
      return;
    }

    if (req.body?.priority !== undefined) {
      await persistServiceOrderPriority(req.params.orderId, String(req.body.priority).toLowerCase());
    }

    if (req.body?.status === 'cancelled') {
      await callRpc('finish_mechanic_assignment', {
        p_service_order_id: req.params.orderId,
        p_actor_user_id: req.user.id,
        p_outcome: 'cancelled',
      });
    }

    res.json({ order: await loadOrder(req.params.orderId) });
  } catch (error) {
    next(normalizeServiceOrderError(error));
  }
});

router.post('/:orderId/complete', requireRole('admin', 'cashier'), async (req, res, next) => {
  try {
    const result = await completeServiceOrder(req.params.orderId, req.user?.id ?? null, req.body ?? {});
    res.json(result);
  } catch (error) {
    next(normalizeServiceOrderError(error));
  }
});

export default router;
