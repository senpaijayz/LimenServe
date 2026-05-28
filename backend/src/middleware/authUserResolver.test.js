import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthUserResolver } from './authUserResolver.js';

function jwtWithExpiry(expiresAtMs) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(expiresAtMs / 1000) })).toString('base64url');
  return `header.${payload}.signature`;
}

function createFakeClients({ user, profile, getUserDelayMs = 0, getUserError = null } = {}) {
  let getUserCalls = 0;
  let profileCalls = 0;

  const resolvedUser = user ?? {
    id: 'user-1',
    email: 'admin@example.com',
    app_metadata: { role: 'admin' },
    user_metadata: { full_name: 'Fallback Admin' },
  };

  return {
    supabaseAuth: {
      auth: {
        async getUser() {
          getUserCalls += 1;

          if (getUserDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, getUserDelayMs));
          }

          if (getUserError) {
            return { data: null, error: getUserError };
          }

          return { data: { user: resolvedUser }, error: null };
        },
      },
    },
    supabaseAdmin: {
      async rpc() {
        profileCalls += 1;
        return {
          data: profile ?? { full_name: 'Database Admin', role: 'admin' },
          error: null,
        };
      },
    },
    get counts() {
      return { getUserCalls, profileCalls };
    },
  };
}

test('deduplicates concurrent token validation and profile lookups', async () => {
  let now = 1_000;
  const token = jwtWithExpiry(now + 60_000);
  const clients = createFakeClients({ getUserDelayMs: 10 });
  const { resolveUser } = createAuthUserResolver({
    supabaseAuth: clients.supabaseAuth,
    supabaseAdmin: clients.supabaseAdmin,
    now: () => now,
  });

  const users = await Promise.all([resolveUser(token), resolveUser(token), resolveUser(token)]);

  assert.equal(clients.counts.getUserCalls, 1);
  assert.equal(clients.counts.profileCalls, 1);
  assert.deepEqual(users.map((user) => user?.role), ['admin', 'admin', 'admin']);
});

test('reuses resolved users inside the cache ttl', async () => {
  let now = 5_000;
  const token = jwtWithExpiry(now + 60_000);
  const clients = createFakeClients();
  const { resolveUser } = createAuthUserResolver({
    supabaseAuth: clients.supabaseAuth,
    supabaseAdmin: clients.supabaseAdmin,
    now: () => now,
  });

  const first = await resolveUser(token);
  now += 15_000;
  const second = await resolveUser(token);

  assert.equal(clients.counts.getUserCalls, 1);
  assert.equal(clients.counts.profileCalls, 1);
  assert.equal(first?.id, 'user-1');
  assert.equal(second?.fullName, 'Database Admin');
});

test('does not cache invalid tokens', async () => {
  let now = 10_000;
  const token = jwtWithExpiry(now + 60_000);
  const clients = createFakeClients({ getUserError: new Error('invalid token') });
  const { resolveUser } = createAuthUserResolver({
    supabaseAuth: clients.supabaseAuth,
    supabaseAdmin: clients.supabaseAdmin,
    now: () => now,
  });

  const first = await resolveUser(token);
  now += 1_000;
  const second = await resolveUser(token);

  assert.equal(first, null);
  assert.equal(second, null);
  assert.equal(clients.counts.getUserCalls, 2);
  assert.equal(clients.counts.profileCalls, 0);
});
