import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInMemoryRateLimitStore,
  createStoreBackedRateLimiter,
  createSupabaseRateLimitStore,
  hashRateLimitKey,
} from './sharedRateLimit.js';

function createResponse() {
  return {
    headers: new Map(),
    statusCode: 200,
    setHeader(name, value) { this.headers.set(name.toLowerCase(), String(value)); },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

async function invoke(middleware, req = {}) {
  const response = createResponse();
  let nextError;
  let nextCalled = false;
  await middleware(req, response, (error) => {
    nextCalled = true;
    nextError = error;
  });
  return { response, nextCalled, nextError };
}

test('hashes raw identifiers before calling the shared store and maps atomic results', async () => {
  const calls = [];
  const results = [
    { allowed: true, remaining: 0, resetSeconds: 30 },
    { allowed: false, remaining: 0, resetSeconds: 29 },
  ];
  const limiter = createStoreBackedRateLimiter({
    store: {
      async consume(input) {
        calls.push(input);
        return results.shift();
      },
    },
    scope: 'estimate.lookup.ip',
    windowMs: 60_000,
    limit: 1,
    keyGenerator: (req) => req.ip,
    hashSecret: 'server-only-test-secret',
    message: 'Lookup limited.',
  });

  const allowed = await invoke(limiter, { ip: '203.0.113.8' });
  const blocked = await invoke(limiter, { ip: '203.0.113.8' });

  assert.equal(allowed.nextCalled, true);
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.response.statusCode, 429);
  assert.equal(blocked.response.headers.get('retry-after'), '29');
  assert.deepEqual(blocked.response.body, { error: 'Lookup limited.' });
  assert.equal(calls[0].keyHash, hashRateLimitKey(
    'estimate.lookup.ip',
    '203.0.113.8',
    'server-only-test-secret',
  ));
  assert.match(calls[0].keyHash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(calls).includes('203.0.113.8'), false);
});

test('fails closed with a safe 503 error when the shared store is unavailable', async () => {
  const storeError = new Error('private database detail');
  const limiter = createStoreBackedRateLimiter({
    store: { async consume() { throw storeError; } },
    scope: 'estimate.create.ip',
    windowMs: 60_000,
    limit: 1,
    keyGenerator: (req) => req.ip,
    hashSecret: 'server-only-test-secret',
  });

  const result = await invoke(limiter, { ip: '203.0.113.9' });
  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError.statusCode, 503);
  assert.equal(result.nextError.publicMessage, 'Request verification is temporarily unavailable. Please try again later.');
  assert.equal(result.nextError.cause, storeError);
  assert.equal(result.response.body, undefined);
});

test('HMAC key hashes are domain-separated by scope and secret', () => {
  const first = hashRateLimitKey('estimate.lookup.ip', '203.0.113.8', 'server-only-test-secret');
  const otherScope = hashRateLimitKey('estimate.create.ip', '203.0.113.8', 'server-only-test-secret');
  const otherSecret = hashRateLimitKey('estimate.lookup.ip', '203.0.113.8', 'another-server-secret');

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, otherScope);
  assert.notEqual(first, otherSecret);
});

test('the development memory store counts repeated requests atomically in one process', async () => {
  let currentTime = 1_000;
  const store = createInMemoryRateLimitStore({ now: () => currentTime });
  const requests = await Promise.all([
    store.consume({ scope: 'test', keyHash: 'hash', windowSeconds: 10, limit: 2 }),
    store.consume({ scope: 'test', keyHash: 'hash', windowSeconds: 10, limit: 2 }),
    store.consume({ scope: 'test', keyHash: 'hash', windowSeconds: 10, limit: 2 }),
  ]);

  assert.deepEqual(requests.map((result) => result.allowed), [true, true, false]);
  currentTime += 10_001;
  assert.equal((await store.consume({
    scope: 'test', keyHash: 'hash', windowSeconds: 10, limit: 2,
  })).allowed, true);
});

test('Supabase store uses the exact atomic RPC contract and validates its response', async () => {
  const calls = [];
  const store = createSupabaseRateLimitStore({
    supabase: {
      async rpc(name, params) {
        calls.push({ name, params });
        return {
          data: [{ allowed: true, remaining: 4, reset_seconds: 900 }],
          error: null,
        };
      },
    },
  });

  const result = await store.consume({
    scope: 'estimate.lookup.ip',
    keyHash: 'a'.repeat(64),
    windowSeconds: 900,
    limit: 5,
  });

  assert.deepEqual(result, { allowed: true, remaining: 4, resetSeconds: 900 });
  assert.deepEqual(calls, [{
    name: 'consume_public_rate_limit',
    params: {
      p_scope: 'estimate.lookup.ip',
      p_key_hash: 'a'.repeat(64),
      p_window_seconds: 900,
      p_limit: 5,
    },
  }]);
});

test('Supabase store propagates RPC errors and rejects malformed responses', async () => {
  const rpcError = new Error('rpc unavailable');
  const failingStore = createSupabaseRateLimitStore({
    supabase: { async rpc() { return { data: null, error: rpcError }; } },
  });
  await assert.rejects(
    failingStore.consume({ scope: 'test', keyHash: 'a'.repeat(64), windowSeconds: 60, limit: 1 }),
    rpcError,
  );

  const malformedStore = createSupabaseRateLimitStore({
    supabase: { async rpc() { return { data: { allowed: true }, error: null }; } },
  });
  await assert.rejects(
    malformedStore.consume({ scope: 'test', keyHash: 'a'.repeat(64), windowSeconds: 60, limit: 1 }),
    /invalid result/,
  );
});
