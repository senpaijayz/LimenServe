import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';
import { normalizeHistoricalAggregatePayload } from '../services/historicalSalesModel.js';
import { posRequestId, validatePosCheckout, posPaymentEvidence } from '../services/posCheckoutValidation.js';

const router = Router();
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});

function normalizePosError(error) {
  if (['22023','22003','22P02'].includes(error.code)) error.statusCode = 400;
  if (error.code === 'PT409') error.statusCode = 409;
  if (error.code === '42501') error.statusCode = 403;
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
    message.includes('Insufficient unreserved stock') ||
    message.includes('Historical sales require') ||
    message.includes('Historical totals require') ||
    message.includes('Historical period total') ||
    message.includes('Historical period totals') ||
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
    note: typeof body?.note === 'string' ? body.note.trim() : '',
    releaseConfirmed: body?.releaseConfirmed === true,
    paymentMethod: body?.paymentMethod || 'cash',
    ...posPaymentEvidence(body),
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

function normalizeHistoricalAggregateEntry(entry) {
  return {
    ...entry,
    aggregateId: entry?.aggregate_id ?? entry?.aggregateId ?? null,
    periodGranularity: entry?.period_granularity ?? entry?.periodGranularity ?? null,
    periodStart: entry?.period_start ?? entry?.periodStart ?? null,
    periodEnd: entry?.period_end ?? entry?.periodEnd ?? null,
    totalAmount: Number(entry?.total_amount ?? entry?.totalAmount ?? 0),
    transactionCount: Number(entry?.transaction_count ?? entry?.transactionCount ?? 0),
    paymentMethod: entry?.payment_method ?? entry?.paymentMethod ?? 'unknown',
    originalReference: entry?.original_reference ?? entry?.originalReference ?? null,
    customerName: entry?.customer_name ?? entry?.customerName ?? null,
    cashierName: entry?.cashier_name ?? entry?.cashierName ?? null,
    createdAt: entry?.created_at ?? entry?.createdAt ?? null,
    updatedAt: entry?.updated_at ?? entry?.updatedAt ?? null,
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

  if (payload.paymentMethod === 'cash' && Math.round((payload.cashReceived+Number.EPSILON)*100) < Math.round((payload.totals.total+Number.EPSILON)*100)) {
    const error = new Error('Cash received must be greater than or equal to the sale total.');
    error.statusCode = 400;
    throw error;
  }
}

function validateHistoricalSalePayload(payload) {
  if (!['cash','gcash','bank_transfer'].includes(payload.paymentMethod)) throw Object.assign(new Error('Choose a supported payment method for historical sales.'),{statusCode:400});
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

async function withPosDetail(result) {
  let detail=null;
  try {detail=normalizeSaleDetail(await callRpc('get_sale_detail',{p_sale_id:result.saleId}));} catch { /* The write is committed; do not invite a duplicate payment or stock issue. */ }
  return {...result,...(detail?.sale?{status:detail.sale.status,paymentMethod:detail.sale.paymentMethod,paidAt:detail.sale.paidAt}:{}),sale:detail?.sale || {id:result.saleId,transactionNumber:result.transactionNumber,status:result.status,paymentMethod:result.paymentMethod,totalAmount:result.totalAmount},items:detail?.items || [],receipt:detail?.receipt || null,detailUnavailable:!detail?.sale};
}
router.get('/paid-day-totals',requireRole('admin'),async(req,res,next)=>{
  try{
    if(typeof req.query.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(req.query.date))throw Object.assign(new Error('Choose a valid sales date.'),{statusCode:400});
    res.set('Cache-Control','private, no-store');res.json(await callRpc('paid_sales_day_totals',{p_date:req.query.date}));
  }catch(error){next(normalizePosError(error));}
});
router.get('/unpaid',requireRole('admin','cashier'),async(req,res,next)=>{
  try{
    const page=req.query.page===undefined?1:Number(req.query.page);
    if(typeof req.query.page==='object'||!Number.isSafeInteger(page)||page<1||page>10000)throw Object.assign(new Error('Choose a valid unpaid-order page.'),{statusCode:400});
    res.set('Cache-Control','private, no-store');
    res.json(await callRpc('list_unpaid_pos_orders',{p_page:page}));
  }catch(error){next(normalizePosError(error));}
});
router.get('/quotation/:estimateId',requireRole('admin'),async(req,res,next)=>{
  try{res.set('Cache-Control','private, no-store');const quote=await callRpc('quote_pos_context',{p_id:posRequestId(req.params.estimateId)});
    if(!quote){res.status(404).json({error:'Saved quotation not found.'});return;}res.json({quote});
  }catch(error){next(normalizePosError(error));}
});
router.post('/quotation/:estimateId/checkout',requireRole('admin'),async(req,res,next)=>{
  try{
    if(typeof req.body?.version!=='string'||!/^[a-f0-9]{32}$/.test(req.body.version))throw Object.assign(new Error('Reload this saved quotation before checkout.'),{statusCode:400});
    const result=await callRpc('checkout_quote_pos_order',{p_estimate:posRequestId(req.params.estimateId),p_version:req.body.version,p_actor:req.user.id,p_request:posRequestId(req.body.requestId),
      payment:{paymentMethod:req.body.paymentMethod,cashReceived:req.body.cashReceived,note:typeof req.body.note==='string'?req.body.note.trim():'',paymentVerified:req.body.paymentVerified===true,releaseConfirmed:req.body.releaseConfirmed===true,...posPaymentEvidence(req.body)}});
    res.status(201).json(await withPosDetail(result));
  }catch(error){next(normalizePosError(error));}
});
router.get('/requests/:requestId',requireRole('admin','cashier'),async(req,res,next)=>{
  try{
    res.set('Cache-Control','private, no-store');
    const result=await callRpc('recover_pos_order',{p_actor:req.user.id,p_request:posRequestId(req.params.requestId)});
    res.json({result:result?await withPosDetail(result):null});
  }catch(error){next(normalizePosError(error));}
});
router.post('/sales/:saleId/settle',requireRole('admin','cashier'),async(req,res,next)=>{
  try{
    const result=await callRpc('settle_pos_order',{p_sale_id:posRequestId(req.params.saleId),p_actor:req.user.id,p_request:posRequestId(req.body?.requestId),
      payload:{cashReceived:req.body?.cashReceived,paymentVerified:req.body?.paymentVerified===true,...posPaymentEvidence(req.body),...(Object.hasOwn(req.body||{},'paymentMethod')?{paymentMethod:req.body.paymentMethod}:{})}});
    res.json(await withPosDetail(result));
  }catch(error){next(normalizePosError(error));}
});
router.post('/sales',requireRole('admin','cashier'),async(req,res,next)=>{
  try{
    if(req.body?.requestId===undefined)throw Object.assign(new Error('Refresh POS before checkout. A saved retry reference is required.'),{statusCode:400});
    const payload=buildSalePayload(req.body);
    validateSalePayload(payload);
    validatePosCheckout(payload,req.body.requestId);
    const result=await callRpc('checkout_pos_order',{payload,p_actor:req.user.id,p_request:posRequestId(req.body.requestId)});
    res.status(201).json(await withPosDetail(result));
  }catch(error){next(normalizePosError(error));}
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

router.post('/sales/historical-aggregates', requireRole('admin'), async (req, res, next) => {
  try {
    const payload = normalizeHistoricalAggregatePayload(req.body);
    const aggregateId = await callRpc('create_historical_sales_aggregate', {
      payload,
      p_operator_id: req.user?.id ?? null,
    });

    res.status(201).json({ aggregateId, aggregate: { ...payload, aggregateId } });
  } catch (error) {
    next(normalizePosError(error));
  }
});

router.put('/sales/historical-aggregates/:aggregateId', requireRole('admin'), async (req, res, next) => {
  try {
    const payload = normalizeHistoricalAggregatePayload(req.body);
    const aggregateId = await callRpc('update_historical_sales_aggregate', {
      p_aggregate_id: req.params.aggregateId,
      payload,
      p_operator_id: req.user?.id ?? null,
    });

    res.json({ aggregateId, aggregate: { ...payload, aggregateId } });
  } catch (error) {
    next(normalizePosError(error));
  }
});

router.get('/sales/historical-aggregates', requireRole('admin', 'cashier', 'stock_clerk'), async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 200);
    const page = Math.max(Number(req.query.page || 1), 1);
    const offset = (page - 1) * limit;
    const rows = await callRpc('list_historical_sales_aggregates', {
      p_start_date: req.query.startDate || null,
      p_end_date: req.query.endDate || null,
      p_search: req.query.search || null,
      p_limit_count: limit,
      p_offset_count: offset,
    });
    const aggregates = (rows ?? []).map(normalizeHistoricalAggregateEntry);
    const total = Number(rows?.[0]?.total_count ?? rows?.[0]?.totalCount ?? aggregates.length);

    res.json({
      aggregates,
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
