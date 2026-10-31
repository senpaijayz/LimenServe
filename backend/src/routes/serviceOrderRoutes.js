import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();
const ALLOWED_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
const ALLOWED_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

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
    || message.includes('appointments must')
    || message.includes('Appointments must')
    || message.includes('Past dates')
    || message.includes('Schedule each work session')
    || message.includes('This mechanic')
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
        name: actor?.full_name || 'Former staff',
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
  const ids = orders.map((order) => order?.id).filter(Boolean);
  const { data: workStates, error: workError } = ids.length
    ? await supabaseAdmin.schema('operations').from('service_work_state')
      .select('service_order_id,stage').in('service_order_id', ids)
    : { data: [], error: null };
  if (workError) throw workError;
  const workById = new Map((workStates || []).map((row) => [row.service_order_id, row.stage]));
  return orders.map((order) => {
    const assignment = assignments.get(order?.id) ?? null;
    const orderMetadata = metadataById.get(order?.id) ?? {};
    return {
      ...order,
      workStage: workById.get(order.id) || null,
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

  if (error?.code === '23505' && message.includes('vehicles_plate_no_idx')) {
    error.statusCode = 409;
    error.message = 'This plate is already registered. Check the vehicle details and try again.';
  }

  if (error?.code === '42501') error.statusCode = 403;
  if (error?.code === 'P0002') error.statusCode = 404;
  if (error?.code === '22023') error.statusCode = 400;
  if (error?.code === 'PT409') error.statusCode = 409;
  if (error?.code === '23P01') error.statusCode = 409;
  if (error?.code === 'PT400') error.statusCode = 400;

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

async function validateAssignmentWindow(start, end) {
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
  const hours = await callRpc('limen_workshop_hours', { p_day: startDate });
  const startMinutes = Number(startLocal.hour) * 60 + Number(startLocal.minute);
  const endMinutes = Number(endLocal.hour) * 60 + Number(endLocal.minute);
  const openMinutes = Number(hours.opensAt.slice(0, 2)) * 60 + Number(hours.opensAt.slice(3, 5));
  const closeMinutes = Number(hours.closesAt.slice(0, 2)) * 60 + Number(hours.closesAt.slice(3, 5));
  if (startMinutes < openMinutes || startMinutes >= closeMinutes || endMinutes > closeMinutes) {
    return closeMinutes === 720
      ? 'Sunday appointments must be between 8:00 AM and 12:00 PM, Philippine time.'
      : 'Appointments must be between 8:00 AM and 5:00 PM, Philippine time.';
  }
  return '';
}

function manilaDateIso(day, minutes) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date, Math.floor(minutes / 60) - 8, minutes % 60)).toISOString();
}

function mechanicAllowsWindow(mechanic, date, startMinutes, endMinutes) {
  if (!mechanic || mechanic.is_active === false || mechanic.availability_status === 'off_duty') return false;
  let profile = {};
  try { profile = JSON.parse(mechanic.location_name || '{}'); } catch { /* legacy location text */ }
  if (profile.available_date && profile.available_date !== date) return false;
  const shift = String(profile.shift_type || mechanic.shift_label || '').toLowerCase();
  if (shift.includes('morning') && endMinutes > 720) return false;
  if (shift.includes('afternoon') && startMinutes < 780) return false;
  return true;
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

  return normalizedItems;
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

  const posted = await callRpc('limen_finalize_service_order', {
    p_order_id: orderId,
    p_actor: operatorId,
    p_payment_method: paymentDetails.paymentMethod,
    p_cash_received: toNumber(paymentDetails.cashReceived),
    p_payment_reference: String(paymentDetails.paymentReference || '').trim() || null,
    p_payment_verified: paymentDetails.paymentReceivedConfirmed === true,
  });

  const order = await loadOrder(orderId);
  if (!posted?.saleId || order?.paymentStatus !== 'paid') {
    const error = new Error('Payment could not be verified in Sales. Please reload the order before trying again.');
    error.statusCode = 409;
    throw error;
  }

  return {
    order,
    sale: { id: posted.saleId, totalAmount: posted.total },
    saleCreated: posted.saleCreated,
    archiveReference: buildServiceSaleReference(currentOrder),
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

router.get('/attention', async (req,res,next) => {
  try {
    const page=req.query.page===undefined?1:Number(req.query.page),kind=req.query.kind===undefined?'all':req.query.kind;
    if ((req.query.page!==undefined && typeof req.query.page!=='string') || !Number.isSafeInteger(page) || page<1 || page>100000
      || !['all','awaiting_payment','overdue','awaiting_assignment','release_review','payment_review'].includes(kind)) {
      return res.status(400).json({error:'Choose a valid job category and page.'});
    }
    res.set('Cache-Control','private, no-store');
    res.json(await callRpc('service_attention_page',{p_page:page,p_kind:kind}));
  } catch(error) {next(normalizeServiceOrderError(error));}
});

router.get('/intake-requests/:requestId', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.requestId)) {
      return res.status(400).json({ error: 'Choose a valid intake request reference.' });
    }
    const result = await callRpc('limen_service_intake_result', { p_actor: req.user.id, p_request: req.params.requestId });
    res.json({ orderId: result?.orderId || null });
  } catch (error) { next(normalizeServiceOrderError(error)); }
});

