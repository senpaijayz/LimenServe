import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
process.env.APP_ENV = 'development';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key';
const { createPriceHistoryRouter } = await import('./priceHistoryRoutes.js');
const ID = '11111111-1111-4111-8111-111111111111';
async function request(role, path, body, rpc = async () => ({ data: { productId: ID } })) {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { if (role) req.user = { role }; next(); });
  app.use(createPriceHistoryRouter({ rpc }));
  app.use((_err, _req, res, _next) => res.status(500).json({ error: 'Internal server error.' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
  } finally { await new Promise((resolve) => server.close(resolve)); }
}
test('price history is internal, and cashier can review but not activate prices', async () => {
  assert.equal((await request(null, `/products/${ID}/price-history`)).status, 401);
  assert.equal((await request('customer', `/products/${ID}/price-history`)).status, 403);
  for (const role of ['cashier', 'stock_clerk', 'admin']) {
    const result = await request(role, `/products/${ID}/price-history`, undefined, async (name, args) => {
      assert.equal(name, 'limen_product_price_history'); assert.equal(args.p_product_id, ID); return { data: { currentPrice: 123 } };
    });
    assert.equal(result.status, 200); assert.equal(result.cache, 'no-store'); assert.equal(result.data.currentPrice, 123);
  }
});
test('invalid IDs and oversized quotes never reach database', async () => {
  const fail = () => assert.fail('Invalid input reached RPC');
  assert.equal((await request('admin', '/products/invalid/price-history', undefined, fail)).status, 400);
  assert.equal((await request('cashier', '/prices/quote', { productIds: Array(101).fill(ID) }, fail)).status, 400);
  assert.equal((await request('cashier', '/prices/quote', { productIds: ['bad'] }, fail)).status, 400);
});
test('quotes deduplicate IDs; missing products and errors do not become zero prices', async () => {
  const result = await request('cashier', '/prices/quote', { productIds: [ID, ID] }, async (name, args) => {
    assert.equal(name, 'limen_current_retail_prices'); assert.deepEqual(args.p_product_ids, [ID]); return { data: [] };
  });
  assert.deepEqual(result.data.prices, []);
  assert.equal((await request('admin', `/products/${ID}/price-history`, undefined, async () => ({ data: null }))).status, 404);
  const error = await request('admin', `/products/${ID}/price-history`, undefined, async () => ({ error: { message: 'private SQL' } }));
  assert.equal(error.status, 500); assert.doesNotMatch(JSON.stringify(error.data), /private SQL/);
});
