import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicReservationRequest } from './publicReservationRequest.js';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_KEY = '22222222-2222-4222-8222-222222222222';

test('normalizes a valid guest reservation request without authentication', () => {
  const result = parsePublicReservationRequest({
    productId: PRODUCT_ID,
    requestKey: REQUEST_KEY,
    quantity: '2',
    customerName: '  Jane Customer ',
    customerPhone: '+63 917 123 4567',
    customerEmail: 'JANE@example.com',
    note: '  Please call before arrival. ',
  });

  assert.deepEqual(result, {
    ok: true,
    productId: PRODUCT_ID,
    requestKey: REQUEST_KEY,
    quantity: 2,
    customerName: 'Jane Customer',
    customerPhone: '09171234567',
    customerEmail: 'jane@example.com',
    customerNote: 'Please call before arrival.',
  });
});

test('rejects incomplete or unsafe guest reservation details', () => {
  const result = parsePublicReservationRequest({
    productId: PRODUCT_ID,
    requestKey: REQUEST_KEY,
    quantity: 1,
    customerName: 'A',
    customerPhone: 'not-a-phone',
    customerEmail: 'bad email',
  });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
});
