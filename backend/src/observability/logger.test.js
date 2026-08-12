import assert from 'node:assert/strict';
import test from 'node:test';

import { createLogger, sanitizeLogValue } from './logger.js';

test('emits structured records while redacting credential-shaped fields', () => {
  const records = [];
  const testLogger = createLogger({
    write(level, record) {
      records.push({ level, record });
    },
  });

  testLogger.info('request.complete', {
    requestId: 'request-1',
    authorization: 'Bearer private-token',
    nested: { serviceRoleKey: 'private-service-key', allowed: 'value' },
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].level, 'info');
  assert.equal(records[0].record.event, 'request.complete');
  assert.equal(records[0].record.requestId, 'request-1');
  assert.equal(records[0].record.authorization, '[REDACTED]');
  assert.equal(records[0].record.nested.serviceRoleKey, '[REDACTED]');
  assert.equal(records[0].record.nested.allowed, 'value');
});

test('serializes detailed errors for server logs without failing on cycles', () => {
  const cause = new Error('database detail');
  cause.code = 'XX001';
  const error = new Error('request failed', { cause });
  error.context = error;

  const result = sanitizeLogValue({ error, value: 'line one\nline two' });

  assert.equal(result.error.message, 'request failed');
  assert.match(result.error.stack, /request failed/);
  assert.equal(result.error.cause.code, 'XX001');
  assert.equal(result.value, 'line one line two');
});
