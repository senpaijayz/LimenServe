import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PUBLIC_ESTIMATE_CREATE_INVALID_MESSAGE,
  PUBLIC_ESTIMATE_CREATE_UNAVAILABLE_MESSAGE,
  applyToPublicEstimateCreators,
  createPublicEstimateCreateHandler,
  getPublicEstimatePhoneRateLimitKey,
  isTrustedEstimateCreator,
  parsePublicEstimateCreateInput,
} from './publicEstimateCreate.js';

const NOW = new Date('2026-08-06T10:20:30.000Z');
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const SERVICE_ID = '22222222-2222-4222-8222-222222222222';
const RULE_ID = '33333333-3333-4333-8333-333333333333';

function validPayload() {
  return {
    customer: {
      customer_type: 'walk_in',
      name: '  Customer Name  ',
      phone: '+63 (917) 123-4567',
      metadata: { source: 'public_estimate_page' },
    },
    vehicle: {
      make: 'Mitsubishi',
      model_name: '  Xpander  ',
      year: '2024',
      plate_no: 'ABC-1234',
      metadata: {
        displayLabel: '  2024 Mitsubishi Xpander  ',
        source: 'public_estimate_page',
      },
    },
    estimate: {
      status: 'sent',
      source: 'public',
      note: '  Public estimate generated from LimenServe quote builder.  ',
      subtotal: 1300,
      discount_total: 100,
      tax_total: 144,
      grand_total: 1344,
      issued_at: '2020-01-01T00:00:00.000Z',
      valid_until: '2099-12-31',
      revision_note: 'Client-provided revision text',
    },
    items: [
      {
        line_type: 'product',
        product_id: PRODUCT_ID.toUpperCase(),
        product_name: 'Oil Filter',
        product_sku: 'FILTER-1',
        quantity: 2,
        unit_price: 500,
        line_total: 1000,
        recommendation_rule_id: RULE_ID,
        is_upsell: true,
        bundle_key: 'maintenance',
        bundle_name: 'Maintenance bundle',
        bundle_tier_label: 'Recommended',
        catalog_unit_price: 550,
      },
      {
        line_type: 'service',
        service_id: SERVICE_ID,
        service_name: 'Installation',
        quantity: 1,
        unit_price: 200,
        line_total: 200,
        recommendation_rule_id: null,
        is_upsell: false,
      },
    ],
  };
}

function createResponse() {
  const headers = new Map();

  return {
    statusCode: 200,
    body: null,
    headers,
    set(name, value) {
      headers.set(name.toLowerCase(), String(value));
      return this;
    },
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

async function resolveValidPricing({ items, requestedItems, requestedEstimate }) {
  return {
    ok: true,
    items: items.map((item, index) => ({
      ...item,
      unit_price: requestedItems[index].unit_price,
      line_total: requestedItems[index].line_total,
    })),
    totals: {
      subtotal: requestedEstimate.subtotal,
      discount_total: requestedEstimate.discount_total,
      tax_total: requestedEstimate.tax_total,
      grand_total: requestedEstimate.grand_total,
    },
  };
}

test('normalizes the public UI payload into a fixed privileged-RPC allowlist', () => {
  const parsed = parsePublicEstimateCreateInput(validPayload(), { now: () => NOW });

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.payload, {
    customer: {
      customer_type: 'walk_in',
      name: 'Customer Name',
      phone: '09171234567',
      metadata: { source: 'public_estimate_page' },
    },
    vehicle: {
      make: 'Mitsubishi',
      model_name: 'Xpander',
      year: 2024,
      metadata: {
        displayLabel: '2024 Mitsubishi Xpander',
        source: 'public_estimate_page',
      },
    },
    estimate: {
      status: 'sent',
      source: 'public',
      note: 'Public estimate generated from LimenServe quote builder.',
      subtotal: 1300,
      discount_total: 100,
      tax_total: 144,
      grand_total: 1344,
      issued_at: '2026-08-06T10:20:30.000Z',
      valid_until: '2026-09-05',
      revision_note: 'Public quote created',
    },
    items: [
      {
        line_type: 'product',
        product_id: PRODUCT_ID,
        quantity: 2,
        unit_price: 500,
        line_total: 1000,
        recommendation_rule_id: RULE_ID,
        is_upsell: true,
      },
      {
        line_type: 'service',
        service_id: SERVICE_ID,
        quantity: 1,
        unit_price: 200,
        line_total: 200,
        recommendation_rule_id: null,
        is_upsell: false,
      },
    ],
  });

  const serialized = JSON.stringify(parsed.payload);
  for (const omittedValue of [
    'ABC-1234',
    'FILTER-1',
    'Maintenance bundle',
    'Client-provided revision text',
    '2099-12-31',
  ]) {
    assert.equal(serialized.includes(omittedValue), false, `payload retained ${omittedValue}`);
  }
});

test('forces safe source, status, customer type, make, and server-owned validity values', () => {
  const payload = validPayload();
  payload.customer.customer_type = 'wholesale';
  payload.vehicle.make = 'Other';
  payload.estimate.source = 'internal';
  payload.estimate.status = 'approved';
  payload.estimate.issued_at = '2050-01-01T00:00:00.000Z';
  payload.estimate.valid_until = '2050-12-31';

  const parsed = parsePublicEstimateCreateInput(payload, { now: NOW });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.customer.customer_type, 'walk_in');
  assert.equal(parsed.payload.vehicle.make, 'Mitsubishi');
  assert.equal(parsed.payload.estimate.source, 'public');
  assert.equal(parsed.payload.estimate.status, 'sent');
  assert.equal(parsed.payload.estimate.issued_at, NOW.toISOString());
  assert.equal(parsed.payload.estimate.valid_until, '2026-09-05');
});

