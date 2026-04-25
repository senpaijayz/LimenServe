import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();
const ALLOWED_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStatus(value, fallback = 'pending') {
  return ALLOWED_STATUSES.has(value) ? value : fallback;
}

function buildOrderNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SVC-${stamp}-${random}`;
}

function getIds(rows = [], key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))];
}

async function fetchByIds(table, ids, columns = '*') {
  if (!ids.length) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .schema('operations')
    .from(table)
    .select(columns)
    .in('id', ids);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((row) => [row.id, row]));
}

function mapOrder(row, customer = null, vehicle = null) {
  const description = row.note || '';

  return {
    id: row.id,
    orderNumber: row.order_number,
    order_number: row.order_number,
    customerId: row.customer_id,
    customerName: customer?.name || 'Walk-in Customer',
    customerPhone: customer?.phone || '',
    vehicleId: row.vehicle_id,
    vehicle: {
      make: vehicle?.make || 'Mitsubishi',
      model: vehicle?.model_name || '',
      year: vehicle?.year || null,
      plate: vehicle?.plate_no || '',
      engine: vehicle?.engine || '',
      mileage: vehicle?.mileage || null,
    },
    description,
    note: row.note,
    status: row.status,
    estimatedCost: Number(row.total_amount ?? row.subtotal ?? 0),
    subtotal: Number(row.subtotal ?? 0),
    taxTotal: Number(row.tax_total ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    businessDate: row.business_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadOrders({ search = '', status = 'all', limit = 50 } = {}) {
  let query = supabaseAdmin
    .schema('operations')
    .from('service_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 50, 1), 100));

  if (ALLOWED_STATUSES.has(status)) {
    query = query.eq('status', status);
  }

  const { data: rows, error } = await query;

  if (error) {
    throw error;
  }

  const customers = await fetchByIds('customers', getIds(rows, 'customer_id'), 'id, name, phone, email');
  const vehicles = await fetchByIds('vehicles', getIds(rows, 'vehicle_id'), 'id, make, model_name, year, plate_no, engine, mileage');
  const normalizedSearch = String(search || '').trim().toLowerCase();

  return (rows ?? [])
    .map((row) => mapOrder(row, customers.get(row.customer_id), vehicles.get(row.vehicle_id)))
    .filter((order) => {
      if (!normalizedSearch) {
        return true;
      }

      return [
        order.orderNumber,
        order.customerName,
        order.customerPhone,
        order.vehicle.plate,
        order.vehicle.model,
        order.description,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });
}

async function loadOrder(orderId) {
  const { data: row, error } = await supabaseAdmin
    .schema('operations')
    .from('service_orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!row) {
    return null;
  }

  const [customers, vehicles] = await Promise.all([
    fetchByIds('customers', getIds([row], 'customer_id'), 'id, name, phone, email'),
    fetchByIds('vehicles', getIds([row], 'vehicle_id'), 'id, make, model_name, year, plate_no, engine, mileage'),
  ]);

  return mapOrder(row, customers.get(row.customer_id), vehicles.get(row.vehicle_id));
}

async function createCustomer(body = {}) {
  const name = String(body.customerName || '').trim() || 'Walk-in Customer';
  const { data, error } = await supabaseAdmin
    .schema('operations')
    .from('customers')
    .insert({
      customer_type: 'walk_in',
      name,
      phone: String(body.customerPhone || '').trim() || null,
      email: null,
      metadata: {},
      business_date: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function createVehicle(body = {}, customerId) {
  const { data, error } = await supabaseAdmin
    .schema('operations')
    .from('vehicles')
    .insert({
      customer_id: customerId,
      plate_no: String(body.vehiclePlate || '').trim() || null,
      make: String(body.vehicleMake || 'Mitsubishi').trim() || 'Mitsubishi',
      model_name: String(body.vehicleModel || '').trim(),
      year: normalizeNumber(body.vehicleYear, null),
      metadata: {},
      business_date: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return data.id;
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
    const customerId = await createCustomer(req.body);
    const vehicleId = await createVehicle(req.body, customerId);
    const estimatedCost = normalizeNumber(req.body?.estimatedCost);
    const status = normalizeStatus(req.body?.status);
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .schema('operations')
      .from('service_orders')
      .insert({
        order_number: buildOrderNumber(),
        customer_id: customerId,
        vehicle_id: vehicleId,
        assigned_to: null,
        status,
        note: String(req.body?.description || '').trim(),
        subtotal: estimatedCost,
        tax_total: 0,
        total_amount: estimatedCost,
        started_at: status === 'in_progress' ? now : null,
        completed_at: status === 'completed' ? now : null,
        business_date: now.slice(0, 10),
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    const order = await loadOrder(data.id);
    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});

router.patch('/:orderId', async (req, res, next) => {
  try {
    const status = normalizeStatus(req.body?.status, null);
    const patch = {};
    const now = new Date().toISOString();

    if (status) {
      patch.status = status;
      if (status === 'in_progress') {
        patch.started_at = now;
      }
      if (status === 'completed') {
        patch.completed_at = now;
      }
    }

    if (typeof req.body?.description === 'string') {
      patch.note = req.body.description.trim();
    }

    if (req.body?.estimatedCost !== undefined) {
      const estimatedCost = normalizeNumber(req.body.estimatedCost);
      patch.subtotal = estimatedCost;
      patch.total_amount = estimatedCost;
    }

    patch.updated_at = now;

    const { error } = await supabaseAdmin
      .schema('operations')
      .from('service_orders')
      .update(patch)
      .eq('id', req.params.orderId);

    if (error) {
      throw error;
    }

    const order = await loadOrder(req.params.orderId);
    res.json({ order });
  } catch (error) {
    next(error);
  }
});

export default router;
