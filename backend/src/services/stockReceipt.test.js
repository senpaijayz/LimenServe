import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapStockReceiptError,
  receiveCatalogStock,
  receiveSupplierInvoiceStock,
  requireIdempotencyKey,
} from './stockReceipt.js';

test('requires a bounded, header-safe idempotency key', () => {
  assert.throws(() => requireIdempotencyKey(''), { statusCode: 400 });
  assert.throws(() => requireIdempotencyKey('short'), { statusCode: 400 });
  assert.throws(() => requireIdempotencyKey(`stock-${'x'.repeat(123)}`), { statusCode: 400 });
  assert.throws(() => requireIdempotencyKey('stock key with spaces'), { statusCode: 400 });
  assert.equal(requireIdempotencyKey(' stock-1234 '), 'stock-1234');
});

test('manual receiving passes one normalized transaction request to the RPC', async () => {
  const calls = [];
  const payload = { productId: 'product-1', quantity: 3 };
  const result = await receiveCatalogStock({
    payload,
    performedBy: 'user-1',
    idempotencyKey: 'stock-1234',
    invokeRpc: async (name, params) => {
      calls.push({ name, params });
      return { updatedStock: 8, idempotentReplay: false };
    },
  });

  assert.deepEqual(calls, [{
    name: 'receive_catalog_stock',
    params: {
      p_payload: payload,
      p_performed_by: 'user-1',
      p_idempotency_key: 'stock-1234',
    },
  }]);
  assert.equal(result.updatedStock, 8);
});

test('invoice receiving uses the idempotent wrapper and preserves replay responses', async () => {
  const calls = [];
  const result = await receiveSupplierInvoiceStock({
    invoice: { invoiceNumber: 'INV-42', items: [{ productId: 'product-1', quantity: 2 }] },
    performedBy: 'user-2',
    idempotencyKey: 'invoice-1234',
    allowNewProducts: false,
    invokeRpc: async (name, params) => {
      calls.push({ name, params });
      return { receiptId: 'receipt-1', idempotentReplay: true };
    },
  });

  assert.equal(calls[0].name, 'receive_supplier_invoice_stock_idempotent');
  assert.equal(calls[0].params.p_allow_new_products, false);
  assert.equal(result.idempotentReplay, true);
});

test('maps idempotency conflicts without exposing database details', () => {
  const mapped = mapStockReceiptError(new Error('IDEMPOTENCY_KEY_REUSED: payload hashes differ at catalog.receipt_idempotency'));

  assert.equal(mapped.statusCode, 409);
  assert.equal(mapped.message, 'That idempotency key was already used for a different stock receipt.');
  assert.doesNotMatch(mapped.message, /catalog|hash/i);
});

test('maps validation and unexpected database errors to safe client messages', () => {
  const invalid = mapStockReceiptError({ code: '22P02', message: 'invalid input syntax for type uuid: secret-value' });
  const unexpected = mapStockReceiptError({ code: 'XX000', message: 'internal relation catalog.secret failed' });

  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.message, 'The stock receipt is invalid.');
  assert.equal(unexpected.statusCode, 500);
  assert.equal(unexpected.message, 'The stock receipt could not be completed.');
  assert.equal(unexpected.cause.message, 'internal relation catalog.secret failed');
});
