import assert from 'node:assert/strict';
import test from 'node:test';

import { createPublicEstimateEditToken } from './publicEstimateEdit.js';
import {
  createPublicEstimateRevisionHandler,
  PUBLIC_ESTIMATE_EDIT_SESSION_INVALID_MESSAGE,
} from './publicEstimateRevision.js';

const NOW = new Date('2026-08-21T10:00:00.000Z');
const SECRET = 'a-private-server-secret-with-at-least-thirty-two-characters';
const ESTIMATE_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

function requestBody() {
  return {
    customer: { name: 'Customer Name', phone: '09171234567' },
    estimate: {
      subtotal: 100,
      discount_total: 0,
      tax_total: 12,
      grand_total: 112,
    },
    items: [{
      line_type: 'product',
      product_id: PRODUCT_ID,
      quantity: 1,
      unit_price: 100,
      line_total: 100,
      is_upsell: false,
    }],
  };
}

function snapshot() {
  return {
    estimate: {
      id: ESTIMATE_ID,
      estimate_number: 'EST-20260821-001',
      source: 'public',
      status: 'sent',
      subtotal: 100,
      discount_total: 0,
      tax_total: 12,
      grand_total: 112,
      issued_at: NOW.toISOString(),
      valid_until: '2026-09-20',
    },
    customer: { name: 'Customer Name', phone: '09171234567' },
    items: [{
      line_type: 'product',
      product_id: PRODUCT_ID,
      product_name: 'Oil Filter',
      quantity: 1,
      unit_price: 100,
      line_total: 100,
    }],
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    set() { return this; },
    setHeader() {},
    status(statusCode) { this.statusCode = statusCode; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('public revision updates the signed quote without creating a new identifier', async () => {
  let revision = null;
  const handler = createPublicEstimateRevisionHandler({
    editTokenSecret: SECRET,
    now: () => NOW,
    loadEstimate: async () => snapshot(),
    resolvePricing: async (input) => ({
      ok: true,
      items: input.items,
      totals: { subtotal: 100, discount_total: 0, tax_total: 12, grand_total: 112 },
    }),
    reviseEstimate: async (estimateId, payload, note) => {
      revision = { estimateId, payload, note };
    },
  });
  const req = {
    body: {
      ...requestBody(),
      editToken: createPublicEstimateEditToken({ estimateId: ESTIMATE_ID, secret: SECRET, now: NOW }),
    },
  };
  const res = response();
  let nextError = null;

  await handler(req, res, (error) => { nextError = error; });

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 200);
  assert.equal(revision.estimateId, ESTIMATE_ID);
  assert.equal(revision.note, 'Public quote updated');
  assert.equal(revision.payload.estimate.revision_note, 'Public quote updated');
  assert.equal(res.body.estimate.estimate.estimate_number, 'EST-20260821-001');
  assert.equal(JSON.stringify(res.body).includes(ESTIMATE_ID), false);
});

test('public revision rejects a missing or invalid edit session before lookup', async () => {
  let loaded = false;
  const handler = createPublicEstimateRevisionHandler({
    editTokenSecret: SECRET,
    loadEstimate: async () => { loaded = true; return snapshot(); },
    reviseEstimate: async () => undefined,
    resolvePricing: async () => ({ ok: true }),
  });
  const res = response();

  await handler({ body: requestBody() }, res, () => undefined);

  assert.equal(loaded, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, PUBLIC_ESTIMATE_EDIT_SESSION_INVALID_MESSAGE);
});
