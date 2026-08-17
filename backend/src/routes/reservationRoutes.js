import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { clearPublicResponseCache } from '../middleware/cache.js';
import { getDefaultRateLimitKey } from '../middleware/rateLimit.js';
import {
  createInMemoryRateLimitStore,
  createStoreBackedRateLimiter,
  createSupabaseRateLimitStore,
} from '../middleware/sharedRateLimit.js';
import { logger } from '../observability/logger.js';
import { callRpc } from '../services/supabaseRpc.js';
import { parsePublicReservationRequest } from '../services/publicReservationRequest.js';

const router = Router();
const ACTIVE_STATUSES = new Set([
  'pending',
  'approved',
  'waiting_for_stock',
  'partially_available',
  'available',
]);
const ALL_STATUSES = new Set([
  ...ACTIVE_STATUSES,
  'completed',
  'rejected',
  'cancelled',
]);
const ADMIN_ACTIONS = new Set(['approve', 'allocate', 'reject', 'cancel', 'complete', 'update']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const publicReservationRateLimitStore = env.publicRateLimitStore === 'supabase'
  ? createSupabaseRateLimitStore({ supabase: supabaseAdmin })
  : createInMemoryRateLimitStore({ maxEntries: env.globalRateLimitMaxEntries });

const publicReservationRateLimiter = createStoreBackedRateLimiter({
  store: publicReservationRateLimitStore,
  scope: 'reservation.create.ip',
  windowMs: 60_000,
  limit: 5,
  keyGenerator: getDefaultRateLimitKey,
  hashSecret: env.supabaseServiceRoleKey,
  message: 'Too many reservation requests. Please try again later.',
  onLimitReached(req, details) {
    (req.log || logger).warn('rate_limit.exceeded', {
      requestId: req.requestId,
      clientIp: req.ip,
      path: req.path,
      scope: details.scope,
      limit: details.limit,
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

function parseLimit(value, fallback = 50, maximum = 200) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), maximum) : fallback;
}

function parseOffset(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.max(parsed, 0) : 0;
}

function normalizeOptionalDate(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}

function requireUuidParam(value, label = 'identifier') {
  if (!UUID_PATTERN.test(String(value || '').trim())) {
    const error = new Error(`Choose a valid reservation ${label}.`);
    error.statusCode = 400;
    throw error;
  }
}

function normalizeReservationError(error) {
  const message = String(error?.message || '');

  if (error?.code === '42501') {
    error.statusCode = 403;
  } else if (error?.code === '23505' || message.toLowerCase().includes('already exists')) {
    error.statusCode = 409;
  } else if (
    message.includes('required')
    || message.includes('must be')
    || message.includes('Only ')
    || message.includes('Unsupported')
    || message.includes('not eligible')
    || message.includes('not available for reservation')
    || message.includes('normal purchase')
  ) {
    error.statusCode = 400;
  }

  return error;
}

function normalizeReservation(row = {}, { customers = new Map(), products = new Map() } = {}) {
  const customer = customers.get(row.customer_id) ?? null;
  const product = products.get(row.product_id) ?? null;
  const requestedQuantity = Number(row.requested_quantity ?? 0);
  const allocatedQuantity = Number(row.allocated_quantity ?? 0);

  return {
    id: row.id,
    reservationNumber: row.reservation_number,
    customerId: row.customer_id,
    customer: customer ? {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    } : null,
    productId: row.product_id,
    product: product ? {
      id: product.id,
      sku: product.sku,
      name: product.name,
      status: product.status,
    } : null,
    requestedQuantity,
    allocatedQuantity,
    remainingQuantity: Math.max(requestedQuantity - allocatedQuantity, 0),
    status: row.status,
    customerNote: row.customer_note,
    adminNote: row.admin_note,
    estimatedAvailableOn: row.estimated_available_on,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at,
    availableAt: row.available_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    processedBy: row.processed_by,
    lastProcessedAt: row.last_processed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canCancel: row.status === 'pending' && allocatedQuantity === 0,
    isActive: ACTIVE_STATUSES.has(row.status),
  };
}

async function enrichReservations(rows = []) {
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))];
  const productIds = [...new Set(rows.map((row) => row.product_id).filter(Boolean))];
  const [customerResult, productResult] = await Promise.all([
    customerIds.length
      ? supabaseAdmin
        .schema('operations')
        .from('customers')
        .select('id, name, email, phone')
        .in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabaseAdmin
        .schema('catalog')
        .from('products')
        .select('id, sku, name, status')
        .in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (customerResult.error) throw customerResult.error;
  if (productResult.error) throw productResult.error;

  const related = {
    customers: new Map((customerResult.data ?? []).map((row) => [row.id, row])),
    products: new Map((productResult.data ?? []).map((row) => [row.id, row])),
  };

  return rows.map((row) => normalizeReservation(row, related));
}

async function getReservationRow(reservationId) {
  const { data, error } = await supabaseAdmin
    .schema('operations')
    .from('part_reservations')
    .select('*')
    .eq('id', reservationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getReservationResponse(reservationId, includeEvents = false) {
  const row = await getReservationRow(reservationId);
  if (!row) return null;

  const [reservation] = await enrichReservations([row]);
  if (!includeEvents) return reservation;

  const { data: events, error } = await supabaseAdmin
    .schema('operations')
    .from('part_reservation_events')
    .select('id, event_type, from_status, to_status, quantity, note, actor_user_id, metadata, created_at')
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return {
    ...reservation,
    events: (events ?? []).map((event) => ({
      id: event.id,
      eventType: event.event_type,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      quantity: event.quantity === null ? null : Number(event.quantity),
      note: event.note,
      actorUserId: event.actor_user_id,
      metadata: event.metadata ?? {},
      createdAt: event.created_at,
    })),
  };
}

async function searchRelatedIds({ schema, table, columns, term, limit }) {
  const pattern = `%${term}%`;
  const results = await Promise.all(columns.map((column) => supabaseAdmin
    .schema(schema)
    .from(table)
    .select('id')
    .ilike(column, pattern)
    .limit(limit)));

  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  return [...new Set(results.flatMap((result) => (result.data ?? []).map((row) => row.id)))];
}

router.post('/', publicReservationRateLimiter, async (req, res, next) => {
  try {
    const parsed = parsePublicReservationRequest({
      ...req.body,
      requestKey: req.body?.requestKey || randomUUID(),
    });
    if (!parsed.ok) {
      res.status(parsed.statusCode).json({ error: parsed.error });
      return;
    }

    const result = await callRpc('create_guest_part_reservation', {
      p_product_id: parsed.productId,
      p_requested_quantity: parsed.quantity,
      p_request_key: parsed.requestKey,
      p_customer_name: parsed.customerName,
      p_customer_phone: parsed.customerPhone,
      p_customer_email: parsed.customerEmail,
      p_customer_note: parsed.customerNote,
    });
    const reservationId = result?.reservation?.id;
    const reservation = reservationId
      ? await getReservationResponse(reservationId, true)
      : result?.reservation;

    res.status(result?.idempotentReplay ? 200 : 201).json({
      reservation,
      idempotentReplay: Boolean(result?.idempotentReplay),
    });
  } catch (error) {
    next(normalizeReservationError(error));
  }
});

router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const status = String(req.query.status || 'all').trim().toLowerCase();
    const limit = parseLimit(req.query.limit);
    const offset = parseOffset(req.query.offset);
    const startDate = normalizeOptionalDate(req.query.startDate);
    const endDate = normalizeOptionalDate(req.query.endDate);

    if (status !== 'all' && !ALL_STATUSES.has(status)) {
      res.status(400).json({ error: 'Invalid reservation status filter.' });
      return;
    }

    if (startDate === undefined || endDate === undefined) {
      res.status(400).json({ error: 'Date filters must use YYYY-MM-DD.' });
      return;
    }

    let customerIds = null;
    const customerSearch = String(req.query.customer || '').trim();
    if (customerSearch) {
      customerIds = await searchRelatedIds({
        schema: 'operations',
        table: 'customers',
        columns: ['name', 'email', 'phone'],
        term: customerSearch,
        limit: 200,
      });
    }

    let productIds = null;
    const partSearch = String(req.query.part || '').trim();
    if (partSearch) {
      productIds = await searchRelatedIds({
        schema: 'catalog',
        table: 'products',
        columns: ['name', 'sku'],
        term: partSearch,
        limit: 500,
      });
    }

    if (customerIds?.length === 0 || productIds?.length === 0) {
      res.json({ reservations: [], total: 0, limit, offset });
      return;
    }

    let query = supabaseAdmin
      .schema('operations')
      .from('part_reservations')
      .select('*', { count: 'exact' });

    if (status !== 'all') query = query.eq('status', status);
    if (startDate) query = query.gte('requested_at', `${startDate}T00:00:00.000Z`);
    if (endDate) query = query.lt('requested_at', `${endDate}T23:59:59.999Z`);
    if (customerIds) query = query.in('customer_id', customerIds);
    if (productIds) query = query.in('product_id', productIds);

    const { data, error, count } = await query
      .order('requested_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({
      reservations: await enrichReservations(data ?? []),
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    next(normalizeReservationError(error));
  }
});

router.get('/:reservationId', requireRole('admin'), async (req, res, next) => {
  try {
    requireUuidParam(req.params.reservationId);
    const reservation = await getReservationResponse(req.params.reservationId, true);
    if (!reservation) {
      res.status(404).json({ error: 'Reservation was not found.' });
      return;
    }

    res.json({ reservation });
  } catch (error) {
    next(normalizeReservationError(error));
  }
});

router.patch('/:reservationId', requireRole('admin'), async (req, res, next) => {
  try {
    requireUuidParam(req.params.reservationId);
    const action = String(req.body?.action || '').trim().toLowerCase();
    const estimatedAvailableOn = normalizeOptionalDate(req.body?.estimatedAvailableOn);

    if (!ADMIN_ACTIONS.has(action)) {
      res.status(400).json({ error: 'Choose a valid reservation action.' });
      return;
    }

    if (estimatedAvailableOn === undefined) {
      res.status(400).json({ error: 'Estimated availability must use YYYY-MM-DD.' });
      return;
    }

    await callRpc('process_part_reservation', {
      p_reservation_id: req.params.reservationId,
      p_action: action,
      p_actor_user_id: req.user.id,
      p_admin_note: String(req.body?.note || '').trim().slice(0, 1000) || null,
      p_estimated_available_on: estimatedAvailableOn,
    });
    clearPublicResponseCache(['catalog-products', 'recommendations']);

    const reservation = await getReservationResponse(req.params.reservationId, true);
    res.json({ reservation });
  } catch (error) {
    next(normalizeReservationError(error));
  }
});

export default router;
