const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeStockReceiptError(statusCode, message, cause) {
  const error = httpError(statusCode, message);
  error.cause = cause;
  return error;
}

export function requireIdempotencyKey(value) {
  const key = String(value || '').trim();

  if (!key) {
    throw httpError(400, 'Idempotency-Key header is required.');
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw httpError(400, 'Idempotency-Key must be 8-128 characters using letters, numbers, dots, colons, underscores, or hyphens.');
  }

  return key;
}

export function mapStockReceiptError(error) {
  const message = String(error?.message || '');
  const code = String(error?.code || '');

  if (message.includes('IDEMPOTENCY_KEY_REUSED')) {
    return safeStockReceiptError(409, 'That idempotency key was already used for a different stock receipt.', error);
  }

  if (message.includes('STOCK_RECEIPT_PRODUCT_NOT_FOUND') || code === 'P0002') {
    return safeStockReceiptError(404, 'The product or supplier was not found.', error);
  }

  if (message.includes('STOCK_RECEIPT_INVALID') || ['22023', '22P02', '23503'].includes(code)) {
    return safeStockReceiptError(400, 'The stock receipt is invalid.', error);
  }

  return safeStockReceiptError(500, 'The stock receipt could not be completed.', error);
}

export async function receiveCatalogStock({
  payload,
  performedBy = null,
  idempotencyKey,
  invokeRpc,
}) {
  const key = requireIdempotencyKey(idempotencyKey);

  if (typeof invokeRpc !== 'function') {
    throw new TypeError('An RPC caller is required.');
  }

  try {
    return await invokeRpc('receive_catalog_stock', {
      p_payload: payload,
      p_performed_by: performedBy,
      p_idempotency_key: key,
    });
  } catch (error) {
    throw mapStockReceiptError(error);
  }
}

export async function receiveSupplierInvoiceStock({
  invoice,
  performedBy = null,
  idempotencyKey,
  allowNewProducts = true,
  invokeRpc,
}) {
  const key = requireIdempotencyKey(idempotencyKey);

  if (typeof invokeRpc !== 'function') {
    throw new TypeError('An RPC caller is required.');
  }

  try {
    return await invokeRpc('receive_supplier_invoice_stock_idempotent', {
      p_invoice: invoice,
      p_performed_by: performedBy,
      p_idempotency_key: key,
      p_allow_new_products: allowNewProducts,
    });
  } catch (error) {
    throw mapStockReceiptError(error);
  }
}
