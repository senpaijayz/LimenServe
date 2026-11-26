export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

function toLockoutRow(value) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function isLocked(lockout) {
  return Boolean(lockout?.locked_at || lockout?.lockedAt);
}

function createLoginError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function createAccountLockedError(role) {
  const isAdministrator = role === 'admin';
  return createLoginError(
    423,
    isAdministrator
      ? 'Administrator sign-in is locked after five incorrect password attempts. Select Recover administrator access and use the code sent to your verified recovery email. Your password will not change.'
      : 'Sign-in is locked after five incorrect attempts. Ask an administrator to open User Management and choose Unlock sign-in for your account.',
    isAdministrator ? 'ADMIN_RECOVERY_REQUIRED' : 'ACCOUNT_LOCKED',
  );
}

/**
 * Wrap a password sign-in with the persistent account lockout workflow.
 * Database callbacks are injected so the threshold and race behavior can be
 * tested without reaching Supabase.
 */
export async function signInWithAccountLockout({
  account = null,
  email,
  password,
  getLockout,
  recordFailure,
  recordSuccess,
  signIn,
  signOut = async () => {},
  clearAuthCache = () => {},
}) {
  const shouldTrack = Boolean(
    account?.account_id
    && account.auth_role === account.profile_role
    && ['admin', 'cashier', 'stock_clerk'].includes(account.auth_role)
    && account.account_status === 'active',
  );

  if (shouldTrack) {
    const existingLockout = toLockoutRow(await getLockout(account.account_id));
    if (isLocked(existingLockout)) {
      throw createAccountLockedError(account.auth_role);
    }
  }

  const result = await signIn({ email, password });
  if (result?.error) {
    if (shouldTrack && result.error.code === 'invalid_credentials') {
      const updatedLockout = toLockoutRow(await recordFailure(account.account_id));
      if (isLocked(updatedLockout)) {
        clearAuthCache();
        throw createAccountLockedError(account.auth_role);
      }
      const attempts = Number(updatedLockout?.failed_attempts);
      if (Number.isInteger(attempts) && attempts > 0 && attempts < MAX_FAILED_LOGIN_ATTEMPTS) {
        const remaining = MAX_FAILED_LOGIN_ATTEMPTS - attempts;
        const warning = remaining === 1 ? '1 attempt left' : `${remaining} attempts left`;
        throw createLoginError(401, `Invalid email or password. ${warning} before sign-in is locked.`, 'INVALID_CREDENTIALS');
      }
    }

    if (Number(result.error.status) === 429) {
      throw createLoginError(429, 'Too many sign-in requests. Please wait a few minutes and try again.', 'AUTH_RATE_LIMITED');
    }

    if (result.error.code === 'invalid_credentials') {
      throw createLoginError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
    }

    throw createLoginError(503, 'Sign-in is temporarily unavailable. Please try again shortly.', 'AUTH_UNAVAILABLE');
  }

  const data = result?.data ?? result;
  if (!data?.session || !data?.user) {
    throw createLoginError(503, 'Sign-in could not be completed. Please try again shortly.', 'AUTH_UNAVAILABLE');
  }

  if (shouldTrack) {
    const canComplete = await recordSuccess(account.account_id);
    if (!canComplete) {
      try {
        await signOut();
      } catch {
        // The ephemeral server auth client does not persist this session.
      }
      throw createAccountLockedError(account.auth_role);
    }
  }

  return data;
}