test('requires and normalizes a Philippine phone number', () => {
  const payload = validPayload();
  payload.customer.phone = 'not-a-phone';

  const invalid = parsePublicEstimateCreateInput(payload, { now: NOW });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.error, PUBLIC_ESTIMATE_CREATE_INVALID_MESSAGE);
  assert.match(invalid.reason, /phone/i);

  payload.customer.phone = '0063 917 123 4567';
  const valid = parsePublicEstimateCreateInput(payload, { now: NOW });
  assert.equal(valid.payload.customer.phone, '09171234567');
});

test('rejects unknown or privileged fields at every public DTO boundary', () => {
  for (const mutate of [
    (payload) => { payload.created_by = 'attacker'; },
    (payload) => { payload.customer.email = 'attacker@example.com'; },
    (payload) => { payload.customer.metadata.is_admin = true; },
    (payload) => { payload.vehicle.engine = 'attacker'; },
    (payload) => { payload.vehicle.metadata.private = true; },
    (payload) => { payload.estimate.estimate_number = 'EST-CHOSEN'; },
    (payload) => { payload.items[0].business_date = '2050-01-01'; },
  ]) {
    const payload = validPayload();
    mutate(payload);
    const parsed = parsePublicEstimateCreateInput(payload, { now: NOW });
    assert.equal(parsed.ok, false);
    assert.match(parsed.reason, /not allowed/i);
  }
});

test('rejects malformed, conflicting, empty, and oversized item collections', () => {
  const malformedUuid = validPayload();
  malformedUuid.items[0].product_id = 'product-1';
  assert.equal(parsePublicEstimateCreateInput(malformedUuid, { now: NOW }).ok, false);

  const conflictingIds = validPayload();
  conflictingIds.items[0].service_id = SERVICE_ID;
  assert.equal(parsePublicEstimateCreateInput(conflictingIds, { now: NOW }).ok, false);

  const empty = validPayload();
  empty.items = [];
  assert.equal(parsePublicEstimateCreateInput(empty, { now: NOW }).ok, false);

  const oversized = validPayload();
  oversized.items = Array.from({ length: 101 }, () => ({ ...oversized.items[0] }));
  assert.equal(parsePublicEstimateCreateInput(oversized, { now: NOW }).ok, false);
});

test('rejects negative, excessive, fractional-quantity, and inconsistent financial values', () => {
  for (const mutate of [
    (payload) => { payload.items[0].unit_price = -1; },
    (payload) => { payload.items[0].quantity = 1.5; },
    (payload) => { payload.items[0].quantity = 1001; },
    (payload) => { payload.items[0].line_total = 999; },
    (payload) => { payload.estimate.subtotal = 999; },
    (payload) => { payload.estimate.tax_total = 143; },
    (payload) => { payload.estimate.grand_total = 999; },
  ]) {
    const payload = validPayload();
    mutate(payload);
    assert.equal(parsePublicEstimateCreateInput(payload, { now: NOW }).ok, false);
  }
});

test('rejects non-object bodies, nested objects in text fields, and control characters', () => {
  assert.equal(parsePublicEstimateCreateInput(null, { now: NOW }).ok, false);
  assert.equal(parsePublicEstimateCreateInput([], { now: NOW }).ok, false);

  const nestedName = validPayload();
  nestedName.customer.name = { text: 'Customer' };
  assert.equal(parsePublicEstimateCreateInput(nestedName, { now: NOW }).ok, false);

  const controlName = validPayload();
  controlName.customer.name = 'Customer\u0000Name';
  assert.equal(parsePublicEstimateCreateInput(controlName, { now: NOW }).ok, false);
});

