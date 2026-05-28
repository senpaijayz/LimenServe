const ALLOWED_ROLES = new Set(['admin', 'cashier', 'stock_clerk']);
const DEFAULT_AUTH_CACHE_TTL_MS = 30_000;
const DEFAULT_MAX_AUTH_CACHE_ENTRIES = 200;
const TOKEN_EXPIRY_SAFETY_MS = 5_000;

function normalizeRole(role) {
  if (role === 'staff' || role === 'viewer' || role === 'customer') {
    return 'stock_clerk';
  }

  return ALLOWED_ROLES.has(role) ? role : 'stock_clerk';
}

function decodeTokenExpiresAt(token) {
  try {
    const [, payload] = token.split('.');

    if (!payload) {
      return null;
    }

    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(claims.exp) ? claims.exp * 1_000 : null;
  } catch (_error) {
    return null;
  }
}

function getPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveCacheExpiry({ token, ttlMs, now }) {
  const ttlExpiresAt = now() + ttlMs;
  const tokenExpiresAt = decodeTokenExpiresAt(token);

  if (!tokenExpiresAt) {
    return ttlExpiresAt;
  }

  return Math.min(ttlExpiresAt, Math.max(now(), tokenExpiresAt - TOKEN_EXPIRY_SAFETY_MS));
}

export function createAuthUserResolver({
  supabaseAuth,
  supabaseAdmin,
  now = () => Date.now(),
  cacheTtlMs = getPositiveInteger(process.env.AUTH_USER_CACHE_TTL_MS, DEFAULT_AUTH_CACHE_TTL_MS),
  maxCacheEntries = getPositiveInteger(
    process.env.AUTH_USER_CACHE_MAX_ENTRIES,
    DEFAULT_MAX_AUTH_CACHE_ENTRIES,
  ),
} = {}) {
  const cache = new Map();
  const inflight = new Map();

  async function fetchProfile(userId) {
    const { data, error } = await supabaseAdmin.rpc('get_user_profile_by_user_id', {
      p_user_id: userId,
    });

    if (error) {
      console.warn('Failed to load user profile via RPC:', error.message);
      return null;
    }

    return Array.isArray(data) ? (data[0] ?? null) : data;
  }

  async function fetchResolvedUser(token) {
    const { data, error } = await supabaseAuth.auth.getUser(token);

    if (error || !data?.user) {
      return null;
    }

    const profile = await fetchProfile(data.user.id);
    const fallbackFullName = data.user.user_metadata?.full_name || '';
    const fallbackRole = data.user.app_metadata?.role || profile?.role;

    return {
      id: data.user.id,
      email: data.user.email,
      fullName: profile?.full_name || fallbackFullName,
      role: normalizeRole(fallbackRole),
      profile,
    };
  }

  function getCachedUser(token) {
    const cached = cache.get(token);

    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= now()) {
      cache.delete(token);
      return null;
    }

    return cached.user;
  }

  function trimCache() {
    while (cache.size > maxCacheEntries) {
      const [oldestToken] = cache.keys();
      cache.delete(oldestToken);
    }
  }

  async function resolveUser(token) {
    if (!token) {
      return null;
    }

    const cachedUser = getCachedUser(token);

    if (cachedUser) {
      return cachedUser;
    }

    const existingRequest = inflight.get(token);

    if (existingRequest) {
      return existingRequest;
    }

    const request = (async () => {
      const user = await fetchResolvedUser(token);

      if (user && cacheTtlMs > 0 && maxCacheEntries > 0) {
        cache.set(token, {
          user,
          expiresAt: resolveCacheExpiry({ token, ttlMs: cacheTtlMs, now }),
        });
        trimCache();
      }

      return user;
    })();

    inflight.set(token, request);

    try {
      return await request;
    } finally {
      inflight.delete(token);
    }
  }

  function clearCache() {
    cache.clear();
    inflight.clear();
  }

  function getCacheStats() {
    return {
      entries: cache.size,
      inflight: inflight.size,
      cacheTtlMs,
      maxCacheEntries,
    };
  }

  return {
    resolveUser,
    clearCache,
    getCacheStats,
  };
}
