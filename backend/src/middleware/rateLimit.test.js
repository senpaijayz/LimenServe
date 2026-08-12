import assert from 'node:assert/strict';
import test from 'node:test';

import { createInMemoryRateLimiter } from './rateLimit.js';

function createResponse() {
  const headers = new Map();

  return {
    statusCode: 200,
    body: null,
    headers,
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

function invoke(middleware, request) {
  const response = createResponse();
  let nextCall = null;

  middleware(request, response, (error) => {
    nextCall = { error };
  });

  return { response, nextCall };
}

test('limits repeated requests and emits standard rate limit headers', () => {
  let currentTime = 1_000;
  const limiter = createInMemoryRateLimiter({
    windowMs: 10_000,
    limit: 2,
    now: () => currentTime,
    keyGenerator: (req) => req.clientKey,
    message: 'Lookup limit reached.',
  });

  const first = invoke(limiter, { clientKey: 'client-a' });
  const second = invoke(limiter, { clientKey: 'client-a' });
  const blocked = invoke(limiter, { clientKey: 'client-a' });

  assert.ok(first.nextCall);
  assert.ok(second.nextCall);
  assert.equal(first.response.headers.get('ratelimit-limit'), '2');
  assert.equal(first.response.headers.get('ratelimit-remaining'), '1');
  assert.equal(second.response.headers.get('ratelimit-remaining'), '0');
  assert.equal(blocked.nextCall, null);
  assert.equal(blocked.response.statusCode, 429);
  assert.deepEqual(blocked.response.body, { error: 'Lookup limit reached.' });
  assert.equal(blocked.response.headers.get('retry-after'), '10');
  assert.equal(blocked.response.headers.get('ratelimit-reset'), '10');
  assert.match(blocked.response.headers.get('ratelimit'), /remaining=0/);

  currentTime += 10_001;
  const afterReset = invoke(limiter, { clientKey: 'client-a' });
  assert.ok(afterReset.nextCall);
  assert.equal(afterReset.response.headers.get('ratelimit-remaining'), '1');
});

test('uses the injected key generator to isolate request budgets', () => {
  const limiter = createInMemoryRateLimiter({
    windowMs: 60_000,
    limit: 1,
    now: () => 5_000,
    keyGenerator: (req) => req.account,
  });

  assert.ok(invoke(limiter, { account: 'one' }).nextCall);
  assert.ok(invoke(limiter, { account: 'two' }).nextCall);
  assert.equal(invoke(limiter, { account: 'one' }).response.statusCode, 429);
});

test('supports health-check exemptions and limit event reporting', () => {
  const limitEvents = [];
  const limiter = createInMemoryRateLimiter({
    windowMs: 60_000,
    limit: 1,
    now: () => 5_000,
    keyGenerator: (req) => req.account,
    skip: (req) => req.healthCheck === true,
    onLimitReached: (req, details) => limitEvents.push({ req, details }),
  });

  assert.ok(invoke(limiter, { account: 'one', healthCheck: true }).nextCall);
  assert.ok(invoke(limiter, { account: 'one' }).nextCall);
  assert.equal(invoke(limiter, { account: 'one' }).response.statusCode, 429);
  assert.equal(limitEvents.length, 1);
  assert.equal(limitEvents[0].details.key, 'one');
  assert.equal(limitEvents[0].details.limit, 1);
});
