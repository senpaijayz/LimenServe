import { createHmac } from 'node:crypto';

const DEFAULT_MESSAGE = 'Too many requests. Please try again later.';
const DEFAULT_FAILURE_MESSAGE = 'Request verification is temporarily unavailable. Please try again later.';
const SCOPE_PATTERN = /^[a-z][a-z0-9_.:-]{0,127}$/;
const HASH_DOMAIN = 'limenserve:rate-limit:v1';

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return value;
}

function setHeader(res, name, value) {
  if (typeof res.set === 'function') {
    res.set(name, String(value));
    return;
  }
  res.setHeader(name, String(value));
}

function normalizeStoreResult(result, limit) {
  const allowed = result?.allowed;
  const remaining = Number(result?.remaining);
  const resetSeconds = Number(result?.resetSeconds ?? result?.reset_seconds);

  if (typeof allowed !== 'boolean'
    || !Number.isSafeInteger(remaining)
    || remaining < 0
    || remaining > limit
    || !Number.isSafeInteger(resetSeconds)
    || resetSeconds <= 0) {
    throw new Error('Rate limit store returned an invalid result.');
  }

  return { allowed, remaining, resetSeconds };
}

export function hashRateLimitKey(scope, key, secret) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new TypeError('A server-only rate limit hash secret is required.');
  }

  return createHmac('sha256', secret)
    .update(HASH_DOMAIN)
    .update('\0')
    .update(scope)
    .update('\0')
    .update(String(key ?? 'unknown').slice(0, 512))
    .digest('hex');
}

export function createStoreBackedRateLimiter({
  store,
  scope,
  windowMs,
  limit,
  keyGenerator,
  hashSecret,
  message = DEFAULT_MESSAGE,
  failureMessage = DEFAULT_FAILURE_MESSAGE,
  skip = () => false,
  onLimitReached = null,
  onStoreError = null,
} = {}) {
  if (!store?.consume || typeof store.consume !== 'function') {
    throw new TypeError('A rate limit store with consume() is required.');
  }
  if (!SCOPE_PATTERN.test(scope || '')) {
    throw new TypeError('scope must be a stable lower-case rate limit namespace.');
  }
  positiveInteger(windowMs, 'windowMs');
  positiveInteger(limit, 'limit');
  if (typeof keyGenerator !== 'function' || typeof skip !== 'function') {
    throw new TypeError('keyGenerator and skip must be functions.');
  }
  if (typeof hashSecret !== 'string' || hashSecret.length < 16) {
    throw new TypeError('hashSecret must be a server-only value with at least 16 characters.');
  }

  const windowSeconds = Math.ceil(windowMs / 1_000);

  return async function storeBackedRateLimiter(req, res, next) {
    if (skip(req)) {
      next();
      return;
    }

    try {
      const keyHash = hashRateLimitKey(scope, keyGenerator(req), hashSecret);
      const rawResult = await store.consume({
        scope,
        keyHash,
        windowSeconds,
        limit,
      });
      const result = normalizeStoreResult(rawResult, limit);

      setHeader(res, 'RateLimit-Policy', `${limit};w=${windowSeconds}`);
      setHeader(res, 'RateLimit', `limit=${limit}, remaining=${result.remaining}, reset=${result.resetSeconds}`);
      setHeader(res, 'RateLimit-Limit', limit);
      setHeader(res, 'RateLimit-Remaining', result.remaining);
      setHeader(res, 'RateLimit-Reset', result.resetSeconds);

      if (!result.allowed) {
        setHeader(res, 'Retry-After', result.resetSeconds);
        setHeader(res, 'Cache-Control', 'no-store');
        onLimitReached?.(req, {
          scope,
          limit,
          resetSeconds: result.resetSeconds,
          windowMs,
        });
        res.status(429).json({ error: message });
        return;
      }

      next();
    } catch (error) {
      onStoreError?.(req, { scope, error });
      const safeError = new Error(failureMessage, { cause: error });
      safeError.statusCode = 503;
      safeError.publicMessage = failureMessage;
      next(safeError);
    }
  };
}

export function createInMemoryRateLimitStore({ now = () => Date.now(), maxEntries = 10_000 } = {}) {
  positiveInteger(maxEntries, 'maxEntries');
  const entries = new Map();

  return {
    async consume({ scope, keyHash, windowSeconds, limit }) {
      positiveInteger(windowSeconds, 'windowSeconds');
      positiveInteger(limit, 'limit');
      const currentTime = Number(now());
      const mapKey = `${scope}:${keyHash}`;
      let entry = entries.get(mapKey);

      if (!entry || entry.resetAt <= currentTime) {
        entry = { count: 0, resetAt: currentTime + (windowSeconds * 1_000) };
        entries.set(mapKey, entry);
      }

      entry.count += 1;
      while (entries.size > maxEntries) {
        entries.delete(entries.keys().next().value);
      }

      return {
        allowed: entry.count <= limit,
        remaining: Math.max(limit - entry.count, 0),
        resetSeconds: Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1_000)),
      };
    },
    clear() {
      entries.clear();
    },
  };
}

export function createSupabaseRateLimitStore({
  supabase,
  rpcName = 'consume_public_rate_limit',
} = {}) {
  if (!supabase?.rpc || typeof supabase.rpc !== 'function') {
    throw new TypeError('A Supabase service-role client is required.');
  }

  return {
    async consume({ scope, keyHash, windowSeconds, limit }) {
      if (!SCOPE_PATTERN.test(scope || '') || !/^[0-9a-f]{64}$/.test(keyHash || '')) {
        throw new TypeError('Supabase rate limit scope and key hash are invalid.');
      }
      positiveInteger(windowSeconds, 'windowSeconds');
      positiveInteger(limit, 'limit');

      const { data, error } = await supabase.rpc(rpcName, {
        p_scope: scope,
        p_key_hash: keyHash,
        p_window_seconds: windowSeconds,
        p_limit: limit,
      });

      if (error) {
        throw error;
      }

      const result = Array.isArray(data) ? data[0] : data;
      return normalizeStoreResult(result, limit);
    },
  };
}
