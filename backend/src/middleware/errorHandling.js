const GENERIC_SERVER_MESSAGES = new Map([
  [500, 'Internal server error.'],
  [502, 'Upstream service unavailable.'],
  [503, 'Service temporarily unavailable.'],
  [504, 'Upstream request timed out.'],
]);

function normalizeStatusCode(error) {
  const candidate = Number(error?.statusCode || error?.status);
  return Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
}

function sanitizeMessage(value, fallback) {
  const message = String(value || '')
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);

  return message || fallback;
}

export function getPublicErrorResponse(error, requestId) {
  const statusCode = normalizeStatusCode(error);
  let message;

  if (error?.type === 'entity.parse.failed') {
    message = 'Invalid JSON request body.';
  } else if (error?.publicMessage) {
    message = sanitizeMessage(error.publicMessage, 'Request failed.');
  } else if (statusCode < 500 || error?.expose === true) {
    message = sanitizeMessage(error?.message, 'Request failed.');
  } else {
    message = GENERIC_SERVER_MESSAGES.get(statusCode) || 'Internal server error.';
  }

  return {
    statusCode,
    body: {
      error: message,
      requestId,
    },
  };
}

export function createNotFoundHandler() {
  return (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).json({
      error: 'API route not found.',
      requestId: req.requestId,
    });
  };
}

export function createErrorHandler({ logger }) {
  if (!logger?.error) {
    throw new TypeError('A structured logger is required.');
  }

  return (error, req, res, next) => {
    const response = getPublicErrorResponse(error, req.requestId);

    logger.error('request.failed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path || String(req.url || '').split('?')[0],
      statusCode: response.statusCode,
      userId: req.user?.id,
      error,
    });

    if (res.headersSent || req.timedOut) {
      next(error);
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(response.statusCode).json(response.body);
  };
}
