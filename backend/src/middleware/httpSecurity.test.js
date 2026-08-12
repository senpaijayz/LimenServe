import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  createRequestContext,
  createRequestTimeout,
  createSecurityHeaders,
  resolveRequestId,
} from './httpSecurity.js';

function createResponse() {
  const response = new EventEmitter();
  response.headers = new Map();
  response.locals = {};
  response.statusCode = 200;
  response.writableEnded = false;
  response.setHeader = (name, value) => response.headers.set(name.toLowerCase(), String(value));
  response.status = (statusCode) => { response.statusCode = statusCode; return response; };
  response.json = (body) => { response.body = body; return response; };
  return response;
}

test('accepts bounded request IDs and replaces unsafe values', () => {
  assert.equal(resolveRequestId('client.request-1', () => 'generated'), 'client.request-1');
  assert.equal(resolveRequestId('bad request id', () => 'generated'), 'generated');
  assert.equal(resolveRequestId('x'.repeat(129), () => 'generated'), 'generated');
});

test('adds request IDs and emits a single structured access log', () => {
  const records = [];
  const logger = {
    info(event, attributes) { records.push({ level: 'info', event, attributes }); },
    warn(event, attributes) { records.push({ level: 'warn', event, attributes }); },
  };
  const response = createResponse();
  const request = {
    headers: { 'x-request-id': 'request-123' },
    method: 'GET',
    path: '/api/test',
    ip: '127.0.0.1',
  };
  let currentTime = 1_000_000_000n;

  createRequestContext({ logger, now: () => currentTime })(request, response, () => {});
  currentTime += 5_000_000n;
  response.writableEnded = true;
  response.emit('finish');
  response.emit('close');

  assert.equal(request.requestId, 'request-123');
  assert.equal(response.headers.get('x-request-id'), 'request-123');
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    level: 'info',
    event: 'request.complete',
    attributes: {
      requestId: 'request-123',
      method: 'GET',
      path: '/api/test',
      statusCode: 200,
      durationMs: 5,
      clientIp: '127.0.0.1',
      closedEarly: false,
    },
  });
});

test('sets defensive API headers including HSTS only when configured', () => {
  const secureResponse = createResponse();
  createSecurityHeaders({ enableHsts: true })({}, secureResponse, () => {});

  assert.equal(secureResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(secureResponse.headers.get('x-frame-options'), 'DENY');
  assert.match(secureResponse.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(secureResponse.headers.get('strict-transport-security'), /max-age=31536000/);

  const localResponse = createResponse();
  createSecurityHeaders({ enableHsts: false })({}, localResponse, () => {});
  assert.equal(localResponse.headers.has('strict-transport-security'), false);
});

test('aborts and safely answers requests that exceed the processing timeout', () => {
  const response = createResponse();
  const request = {
    requestId: 'timeout-request',
    method: 'POST',
    path: '/api/slow',
  };
  const warnings = [];
  let timeoutCallback;
  let cleared = false;

  createRequestTimeout({
    timeoutMs: 1_000,
    logger: { warn(event, attributes) { warnings.push({ event, attributes }); } },
    setTimer(callback) {
      timeoutCallback = callback;
      return { unref() {} };
    },
    clearTimer() { cleared = true; },
  })(request, response, () => {});

  timeoutCallback();

  assert.equal(request.timedOut, true);
  assert.equal(request.abortSignal.aborted, true);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    error: 'Request timed out.',
    requestId: 'timeout-request',
  });
  assert.equal(response.headers.get('connection'), 'close');
  assert.equal(warnings[0].event, 'request.timeout');

  response.emit('finish');
  assert.equal(cleared, true);
});
