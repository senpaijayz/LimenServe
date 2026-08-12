import app from './app.js';
import { env } from './config/env.js';
import { runtimeState } from './health/readiness.js';
import { logger } from './observability/logger.js';
import { createServerRuntime } from './serverRuntime.js';

const serverRuntime = createServerRuntime({
  app,
  runtimeEnv: env,
  lifecycle: runtimeState,
  logger,
});

serverRuntime.start();
