function normalizeRequestOrigin(origin) {
  if (!origin) {
    return null;
  }

  try {
    const parsed = new URL(origin);
    const normalizedInput = String(origin).trim().replace(/\/$/, '');
    return parsed.origin === normalizedInput ? parsed.origin : null;
  } catch (_error) {
    return null;
  }
}

export function createOriginPolicy(allowedOrigins) {
  const allowed = new Set(allowedOrigins);

  return (origin, callback) => {
    // Requests without Origin are server-to-server, same-origin, CLI, or health
    // probes. Authentication and authorization still apply to protected routes.
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeRequestOrigin(origin);
    if (normalizedOrigin && allowed.has(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    const error = new Error('Request origin is not allowed by CORS.');
    error.statusCode = 403;
    error.publicMessage = 'Request origin is not allowed.';
    callback(error);
  };
}

export function createCorsOptions(allowedOrigins) {
  return {
    origin: createOriginPolicy(allowedOrigins),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Limen-Client-Cache',
      'X-Request-ID',
    ],
    exposedHeaders: [
      'ETag',
      'RateLimit',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
      'Retry-After',
      'X-Request-ID',
    ],
    maxAge: 600,
    optionsSuccessStatus: 204,
  };
}
