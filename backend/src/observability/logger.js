const REDACTED = '[REDACTED]';
const SENSITIVE_FIELD_PATTERN = /(?:authorization|cookie|password|passwd|secret|service.?role|api.?key|access.?token|refresh.?token)/i;
const PRIVATE_FIELD_PATTERN = /^(?:body|payload|headers|query|params|req|res|request|response|customer|user|customer_?name|phone|email|address|plate(?:_?no|number)?|notes?|payment_?reference|otp|(?:recovery|verification|reset)_?code|details|hint)$/i;
const MAX_SERIALIZATION_DEPTH = 8;

function serializeError(error, seen, depth) {
  // Provider messages/details can echo customer fields, SQL values or credentials.
  // Keep bounded diagnostic tokens and local source locations, never raw prose.
  const serialized = {
    name: typeof error.name === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(error.name) ? error.name : 'Error',
  };

  if (typeof error.code === 'string' && /^[A-Za-z0-9][A-Za-z0-9_:-]{0,63}$/.test(error.code)) serialized.code = error.code;
  for (const field of ['status', 'statusCode']) {
    if (Number.isInteger(error[field]) && error[field] >= 100 && error[field] <= 599) serialized[field] = error[field];
  }

  const locations = typeof error.stack === 'string' ? error.stack.split('\n').slice(1, 21)
    .map(line => {
      const source = line.match(/(?:^|[\\/])(src[\\/][A-Za-z0-9_./\\-]+\.(?:mjs|cjs|js|jsx|ts|tsx):\d+:\d+)(?=[)\s]|$)/)?.[1]?.replaceAll('\\', '/');
      return source?.replace(/^.*\/src\//, 'src/');
    })
    .filter(Boolean) : [];
  if (locations.length) serialized.locations = [...new Set(locations)].slice(0, 8);
  if (error.cause !== undefined) {
    serialized.cause = sanitizeError(error.cause, seen, depth + 1);
  }

  return serialized;
}

function sanitizeError(value, seen, depth) {
  if (value == null) return value;
  if (typeof value !== 'object') return REDACTED;
  if (depth >= MAX_SERIALIZATION_DEPTH) return '[MAX_DEPTH]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  return serializeError(value, seen, depth);
}

export function sanitizeLogValue(value, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'string') {
    return value.replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, 8_192);
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return String(value);
  }

  if (depth >= MAX_SERIALIZATION_DEPTH) {
    return '[MAX_DEPTH]';
  }

  if (value instanceof Error) return sanitizeError(value, seen, depth);

  if (seen.has(value)) {
    return '[CIRCULAR]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => sanitizeLogValue(entry, seen, depth + 1));
  }

  const output = {};
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    output[key] = SENSITIVE_FIELD_PATTERN.test(key) || PRIVATE_FIELD_PATTERN.test(key)
      ? REDACTED
      : /^(?:error|cause)$/i.test(key)
        ? sanitizeError(entry, seen, depth + 1)
        : sanitizeLogValue(entry, seen, depth + 1);
  }

  return output;
}

function defaultWrite(level, record) {
  const line = `${JSON.stringify(record)}\n`;

  if (level === 'error') {
    process.stderr.write(line);
    return;
  }

  process.stdout.write(line);
}

export function createLogger({ write = defaultWrite, service = 'limen-backend' } = {}) {
  function log(level, event, attributes = {}) {
    const record = sanitizeLogValue({
      timestamp: new Date().toISOString(),
      level,
      service,
      event,
      ...attributes,
    });

    write(level, record);
    return record;
  }

  return Object.freeze({
    debug: (event, attributes) => log('debug', event, attributes),
    info: (event, attributes) => log('info', event, attributes),
    warn: (event, attributes) => log('warn', event, attributes),
    error: (event, attributes) => log('error', event, attributes),
  });
}

export const logger = createLogger();
