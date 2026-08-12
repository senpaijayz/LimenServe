import assert from 'node:assert/strict';
import test from 'node:test';

import { createRuntimeState, createSupabaseReadinessCheck } from './readiness.js';

test('tracks starting, ready, and stopping lifecycle states', () => {
  const state = createRuntimeState();

  assert.equal(state.getPhase(), 'starting');
  assert.equal(state.isAcceptingTraffic(), false);
  state.markReady();
  assert.equal(state.isAcceptingTraffic(), true);
  state.beginShutdown();
  assert.equal(state.getPhase(), 'stopping');
  state.markReady();
  assert.equal(state.getPhase(), 'stopping');
});

test('checks and briefly caches Supabase Auth health without using the service-role key', async () => {
  const calls = [];
  let currentTime = 1_000;
  const check = createSupabaseReadinessCheck({
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'public-key',
    cacheMs: 500,
    now: () => currentTime,
    async fetchImpl(url, options) {
      calls.push({ url: String(url), options });
      return { ok: true, status: 200 };
    },
  });

  const first = await check();
  const cached = await check();

  assert.equal(first.ok, true);
  assert.equal(cached, first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://project.supabase.co/auth/v1/health');
  assert.equal(calls[0].options.headers.apikey, 'public-key');

  currentTime += 501;
  await check();
  assert.equal(calls.length, 2);
});

test('returns a closed readiness result when the dependency check fails', async () => {
  const check = createSupabaseReadinessCheck({
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'public-key',
    async fetchImpl() {
      throw new Error('network unavailable');
    },
  });

  const result = await check();
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unavailable');
  assert.match(result.error.message, /network unavailable/);
});
