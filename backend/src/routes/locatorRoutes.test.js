import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
process.env.APP_ENV = 'development';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key';
const { createLocatorRouter } = await import('./locatorRoutes.js');

async function request(user, body, rpc = async () => ({ data: [] })) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use(createLocatorRouter({ client: { rpc } }));
  app.use((error, _req, res, _next) => res.status(500).json({ error: 'Internal server error.' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const result = await fetch('http://127.0.0.1:' + server.address().port + '/command', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: result.status, body: await result.json(), cache: result.headers.get('cache-control') };
  } finally { await new Promise((resolve) => server.close(resolve)); }
}
test('anonymous requests cannot read layouts', async () => {
  assert.equal((await request(null, { action: 'list' })).status, 401);
});
test('staff cannot write or inspect draft history', async () => {
  for (const action of ['save', 'assign', 'unassign', 'publish', 'restore', 'history', 'view_revision'])
    assert.equal((await request({ role: 'cashier' }, { action })).status, 403);
});
test('admin can remove one saved product location through the locator command', async () => {
  const result = await request({ id: 'admin-id', role: 'admin' }, { action: 'unassign', payload: { layoutId: 'layout-id', expectedRevision: 3, productId: 'product-id' } }, async (name, args) => {
    assert.equal(name, 'limen_locator_command');
    assert.equal(args.p_action, 'unassign');
    assert.equal(args.p_payload.productId, 'product-id');
    return { data: { revision: 4, metadata: { locations: [] } } };
  });
  assert.equal(result.status, 200);
});
test('staff cannot forge allowDraft; actor comes from authenticated session', async () => {
  const result = await request({ id: 'staff-id', role: 'cashier' }, { action: 'load', payload: { allowDraft: true, p_actor: 'forged' } }, async (_name, args) => {
    assert.equal(args.p_payload.allowDraft, false);
    assert.equal(args.p_actor, 'staff-id');
    return { data: { id: 'published' } };
  });
  assert.equal(result.status, 200);
  assert.equal(result.cache, 'no-store');
});
test('invalid actions and payloads fail before database access', async () => {
  for (const body of [{ action: 'delete' }, { action: 'save', payload: [] }])
    assert.equal((await request({ role: 'admin' }, body)).status, 400);
});
test('revision conflicts return 409 and never automatically retry', async () => {
  let calls = 0;
  const result = await request({ role: 'admin' }, { action: 'save', payload: { expectedRevision: 2 } }, async () => {
    calls++; return { error: { code: 'PT409', message: 'private SQL details' } };
  });
  assert.equal(result.status, 409); assert.equal(calls, 1);
  assert.equal(result.body.code, 'LOCATOR_REVISION_CONFLICT');
  assert.match(result.body.error, /changed after you opened it/);
  assert.doesNotMatch(result.body.error, /private SQL/);
});
test('revision snapshot reads the requested existing revision with the read-only RPC', async () => {
  const snapshot = { id: 'ffbd5f12-0000-4000-8000-000000000004', revision: 4, metadata: { scene: { objects: [] }, locations: [] } };
  const result = await request({ id: 'admin-id', role: 'admin' }, { action: 'view_revision', payload: { layoutId: snapshot.id, revision: 4 } }, async (name, args) => {
    assert.equal(name, 'limen_locator_revision_snapshot');
    assert.deepEqual(args, { p_layout_id: snapshot.id, p_revision: 4 });
    return { data: snapshot };
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.result, snapshot);
});
test('duplicate draft names get a distinct conflict message', async () => {
  const result = await request({ id: 'admin-id', role: 'admin' }, { action: 'restore', payload: {} }, async () => ({
    error: { code: '40001', message: 'A draft with this name already exists. Load it before saving.' },
  }));
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'LOCATOR_DRAFT_NAME_EXISTS');
  assert.match(result.body.error, /choose a different name/);
});
test('layer capacity conflicts are returned clearly without losing assignment context', async () => {
  const result = await request({ id: 'admin-id', role: 'admin' }, { action: 'assign', payload: {} }, async () => ({
    error: { code: '23514', message: 'This shelf layer has reached its configured capacity. Choose another layer or increase the capacity.' },
  }));
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'LOCATOR_LAYER_FULL');
  assert.match(result.body.error, /configured capacity/);
});
test('database failures remain sanitized', async () => {
  const result = await request({ role: 'admin' }, { action: 'load' }, async () => ({ error: { message: 'secret database host' } }));
  assert.equal(result.status, 500); assert.doesNotMatch(JSON.stringify(result.body), /secret/);
});

test('removed product mappings give actionable feedback without SQL details', async () => {
  const result = await request({ role: 'admin' }, { action: 'assign' }, async () => ({ error: { code: 'PT410', message: 'private constraint details' } }));
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'LOCATOR_PRODUCT_CHANGED');
  assert.match(result.body.error, /Refresh the locator/);
  assert.doesNotMatch(result.body.error, /private/);
});

test('unconfirmed upstream results are bounded errors, never false successes or replayed writes', async () => {
  let calls = 0;
  const result = await request({ role: 'admin' }, { action: 'save' }, async (_name, _args, options) => {
    calls++;
    assert.ok(options.signal instanceof AbortSignal);
    return { error: { code: 'LOCATOR_UPSTREAM_TIMEOUT', message: 'private server details' }, durationMs: 8000 };
  });
  assert.equal(result.status, 504);
  assert.equal(result.body.code, 'LOCATOR_SAVE_UNCONFIRMED');
  assert.match(result.body.error, /edits are kept/);
  assert.equal(calls, 1);
});

test('duplicate or invalid shelf labels fail before writing; labels may repeat on different floors', async () => {
  const shelf = { id: 'a', type: 'shelf', floor: 1, aisle: 'A', shelfNumber: 1 };
  for (const second of [{ ...shelf, id: 'b', aisle: ' a ' }, { ...shelf, id: 'b', shelfNumber: -1 }, { ...shelf, id: 'b', aisle: '' }]) {
    const result = await request({ role: 'admin' }, { action: 'save', payload: { objects: [shelf, second] } }, () => { assert.fail('Must not write invalid shelves'); });
    assert.equal(result.status, 400);
  }
  assert.equal((await request({ role: 'admin' }, { action: 'save', payload: { objects: [shelf, { ...shelf, id: 'b', floor: 2 }] } })).status, 200);
});
test('invalid layer capacity and spacing settings fail before saving', async () => {
  const shelf = { id: 'shelf', type: 'shelf-4-layer', aisle: 'A', shelfNumber: 1, layerCount: 4 };
  const invalidCases = [
    { ...shelf, layerCapacities: { 1: 6 } },
    { ...shelf, layerCapacities: { 5: 4 } },
    { ...shelf, layerSpacingByNumber: { 1: 0.5 } },
    { ...shelf, layerSpacingByNumber: { 4: '0.9' } },
  ];
  for (const object of invalidCases) {
    const result = await request({ role: 'admin' }, { action: 'save', payload: { objects: [object] } }, () => { assert.fail('Invalid layer settings must not be saved'); });
    assert.equal(result.status, 400);
  }
  const valid = await request({ role: 'admin' }, { action: 'save', payload: { objects: [{ ...shelf, layerCapacities: { 1: 3 }, layerSpacingByNumber: { 1: 0.8 } }] } });
  assert.equal(valid.status, 200);
});
