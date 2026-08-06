import assert from 'node:assert/strict';
import test from 'node:test';
import { clearPublicResponseCache, publicResponseCache } from './cache.js';

function createRequest(path) {
  return {
    method: 'GET',
    originalUrl: path,
    url: path,
    headers: {},
  };
}

function createResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: null,
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    set(name, value) {
      headers.set(name.toLowerCase(), value);
      return this;
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

function runCache(path, generatedBody = null) {
  const req = createRequest(path);
  const res = createResponse();
  let reachedHandler = false;

  publicResponseCache(req, res, () => {
    reachedHandler = true;
    if (generatedBody !== null) res.json(generatedBody);
  });

  return { req, res, reachedHandler };
}

test('invalidates only matching public response cache tags', () => {
  clearPublicResponseCache();
  runCache('/api/catalog/products', { products: [{ id: 'part-1' }] });
  runCache('/api/public/mechanics', { mechanics: [{ id: 'mechanic-1' }] });

  assert.equal(runCache('/api/catalog/products').reachedHandler, false);
  assert.equal(runCache('/api/public/mechanics').reachedHandler, false);

  clearPublicResponseCache('public-mechanics');

  assert.equal(runCache('/api/catalog/products').reachedHandler, false);
  assert.equal(runCache('/api/public/mechanics').reachedHandler, true);

  clearPublicResponseCache('catalog-products');
  assert.equal(runCache('/api/catalog/products').reachedHandler, true);
});

test('marks authenticated and user-specific GET routes as no-store', () => {
  const { res, reachedHandler } = runCache('/api/reservations/mine');

  assert.equal(reachedHandler, true);
  assert.equal(res.getHeader('cache-control'), 'no-store');
});