test('valid public creation calls persistence only with the normalized DTO', async () => {
  let persistedPayload = null;
  let loadedId = null;
  let notified = null;
  const snapshot = {
    estimate: {
      id: 'estimate-id',
      estimate_number: 'EST-20260806-A',
      source: 'public',
      status: 'sent',
      subtotal: 1300,
      discount_total: 100,
      tax_total: 144,
      grand_total: 1344,
      issued_at: NOW.toISOString(),
      valid_until: '2026-09-05',
      note: 'private note',
    },
    customer: {
      id: 'customer-id',
      name: 'Customer Name',
      phone: '09171234567',
      metadata: { private: true },
    },
    vehicle: {
      id: 'vehicle-id',
      make: 'Mitsubishi',
      model_name: 'Xpander',
      year: 2024,
      plate_no: 'PRIVATE-PLATE',
    },
    items: [{
      id: 'item-id',
      line_type: 'product',
      product_id: PRODUCT_ID,
      product_name: 'Oil Filter',
      product_sku: 'PRIVATE-SKU',
      quantity: 2,
      unit_price: 500,
      line_total: 1000,
    }],
  };
  const handler = createPublicEstimateCreateHandler({
    now: () => NOW,
    resolvePricing: resolveValidPricing,
    createEstimate: async (payload) => {
      persistedPayload = payload;
      return 'estimate-id';
    },
    loadEstimate: async (estimateId) => {
      loadedId = estimateId;
      return snapshot;
    },
    notify: (estimate) => {
      notified = estimate;
    },
  });

  const { response, nextError } = await invokeHandler(handler, validPayload());

  assert.equal(nextError, null);
  assert.equal(response.statusCode, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(persistedPayload.customer.phone, '09171234567');
  assert.equal(persistedPayload.estimate.source, 'public');
  assert.equal(Object.hasOwn(persistedPayload.vehicle, 'plate_no'), false);
  assert.equal(loadedId, 'estimate-id');
  assert.equal(notified, snapshot);
  assert.deepEqual(response.body, {
    estimate: {
      estimate: {
        estimate_number: 'EST-20260806-A',
        status: 'sent',
        subtotal: 1300,
        discount_total: 100,
        tax_total: 144,
        grand_total: 1344,
        issued_at: NOW.toISOString(),
        valid_until: '2026-09-05',
      },
      customer: { name: 'Customer Name' },
      vehicle: { make: 'Mitsubishi', model: 'Xpander', year: 2024 },
      items: [{
        line_type: 'product',
        product_name: 'Oil Filter',
        service_name: null,
        quantity: 2,
        unit_price: 500,
        line_total: 1000,
      }],
    },
  });

  const serializedResponse = JSON.stringify(response.body);
  for (const privateValue of [
    'estimate-id',
    'customer-id',
    'vehicle-id',
    'item-id',
    PRODUCT_ID,
    '09171234567',
    'PRIVATE-PLATE',
    'PRIVATE-SKU',
    'private note',
  ]) {
    assert.equal(serializedResponse.includes(privateValue), false, `response leaked ${privateValue}`);
  }
});

test('pricing resolution runs before persistence and owns persisted financial values', async () => {
  let persistedPayload = null;
  let pricingInput = null;
  const snapshot = {
    estimate: {
      estimate_number: 'EST-20260806-CANONICAL',
      source: 'public',
      status: 'sent',
      subtotal: 1500,
      discount_total: 300,
      tax_total: 144,
      grand_total: 1344,
    },
    customer: { name: 'Customer Name' },
    vehicle: null,
    items: [],
  };
  const handler = createPublicEstimateCreateHandler({
    now: () => NOW,
    resolvePricing: async (input) => {
      pricingInput = input;
      return {
        ok: true,
        items: input.items.map((item) => ({ ...item, unit_price: 400, line_total: item.quantity * 400 })),
        totals: {
          subtotal: 1500,
          discount_total: 300,
          tax_total: 144,
          grand_total: 1344,
        },
      };
    },
    createEstimate: async (payload) => {
      persistedPayload = payload;
      return 'estimate-id';
    },
    loadEstimate: async () => snapshot,
  });

  const { response, nextError } = await invokeHandler(handler, validPayload());

  assert.equal(nextError, null);
  assert.equal(response.statusCode, 201);
  assert.equal(pricingInput.vehicle.model_name, 'Xpander');
  assert.equal(pricingInput.requestedItems[0].catalog_unit_price, 550);
  assert.equal(persistedPayload.items[0].unit_price, 400);
  assert.equal(persistedPayload.estimate.subtotal, 1500);
  assert.equal(persistedPayload.estimate.discount_total, 300);
});

test('pricing rejection is generic and never reaches persistence', async () => {
  let persistenceCalls = 0;
  const handler = createPublicEstimateCreateHandler({
    now: () => NOW,
    resolvePricing: async () => ({
      ok: false,
      error: 'The selected items or prices are no longer available.',
      reason: 'internal product identifier detail',
    }),
    createEstimate: async () => {
      persistenceCalls += 1;
      return 'estimate-id';
    },
    loadEstimate: async () => null,
  });

  const { response, nextError } = await invokeHandler(handler, validPayload());

  assert.equal(nextError, null);
  assert.equal(persistenceCalls, 0);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    error: 'The selected items or prices are no longer available.',
  });
  assert.equal(JSON.stringify(response.body).includes('identifier'), false);
});

