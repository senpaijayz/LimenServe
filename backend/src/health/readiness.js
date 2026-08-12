export function createRuntimeState() {
  let phase = 'starting';

  return Object.freeze({
    getPhase: () => phase,
    isAcceptingTraffic: () => phase === 'ready',
    markReady() {
      if (phase !== 'stopping') {
        phase = 'ready';
      }
    },
    beginShutdown() {
      phase = 'stopping';
    },
  });
}

export function createSupabaseReadinessCheck({
  supabaseUrl,
  supabaseAnonKey,
  timeoutMs = 2_000,
  cacheMs = 5_000,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required for readiness checks.');
  }

  const healthUrl = new URL('/auth/v1/health', supabaseUrl);
  let cachedResult = null;
  let cachedUntil = 0;
  let inflight = null;

  async function performCheck() {
    const startedAt = now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();

    try {
      const response = await fetchImpl(healthUrl, {
        method: 'GET',
        headers: {
          apikey: supabaseAnonKey,
          accept: 'application/json',
        },
        signal: controller.signal,
      });

      return {
        ok: response.ok,
        dependency: 'supabase_auth',
        status: response.ok ? 'ready' : 'unavailable',
        statusCode: response.status,
        latencyMs: Math.max(0, now() - startedAt),
      };
    } catch (error) {
      return {
        ok: false,
        dependency: 'supabase_auth',
        status: 'unavailable',
        latencyMs: Math.max(0, now() - startedAt),
        error,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return async function checkSupabaseReadiness() {
    const currentTime = now();
    if (cachedResult && currentTime < cachedUntil) {
      return cachedResult;
    }

    if (inflight) {
      return inflight;
    }

    inflight = performCheck();
    try {
      cachedResult = await inflight;
      cachedUntil = now() + cacheMs;
      return cachedResult;
    } finally {
      inflight = null;
    }
  };
}

export const runtimeState = createRuntimeState();
