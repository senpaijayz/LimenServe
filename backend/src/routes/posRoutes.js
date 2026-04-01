import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();

function normalizePosError(error) {
  const message = String(error?.message || '');

  if (
    message.includes('A sale must include at least one line item') ||
    message.includes('Unsupported payment method') ||
    message.includes('Sale subtotal does not match') ||
    message.includes('Sale totals are inconsistent') ||
    message.includes('Discount percent must be between') ||
    message.includes('Cash received must be greater than or equal') ||
    message.includes('Each sale line must') ||
    message.includes('missing product') ||
    message.includes('missing service') ||
    message.includes('Manual service lines must include') ||
    message.includes('Insufficient stock')
  ) {
    error.statusCode = error.statusCode || 400;
  }

  return error;
}

function toNumeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLineType(item) {
  if (item?.lineType === 'service' || item?.serviceId) {
    return 'service';
  }

  return 'product';
}

function buildSalePayload(body) {
  const items = Array.isArray(body?.items) ? body.items : [];

  return {
    customerName: typeof body?.customerName === 'string' ? body.customerName.trim() : '',
    paymentMethod: body?.paymentMethod || 'cash',
    cashReceived: toNumeric(body?.cashReceived),
    changeDue: toNumeric(body?.changeDue),
    discountPercent: toNumeric(body?.discountPercent),
    totals: {
      rawSubtotal: toNumeric(body?.totals?.rawSubtotal),
      discountAmount: toNumeric(body?.totals?.discountAmount),
      tax: toNumeric(body?.totals?.tax),
      total: toNumeric(body?.totals?.total),
    },
    items: items.map((item) => ({
      lineType: normalizeLineType(item),
      productId: normalizeLineType(item) === 'product' ? (item?.productId || item?.id || null) : null,
      serviceId: normalizeLineType(item) === 'service' ? (item?.serviceId || null) : null,
      quantity: toNumeric(item?.quantity, 1),
      unitPrice: toNumeric(item?.unitPrice ?? item?.price),
      lineTotal: toNumeric(item?.lineTotal ?? (toNumeric(item?.quantity, 1) * toNumeric(item?.unitPrice ?? item?.price))),
      displayName: item?.displayName || item?.itemName || item?.name || '',
      sku: item?.sku || item?.itemSku || item?.code || '',
    })),
  };
}

function validateSalePayload(payload) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    const error = new Error('A sale must include at least one line item.');
    error.statusCode = 400;
    throw error;
  }

  for (const item of payload.items) {
    if (!['product', 'service'].includes(item.lineType)) {
      const error = new Error('Each sale line must be a product or service.');
      error.statusCode = 400;
      throw error;
    }

    if (item.quantity <= 0 || item.unitPrice < 0) {
      const error = new Error('Each sale line must have a valid quantity and price.');
      error.statusCode = 400;
      throw error;
    }

    if (item.lineType === 'product' && !item.productId) {
      const error = new Error('Product sale lines must reference a valid product.');
      error.statusCode = 400;
      throw error;
    }

    if (item.lineType === 'service' && !item.serviceId && !item.displayName) {
      const error = new Error('Manual service lines must include a service name.');
      error.statusCode = 400;
      throw error;
    }
  }

  if (payload.paymentMethod === 'cash' && payload.cashReceived < payload.totals.total) {
    const error = new Error('Cash received must be greater than or equal to the sale total.');
    error.statusCode = 400;
    throw error;
  }
}

router.post('/sales', requireRole('admin', 'cashier'), async (req, res, next) => {
  try {
    const payload = buildSalePayload(req.body);
    validateSalePayload(payload);

    const saleId = await callRpc('create_pos_sale', {
      payload,
      p_operator_id: req.user?.id ?? null,
    });

    const detail = await callRpc('get_sale_detail', {
      p_sale_id: saleId,
    });

    if (!detail?.sale) {
      const error = new Error('Sale was created but the receipt could not be loaded.');
      error.statusCode = 500;
      throw error;
    }

    res.status(201).json({
      saleId,
      transactionNumber: detail.sale.transactionNumber,
      createdAt: detail.sale.createdAt,
      sale: detail.sale,
      items: detail.items ?? [],
      receipt: detail.receipt ?? null,
    });
  } catch (error) {
    next(normalizePosError(error));
  }
});

router.get('/sales', requireRole('admin', 'cashier', 'stock_clerk'), async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const page = Math.max(Number(req.query.page || 1), 1);
    const offset = (page - 1) * limit;

    const sales = await callRpc('list_sales_history', {
      p_search: req.query.search || null,
      p_start_date: req.query.startDate || null,
      p_end_date: req.query.endDate || null,
      p_limit_count: limit,
      p_offset_count: offset,
    });

    const total = Number(sales?.[0]?.total_count ?? 0);

    res.json({
      sales: sales ?? [],
      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    next(normalizePosError(error));
  }
});

router.get('/sales/:saleId', requireRole('admin', 'cashier', 'stock_clerk'), async (req, res, next) => {
  try {
    const detail = await callRpc('get_sale_detail', {
      p_sale_id: req.params.saleId,
    });

    if (!detail?.sale) {
      res.status(404).json({ error: 'Sale not found.' });
      return;
    }

    res.json(detail);
  } catch (error) {
    next(normalizePosError(error));
  }
});

export default router;