test('invalid public creation never reaches persistence and returns a generic error', async () => {
  let persistenceCalls = 0;
  const handler = createPublicEstimateCreateHandler({
    now: () => NOW,
    resolvePricing: resolveValidPricing,
    createEstimate: async () => {
      persistenceCalls += 1;
      return 'estimate-id';
    },
    loadEstimate: async () => null,
  });

  const payload = validPayload();
  payload.estimate.estimate_number = 'EST-ATTACKER';
  const { response, nextError } = await invokeHandler(handler, payload);

  assert.equal(nextError, null);
  assert.equal(persistenceCalls, 0);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: PUBLIC_ESTIMATE_CREATE_INVALID_MESSAGE });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('persistence failures preserve the cause for logs but expose only a safe error', async () => {
  const databaseError = new Error('insert into app.secret_table failed');
  const handler = createPublicEstimateCreateHandler({
    now: () => NOW,
    resolvePricing: resolveValidPricing,
    createEstimate: async () => {
      throw databaseError;
    },
    loadEstimate: async () => null,
  });

  const { response, nextError } = await invokeHandler(handler, validPayload());

  assert.equal(response.body, null);
  assert.equal(nextError.statusCode, 503);
  assert.equal(nextError.message, PUBLIC_ESTIMATE_CREATE_UNAVAILABLE_MESSAGE);
  assert.equal(nextError.cause, databaseError);
  assert.doesNotMatch(nextError.message, /secret|insert/i);
});

test('fails closed when persistence returns a non-public snapshot', async () => {
  const handler = createPublicEstimateCreateHandler({
    now: () => NOW,
    resolvePricing: resolveValidPricing,
    createEstimate: async () => 'estimate-id',
    loadEstimate: async () => ({ estimate: { source: 'internal' } }),
  });

  const { nextError } = await invokeHandler(handler, validPayload());
  assert.equal(nextError.statusCode, 503);
  assert.equal(nextError.message, PUBLIC_ESTIMATE_CREATE_UNAVAILABLE_MESSAGE);
  assert.match(nextError.cause.message, /invalid snapshot/i);
});

test('public-only middleware protects anonymous and customer requests but bypasses admins', () => {
  let protectedCalls = 0;
  let nextCalls = 0;
  const middleware = applyToPublicEstimateCreators((_req, _res, next) => {
    protectedCalls += 1;
    next();
  });
  const next = () => { nextCalls += 1; };

  middleware({ user: null }, createResponse(), next);
  middleware({ user: { role: 'customer' } }, createResponse(), next);
  middleware({ user: { role: 'admin' } }, createResponse(), next);

  assert.equal(protectedCalls, 2);
  assert.equal(nextCalls, 3);
  assert.equal(isTrustedEstimateCreator({ role: 'admin' }), true);
  assert.equal(isTrustedEstimateCreator({ role: 'cashier' }), false);
});

test('phone rate-limit keys normalize equivalent numbers and isolate invalid input by IP', () => {
  const local = getPublicEstimatePhoneRateLimitKey({
    ip: '192.0.2.1',
    body: { customer: { phone: '0917 123 4567' } },
  });
  const international = getPublicEstimatePhoneRateLimitKey({
    ip: '198.51.100.1',
    body: { customer: { phone: '+63 (917) 123-4567' } },
  });
  const invalidOne = getPublicEstimatePhoneRateLimitKey({ ip: '192.0.2.1', body: {} });
  const invalidTwo = getPublicEstimatePhoneRateLimitKey({ ip: '198.51.100.1', body: {} });

  assert.equal(local, international);
  assert.match(local, /^phone:[0-9a-f]{64}$/);
  assert.equal(invalidOne, 'invalid:192.0.2.1');
  assert.equal(invalidTwo, 'invalid:198.51.100.1');
});
