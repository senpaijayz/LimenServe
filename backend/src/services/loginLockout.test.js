import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_FAILED_LOGIN_ATTEMPTS,
  signInWithAccountLockout,
} from './loginLockout.js';

function makeAccount(role = 'cashier') {
  return {
    account_id: 'staff-account-1',
    auth_role: role,
    profile_role: role,
    account_status: 'active',
  };
}

function makeLockoutStore() {
  let failedAttempts = 0;
  let lockedAt = null;
  return {
    get failedAttempts() { return failedAttempts; },
    async getLockout() {
      return lockedAt ? { failed_attempts: failedAttempts, locked_at: lockedAt } : null;
    },
    async recordFailure() {
      failedAttempts = Math.min(MAX_FAILED_LOGIN_ATTEMPTS, failedAttempts + 1);
      if (failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) lockedAt = '2026-11-26T00:00:00Z';
      return { failed_attempts: failedAttempts, locked_at: lockedAt };
    },
    async recordSuccess() {
      if (lockedAt) return false;
      failedAttempts = 0;
      return true;
    },
    unlock() {
      failedAttempts = 0;
      lockedAt = null;
    },
  };
}

test('locks a staff account on the fifth incorrect password and blocks later attempts', async () => {
  const store = makeLockoutStore();
  let signInCalls = 0;
  let cacheClears = 0;
  const options = {
    account: makeAccount(),
    email: 'cashier@example.com',
    password: 'wrong-password',
    getLockout: store.getLockout,
    recordFailure: store.recordFailure,
    recordSuccess: store.recordSuccess,
    signIn: async () => {
      signInCalls += 1;
      return { error: { code: 'invalid_credentials', status: 400 } };
    },
    clearAuthCache: () => { cacheClears += 1; },
  };

  for (let attempt = 1; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt += 1) {
    await assert.rejects(signInWithAccountLockout(options), (error) => error.statusCode === 401);
  }

  await assert.rejects(signInWithAccountLockout(options), (error) => (
    error.statusCode === 423
    && error.code === 'ACCOUNT_LOCKED'
    && error.message.includes('administrator')
  ));
  await assert.rejects(signInWithAccountLockout(options), (error) => error.statusCode === 423);

  assert.equal(store.failedAttempts, MAX_FAILED_LOGIN_ATTEMPTS);
  assert.equal(signInCalls, MAX_FAILED_LOGIN_ATTEMPTS);
  assert.equal(cacheClears, 1);
});

test('successful sign-in resets failures and a subsequent wrong password starts a new count', async () => {
  const store = makeLockoutStore();
  const shared = {
    account: makeAccount(),
    email: 'cashier@example.com',
    password: 'password',
    getLockout: store.getLockout,
    recordFailure: store.recordFailure,
    recordSuccess: store.recordSuccess,
    signIn: async () => ({ data: { user: { id: 'staff-account-1' }, session: { access_token: 'token' } } }),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(signInWithAccountLockout({
      ...shared,
      signIn: async () => ({ error: { code: 'invalid_credentials', status: 400 } }),
    }));
  }
  assert.equal(store.failedAttempts, 3);

  const session = await signInWithAccountLockout(shared);
  assert.equal(session.session.access_token, 'token');
  assert.equal(store.failedAttempts, 0);

  await assert.rejects(signInWithAccountLockout({
    ...shared,
    signIn: async () => ({ error: { code: 'invalid_credentials', status: 400 } }),
  }));
  assert.equal(store.failedAttempts, 1);
});

test('verified recovery can unlock the administrator while the lockout guard blocks sign-in', async () => {
  const store = makeLockoutStore();
  for (let attempt = 0; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt += 1) {
    await store.recordFailure();
  }

  let signInCalls = 0;
  const options = {
    account: makeAccount('admin'),
    email: 'admin@limen.com',
    password: 'new-password',
    getLockout: store.getLockout,
    recordFailure: store.recordFailure,
    recordSuccess: store.recordSuccess,
    signIn: async () => {
      signInCalls += 1;
      return { data: { user: { id: 'staff-account-1' }, session: { access_token: 'token' } } };
    },
  };

  await assert.rejects(signInWithAccountLockout(options), (error) => (
    error.statusCode === 423 && error.message.includes('recovery email')
  ));
  assert.equal(signInCalls, 0);

  store.unlock();
  const session = await signInWithAccountLockout(options);
  assert.equal(session.user.id, 'staff-account-1');
});

test('rate limiting and other auth failures do not count as wrong-password attempts', async () => {
  const store = makeLockoutStore();
  const options = {
    account: makeAccount(),
    email: 'cashier@example.com',
    password: 'password',
    getLockout: store.getLockout,
    recordFailure: store.recordFailure,
    recordSuccess: store.recordSuccess,
    signIn: async () => ({ error: { code: 'email_not_confirmed', status: 400 } }),
  };

  await assert.rejects(signInWithAccountLockout(options), (error) => error.statusCode === 503);
  assert.equal(store.failedAttempts, 0);

  await assert.rejects(signInWithAccountLockout({
    ...options,
    signIn: async () => ({ error: { code: 'over_request_rate_limit', status: 429 } }),
  }), (error) => error.statusCode === 429);
  assert.equal(store.failedAttempts, 0);
});
