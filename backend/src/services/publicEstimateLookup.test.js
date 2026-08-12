import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PUBLIC_ESTIMATE_INPUT_INVALID_MESSAGE,
  PUBLIC_ESTIMATE_INPUT_REQUIRED_MESSAGE,
  PUBLIC_ESTIMATE_NOT_FOUND_MESSAGE,
  buildPublicEstimateLookupResult,
  createPublicEstimateLookupHandler,
  normalizePhilippinePhoneNumber,
  normalizePublicEstimateNumber,
} from './publicEstimateLookup.js';

function createResponse() {
  const headers = new Map();

  return {
    statusCode: 200,
    body: null,
    headers,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), String(value));
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function invokeHandler(handler, body) {
  const response = createResponse();
  let nextError = null;
  await handler({ body }, response, (error) => {
    nextError = error;
  });
  return { response, nextError };
}

function privateSnapshot() {
  return {
    estimate: {
      id: 'estimate-secret-id',
      estimate_number: 'EST-DEMO-202510-A',
      status: 'sent',
      source: 'public',
      note: 'private note',
      subtotal: '1000.00',
      discount_total: '50.00',
      tax_total: '114.00',
      grand_total: '1064.00',
      issued_at: '2026-08-01T00:00:00Z',
      valid_until: '2026-08-31',
      created_by: 'user-secret-id',
      metadata: { private: true },
    },
    customer: {
      id: 'customer-secret-id',
      name: 'Customer Name',
      phone: '09170000001',
      email: 'customer@example.com',
      metadata: { private: true },
    },
    vehicle: {
      id: 'vehicle-secret-id',
      customer_id: 'customer-secret-id',
      make: 'Mitsubishi',
      model_name: 'Xpander',
      year: 2024,
      plate_no: 'SECRET-PLATE',
      mileage: 20000,
      metadata: { private: true },
    },
    items: [{
      id: 'line-secret-id',
      line_type: 'product',
      product_id: 'product-secret-id',
      product_name: 'Oil Filter',
      product_sku: 'FILTER-1',
      service_id: null,
      quantity: '2',
      unit_price: '500',
      line_total: '1000',
      recommendation_rule_id: 'rule-secret-id',
      metadata: { private: true },
    }],
  };
}

test('requires both a quote number and phone without calling the RPC', async () => {
  let rpcCalls = 0;
  const handler = createPublicEstimateLookupHandler({
    rpc: async () => {
      rpcCalls += 1;
      return null;
    },
  });

  const { response, nextError } = await invokeHandler(handler, { estimateNumber: 'EST-123' });

  assert.equal(nextError, null);
  assert.equal(rpcCalls, 0);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: PUBLIC_ESTIMATE_INPUT_REQUIRED_MESSAGE });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('rejects malformed lookup input without calling the RPC', async () => {
  let rpcCalls = 0;
  const handler = createPublicEstimateLookupHandler({
    rpc: async () => {
      rpcCalls += 1;
      return null;
    },
  });

  const { response } = await invokeHandler(handler, {
    estimateNumber: 'not a quote',
    phone: '0917-ABC-0000',
  });

  assert.equal(rpcCalls, 0);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: PUBLIC_ESTIMATE_INPUT_INVALID_MESSAGE });
});

test('normalizes quote numbers and Philippine phone numbers before lookup', async () => {
  let rpcCall = null;
  const handler = createPublicEstimateLookupHandler({
    rpc: async (name, params) => {
      rpcCall = { name, params };
      return null;
    },
  });

  const { response } = await invokeHandler(handler, {
    estimateNumber: '  est-demo-202510-a  ',
    phone: '+63 (917) 000-0001',
  });

  assert.equal(normalizePublicEstimateNumber(' est-20260801000000000 '), 'EST-20260801000000000');
  assert.equal(normalizePhilippinePhoneNumber('0917 000 0001'), '09170000001');
  assert.equal(normalizePhilippinePhoneNumber('0063 917 000 0001'), '09170000001');
  assert.deepEqual(rpcCall, {
    name: 'lookup_public_estimate',
    params: {
      p_estimate_number: 'EST-DEMO-202510-A',
      p_phone: '09170000001',
    },
  });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: PUBLIC_ESTIMATE_NOT_FOUND_MESSAGE });
});

test('uses the same generic response when verification does not match', async () => {
  const handler = createPublicEstimateLookupHandler({ rpc: async () => null });

  const { response } = await invokeHandler(handler, {
    estimateNumber: 'EST-UNKNOWN-1',
    phone: '09170000001',
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: PUBLIC_ESTIMATE_NOT_FOUND_MESSAGE });
});

test('returns an explicit public allowlist for a verified quote', async () => {
  const snapshot = privateSnapshot();
  const expected = {
    estimate: {
      estimate_number: 'EST-DEMO-202510-A',
      status: 'sent',
      subtotal: 1000,
      discount_total: 50,
      tax_total: 114,
      grand_total: 1064,
      issued_at: '2026-08-01T00:00:00Z',
      valid_until: '2026-08-31',
    },
    customer: { name: 'Customer Name' },
    vehicle: {
      make: 'Mitsubishi',
      model: 'Xpander',
      year: 2024,
    },
    items: [{
      line_type: 'product',
      product_name: 'Oil Filter',
      service_name: null,
      quantity: 2,
      unit_price: 500,
      line_total: 1000,
    }],
  };

  assert.deepEqual(buildPublicEstimateLookupResult(snapshot), expected);

  const handler = createPublicEstimateLookupHandler({ rpc: async () => snapshot });
  const { response, nextError } = await invokeHandler(handler, {
    estimateNumber: 'EST-DEMO-202510-A',
    phone: '09170000001',
  });

  assert.equal(nextError, null);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { estimate: expected });

  const serialized = JSON.stringify(response.body);
  for (const privateValue of [
    'estimate-secret-id',
    'user-secret-id',
    'customer-secret-id',
    'vehicle-secret-id',
    'line-secret-id',
    'product-secret-id',
    'rule-secret-id',
    '09170000001',
    'customer@example.com',
    'SECRET-PLATE',
    'private note',
    'FILTER-1',
  ]) {
    assert.equal(serialized.includes(privateValue), false, `response leaked ${privateValue}`);
  }
});

test('does not publish an internal estimate returned by the privileged RPC', () => {
  const snapshot = privateSnapshot();
  snapshot.estimate.source = 'internal';
  assert.equal(buildPublicEstimateLookupResult(snapshot), null);
});

test('preserves database details for server logs but sends only a safe lookup error', async () => {
  const databaseError = new Error('relation operations.secret_table does not exist');
  const handler = createPublicEstimateLookupHandler({
    rpc: async () => {
      throw databaseError;
    },
  });

  const { response, nextError } = await invokeHandler(handler, {
    estimateNumber: 'EST-2026-100',
    phone: '09171234567',
  });

  assert.equal(response.body, null);
  assert.equal(nextError.statusCode, 503);
  assert.equal(nextError.message, 'Quote lookup is temporarily unavailable.');
  assert.equal(nextError.cause, databaseError);
  assert.doesNotMatch(nextError.message, /operations|relation/i);
});

test('fails closed when the RPC result omits the internal source marker', () => {
  const snapshot = privateSnapshot();
  delete snapshot.estimate.source;

  assert.equal(buildPublicEstimateLookupResult(snapshot), null);
});
