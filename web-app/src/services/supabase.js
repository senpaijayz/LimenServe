import { createClient } from '@supabase/supabase-js';

// Connection keys should be stored in .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mock-url.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'mock-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SESSION_EXPIRY_SKEW_SECONDS = 60;

let cachedSession;
let sessionPromise = null;
let refreshPromise = null;

function setCachedSession(session) {
  cachedSession = session ?? null;
}

function isSessionExpiring(session) {
  const expiresAt = Number(session?.expires_at ?? 0);
  if (!expiresAt) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return expiresAt - nowSeconds <= SESSION_EXPIRY_SKEW_SECONDS;
}

function isInvalidRefreshTokenError(error) {
  const message = String(error?.message || error?.error_description || error?.error || '').toLowerCase();
  return /refresh token|invalid_grant|already used|not found|revoked|expired/.test(message);
}

function createSessionExpiredError() {
  const error = new Error('Your sign-in session expired. Please sign in again before saving.');
  error.code = 'AUTH_SESSION_EXPIRED';
  error.isAuthSessionError = true;
  return error;
}

async function loadSessionFromSupabase() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  setCachedSession(data.session);
  return cachedSession;
}

supabase.auth.onAuthStateChange((_event, session) => {
  setCachedSession(session);
});

export function getCachedSession() {
  return cachedSession ?? null;
}

export function getCachedAccessToken() {
  return cachedSession?.access_token ?? null;
}

export async function ensureSessionLoaded() {
  if (cachedSession !== undefined) {
    return cachedSession;
  }

  if (!sessionPromise) {
    sessionPromise = loadSessionFromSupabase()
      .finally(() => {
        sessionPromise = null;
      });
  }

  return sessionPromise;
}

async function clearLocalSession() {
  setCachedSession(null);

  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // If Supabase cannot clear storage, the in-memory session is already reset.
  }
}

async function refreshCachedSession(session) {
  if (!session?.refresh_token) {
    return loadSessionFromSupabase();
  }

  if (!refreshPromise) {
    refreshPromise = supabase.auth.refreshSession({
      refresh_token: session.refresh_token,
    }).then(({ data, error }) => {
      if (error) {
        throw error;
      }

      setCachedSession(data.session);
      return cachedSession;
    }).catch(async (error) => {
      if (isInvalidRefreshTokenError(error)) {
        await clearLocalSession();
        throw createSessionExpiredError();
      }

      throw error;
    }).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function getFreshAccessToken({ forceRefresh = false } = {}) {
  let session = await ensureSessionLoaded();

  if (!session && forceRefresh) {
    session = await loadSessionFromSupabase();
  }

  if (!session) {
    return null;
  }

  if (forceRefresh || isSessionExpiring(session)) {
    try {
      session = await refreshCachedSession(session);
    } catch (error) {
      if (error?.isAuthSessionError) {
        throw error;
      }

      session = await loadSessionFromSupabase();
    }
  }

  return session?.access_token ?? null;
}
