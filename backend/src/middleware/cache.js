const MAX_RESPONSE_CACHE_ENTRIES = 120;
const MAX_CACHED_BODY_BYTES = 1_200_000;

const publicCacheRules = [
  {
    pattern: /^\/api\/public\/cms\/site$/,
    browserMaxAge: 30,
    sharedMaxAge: 180,
    staleWhileRevalidate: 900,
    memoryTtlMs: 60_000,
    tags: ['cms', 'cms-site'],
  },
  {
    pattern: /^\/api\/public\/cms\/pages\/[^/]+$/,
    browserMaxAge: 30,
    sharedMaxAge: 180,
    staleWhileRevalidate: 900,
    memoryTtlMs: 60_000,
    tags: ['cms', 'cms-pages'],
  },
  {
    pattern: /^\/api\/public\/mechanics$/,
    browserMaxAge: 60,
    sharedMaxAge: 300,
    staleWhileRevalidate: 900,
    memoryTtlMs: 120_000,
    tags: ['public-mechanics'],
  },
  {
    pattern: /^\/api\/catalog\/vehicle-fitment\/options$/,
    browserMaxAge: 3600,
    sharedMaxAge: 86_400,
    staleWhileRevalidate: 604_800,
    memoryTtlMs: 600_000,
    tags: ['vehicle-fitments'],
  },
  {
    pattern: /^\/api\/catalog\/vehicle-packages$/,
    browserMaxAge: 120,
    sharedMaxAge: 900,
    staleWhileRevalidate: 3600,
    memoryTtlMs: 300_000,
    tags: ['vehicle-packages'],
  },
  {
    pattern: /^\/api\/catalog\/services$/,
    browserMaxAge: 120,
    sharedMaxAge: 1800,
    staleWhileRevalidate: 3600,
    memoryTtlMs: 300_000,
    tags: ['catalog-services'],
  },
  {
    pattern: /^\/api\/catalog\/products$/,
    browserMaxAge: 30,
    sharedMaxAge: 120,
    staleWhileRevalidate: 600,
    memoryTtlMs: 45_000,
    tags: ['catalog-products'],
  },
  {
    pattern: /^\/api\/catalog\/products\/[^/]+\/recommendations$/,
    browserMaxAge: 120,
    sharedMaxAge: 900,
    staleWhileRevalidate: 3600,
    memoryTtlMs: 300_000,
    tags: ['catalog-products', 'recommendations'],
  },
];

const responseCache = new Map();

function getRequestPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

function getPublicCacheRule(req) {
  if (req.method !== 'GET') {
    return null;
  }

  const path = getRequestPath(req);
  return publicCacheRules.find((rule) => rule.pattern.test(path)) ?? null;
}

function shouldBypassCache(req) {
  const cacheControl = String(req.headers['cache-control'] || '').toLowerCase();
  return cacheControl.includes('no-cache') || cacheControl.includes('no-store');
}

function setPublicCacheHeaders(res, rule) {
  const cacheControl = `public, max-age=${rule.browserMaxAge}, s-maxage=${rule.sharedMaxAge}, stale-while-revalidate=${rule.staleWhileRevalidate}`;
  const cdnCacheControl = `public, max-age=${rule.sharedMaxAge}, stale-while-revalidate=${rule.staleWhileRevalidate}`;

  res.set('Cache-Control', cacheControl);
  res.set('CDN-Cache-Control', cdnCacheControl);
  res.set('Vercel-CDN-Cache-Control', cdnCacheControl);
  res.set('Surrogate-Control', `max-age=${rule.sharedMaxAge}, stale-while-revalidate=${rule.staleWhileRevalidate}`);
  res.set('Vercel-Cache-Tag', rule.tags.join(','));
  res.set('Vary', 'Accept-Encoding');
}

function trimResponseCache() {
  while (responseCache.size > MAX_RESPONSE_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
}

function buildCacheKey(req) {
  return `${req.method}:${req.originalUrl}`;
}

function getSerializedBodySize(body) {
  try {
    return Buffer.byteLength(JSON.stringify(body), 'utf8');
  } catch {
    return MAX_CACHED_BODY_BYTES + 1;
  }
}

export function isPublicCacheableRequest(req) {
  return Boolean(getPublicCacheRule(req));
}

export function clearPublicResponseCache() {
  responseCache.clear();
}

export function publicResponseCache(req, res, next) {
  const rule = getPublicCacheRule(req);

  if (!rule) {
    if (req.method === 'GET' && !res.getHeader('Cache-Control')) {
      res.set('Cache-Control', 'no-store');
    }
    next();
    return;
  }

  req.skipUserAttachment = true;
  setPublicCacheHeaders(res, rule);

  if (shouldBypassCache(req)) {
    res.set('X-Limen-Data-Cache', 'BYPASS');
    next();
    return;
  }

  const cacheKey = buildCacheKey(req);
  const cached = responseCache.get(cacheKey);
  const ageMs = cached ? Date.now() - cached.timestamp : Number.POSITIVE_INFINITY;

  if (cached && ageMs < rule.memoryTtlMs) {
    res.set('Age', String(Math.floor(ageMs / 1000)));
    res.set('X-Limen-Data-Cache', 'HIT');
    res.status(cached.statusCode).json(cached.body);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const statusCode = res.statusCode || 200;

    if (statusCode >= 200 && statusCode < 300 && getSerializedBodySize(body) <= MAX_CACHED_BODY_BYTES) {
      responseCache.set(cacheKey, {
        body,
        statusCode,
        timestamp: Date.now(),
      });
      trimResponseCache();
    }

    res.set('X-Limen-Data-Cache', 'MISS');
    return originalJson(body);
  };

  next();
}
