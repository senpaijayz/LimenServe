import assert from 'node:assert/strict';
import test from 'node:test';

import { createCorsOptions, createOriginPolicy } from './corsPolicy.js';

function invoke(policy, origin) {
  let result;
  policy(origin, (error, allowed) => {
    result = { error, allowed };
  });
  return result;
}

test('allows only exact configured browser origins', () => {
  const policy = createOriginPolicy([
    'https://app.example.com',
    'https://preview.example.com',
  ]);

  assert.deepEqual(invoke(policy, 'https://app.example.com'), { error: null, allowed: true });
  assert.deepEqual(invoke(policy, undefined), { error: null, allowed: true });
  assert.equal(invoke(policy, 'https://app.example.com.attacker.test').allowed, undefined);
  assert.equal(invoke(policy, 'https://unexpected.example.com').error.statusCode, 403);
  assert.equal(invoke(policy, 'not-an-origin').error.publicMessage, 'Request origin is not allowed.');
});

test('limits preflight methods and headers and exposes operational headers', () => {
  const options = createCorsOptions(['https://app.example.com']);

  assert.deepEqual(options.methods, ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
  assert.ok(options.allowedHeaders.includes('Idempotency-Key'));
  assert.ok(options.exposedHeaders.includes('X-Request-ID'));
  assert.equal(options.maxAge, 600);
});
