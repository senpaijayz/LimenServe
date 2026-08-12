import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  MAX_PUBLIC_BUNDLE_LINES,
  MAX_PUBLIC_BUNDLE_PRODUCT_IDS,
  PUBLIC_ESTIMATE_PRICING_INVALID_MESSAGE,
  createPublicEstimatePricingResolver,
} from './publicEstimatePricing.js';

const ANCHOR_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const SERVICE_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_RULE_ID = '44444444-4444-4444-8444-444444444444';
const SERVICE_RULE_ID = '55555555-5555-4555-8555-555555555555';

function createReaders(overrides = {}) {
  return {
    loadProducts: async () => [
      { id: ANCHOR_ID, sku: 'ANCHOR-1', status: 'in_stock', is_active: true },
      { id: PRODUCT_ID, sku: 'PART-1', status: 'in_stock', is_active: true },
    ],
    loadProductPrices: async () => [
      { product_id: ANCHOR_ID, amount: 1000, is_current: true, effective_from: '2026-08-01' },
      { product_id: PRODUCT_ID, amount: 500, is_current: true, effective_from: '2026-08-01' },
    ],
    loadStagingPrices: async () => [
      { sku: 'ANCHOR-1', price: 1000, status: 'in_stock' },
      { sku: 'PART-1', price: 500, status: 'in_stock' },
    ],
    loadServices: async () => [
      { id: SERVICE_ID, standard_price: 600, is_active: true },
    ],
    loadRecommendations: async () => [
      {
        id: PRODUCT_RULE_ID,
        item_kind: 'product',
        product_id: PRODUCT_ID,
        package_key: 'maintenance',
        anchor_product_id: ANCHOR_ID,
        min_anchor_quantity: 1,
        catalog_price: 500,
        resolved_price: 475,
        is_active: true,
        package_is_active: true,
      },
      {
        id: SERVICE_RULE_ID,
        item_kind: 'service',
        service_id: SERVICE_ID,
        package_key: 'maintenance',
        anchor_product_id: ANCHOR_ID,
        min_anchor_quantity: 1,
        catalog_price: 600,
        resolved_price: 485,
        is_active: true,
        package_is_active: true,
      },
    ],
    ...overrides,
  };
}

function createResolver(overrides = {}) {
  return createPublicEstimatePricingResolver(createReaders(overrides));
}