router.get('/queue', async (req, res, next) => {
  try {
    const stage = String(req.query.stage || 'active');
    const priority = String(req.query.priority || 'all');
    const sort = String(req.query.sort || 'newest');
    const date = String(req.query.date || '').trim();
    if (!['active', 'pending', 'in_progress', 'overdue', 'completed', 'cancelled', 'all'].includes(stage)
      || !['all', 'low', 'normal', 'high', 'urgent'].includes(priority)
      || !['newest', 'oldest', 'due', 'urgency'].includes(sort)) {
      res.status(400).json({ error: 'Choose valid queue filters.' });
      return;
    }
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))) {
      res.status(400).json({ error: 'Choose a valid service order date.' });
      return;
    }
    const queue = await callRpc(date ? 'limen_service_order_queue_by_date' : 'limen_service_order_queue', {
      p_search: String(req.query.search || '').trim().slice(0, 120),
      p_stage: stage,
      p_mechanic_id: String(req.query.mechanicId || '').trim() || null,
      p_priority: priority,
      p_sort: sort,
      p_page: Number(req.query.page || 1),
      p_page_size: Number(req.query.pageSize || 18),
      ...(date ? { p_date: date } : {}),
    });
    const { count: awaitingPayment, error: paymentCountError } = date ? { count: queue?.summary?.awaitingPayment ?? 0, error: null } : await supabaseAdmin
      .schema('operations').from('service_work_state')
      .select('service_order_id', { count: 'exact', head: true })
      .eq('stage', 'work_completed');
    if (paymentCountError) throw paymentCountError;
    res.json({ ...queue,
      summary: { ...(queue?.summary || {}), awaitingPayment: awaitingPayment || 0 },
      orders: await enrichOrdersWithAssignments(queue?.orders || []),
    });
  } catch (error) {
    next(normalizeServiceOrderError(error));
  }
});

