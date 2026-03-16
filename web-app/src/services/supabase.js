import { createClient } from '@supabase/supabase-js';

// Connection keys should be stored in .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mock-url.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'mock-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

let cachedSession;
let sessionPromise = null;

function setCachedSession(session) {
  cachedSession = session ?? null;
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
    sessionPromise = supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          throw error;
        }

        setCachedSession(data.session);
        return cachedSession;
      })
      .finally(() => {
        sessionPromise = null;
      });
  }

  return sessionPromise;
}