test('derives ordinary lines and totals from active staging and service prices', async () => {
  const resolver = createResolver();
  const result = await resolver({
    items: [
      { line_type: 'product', product_id: PRODUCT_ID, quantity: 2, recommendation_rule_id: null, is_upsell: false },
      { line_type: 'service', service_id: SERVICE_ID, quantity: 1, recommendation_rule_id: null, is_upsell: false },
    ],
    requestedItems: [
      { unit_price: 500, line_total: 1000, catalog_unit_price: 500 },
      { unit_price: 600, line_total: 600, catalog_unit_price: 600 },
    ],
    requestedEstimate: {
      subtotal: 1600,
      discount_total: 0,
      tax_total: 192,
      grand_total: 1792,
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.items, [
    {
      line_type: 'product',
      product_id: PRODUCT_ID,
      quantity: 2,
      recommendation_rule_id: null,
      is_upsell: false,
      unit_price: 500,
      line_total: 1000,
    },
    {
      line_type: 'service',
      service_id: SERVICE_ID,
      quantity: 1,
      recommendation_rule_id: null,
      is_upsell: false,
      unit_price: 600,
      line_total: 600,
    },
  ]);
  assert.deepEqual(result.totals, {
    subtotal: 1600,
    discount_total: 0,
    tax_total: 192,
    grand_total: 1792,
  });
});

test('accepts a current staging SKU price and falls back to current retail', async () => {
  const stagingResolver = createResolver({
    loadStagingPrices: async () => [{ sku: 'PART-1', price: 525, status: 'in_stock' }],
  });
  const staging = await stagingResolver({
    items: [{ line_type: 'product', product_id: PRODUCT_ID, quantity: 1 }],
    requestedItems: [{ unit_price: 525, line_total: 525, catalog_unit_price: 525 }],
    requestedEstimate: { subtotal: 525, discount_total: 0, tax_total: 63, grand_total: 588 },
  });
  assert.equal(staging.ok, true);
  assert.equal(staging.items[0].unit_price, 525);

  const retailResolver = createResolver({ loadStagingPrices: async () => [] });
  const retail = await retailResolver({
    items: [{ line_type: 'product', product_id: PRODUCT_ID, quantity: 1 }],
    requestedItems: [{ unit_price: 500, line_total: 500, catalog_unit_price: 500 }],
    requestedEstimate: { subtotal: 500, discount_total: 0, tax_total: 60, grand_total: 560 },
  });
  assert.equal(retail.ok, true);
  assert.equal(retail.items[0].unit_price, 500);
});

test('validates redistributed bundle totals and persists authoritative line prices', async () => {
  let recommendationRequest = null;
  const resolver = createResolver({
    loadRecommendations: async (request) => {
      recommendationRequest = request;
      return createReaders().loadRecommendations();
    },
  });
  const result = await resolver({
    vehicle: { model_name: 'Xpander' },
    items: [
      { line_type: 'product', product_id: ANCHOR_ID, quantity: 1, recommendation_rule_id: null, is_upsell: false },
      { line_type: 'product', product_id: PRODUCT_ID, quantity: 1, recommendation_rule_id: PRODUCT_RULE_ID, is_upsell: true },
      { line_type: 'service', service_id: SERVICE_ID, quantity: 1, recommendation_rule_id: SERVICE_RULE_ID, is_upsell: true },
    ],
    requestedItems: [
      { unit_price: 1000, line_total: 1000, catalog_unit_price: 1000 },
      { unit_price: 450, line_total: 450, catalog_unit_price: 500, bundle_key: 'maintenance:better' },
      { unit_price: 510, line_total: 510, catalog_unit_price: 600, bundle_key: 'maintenance:better' },
    ],
    requestedEstimate: {
      subtotal: 2100,
      discount_total: 140,
      tax_total: 235.2,
      grand_total: 2195.2,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.items[1].unit_price, 475);
  assert.equal(result.items[2].unit_price, 485);
  assert.deepEqual(result.totals, {
    subtotal: 2100,
    discount_total: 140,
    tax_total: 235.2,
    grand_total: 2195.2,
  });
  assert.deepEqual(recommendationRequest, {
    anchorProductIds: [ANCHOR_ID, PRODUCT_ID],
    vehicleModelName: 'Xpander',
  });
});

test('rejects tampered line, bundle, discount, and total prices', async () => {
  const resolver = createResolver();
  const ordinary = {
    items: [{ line_type: 'product', product_id: PRODUCT_ID, quantity: 1 }],
    requestedItems: [{ unit_price: 1, line_total: 1, catalog_unit_price: 1 }],
    requestedEstimate: { subtotal: 1, discount_total: 0, tax_total: 0.12, grand_total: 1.12 },
  };
  assert.equal((await resolver(ordinary)).ok, false);

  const bundle = {
    items: [
      { line_type: 'product', product_id: ANCHOR_ID, quantity: 1 },
      { line_type: 'product', product_id: PRODUCT_ID, quantity: 1, recommendation_rule_id: PRODUCT_RULE_ID },
    ],
    requestedItems: [
      { unit_price: 1000, line_total: 1000, catalog_unit_price: 1000 },
      { unit_price: 1, line_total: 1, catalog_unit_price: 500, bundle_key: 'maintenance:good' },
    ],
    requestedEstimate: { subtotal: 1500, discount_total: 499, tax_total: 120.12, grand_total: 1121.12 },
  };
  const badBundle = await resolver(bundle);
  assert.equal(badBundle.ok, false);
  assert.equal(badBundle.error, PUBLIC_ESTIMATE_PRICING_INVALID_MESSAGE);

  const badTotals = await resolver({
    items: [{ line_type: 'product', product_id: PRODUCT_ID, quantity: 1 }],
    requestedItems: [{ unit_price: 500, line_total: 500, catalog_unit_price: 500 }],
    requestedEstimate: { subtotal: 500, discount_total: 100, tax_total: 48, grand_total: 448 },
  });
  assert.equal(badTotals.ok, false);
  assert.match(badTotals.reason, /totals/i);
});

test('strips unverified recommendation attribution from unbundled catalogue lines', async () => {
  const resolver = createResolver();
  const result = await resolver({
    items: [{
      line_type: 'product',
      product_id: PRODUCT_ID,
      quantity: 1,
      recommendation_rule_id: PRODUCT_RULE_ID,
      is_upsell: true,
    }],
    requestedItems: [{
      unit_price: 500,
      line_total: 500,
      catalog_unit_price: 500,
      recommendation_rule_id: PRODUCT_RULE_ID,
      is_upsell: true,
    }],
    requestedEstimate: {
      subtotal: 500,
      discount_total: 0,
      tax_total: 60,
      grand_total: 560,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.items[0].recommendation_rule_id, null);
  assert.equal(result.items[0].is_upsell, false);
});

test('rejects missing, inactive, discontinued, or mismatched catalogue identities', async () => {
  for (const overrides of [
    { loadProducts: async () => [] },
    { loadProducts: async () => [{ id: PRODUCT_ID, sku: 'PART-1', is_active: false, status: 'in_stock' }] },
    { loadProducts: async () => [{ id: PRODUCT_ID, sku: 'PART-1', is_active: true, status: 'discontinued' }] },
    { loadServices: async () => [{ id: SERVICE_ID, standard_price: 600, is_active: false }] },
  ]) {
    const isServiceCase = Object.hasOwn(overrides, 'loadServices');
    const resolver = createResolver(overrides);
    const result = await resolver({
      items: [isServiceCase
        ? { line_type: 'service', service_id: SERVICE_ID, quantity: 1 }
        : { line_type: 'product', product_id: PRODUCT_ID, quantity: 1 }],
      requestedItems: [{ unit_price: isServiceCase ? 600 : 500, catalog_unit_price: isServiceCase ? 600 : 500 }],
      requestedEstimate: {},
    });
    assert.equal(result.ok, false);
  }
});

test('rejects inactive, wrong-target, wrong-package, and unqualified bundle rules', async () => {
  const baseRequest = {
    items: [
      { line_type: 'product', product_id: ANCHOR_ID, quantity: 1 },
      { line_type: 'product', product_id: PRODUCT_ID, quantity: 1, recommendation_rule_id: PRODUCT_RULE_ID },
    ],
    requestedItems: [
      { unit_price: 1000, catalog_unit_price: 1000 },
      { unit_price: 475, catalog_unit_price: 500, bundle_key: 'maintenance:good' },
    ],
    requestedEstimate: { subtotal: 1500, discount_total: 25, tax_total: 177, grand_total: 1652 },
  };

  for (const mutate of [
    (row) => { row.is_active = false; },
    (row) => { row.product_id = ANCHOR_ID; },
    (row) => { row.package_key = 'different'; },
    (row) => { row.min_anchor_quantity = 2; },
  ]) {
    const recommendation = (await createReaders().loadRecommendations())[0];
    mutate(recommendation);
    const resolver = createResolver({ loadRecommendations: async () => [recommendation] });
    const result = await resolver(baseRequest);
    assert.equal(result.ok, false);
    assert.match(result.reason, /bundle/i);
  }
});

test('rejects duplicated recommendation items and multiplied discounted quantities', async () => {
  const resolver = createResolver();
  const multiplied = await resolver({
    items: [
      { line_type: 'product', product_id: ANCHOR_ID, quantity: 1 },
      { line_type: 'product', product_id: PRODUCT_ID, quantity: 2, recommendation_rule_id: PRODUCT_RULE_ID },
    ],
    requestedItems: [
      { unit_price: 1000, catalog_unit_price: 1000 },
      { unit_price: 475, catalog_unit_price: 500, bundle_key: 'maintenance:good' },
    ],
    requestedEstimate: { subtotal: 2000, discount_total: 50, tax_total: 234, grand_total: 2184 },
  });
  assert.equal(multiplied.ok, false);
  assert.match(multiplied.reason, /quantity/i);

  const duplicated = await resolver({
    items: [
      { line_type: 'product', product_id: ANCHOR_ID, quantity: 1 },
      { line_type: 'product', product_id: PRODUCT_ID, quantity: 1, recommendation_rule_id: PRODUCT_RULE_ID },
      { line_type: 'product', product_id: PRODUCT_ID, quantity: 1, recommendation_rule_id: PRODUCT_RULE_ID },
    ],
    requestedItems: [
      { unit_price: 1000, catalog_unit_price: 1000 },
      { unit_price: 475, catalog_unit_price: 500, bundle_key: 'maintenance:good' },
      { unit_price: 475, catalog_unit_price: 500, bundle_key: 'maintenance:good' },
    ],
    requestedEstimate: { subtotal: 2000, discount_total: 50, tax_total: 234, grand_total: 2184 },
  });
  assert.equal(duplicated.ok, false);
  assert.match(duplicated.reason, /reuses/i);
});

test('rejects oversized bundled requests before invoking any reader', async () => {
  const calls = {
    products: 0,
    prices: 0,
    staging: 0,
    services: 0,
    recommendations: 0,
  };
  const resolver = createPublicEstimatePricingResolver({
    loadProducts: async () => { calls.products += 1; return []; },
    loadProductPrices: async () => { calls.prices += 1; return []; },
    loadStagingPrices: async () => { calls.staging += 1; return []; },
    loadServices: async () => { calls.services += 1; return []; },
    loadRecommendations: async () => { calls.recommendations += 1; return []; },
  });
  const tooManyBundleLines = Array.from({ length: MAX_PUBLIC_BUNDLE_LINES + 1 }, (_, index) => ({
    line_type: 'product',
    product_id: PRODUCT_ID,
    quantity: 1,
    recommendation_rule_id: `${index}`,
  }));
  const lineLimitResult = await resolver({
    items: tooManyBundleLines,
    requestedItems: tooManyBundleLines.map((_, index) => ({
      unit_price: 500,
      catalog_unit_price: 500,
      bundle_key: `maintenance:${index}`,
    })),
    requestedEstimate: {},
  });
  assert.equal(lineLimitResult.ok, false);
  assert.match(lineLimitResult.reason, /too many bundle lines/i);
  assert.deepEqual(calls, {
    products: 0,
    prices: 0,
    staging: 0,
    services: 0,
    recommendations: 0,
  });

  const tooManyProductIds = Array.from({ length: MAX_PUBLIC_BUNDLE_PRODUCT_IDS + 1 }, (_, index) => ({
    line_type: 'product',
    product_id: `product-${index}`,
    quantity: 1,
    recommendation_rule_id: index === 0 ? PRODUCT_RULE_ID : null,
  }));
  const anchorLimitResult = await resolver({
    items: tooManyProductIds,
    requestedItems: tooManyProductIds.map((_, index) => ({
      unit_price: 500,
      catalog_unit_price: 500,
      bundle_key: index === 0 ? 'maintenance:good' : null,
    })),
    requestedEstimate: {},
  });
  assert.equal(anchorLimitResult.ok, false);
  assert.match(anchorLimitResult.reason, /anchor candidates/i);
  assert.deepEqual(calls, {
    products: 0,
    prices: 0,
    staging: 0,
    services: 0,
    recommendations: 0,
  });
});

test('propagates reader failures as server failures and rejects malformed reader output', async () => {
  const databaseError = new Error('database unavailable');
  const failing = createResolver({
    loadProducts: async () => { throw databaseError; },
  });
  await assert.rejects(() => failing({ items: [], requestedItems: [] }), databaseError);

  const malformed = createResolver({ loadProducts: async () => null });
  await assert.rejects(
    () => malformed({ items: [], requestedItems: [] }),
    /invalid data/i,
  );
});

test('requires all reader dependencies', () => {
  assert.throws(() => createPublicEstimatePricingResolver(), /readers are required/i);
});

test('the anonymous estimate route wires the service-role catalogue resolver', async () => {
  const routeSource = await readFile(new URL('../routes/estimateRoutes.js', import.meta.url), 'utf8');

  assert.match(routeSource, /createPublicEstimatePricingResolver\s*\(\s*\{/);
  assert.match(routeSource, /loadProducts:\s*loadActiveProducts/);
  assert.match(routeSource, /loadStagingPrices:\s*loadCurrentStagingPrices/);
  assert.match(routeSource, /resolvePricing:\s*resolvePublicEstimatePricing/);
});
