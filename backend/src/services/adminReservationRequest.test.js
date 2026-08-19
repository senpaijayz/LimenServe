import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdminReservationRequest } from './adminReservationRequest.js';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_KEY = '33333333-3333-4333-8333-333333333333';

test('normalizes a valid admin reservation request', () => {
  assert.deepEqual(parseAdminReservationRequest({
    customerId: CUSTOMER_ID,
    productId: PRODUCT_ID,
    requestKey: REQUEST_KEY,
    quantity: '3',
    note: '  Hold for Friday. ',
  }), {
    ok: true,
    customerId: CUSTOMER_ID,
    productId: PRODUCT_ID,
    requestKey: REQUEST_KEY,
    quantity: 3,
    customerNote: 'Hold for Friday.',
  });
});

test('generates an idempotency key when omitted', () => {
  const result = parseAdminReservationRequest({
    customerId: CUSTOMER_ID,
    productId: PRODUCT_ID,
    quantity: 1,
  }, () => REQUEST_KEY);

  assert.equal(result.ok, true);
  assert.equal(result.requestKey, REQUEST_KEY);
});

test('rejects invalid ids, fractional quantities, and oversized notes', () => {
  const result = parseAdminReservationRequest({
    customerId: 'not-an-id',
    productId: PRODUCT_ID,
    requestKey: REQUEST_KEY,
    quantity: 1.5,
    note: 'x'.repeat(1001),
  });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
});
