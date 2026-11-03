import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
process.env.APP_ENV = 'development';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key';
const { default: catalogRoutes } = await import('./catalogRoutes.js');

async function request(role, method = 'POST', type = 'application/json') {
    const app = express();
    app.use((req, _res, next) => { req.user = role ? { id: 'staff-id', role } : null; next(); });
    app.use(catalogRoutes);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/stock/invoice-ocr`, { method, headers: { 'Content-Type': type }, ...(method === 'POST' ? { body: 'unused legacy request' } : {}) });
        return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
    } finally { await new Promise(resolve => server.close(resolve)); }
}
test('removed scanner returns an actionable 410 for old JSON and photo clients without processing', async () => {
    for (const role of ['admin', 'stock_clerk']) {
        for (const type of ['application/json', 'image/jpeg']) {
            const response = await request(role, 'POST', type);
            assert.equal(response.status, 410);
            assert.match(response.body.error, /removed.*Receive Stock/);
            assert.equal(response.cache, 'private, no-store');
        }
    }
});
test('legacy scanner remains protected and cannot be re-enabled by another method', async () => {
    assert.equal((await request(null)).status, 401);
    assert.equal((await request('cashier')).status, 403);
    assert.equal((await request('admin', 'GET')).status, 410);
});
