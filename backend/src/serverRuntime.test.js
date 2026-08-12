import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { createServerRuntime } from './serverRuntime.js';

function createFixture({ closeImmediately = true } = {}) {
  const processRef = new EventEmitter();
  processRef.exitCode = 0;
  const records = [];
  const logger = {
    info(event, attributes) { records.push({ level: 'info', event, attributes }); },
    warn(event, attributes) { records.push({ level: 'warn', event, attributes }); },
    error(event, attributes) { records.push({ level: 'error', event, attributes }); },
  };
  const lifecycle = {
    phase: 'starting',
    markReady() { this.phase = 'ready'; },
    beginShutdown() { this.phase = 'stopping'; },
  };
  const server = new EventEmitter();
  server.listen = (_port, callback) => callback();
  server.close = (callback) => {
    server.closeCallback = callback;
    if (closeImmediately) callback();
  };
  server.closeIdleConnections = () => { server.idleConnectionsClosed = true; };
  server.closeAllConnections = () => { server.allConnectionsClosed = true; };

  const runtime = createServerRuntime({
    app: () => {},
    runtimeEnv: {
      port: 3001,
      applicationEnvironment: 'test',
      proxyHops: 0,
      requestTimeoutMs: 25_000,
      shutdownGraceMs: 10,
    },
    lifecycle,
    logger,
    processRef,
    createServer: () => server,
  });

  return { runtime, processRef, records, lifecycle, server };
}

test('marks the process ready after listening and configures HTTP timeouts', () => {
  const { runtime, lifecycle, server } = createFixture();
  runtime.start();

  assert.equal(lifecycle.phase, 'ready');
  assert.equal(server.requestTimeout, 25_000);
  assert.equal(server.headersTimeout, 15_000);
  assert.equal(server.keepAliveTimeout, 5_000);
});

test('stops accepting traffic and closes idle connections on SIGTERM', async () => {
  const { runtime, processRef, records, lifecycle, server } = createFixture();
  runtime.start();
  processRef.emit('SIGTERM');

  const result = await runtime.shutdown('test');
  assert.equal(result.forced, false);
  assert.equal(lifecycle.phase, 'stopping');
  assert.equal(server.idleConnectionsClosed, true);
  assert.ok(records.some((record) => record.event === 'server.shutdown_complete'));
});

test('forces lingering connections closed after the grace period', async () => {
  const { runtime, processRef, lifecycle, server } = createFixture({ closeImmediately: false });
  runtime.start();

  const result = await runtime.shutdown('test-timeout');
  assert.equal(result.forced, true);
  assert.equal(lifecycle.phase, 'stopping');
  assert.equal(server.allConnectionsClosed, true);
  assert.equal(processRef.exitCode, 1);
});
