import assert from 'node:assert/strict';
import test from 'node:test';

import { createErrorHandler, getPublicErrorResponse } from './errorHandling.js';

test('sanitizes unexpected server errors while retaining the request ID', () => {
  const error = new Error('password=secret select * from private_table');
  error.code = 'XX001';

  assert.deepEqual(getPublicErrorResponse(error, 'request-1'), {
    statusCode: 500,
    body: {
      error: 'Internal server error.',
      requestId: 'request-1',
    },
  });
});

test('preserves explicit client-safe messages and normalizes invalid JSON errors', () => {
  const conflict = new Error('That idempotency key is already in use.');
  conflict.statusCode = 409;
  assert.equal(getPublicErrorResponse(conflict, 'request-2').body.error, conflict.message);

  const invalidJson = new SyntaxError('Unexpected token at position 10');
  invalidJson.status = 400;
  invalidJson.type = 'entity.parse.failed';
  assert.equal(getPublicErrorResponse(invalidJson, 'request-3').body.error, 'Invalid JSON request body.');
});

test('logs detailed failures but sends only the sanitized response', () => {
  const records = [];
  const logger = {
    error(event, attributes) { records.push({ event, attributes }); },
  };
  const response = {
    headersSent: false,
    headers: new Map(),
    setHeader(name, value) { this.headers.set(name.toLowerCase(), value); },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  const error = new Error('database connection string and stack detail');

  createErrorHandler({ logger })(error, {
    requestId: 'request-4',
    method: 'GET',
    path: '/api/private',
  }, response, () => {});

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, 'Internal server error.');
  assert.equal(response.body.requestId, 'request-4');
  assert.equal(records[0].attributes.error, error);
  assert.equal(records[0].attributes.requestId, 'request-4');
});