router.get('/schedule/slots', async (req, res, next) => {
  try {
    const day = String(req.query.date || '');
    const duration = Number(req.query.duration || 60);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)
      || !Number.isInteger(duration) || duration < 15 || duration > 540
      || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
      res.status(400).json({ error: 'Choose a valid date and appointment length.' });
      return;
    }
    const hours = await callRpc('limen_workshop_hours', { p_day: day });
    const opening = Number(hours.opensAt.slice(0, 2)) * 60 + Number(hours.opensAt.slice(3, 5));
    const closing = Number(hours.closesAt.slice(0, 2)) * 60 + Number(hours.closesAt.slice(3, 5));
    const mechanicId = String(req.query.mechanicId || '').trim();
    const orderId = String(req.query.orderId || '').trim();
    const [mechanicResult, assignmentResult] = await Promise.all([
      mechanicId ? supabaseAdmin.schema('operations').from('mechanics')
        .select('id, is_active, availability_status, shift_label, location_name').eq('id', mechanicId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      mechanicId ? supabaseAdmin.schema('operations').from('mechanic_assignments')
        .select('service_order_id, scheduled_start, scheduled_end')
        .eq('mechanic_id', mechanicId).eq('status', 'assigned')
        .lt('scheduled_start', manilaDateIso(day, closing))
        .gt('scheduled_end', manilaDateIso(day, opening))
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (mechanicResult.error) throw mechanicResult.error;
    if (assignmentResult.error) throw assignmentResult.error;
    const slots = [];
    for (let start = opening; start + duration <= closing; start += 15) {
      const startIso = manilaDateIso(day, start);
      const endIso = manilaDateIso(day, start + duration);
      const past = Date.parse(startIso) <= Date.now();
      const shiftAllowed = !mechanicId || mechanicAllowsWindow(mechanicResult.data, day, start, start + duration);
      const occupied = (assignmentResult.data || []).some((assignment) =>
        assignment.service_order_id !== orderId
        && Date.parse(assignment.scheduled_start) < Date.parse(endIso)
        && Date.parse(assignment.scheduled_end) > Date.parse(startIso));
      slots.push({ start: startIso, end: endIso, available: !past && shiftAllowed && !occupied,
        reason: past ? 'Already passed' : !shiftAllowed ? 'Outside mechanic shift' : occupied ? 'Mechanic booked' : null });
    }
    res.json({ hours, slots });
  } catch (error) {
    next(normalizeAssignmentError(error));
  }
});

router.get('/schedule/day', async (req, res, next) => {
  try {
    const day = String(req.query.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
      res.status(400).json({ error: 'Choose a valid schedule date.' }); return;
    }
    const hours = await callRpc('limen_workshop_hours', { p_day: day });
    const dayStart = manilaDateIso(day, 0);
    const dayEnd = manilaDateIso(day, 24 * 60);
    const { data: assignments, error } = await supabaseAdmin.schema('operations')
      .from('mechanic_assignments')
      .select('id, service_order_id, mechanic_id, scheduled_start, scheduled_end, status, note')
      .lt('scheduled_start', dayEnd).gt('scheduled_end', dayStart)
      .order('scheduled_start', { ascending: true }).limit(200);
    if (error) throw error;
    const orderIds = [...new Set((assignments || []).map((row) => row.service_order_id))];
    const mechanicIds = [...new Set((assignments || []).map((row) => row.mechanic_id))];
    const [ordersResult, mechanicsResult] = await Promise.all([
      orderIds.length ? supabaseAdmin.schema('operations').from('service_orders')
        .select('id, order_number, note, status').in('id', orderIds)
        : Promise.resolve({ data: [], error: null }),
      mechanicIds.length ? supabaseAdmin.schema('operations').from('mechanics')
        .select('id, full_name, specialization').in('id', mechanicIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (ordersResult.error) throw ordersResult.error;
    if (mechanicsResult.error) throw mechanicsResult.error;
    const orders = new Map((ordersResult.data || []).map((row) => [row.id, row]));
    const mechanics = new Map((mechanicsResult.data || []).map((row) => [row.id, row]));
    res.json({ date: day, hours, bookings: (assignments || []).map((row) => ({
      ...row, order: orders.get(row.service_order_id) || null,
      mechanic: mechanics.get(row.mechanic_id) || null,
    })) });
  } catch (error) { next(normalizeServiceOrderError(error)); }
});

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

router.get('/:orderId/work', async (req, res, next) => {
  try {
    const order = await loadOrder(req.params.orderId);
    if (!order) { res.status(404).json({ error: 'Service order not found.' }); return; }
    const [stateResult, linesResult, eventsResult, assignmentsResult] = await Promise.all([
      supabaseAdmin.schema('operations').from('service_work_state').select('*')
        .eq('service_order_id', order.id).maybeSingle(),
      supabaseAdmin.schema('operations').from('service_work_lines').select('*')
        .eq('service_order_id', order.id).order('created_at', { ascending: true }),
      supabaseAdmin.schema('operations').from('service_work_events').select('*')
        .eq('service_order_id', order.id).order('occurred_at', { ascending: false }).limit(200),
      supabaseAdmin.schema('operations').from('mechanic_assignments')
        .select('id, mechanic_id, status, scheduled_start, scheduled_end, assigned_at, ended_at, note')
        .eq('service_order_id', order.id).order('assigned_at', { ascending: false }).limit(100),
    ]);
    for (const result of [stateResult, linesResult, eventsResult, assignmentsResult]) {
      if (result.error) throw result.error;
    }
    const { data: sale, error: saleError } = await supabaseAdmin.schema('operations')
      .from('sales_transactions')
      .select('id, transaction_number, total_amount, subtotal, discount_total, tax_total, payment_method, cash_received, change_due, created_at, original_reference')
      .eq('original_reference', buildServiceSaleReference(order)).order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (saleError) throw saleError;
    const { data: saleLines, error: saleLinesError } = sale
      ? await supabaseAdmin.schema('operations').from('sales_transaction_items')
        .select('line_type, item_name_snapshot, item_sku_snapshot, quantity, unit_price, line_total')
        .eq('transaction_id', sale.id)
      : { data: [], error: null };
    if (saleLinesError) throw saleLinesError;
    res.json({
      state: stateResult.data || { stage: order.status === 'completed' ? 'released' : order.status === 'cancelled' ? 'cancelled' : order.status === 'in_progress' ? 'in_progress' : 'intake' },
      lines: linesResult.data || [],
      events: eventsResult.data || [],
      assignments: assignmentsResult.data || [],
      sale: sale ? { ...sale, lines: saleLines || [] } : null,
    });
  } catch (error) { next(normalizeServiceOrderError(error)); }
});

router.post('/:orderId/work/events', async (req, res, next) => {
  try {
    await callRpc('limen_record_service_work_event', {
      p_order_id: req.params.orderId,
      p_actor: req.user.id,
      p_event_type: String(req.body?.eventType || ''),
      p_note: String(req.body?.note || '').trim().slice(0, 2000) || null,
    });
    res.json({ saved: true, order: await loadOrder(req.params.orderId) });
  } catch (error) { next(normalizeServiceOrderError(error)); }
});

router.put('/:orderId/work/lines', async (req, res, next) => {
  try {
    if (!Array.isArray(req.body?.lines)) {
      res.status(400).json({ error: 'Send the actual parts and labor lines to save.' }); return;
    }
    const result = await callRpc('limen_replace_service_work_lines', {
      p_order_id: req.params.orderId,
      p_actor: req.user.id,
      p_lines: req.body.lines,
    });
    res.json({ saved: true, ...result });
  } catch (error) { next(normalizeServiceOrderError(error)); }
});

router.post('/:orderId/assignment', requireRole('admin'), async (req, res, next) => {
  try {
    const mechanicId = String(req.body?.mechanicId || '').trim();
    const explicitTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
    if (!explicitTimestamp.test(String(req.body?.scheduledStart || ''))
      || !explicitTimestamp.test(String(req.body?.scheduledEnd || ''))) {
      res.status(400).json({ error: 'Send start and end times with an explicit time zone.' });
      return;
    }
    const scheduledStart = new Date(req.body?.scheduledStart);
    const scheduledEnd = new Date(req.body?.scheduledEnd);

    const scheduleError = await validateAssignmentWindow(scheduledStart, scheduledEnd);
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
    const intakeRequestId = req.body?.intakeRequestId;
    if (typeof intakeRequestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(intakeRequestId)) {
      return res.status(400).json({ error: 'Open the current intake form before creating this job. Keep your entered details; a saved request reference is required for safe recovery.' });
    }
    if (req.body?.customerId || req.body?.vehicleId) {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validId = (value) => typeof value === 'string' && uuid.test(value);
      if (!validId(req.body.customerId) || !validId(req.body.vehicleId)
        || !validId(req.body.intakeRequestId) || typeof req.body.identityVersion !== 'string' || !/^[a-f0-9]{32}$/.test(req.body.identityVersion)) {
        return res.status(400).json({ error: 'Choose a saved customer and vehicle with a valid intake reference.' });
      }
    }
    if (req.body?.priority && !ALLOWED_PRIORITIES.has(String(req.body.priority).toLowerCase())) {
      res.status(400).json({ error: 'Choose a valid service priority.' });
      return;
    }
    const timestampWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
    if (req.body.mechanicId && (!timestampWithZone.test(String(req.body.scheduledStart || '')) || !timestampWithZone.test(String(req.body.scheduledEnd || '')))) {
      res.status(400).json({ error: 'Choose an appointment with a start and end time, including its time zone.' }); return;
    }
    const order = await callRpc('limen_create_service_intake', {
      p_payload: req.body, p_actor: req.user.id, p_request_id: intakeRequestId,
    });
    // Creation has committed. An optional enrichment read must not turn that
    // success into a misleading creation failure and invite a duplicate.
    try { res.status(201).json({ order: await loadOrder(order.id) }); }
    catch { res.status(201).json({ order, refreshRequired: true }); }
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
