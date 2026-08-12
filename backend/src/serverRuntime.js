import http from 'node:http';

export function createServerRuntime({
  app,
  runtimeEnv,
  lifecycle,
  logger,
  processRef = process,
  createServer = http.createServer,
} = {}) {
  if (!app || !runtimeEnv || !lifecycle || !logger) {
    throw new TypeError('app, runtimeEnv, lifecycle, and logger are required.');
  }

  const server = createServer(app);
  server.requestTimeout = runtimeEnv.requestTimeoutMs;
  server.headersTimeout = Math.min(15_000, runtimeEnv.requestTimeoutMs);
  server.keepAliveTimeout = 5_000;

  let shutdownPromise = null;
  let handlersRegistered = false;

  function removeProcessHandlers() {
    if (!handlersRegistered) {
      return;
    }

    processRef.off('SIGTERM', handleSigterm);
    processRef.off('SIGINT', handleSigint);
    processRef.off('uncaughtException', handleUncaughtException);
    processRef.off('unhandledRejection', handleUnhandledRejection);
    handlersRegistered = false;
  }

  function shutdown(reason, error = null) {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    lifecycle.beginShutdown();
    if (error) {
      processRef.exitCode = 1;
    }

    logger.warn('server.shutdown_started', {
      reason,
      graceMs: runtimeEnv.shutdownGraceMs,
      error,
    });

    shutdownPromise = new Promise((resolve) => {
      let settled = false;

      function finish(closeError = null) {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(forceTimer);
        removeProcessHandlers();

        if (closeError) {
          processRef.exitCode = 1;
          logger.error('server.shutdown_failed', { reason, error: closeError });
        } else {
          logger.info('server.shutdown_complete', { reason });
        }

        resolve({ forced: false, error: closeError });
      }

      const forceTimer = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        processRef.exitCode = 1;
        server.closeAllConnections?.();
        removeProcessHandlers();
        logger.error('server.shutdown_forced', {
          reason,
          graceMs: runtimeEnv.shutdownGraceMs,
        });
        resolve({ forced: true, error: null });
      }, runtimeEnv.shutdownGraceMs);
      forceTimer.unref?.();

      server.close((closeError) => finish(closeError || null));
      server.closeIdleConnections?.();
    });

    return shutdownPromise;
  }

  function handleSigterm() {
    void shutdown('SIGTERM');
  }

  function handleSigint() {
    void shutdown('SIGINT');
  }

  function handleUncaughtException(error) {
    logger.error('process.uncaught_exception', { error });
    void shutdown('uncaughtException', error);
  }

  function handleUnhandledRejection(reason) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('process.unhandled_rejection', { error });
    void shutdown('unhandledRejection', error);
  }

  function registerProcessHandlers() {
    if (handlersRegistered) {
      return;
    }

    processRef.once('SIGTERM', handleSigterm);
    processRef.once('SIGINT', handleSigint);
    processRef.once('uncaughtException', handleUncaughtException);
    processRef.once('unhandledRejection', handleUnhandledRejection);
    handlersRegistered = true;
  }

  function start() {
    registerProcessHandlers();

    server.once('error', (error) => {
      lifecycle.beginShutdown();
      processRef.exitCode = 1;
      logger.error('server.listen_failed', { port: runtimeEnv.port, error });
    });

    server.listen(runtimeEnv.port, () => {
      lifecycle.markReady();
      logger.info('server.listening', {
        port: runtimeEnv.port,
        environment: runtimeEnv.applicationEnvironment,
        proxyHops: runtimeEnv.proxyHops,
      });
    });

    return server;
  }

  return Object.freeze({
    server,
    start,
    shutdown,
  });
}
