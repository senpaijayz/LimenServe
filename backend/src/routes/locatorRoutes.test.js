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
  for (const action of ['save', 'assign', 'publish', 'restore', 'history'])
    assert.equal((await request({ role: 'cashier' }, { action })).status, 403);
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
    calls++; return { error: { code: '40001', message: 'private SQL details' } };
  });
  assert.equal(result.status, 409); assert.equal(calls, 1);
  assert.doesNotMatch(result.body.error, /private SQL/);
});
test('database failures remain sanitized', async () => {
  const result = await request({ role: 'admin' }, { action: 'load' }, async () => ({ error: { message: 'secret database host' } }));
  assert.equal(result.status, 500); assert.doesNotMatch(JSON.stringify(result.body), /secret/);
});

test('duplicate or invalid shelf labels fail before writing; labels may repeat on different floors', async () => {
  const shelf = { id: 'a', type: 'shelf', floor: 1, aisle: 'A', shelfNumber: 1 };
  for (const second of [{ ...shelf, id: 'b', aisle: ' a ' }, { ...shelf, id: 'b', shelfNumber: -1 }, { ...shelf, id: 'b', aisle: '' }]) {
    const result = await request({ role: 'admin' }, { action: 'save', payload: { objects: [shelf, second] } }, () => { assert.fail('Must not write invalid shelves'); });
    assert.equal(result.status, 400);
  }
  assert.equal((await request({ role: 'admin' }, { action: 'save', payload: { objects: [shelf, { ...shelf, id: 'b', floor: 2 }] } })).status, 200);
});
