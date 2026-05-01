import { createClient } from '@supabase/supabase-js';

// Connection keys should be stored in .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mock-url.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'mock-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SESSION_EXPIRY_SKEW_SECONDS = 60;

let cachedSession;
let sessionPromise = null;

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

export async function getFreshAccessToken({ forceRefresh = false } = {}) {
  let session = await ensureSessionLoaded();

  if (!session && forceRefresh) {
    session = await loadSessionFromSupabase();
  }

  if (!session) {
    return null;
  }

  if (forceRefresh || isSessionExpiring(session)) {
    if (session.refresh_token) {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: session.refresh_token,
      });

      if (!error) {
        setCachedSession(data.session);
        return cachedSession?.access_token ?? null;
      }
    }

    session = await loadSessionFromSupabase();
  }

  return session?.access_token ?? null;
}
