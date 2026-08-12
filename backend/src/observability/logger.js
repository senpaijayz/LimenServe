const REDACTED = '[REDACTED]';
const SENSITIVE_FIELD_PATTERN = /(?:authorization|cookie|password|passwd|secret|service.?role|api.?key|access.?token|refresh.?token)/i;
const MAX_SERIALIZATION_DEPTH = 8;

function serializeError(error, seen, depth) {
  const serialized = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  for (const field of ['code', 'status', 'statusCode', 'details', 'hint']) {
    if (error[field] !== undefined) {
      serialized[field] = sanitizeLogValue(error[field], seen, depth + 1);
    }
  }

  if (error.cause !== undefined) {
    serialized.cause = sanitizeLogValue(error.cause, seen, depth + 1);
  }

  return serialized;
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

  if (seen.has(value)) {
    return '[CIRCULAR]';
  }

  seen.add(value);

  if (value instanceof Error) {
    return serializeError(value, seen, depth);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => sanitizeLogValue(entry, seen, depth + 1));
  }

  const output = {};
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    output[key] = SENSITIVE_FIELD_PATTERN.test(key)
      ? REDACTED
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
