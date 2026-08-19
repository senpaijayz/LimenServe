import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEnv } from './envModel.js';

function baseEnvironment(overrides = {}) {
  return {
    APP_ENV: 'test',
    FRONTEND_URLS: 'http://localhost:5173',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'public-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
    ...overrides,
  };
}

test('uses exact, normalized, de-duplicated CORS origins', () => {
  const result = buildEnv(baseEnvironment({
    FRONTEND_URLS: 'https://example.com/, https://example.com, http://localhost:5173',
  }));

  assert.deepEqual(result.frontendUrls, [
    'https://example.com',
    'http://localhost:5173',
  ]);
  assert.equal(result.proxyHops, 0);
});

test('requires explicit HTTPS origins and proxy trust in deployed environments', () => {
  assert.throws(
    () => buildEnv(baseEnvironment({ APP_ENV: 'production', FRONTEND_URLS: '' })),
    /FRONTEND_URLS is required/,
  );
  assert.throws(
    () => buildEnv(baseEnvironment({ APP_ENV: 'staging', FRONTEND_URLS: 'http:\/\/staging.example.com' })),
    /public HTTPS origins/,
  );
  assert.throws(
    () => buildEnv(baseEnvironment({
      APP_ENV: 'preview',
      FRONTEND_URLS: 'https://preview.example.com',
      PUBLIC_RATE_LIMIT_STORE: 'supabase',
    })),
    /TRUST_PROXY_HOPS is required/,
  );

  const result = buildEnv(baseEnvironment({
    APP_ENV: 'production',
    FRONTEND_URLS: 'https://app.example.com',
    TRUST_PROXY_HOPS: '1',
    PUBLIC_RATE_LIMIT_STORE: 'supabase',
  }));

  assert.equal(result.proxyHops, 1);
  assert.equal(result.isDeployed, true);
  assert.equal(result.publicRateLimitStore, 'supabase');
});

test('uses memory only for local/test and requires the shared store when deployed', () => {
  assert.equal(buildEnv(baseEnvironment()).publicRateLimitStore, 'memory');
  assert.throws(
    () => buildEnv(baseEnvironment({
      APP_ENV: 'production',
      FRONTEND_URLS: 'https://app.example.com',
      TRUST_PROXY_HOPS: '1',
    })),
    /PUBLIC_RATE_LIMIT_STORE=supabase is required/,
  );
  assert.throws(
    () => buildEnv(baseEnvironment({
      APP_ENV: 'staging',
      FRONTEND_URLS: 'https://staging.example.com',
      TRUST_PROXY_HOPS: '1',
      PUBLIC_RATE_LIMIT_STORE: 'memory',
    })),
    /must be supabase/,
  );
});

test('rejects wildcard origins and origins containing paths', () => {
  assert.throws(
    () => buildEnv(baseEnvironment({ FRONTEND_URLS: 'https://*.example.com' })),
    /wildcard origins are not allowed/,
  );
  assert.throws(
    () => buildEnv(baseEnvironment({ FRONTEND_URLS: 'https://example.com/app' })),
    /URL origins only/,
  );
});

test('rejects public service-role variables and identical Supabase keys', () => {
  assert.throws(
    () => buildEnv(baseEnvironment({ VITE_SUPABASE_SERVICE_ROLE_KEY: 'bad' })),
    /would expose a service-role credential/,
  );
  assert.throws(
    () => buildEnv(baseEnvironment({ SUPABASE_SERVICE_ROLE_KEY: 'public-test-key' })),
    /must not be the public Supabase key/,
  );
});

test('validates bounded numeric security settings', () => {
  assert.throws(
    () => buildEnv(baseEnvironment({ REQUEST_TIMEOUT_MS: '100' })),
    /REQUEST_TIMEOUT_MS must be an integer/,
  );
  assert.throws(
    () => buildEnv(baseEnvironment({ GLOBAL_RATE_LIMIT_MAX: '0' })),
    /GLOBAL_RATE_LIMIT_MAX must be an integer/,
  );
});

test('keeps external OCR disabled unless explicitly approved', () => {
  assert.equal(buildEnv(baseEnvironment()).externalOcrFallbackEnabled, false);
  assert.equal(buildEnv(baseEnvironment({ OCR_EXTERNAL_FALLBACK_ENABLED: 'true' })).externalOcrFallbackEnabled, true);
  assert.throws(
    () => buildEnv(baseEnvironment({ OCR_EXTERNAL_FALLBACK_ENABLED: 'enabled' })),
    /OCR_EXTERNAL_FALLBACK_ENABLED must be either true or false/,
  );
});
