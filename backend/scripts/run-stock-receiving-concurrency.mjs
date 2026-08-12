// Opt-in local integration harness; intentionally not named test-* so Node's
// default unit-test discovery cannot execute it.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const OPT_IN_ENV = 'RUN_LOCAL_SUPABASE_INTEGRATION_TESTS';
const URL_ENV = 'LOCAL_SUPABASE_URL';
const KEY_ENV = 'LOCAL_SUPABASE_SERVICE_ROLE_KEY';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function requireLocalConfiguration() {
  if (process.env[OPT_IN_ENV] !== 'true') {
    throw new Error(`${OPT_IN_ENV}=true is required. This test mutates disposable rows in a local database.`);
  }

  const rawUrl = String(process.env[URL_ENV] || '').trim();
  const serviceRoleKey = String(process.env[KEY_ENV] || '').trim();

  if (!rawUrl || !serviceRoleKey) {
    throw new Error(`${URL_ENV} and ${KEY_ENV} are required; production environment variable fallbacks are intentionally disabled.`);
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${URL_ENV} must be a valid URL.`);
  }

  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Refusing non-local Supabase host: ${url.hostname}`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Refusing unsupported Supabase URL protocol: ${url.protocol}`);
  }

  return { serviceRoleKey, url: url.toString().replace(/\/$/, '') };
}

function formatSupabaseError(label, error) {
  const detail = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' | ');
  return new Error(`${label}: ${detail || 'unknown Supabase error'}`);
}

async function unwrap(label, operation) {
  const result = await operation;
  if (result.error) {
    throw formatSupabaseError(label, result.error);
  }
  return result;
}

function createProduct(runId, label) {
  const id = randomUUID();
  return {
    id,
    sku: `P1-${label}-${runId.slice(0, 8)}`.toUpperCase(),
    name: `Phase 1 ${label} ${runId}`,
    brand: 'Mitsubishi',
    uom: 'PC',
    status: 'in_stock',
    is_active: true,
    metadata: { integrationTestRunId: runId },
    business_date: new Date().toISOString().slice(0, 10),
  };
}

function buildReceiptPayload({ product, quantity, supplierName, referenceNumber }) {
  return {
    productId: product.id,
    quantity,
    supplierName,
    referenceNumber,
    receivedDate: new Date().toISOString().slice(0, 10),
    reason: 'Local Phase 1 concurrency integration test',
  };
}

function buildInvoicePayload({ invoiceNumber, supplierName, items }) {
  return {
    invoiceNumber,
    invoiceDate: new Date().toISOString().slice(0, 10),
    supplierName,
    source: 'phase1_lock_order_integration',
    items: items.map(({ product, quantity }) => ({
      partNumber: product.sku,
      description: product.name,
      quantity,
      unitCost: 0,
      uom: product.uom,
    })),
  };
}

async function callReceipt(client, payload, idempotencyKey, performedBy = null) {
  return client.rpc('receive_catalog_stock', {
    p_payload: payload,
    p_performed_by: performedBy,
    p_idempotency_key: idempotencyKey,
  });
}

async function callInvoice(client, payload, idempotencyKey) {
  return client.rpc('receive_supplier_invoice_stock_idempotent', {
    p_invoice: payload,
    p_performed_by: null,
    p_idempotency_key: idempotencyKey,
    p_allow_new_products: false,
  });
}

async function countRows(operation, label) {
  const { count } = await unwrap(label, operation);
  return count ?? 0;
}

async function verifyBalance(catalog, productId, expected) {
  const { data } = await unwrap(
    `load balance for ${productId}`,
    catalog.from('inventory_balances').select('on_hand').eq('product_id', productId).single(),
  );
  assert.equal(Number(data.on_hand), expected, `Unexpected balance for ${productId}`);
}

async function cleanupFixtures(catalog, fixture) {
  const cleanupErrors = [];
  const attempt = async (label, operation) => {
    try {
      await unwrap(label, operation);
    } catch (error) {
      cleanupErrors.push(error);
    }
  };

  let supplierIds = [];
  try {
    const { data } = await unwrap(
      'load disposable suppliers for cleanup',
      catalog.from('suppliers').select('id').in('name', fixture.supplierNames),
    );
    supplierIds = (data || []).map((row) => row.id);
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (fixture.invoiceNumbers.length > 0) {
    await attempt(
      'delete disposable invoice receipts',
      catalog.from('stock_receipts').delete().in('invoice_number', fixture.invoiceNumbers),
    );
  }

  if (fixture.productIds.length > 0) {
    await attempt(
      'delete disposable receiving logs',
      catalog.from('stock_receiving_logs').delete().in('product_id', fixture.productIds),
    );
    await attempt(
      'delete disposable inventory movements',
      catalog.from('inventory_movements').delete().in('product_id', fixture.productIds),
    );
    await attempt(
      'delete disposable supplier links',
      catalog.from('product_supplier_links').delete().in('product_id', fixture.productIds),
    );
    await attempt(
      'delete disposable product prices',
      catalog.from('product_prices').delete().in('product_id', fixture.productIds),
    );
    await attempt(
      'delete disposable balances',
      catalog.from('inventory_balances').delete().in('product_id', fixture.productIds),
    );
    await attempt(
      'delete disposable products',
      catalog.from('products').delete().in('id', fixture.productIds),
    );
  }

  if (supplierIds.length > 0) {
    await attempt(
      'delete disposable suppliers',
      catalog.from('suppliers').delete().in('id', supplierIds),
    );
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'One or more disposable Phase 1 fixtures could not be cleaned up.');
  }
}

async function run() {
  const { url, serviceRoleKey } = requireLocalConfiguration();
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const catalog = client.schema('catalog');
  const runId = randomUUID();
  const products = {
    distinct: createProduct(runId, 'DISTINCT'),
    replay: createProduct(runId, 'REPLAY'),
    rollback: createProduct(runId, 'ROLLBACK'),
    invoiceA: createProduct(runId, 'INVOICE-A'),
    invoiceB: createProduct(runId, 'INVOICE-B'),
    crossPath: createProduct(runId, 'CROSS-PATH'),
  };
  const supplierNames = [
    `Phase 1 Distinct Supplier ${runId}`,
    `Phase 1 Replay Supplier ${runId}`,
    `Phase 1 Rollback Supplier ${runId}`,
    `Phase 1 Inverse AB Supplier ${runId}`,
    `Phase 1 Inverse BA Supplier ${runId}`,
    `Phase 1 Cross Manual Supplier ${runId}`,
    `Phase 1 Cross Invoice Supplier ${runId}`,
  ];
  const invoiceNumbers = [
    `P1-AB-${runId}`,
    `P1-BA-${runId}`,
    `P1-CROSS-${runId}`,
  ];
  const fixture = {
    productIds: Object.values(products).map((product) => product.id),
    supplierNames,
    invoiceNumbers,
  };
  let testError;

  try {
    await unwrap('insert disposable products', catalog.from('products').insert(Object.values(products)));
    await unwrap(
      'insert disposable balances',
      catalog.from('inventory_balances').insert([
        { product_id: products.distinct.id, on_hand: 10, reserved: 0, reorder_point: 0, reorder_quantity: 0, location: {}, as_of_date: new Date().toISOString().slice(0, 10), business_date: new Date().toISOString().slice(0, 10) },
        { product_id: products.replay.id, on_hand: 20, reserved: 0, reorder_point: 0, reorder_quantity: 0, location: {}, as_of_date: new Date().toISOString().slice(0, 10), business_date: new Date().toISOString().slice(0, 10) },
        { product_id: products.rollback.id, on_hand: 30, reserved: 0, reorder_point: 0, reorder_quantity: 0, location: {}, as_of_date: new Date().toISOString().slice(0, 10), business_date: new Date().toISOString().slice(0, 10) },
        { product_id: products.invoiceA.id, on_hand: 40, reserved: 0, reorder_point: 0, reorder_quantity: 0, location: {}, as_of_date: new Date().toISOString().slice(0, 10), business_date: new Date().toISOString().slice(0, 10) },
        { product_id: products.crossPath.id, on_hand: 50, reserved: 0, reorder_point: 0, reorder_quantity: 0, location: {}, as_of_date: new Date().toISOString().slice(0, 10), business_date: new Date().toISOString().slice(0, 10) },
      ]),
    );

    const distinctCalls = Array.from({ length: 20 }, (_, index) => {
      const quantity = index + 1;
      const key = `phase1-${runId}-distinct-${index + 1}`;
      return callReceipt(
        client,
        buildReceiptPayload({
          product: products.distinct,
          quantity,
          supplierName: supplierNames[0],
          referenceNumber: `DISTINCT-${runId}-${index + 1}`,
        }),
        key,
      );
    });

    const distinctResults = await Promise.all(distinctCalls);
    const distinctMovementIds = new Set();
    for (const result of distinctResults) {
      if (result.error) {
        throw formatSupabaseError('concurrent distinct-key receipt', result.error);
      }
      assert.equal(result.data.idempotentReplay, false);
      assert.equal(Number(result.data.previousStock) + Number(result.data.quantityAdded), Number(result.data.updatedStock));
      distinctMovementIds.add(result.data.movement.id);
    }

    assert.equal(distinctMovementIds.size, 20, 'Distinct keys must create distinct movements.');
    await verifyBalance(catalog, products.distinct.id, 220);
    assert.equal(
      await countRows(
        catalog.from('inventory_movements').select('id', { count: 'exact', head: true }).eq('product_id', products.distinct.id),
        'count distinct-key movements',
      ),
      20,
    );
    assert.equal(
      await countRows(
        catalog.from('stock_receiving_logs').select('id', { count: 'exact', head: true }).eq('product_id', products.distinct.id),
        'count distinct-key audit rows',
      ),
      20,
    );
    assert.equal(
      await countRows(
        catalog.from('product_supplier_links').select('product_id', { count: 'exact', head: true }).eq('product_id', products.distinct.id),
        'count distinct-key supplier links',
      ),
      1,
    );
    const replayKey = `phase1-${runId}-same-key`;
    const replayPayload = buildReceiptPayload({
      product: products.replay,
      quantity: 5,
      supplierName: supplierNames[1],
      referenceNumber: `REPLAY-${runId}`,
    });
    const replayResults = await Promise.all(
      Array.from({ length: 20 }, () => callReceipt(client, replayPayload, replayKey)),
    );
    const replayMovementIds = new Set();
    let initialResponseCount = 0;
    let replayResponseCount = 0;

    for (const result of replayResults) {
      if (result.error) {
        throw formatSupabaseError('concurrent same-key receipt', result.error);
      }
      replayMovementIds.add(result.data.movement.id);
      if (result.data.idempotentReplay) {
        replayResponseCount += 1;
      } else {
        initialResponseCount += 1;
      }
    }

    assert.equal(initialResponseCount, 1, 'Exactly one same-key request must perform the receipt.');
    assert.equal(replayResponseCount, 19, 'All remaining same-key requests must replay.');
    assert.equal(replayMovementIds.size, 1, 'All same-key responses must reference one movement.');
    await verifyBalance(catalog, products.replay.id, 25);
    assert.equal(
      await countRows(
        catalog.from('inventory_movements').select('id', { count: 'exact', head: true }).eq('product_id', products.replay.id),
        'count same-key movements',
      ),
      1,
    );
    assert.equal(
      await countRows(
        catalog.from('stock_receiving_logs').select('id', { count: 'exact', head: true }).eq('product_id', products.replay.id),
        'count same-key audit rows',
      ),
      1,
    );
    assert.equal(
      await countRows(
        catalog.from('product_supplier_links').select('product_id', { count: 'exact', head: true }).eq('product_id', products.replay.id),
        'count same-key supplier links',
      ),
      1,
    );

    const changedPayloadResult = await callReceipt(
      client,
      { ...replayPayload, quantity: 6 },
      replayKey,
    );
    assert.ok(changedPayloadResult.error, 'Changed payload must fail for a reused idempotency key.');
    assert.equal(changedPayloadResult.error.code, '22023');
    assert.match(changedPayloadResult.error.message, /IDEMPOTENCY_KEY_REUSED/);
    await verifyBalance(catalog, products.replay.id, 25);

    const failureKey = `phase1-${runId}-late-failure`;
    const missingUserId = randomUUID();
    const failureResult = await callReceipt(
      client,
      buildReceiptPayload({
        product: products.rollback,
        quantity: 7,
        supplierName: supplierNames[2],
        referenceNumber: `ROLLBACK-${runId}`,
      }),
      failureKey,
      missingUserId,
    );
    assert.ok(failureResult.error, 'Invalid performed_by must trigger a late foreign-key failure.');
    assert.equal(failureResult.error.code, '23503');
    await verifyBalance(catalog, products.rollback.id, 30);
    assert.equal(
      await countRows(
        catalog.from('inventory_movements').select('id', { count: 'exact', head: true }).eq('product_id', products.rollback.id),
        'count rolled-back movements',
      ),
      0,
    );
    assert.equal(
      await countRows(
        catalog.from('stock_receiving_logs').select('id', { count: 'exact', head: true }).eq('product_id', products.rollback.id),
        'count rolled-back audit rows',
      ),
      0,
    );
    assert.equal(
      await countRows(
        catalog.from('product_supplier_links').select('product_id', { count: 'exact', head: true }).eq('product_id', products.rollback.id),
        'count rolled-back supplier links',
      ),
      0,
    );
    assert.equal(
      await countRows(
        catalog.from('suppliers').select('id', { count: 'exact', head: true }).eq('name', supplierNames[2]),
        'count rolled-back suppliers',
      ),
      0,
    );

    const invoiceAB = buildInvoicePayload({
      invoiceNumber: invoiceNumbers[0],
      supplierName: supplierNames[3],
      items: [
        { product: products.invoiceA, quantity: 2 },
        { product: products.invoiceB, quantity: 3 },
      ],
    });
    const invoiceBA = buildInvoicePayload({
      invoiceNumber: invoiceNumbers[1],
      supplierName: supplierNames[4],
      items: [
        { product: products.invoiceB, quantity: 5 },
        { product: products.invoiceA, quantity: 7 },
      ],
    });
    const inverseOrderResults = await Promise.all([
      callInvoice(client, invoiceAB, `phase1-${runId}-invoice-ab`),
      callInvoice(client, invoiceBA, `phase1-${runId}-invoice-ba`),
    ]);

    for (const result of inverseOrderResults) {
      if (result.error) {
        throw formatSupabaseError('concurrent inverse-order invoice receipt', result.error);
      }
      assert.equal(result.data.idempotentReplay, false);
      assert.equal(Number(result.data.totalLines), 2);
    }

    await verifyBalance(catalog, products.invoiceA.id, 49);
    await verifyBalance(catalog, products.invoiceB.id, 8);
    assert.equal(
      await countRows(
        catalog.from('stock_receipts').select('id', { count: 'exact', head: true }).in('invoice_number', invoiceNumbers),
        'count inverse-order invoice receipts',
      ),
      2,
    );
    assert.equal(
      await countRows(
        catalog.from('stock_receipt_items').select('id', { count: 'exact', head: true }).in('product_id', [products.invoiceA.id, products.invoiceB.id]),
        'count inverse-order invoice items',
      ),
      4,
    );
    assert.equal(
      await countRows(
        catalog.from('inventory_movements').select('id', { count: 'exact', head: true }).in('product_id', [products.invoiceA.id, products.invoiceB.id]),
        'count inverse-order invoice movements',
      ),
      4,
    );
    assert.equal(
      await countRows(
        catalog.from('stock_receiving_logs').select('id', { count: 'exact', head: true }).in('product_id', [products.invoiceA.id, products.invoiceB.id]),
        'count inverse-order invoice audit rows',
      ),
      4,
    );

    // This is the cross-function lock-order regression. The two suppliers are
    // intentionally distinct: a shared supplier row must not serialize the
    // requests before they contend on the same product and balance rows.
    const crossManualPayload = buildReceiptPayload({
      product: products.crossPath,
      quantity: 4,
      supplierName: supplierNames[5],
      referenceNumber: `CROSS-MANUAL-${runId}`,
    });
    const crossInvoicePayload = buildInvoicePayload({
      invoiceNumber: invoiceNumbers[2],
      supplierName: supplierNames[6],
      items: [{ product: products.crossPath, quantity: 7 }],
    });
    const [crossManualResult, crossInvoiceResult] = await Promise.all([
      callReceipt(client, crossManualPayload, `phase1-${runId}-cross-manual`),
      callInvoice(client, crossInvoicePayload, `phase1-${runId}-cross-invoice`),
    ]);

    if (crossManualResult.error) {
      throw formatSupabaseError('concurrent manual side of cross-path receipt', crossManualResult.error);
    }
    if (crossInvoiceResult.error) {
      throw formatSupabaseError('concurrent invoice side of cross-path receipt', crossInvoiceResult.error);
    }

    assert.equal(crossManualResult.data.idempotentReplay, false);
    assert.equal(Number(crossManualResult.data.quantityAdded), 4);
    assert.equal(crossInvoiceResult.data.idempotentReplay, false);
    assert.equal(Number(crossInvoiceResult.data.totalLines), 1);
    await verifyBalance(catalog, products.crossPath.id, 61);
    assert.equal(
      await countRows(
        catalog.from('stock_receipts').select('id', { count: 'exact', head: true }).eq('invoice_number', invoiceNumbers[2]),
        'count cross-path invoice receipts',
      ),
      1,
    );
    assert.equal(
      await countRows(
        catalog.from('stock_receipt_items').select('id', { count: 'exact', head: true }).eq('product_id', products.crossPath.id),
        'count cross-path invoice items',
      ),
      1,
    );
    assert.equal(
      await countRows(
        catalog.from('inventory_movements').select('id', { count: 'exact', head: true }).eq('product_id', products.crossPath.id),
        'count cross-path movements',
      ),
      2,
    );
    assert.equal(
      await countRows(
        catalog.from('stock_receiving_logs').select('id', { count: 'exact', head: true }).eq('product_id', products.crossPath.id),
        'count cross-path audit rows',
      ),
      2,
    );
    assert.equal(
      await countRows(
        catalog.from('product_supplier_links').select('product_id', { count: 'exact', head: true }).eq('product_id', products.crossPath.id),
        'count cross-path supplier links',
      ),
      1,
    );
    process.stdout.write('Local stock-receiving concurrency integration test passed.\n');
    process.stdout.write(`Replay ledger rows remain in this disposable local database under run key ${runId}; direct service-role table access is intentionally denied.\n`);
  } catch (error) {
    testError = error;
  }

  try {
    await cleanupFixtures(catalog, fixture);
  } catch (cleanupError) {
    if (testError) {
      throw new AggregateError([testError, cleanupError], 'Test failed and disposable fixture cleanup also failed.');
    }
    throw cleanupError;
  }

  if (testError) {
    throw testError;
  }
}

run().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
