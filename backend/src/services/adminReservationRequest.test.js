import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminReservationRequest } from './adminReservationRequest.js';

const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_KEY = '33333333-3333-4333-8333-333333333333';

test('normalizes a valid admin reservation request', () => {
  assert.deepEqual(parseAdminReservationRequest({
    productId: PRODUCT_ID,
    requestKey: REQUEST_KEY,
    customerName: '  Jane Customer ',
    customerPhone: '+63 917 123 4567',
    customerEmail: 'JANE@example.com',
    quantity: '3',
    note: '  Hold for Friday. ',
    paymentStatus: 'Paid',
  }), {
    ok: true,
    productId: PRODUCT_ID,
    requestKey: REQUEST_KEY,
    customerName: 'Jane Customer',
    customerPhone: '09171234567',
    customerEmail: 'jane@example.com',
    quantity: 3,
    customerNote: 'Hold for Friday.',
    paymentStatus: 'paid',
  });
});

test('generates an idempotency key when omitted', () => {
  const result = parseAdminReservationRequest({
    productId: PRODUCT_ID,
    quantity: 1,
    customerName: 'Jane Customer',
    customerPhone: '09171234567',
  }, () => REQUEST_KEY);

  assert.equal(result.ok, true);
  assert.equal(result.requestKey, REQUEST_KEY);
});

test('rejects invalid ids, fractional quantities, and oversized notes', () => {
  const result = parseAdminReservationRequest({
    productId: PRODUCT_ID,
    requestKey: REQUEST_KEY,
    customerName: 'A',
    customerPhone: 'not-a-phone',
    quantity: 1.5,
    note: 'x'.repeat(1001),
  });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
});
