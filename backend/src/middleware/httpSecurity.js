import { randomUUID } from 'node:crypto';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function setHeader(res, name, value) {
  if (typeof res.set === 'function') {
    res.set(name, String(value));
    return;
  }

  res.setHeader(name, String(value));
}

export function resolveRequestId(value, generateId = randomUUID) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = String(candidate || '').trim();

  return REQUEST_ID_PATTERN.test(normalized) ? normalized : generateId();
}

export function createRequestContext({ logger, now = () => process.hrtime.bigint() } = {}) {
  if (!logger?.info || !logger?.warn) {
    throw new TypeError('A structured logger is required.');
  }

  return (req, res, next) => {
    const requestId = resolveRequestId(req.headers?.['x-request-id']);
    const startedAt = now();
    let completed = false;

    req.requestId = requestId;
    req.log = logger;
    res.locals = res.locals || {};
    res.locals.requestId = requestId;
    setHeader(res, 'X-Request-ID', requestId);

    function logCompletion(closedEarly = false) {
      if (completed) {
        return;
      }

      completed = true;
      const endedAt = now();
      const durationMs = Number(endedAt - startedAt) / 1_000_000;
      const attributes = {
        requestId,
        method: req.method,
        path: req.path || String(req.url || '').split('?')[0],
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        clientIp: req.ip,
        closedEarly,
      };

      if (closedEarly || res.statusCode >= 500) {
        logger.warn('request.complete', attributes);
      } else {
        logger.info('request.complete', attributes);
      }
    }

    res.once('finish', () => logCompletion(false));
    res.once('close', () => logCompletion(!res.writableEnded));
    next();
  };
}

export function createSecurityHeaders({ enableHsts = false } = {}) {
  return (_req, res, next) => {
    setHeader(res, 'Content-Security-Policy', "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    setHeader(res, 'Cross-Origin-Opener-Policy', 'same-origin');
    setHeader(res, 'Cross-Origin-Resource-Policy', 'cross-origin');
    setHeader(res, 'Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
    setHeader(res, 'Referrer-Policy', 'no-referrer');
    setHeader(res, 'X-Content-Type-Options', 'nosniff');
    setHeader(res, 'X-Frame-Options', 'DENY');
    setHeader(res, 'X-Permitted-Cross-Domain-Policies', 'none');

    if (enableHsts) {
      setHeader(res, 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  };
}

export function createRequestTimeout({
  timeoutMs,
  logger,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive integer.');
  }

  return (req, res, next) => {
    const abortController = new AbortController();
    let finished = false;

    req.abortSignal = abortController.signal;

    const timer = setTimer(() => {
      if (finished) {
        return;
      }

      req.timedOut = true;
      abortController.abort(new Error('Request processing timeout.'));
      logger?.warn?.('request.timeout', {
        requestId: req.requestId,
        method: req.method,
        path: req.path || String(req.url || '').split('?')[0],
        timeoutMs,
      });

      if (!res.headersSent) {
        setHeader(res, 'Cache-Control', 'no-store');
        setHeader(res, 'Connection', 'close');
        res.status(503).json({
          error: 'Request timed out.',
          requestId: req.requestId,
        });
      } else if (typeof res.destroy === 'function') {
        res.destroy();
      }
    }, timeoutMs);
    timer.unref?.();

    function cleanup() {
      if (finished) {
        return;
      }

      finished = true;
      clearTimer(timer);
    }

    res.once('finish', cleanup);
    res.once('close', cleanup);
    next();
  };
}
