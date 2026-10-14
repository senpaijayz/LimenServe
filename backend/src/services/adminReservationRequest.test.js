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
    items: [{ productId: PRODUCT_ID, quantity: 3 }],
    requestKey: REQUEST_KEY,
    customerName: 'Jane Customer',
    customerPhone: '09171234567',
    customerEmail: 'jane@example.com',
    quantity: 3,
    customerNote: 'Hold for Friday.',
    paymentStatus: 'paid',
  });
});

test('accepts multiple parts and validates every line independently', () => {
  const valid = { customerName: 'Jane Customer', customerPhone: '09171234567', requestKey: REQUEST_KEY,
    items: [{ productId: PRODUCT_ID, quantity: '2' }, { productId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', quantity: 1 }] };
  const result = parseAdminReservationRequest(valid);
  assert.equal(result.ok, true);
  assert.deepEqual(result.items, [{ productId: PRODUCT_ID, quantity: 2 }, { productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', quantity: 1 }]);
  for (const items of [[], [{ productId: PRODUCT_ID, quantity: 0 }], [{ productId: PRODUCT_ID, quantity: 1000 }], [...valid.items, { productId: PRODUCT_ID, quantity: 1 }], [valid.items[0], { productId: 'bad', quantity: 1 }], [valid.items[0], { productId: valid.items[1].productId, quantity: 1.5 }]]) {
    assert.equal(parseAdminReservationRequest({ ...valid, items }).ok, false);
  }
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

test('explains the specific invalid detail without asking users for technical keys', () => {
  const valid = { customerName: 'Jane', customerPhone: '09171234567', productId: PRODUCT_ID, quantity: 1, requestKey: REQUEST_KEY };
  for (const [change, message] of [
    [{ customerName: 'j' }, /name.*2 characters/],
    [{ customerPhone: 'bad' }, /valid phone/],
    [{ customerEmail: 'bad' }, /email address/],
    [{ items: [] }, /at least one part/],
    [{ quantity: 1.5 }, /quantity for part 1.*whole number/],
    [{ requestKey: 'bad' }, /Close the form/],
  ]) {
    const result = parseAdminReservationRequest({ ...valid, ...change });
    assert.equal(result.ok, false);
    assert.match(result.error, message);
    assert.doesNotMatch(result.error, /request key/);
  }
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
