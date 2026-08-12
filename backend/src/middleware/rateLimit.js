const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 60;
const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_MESSAGE = 'Too many requests. Please try again later.';

function requirePositiveInteger(value, name) {
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

export function getDefaultRateLimitKey(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

export function createInMemoryRateLimiter({
  windowMs = DEFAULT_WINDOW_MS,
  limit = DEFAULT_LIMIT,
  maxEntries = DEFAULT_MAX_ENTRIES,
  keyGenerator = getDefaultRateLimitKey,
  now = () => Date.now(),
  message = DEFAULT_MESSAGE,
  skip = () => false,
  onLimitReached = null,
} = {}) {
  requirePositiveInteger(windowMs, 'windowMs');
  requirePositiveInteger(limit, 'limit');
  requirePositiveInteger(maxEntries, 'maxEntries');

  if (typeof keyGenerator !== 'function') {
    throw new TypeError('keyGenerator must be a function.');
  }

  if (typeof now !== 'function') {
    throw new TypeError('now must be a function.');
  }

  if (typeof skip !== 'function') {
    throw new TypeError('skip must be a function.');
  }

  if (onLimitReached !== null && typeof onLimitReached !== 'function') {
    throw new TypeError('onLimitReached must be a function when provided.');
  }

  const entries = new Map();
  let nextSweepAt = 0;

  function sweepExpiredEntries(currentTime) {
    if (currentTime < nextSweepAt && entries.size < maxEntries) {
      return;
    }

    for (const [key, entry] of entries.entries()) {
      if (entry.resetAt <= currentTime) {
        entries.delete(key);
      }
    }

    nextSweepAt = currentTime + windowMs;
  }

  function makeRoomForKey(key) {
    if (entries.has(key) || entries.size < maxEntries) {
      return;
    }

    const oldestKey = entries.keys().next().value;
    if (oldestKey !== undefined) {
      entries.delete(oldestKey);
    }
  }

  const middleware = (req, res, next) => {
    if (skip(req)) {
      next();
      return;
    }

    const currentTime = Number(now());
    if (!Number.isFinite(currentTime)) {
      next(new TypeError('Rate limiter clock returned an invalid time.'));
      return;
    }

    sweepExpiredEntries(currentTime);

    const generatedKey = keyGenerator(req);
    const key = String(generatedKey ?? 'unknown').slice(0, 512) || 'unknown';
    makeRoomForKey(key);

    let entry = entries.get(key);
    if (!entry || entry.resetAt <= currentTime) {
      entry = {
        count: 0,
        resetAt: currentTime + windowMs,
      };
      entries.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(limit - entry.count, 0);
    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1_000));
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1_000));

    setHeader(res, 'RateLimit-Policy', `${limit};w=${windowSeconds}`);
    setHeader(res, 'RateLimit', `limit=${limit}, remaining=${remaining}, reset=${resetSeconds}`);
    setHeader(res, 'RateLimit-Limit', limit);
    setHeader(res, 'RateLimit-Remaining', remaining);
    setHeader(res, 'RateLimit-Reset', resetSeconds);

    if (entry.count > limit) {
      setHeader(res, 'Retry-After', resetSeconds);
      setHeader(res, 'Cache-Control', 'no-store');
      onLimitReached?.(req, {
        key,
        limit,
        resetSeconds,
        windowMs,
      });
      res.status(429).json({ error: message });
      return;
    }

    next();
  };

  middleware.clear = () => {
    entries.clear();
    nextSweepAt = 0;
  };

  middleware.getEntryCount = () => entries.size;

  return middleware;
}
