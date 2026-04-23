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
    message.includes('Insufficient stock') ||
    message.includes('Historical sales require') ||
    message.includes('Only historical encoded sales can be edited')
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

function normalizeBaseItems(items = []) {
  return items.map((item) => {
    const lineType = normalizeLineType(item);

    return {
      lineType,
      productId: lineType === 'product' ? (item?.productId || item?.id || null) : null,
      serviceId: lineType === 'service' ? (item?.serviceId || null) : null,
      quantity: toNumeric(item?.quantity, 1),
      unitPrice: toNumeric(item?.unitPrice ?? item?.price),
      lineTotal: toNumeric(item?.lineTotal ?? (toNumeric(item?.quantity, 1) * toNumeric(item?.unitPrice ?? item?.price))),
      displayName: item?.displayName || item?.itemName || item?.name || '',
      sku: item?.sku || item?.itemSku || item?.code || '',
    };
  });
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
    items: normalizeBaseItems(items),
  };
}

function buildHistoricalSalePayload(body) {
  const payload = buildSalePayload(body);

  return {
    ...payload,
    sourceType: 'historical_encoded',
    saleAt: typeof body?.saleAt === 'string' ? body.saleAt : '',
    originalReference: typeof body?.originalReference === 'string' ? body.originalReference.trim() : '',
    cashierName: typeof body?.cashierName === 'string' ? body.cashierName.trim() : '',
    note: typeof body?.note === 'string' ? body.note.trim() : '',
    inventoryApplied: false,
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

function validateHistoricalSalePayload(payload) {
  validateSalePayload(payload);

  if (!payload.saleAt || Number.isNaN(Date.parse(payload.saleAt))) {
    const error = new Error('Historical sales require a valid sale date and time.');
    error.statusCode = 400;
    throw error;
  }

  if (!payload.originalReference) {
    const error = new Error('Historical sales require an original paper reference.');
    error.statusCode = 400;
    throw error;
  }

  if (!payload.cashierName) {
    const error = new Error('Historical sales require the original cashier name.');
    error.statusCode = 400;
    throw error;
  }
}

function normalizeSalesListEntry(entry) {
  const saleId = entry?.sale_id ?? entry?.saleId ?? null;
  const transactionNumber = entry?.transaction_number ?? entry?.transactionNumber ?? null;
  const customerName = entry?.customer_name ?? entry?.customerName ?? null;
  const cashierName = entry?.cashier_name ?? entry?.cashierName ?? null;
  const sourceType = entry?.source_type ?? entry?.sourceType ?? 'pos';
  const originalReference = entry?.original_reference ?? entry?.originalReference ?? null;
  const inventoryApplied = entry?.inventory_applied ?? entry?.inventoryApplied;

  return {
    ...entry,
    sale_id: saleId,
    transaction_number: transactionNumber,
    customer_name: customerName,
    cashier_name: cashierName,
    source_type: sourceType,
    original_reference: originalReference,
    inventory_applied: inventoryApplied,
    sale_at: entry?.sale_at ?? entry?.saleAt ?? entry?.created_at ?? null,
    encoded_by_name: entry?.encoded_by_name ?? entry?.encodedByName ?? null,
    updated_by_name: entry?.updated_by_name ?? entry?.updatedByName ?? null,
    saleId,
    transactionNumber,
    customerName,
    cashierName,
    sourceType,
    originalReference,
    inventoryApplied: Boolean(inventoryApplied),
    saleAt: entry?.sale_at ?? entry?.saleAt ?? entry?.created_at ?? null,
    encodedByName: entry?.encoded_by_name ?? entry?.encodedByName ?? null,
    updatedByName: entry?.updated_by_name ?? entry?.updatedByName ?? null,
    itemCount: Number(entry?.item_count ?? entry?.itemCount ?? 0),
    lineCount: Number(entry?.line_count ?? entry?.lineCount ?? 0),
  };
}

function isDemoSaleEntry(entry) {
  const transactionNumber = String(entry?.transaction_number ?? entry?.transactionNumber ?? '');
  const customerName = String(entry?.customer_name ?? entry?.customerName ?? '');
  const originalReference = String(entry?.original_reference ?? entry?.originalReference ?? '');

  return transactionNumber.startsWith('SALE-DEMO-')
    || customerName.toLowerCase().startsWith('demo customer')
    || originalReference.toUpperCase().startsWith('DEMO-');
}

function normalizeSaleDetail(detail) {
  if (!detail?.sale) {
    return detail;
  }

  const sale = detail.sale;
  const sourceType = sale.sourceType ?? sale.source_type ?? 'pos';
  const originalReference = sale.originalReference ?? sale.original_reference ?? null;
  const inventoryApplied = sale.inventoryApplied ?? sale.inventory_applied;

  return {
    ...detail,
    sale: {
      ...sale,
      source_type: sourceType,
      original_reference: originalReference,
      inventory_applied: inventoryApplied,
      sale_at: sale.saleAt ?? sale.sale_at ?? sale.createdAt ?? sale.created_at ?? null,
      cashier_name_snapshot: sale.cashierNameSnapshot ?? sale.cashier_name_snapshot ?? null,
      encoded_by_name: sale.encodedByName ?? sale.encoded_by_name ?? null,
      updated_by_name: sale.updatedByName ?? sale.updated_by_name ?? null,
      sourceType,
      originalReference,
      inventoryApplied: Boolean(inventoryApplied),
      saleAt: sale.saleAt ?? sale.sale_at ?? sale.createdAt ?? sale.created_at ?? null,
      cashierNameSnapshot: sale.cashierNameSnapshot ?? sale.cashier_name_snapshot ?? null,
      encodedByName: sale.encodedByName ?? sale.encoded_by_name ?? null,
      updatedByName: sale.updatedByName ?? sale.updated_by_name ?? null,
    },
  };
}

router.post('/sales', requireRole('admin', 'cashier'), async (req, res, next) => {
  try {
    const payload = buildSalePayload(req.body);
    validateSalePayload(payload);

    const saleId = await callRpc('create_pos_sale', {
      payload,
      p_operator_id: req.user?.id ?? null,
    });

    const detail = normalizeSaleDetail(await callRpc('get_sale_detail', {
      p_sale_id: saleId,
    }));

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

router.post('/sales/historical', requireRole('admin'), async (req, res, next) => {
  try {
    const payload = buildHistoricalSalePayload(req.body);
    validateHistoricalSalePayload(payload);

    const saleId = await callRpc('create_historical_sale', {
      payload,
      p_operator_id: req.user?.id ?? null,
    });

    const detail = normalizeSaleDetail(await callRpc('get_sale_detail', {
      p_sale_id: saleId,
    }));

    res.status(201).json({
      saleId,
      sale: detail?.sale ?? null,
      items: detail?.items ?? [],
      receipt: detail?.receipt ?? null,
    });
  } catch (error) {
    next(normalizePosError(error));
  }
});

router.put('/sales/:saleId/historical', requireRole('admin'), async (req, res, next) => {
  try {
    const payload = buildHistoricalSalePayload(req.body);
    validateHistoricalSalePayload(payload);

    const saleId = await callRpc('update_historical_sale', {
      p_sale_id: req.params.saleId,
      payload,
      p_operator_id: req.user?.id ?? null,
    });

    const detail = normalizeSaleDetail(await callRpc('get_sale_detail', {
      p_sale_id: saleId,
    }));

    res.json({
      saleId,
      sale: detail?.sale ?? null,
      items: detail?.items ?? [],
      receipt: detail?.receipt ?? null,
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
    const normalizedSales = (sales ?? [])
      .filter((entry) => !isDemoSaleEntry(entry))
      .map(normalizeSalesListEntry);
    const rawTotal = Number((sales ?? [])?.[0]?.total_count ?? (sales ?? [])?.[0]?.totalCount ?? 0);
    const total = Math.max(rawTotal - ((sales ?? []).length - normalizedSales.length), normalizedSales.length);

    res.json({
      sales: normalizedSales,
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
    const detail = normalizeSaleDetail(await callRpc('get_sale_detail', {
      p_sale_id: req.params.saleId,
    }));

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
