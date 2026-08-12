import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

Object.assign(process.env, {
  APP_ENV: 'test',
  FRONTEND_URLS: 'http://localhost:5173',
  TRUST_PROXY_HOPS: '0',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'public-integration-test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-integration-test-key',
});

const [{ createApp }, { env }, { createRuntimeState }] = await Promise.all([
  import('./app.js'),
  import('./config/env.js'),
  import('./health/readiness.js'),
]);

function createTestLogger() {
  const records = [];
  return {
    records,
    debug(event, attributes) { records.push({ level: 'debug', event, attributes }); },
    info(event, attributes) { records.push({ level: 'info', event, attributes }); },
    warn(event, attributes) { records.push({ level: 'warn', event, attributes }); },
    error(event, attributes) { records.push({ level: 'error', event, attributes }); },
  };
}

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

function appEnvironment(overrides = {}) {
  return {
    ...env,
    frontendUrls: ['https://app.example.com'],
    globalRateLimitMax: 100,
    globalRateLimitWindowMs: 60_000,
    globalRateLimitMaxEntries: 1_000,
    requestTimeoutMs: 5_000,
    ...overrides,
  };
}

test('health and CORS error responses include request IDs and defensive headers', async () => {
  const lifecycle = createRuntimeState();
  lifecycle.markReady();
  const testLogger = createTestLogger();
  const app = createApp({
    runtimeEnv: appEnvironment({ isDeployed: true }),
    applicationLogger: testLogger,
    lifecycle,
    readinessCheck: async () => ({
      ok: true,
      status: 'ready',
      dependency: 'supabase_auth',
    }),
  });

  await withServer(app, async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/api/health/live`, {
      headers: {
        Origin: 'https://app.example.com',
        'X-Request-ID': 'integration-allowed',
      },
    });

    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://app.example.com');
    assert.equal(allowed.headers.get('x-request-id'), 'integration-allowed');
    assert.equal(allowed.headers.get('x-powered-by'), null);
    assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');
    assert.match(allowed.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(allowed.headers.get('strict-transport-security'), /max-age=31536000/);

    const allowedPreflight = await fetch(`${baseUrl}/api/estimates/public/lookup`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-request-id',
      },
    });
    assert.equal(allowedPreflight.status, 204);
    assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), 'https://app.example.com');
    assert.match(allowedPreflight.headers.get('access-control-allow-headers'), /X-Request-ID/i);

    const denied = await fetch(`${baseUrl}/api/health/live`, {
      headers: { Origin: 'https://limen-serve-attacker.vercel.app' },
    });
    const deniedBody = await denied.json();

    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('x-powered-by'), null);
    assert.equal(denied.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(denied.headers.get('x-request-id'));
    assert.equal(deniedBody.requestId, denied.headers.get('x-request-id'));
    assert.equal(deniedBody.error, 'Request origin is not allowed.');

    const deniedPreflight = await fetch(`${baseUrl}/api/estimates/public/lookup`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://limen-serve-attacker.vercel.app',
        'Access-Control-Request-Method': 'POST',
      },
    });
    assert.equal(deniedPreflight.status, 403);
    assert.equal(deniedPreflight.headers.get('access-control-allow-origin'), null);
    assert.equal(deniedPreflight.headers.get('x-powered-by'), null);
    assert.ok(deniedPreflight.headers.get('x-request-id'));
  });

  assert.ok(testLogger.records.some((record) => record.event === 'request.failed'));
});

test('readiness remains closed until startup and reports dependency failure safely', async () => {
  const lifecycle = createRuntimeState();
  let checks = 0;
  const app = createApp({
    runtimeEnv: appEnvironment(),
    applicationLogger: createTestLogger(),
    lifecycle,
    readinessCheck: async () => {
      checks += 1;
      return {
        ok: false,
        status: 'unavailable',
        dependency: 'supabase_auth',
        error: new Error('private upstream detail'),
      };
    },
  });

  await withServer(app, async (baseUrl) => {
    const starting = await fetch(`${baseUrl}/api/health/ready`);
    assert.equal(starting.status, 503);
    assert.equal(checks, 0);

    lifecycle.markReady();
    const unavailable = await fetch(`${baseUrl}/api/health/ready`);
    const body = await unavailable.json();
    assert.equal(unavailable.status, 503);
    assert.equal(checks, 1);
    assert.equal(body.dependencies.supabaseAuth, 'unavailable');
    assert.equal(JSON.stringify(body).includes('private upstream detail'), false);
  });
});

test('global rate limiting runs before route work and invalid JSON is sanitized', async () => {
  const lifecycle = createRuntimeState();
  lifecycle.markReady();
  const app = createApp({
    runtimeEnv: appEnvironment({ globalRateLimitMax: 2 }),
    applicationLogger: createTestLogger(),
    lifecycle,
    readinessCheck: async () => ({ ok: true, status: 'ready' }),
  });

  await withServer(app, async (baseUrl) => {
    const invalidJson = await fetch(`${baseUrl}/api/missing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    const invalidJsonBody = await invalidJson.json();
    assert.equal(invalidJson.status, 400);
    assert.equal(invalidJsonBody.error, 'Invalid JSON request body.');
    assert.equal(JSON.stringify(invalidJsonBody).includes('Unexpected token'), false);

    const notFound = await fetch(`${baseUrl}/api/missing`);
    assert.equal(notFound.status, 404);

    const limited = await fetch(`${baseUrl}/api/missing`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('ratelimit-limit'), '2');
    assert.ok(limited.headers.get('retry-after'));
    assert.ok(limited.headers.get('x-request-id'));
  });
});

test('sensitive estimate lookup and creation routes enforce their own counters', async () => {
  const lifecycle = createRuntimeState();
  lifecycle.markReady();
  const app = createApp({
    runtimeEnv: appEnvironment({ globalRateLimitMax: 100 }),
    applicationLogger: createTestLogger(),
    lifecycle,
    readinessCheck: async () => ({ ok: true, status: 'ready' }),
  });

  await withServer(app, async (baseUrl) => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/estimates/public/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(response.status, 400);
    }

    const lookupLimited = await fetch(`${baseUrl}/api/estimates/public/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(lookupLimited.status, 429);
    assert.equal((await lookupLimited.json()).error, 'Too many quote lookup attempts. Please try again later.');

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/estimates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(response.status, 400);
    }

    const createLimited = await fetch(`${baseUrl}/api/estimates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(createLimited.status, 429);
    assert.equal((await createLimited.json()).error, 'Too many quotation requests. Please try again later.');
  });
});
