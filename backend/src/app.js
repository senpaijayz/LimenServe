import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import {
  createSupabaseReadinessCheck,
  runtimeState,
} from './health/readiness.js';
import { attachUser } from './middleware/auth.js';
import { publicResponseCache } from './middleware/cache.js';
import { createCorsOptions } from './middleware/corsPolicy.js';
import { createErrorHandler, createNotFoundHandler } from './middleware/errorHandling.js';
import {
  createRequestContext,
  createRequestTimeout,
  createSecurityHeaders,
} from './middleware/httpSecurity.js';
import { createInMemoryRateLimiter } from './middleware/rateLimit.js';
import { logger } from './observability/logger.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import catalogRoutes from './routes/catalogRoutes.js';
import cmsRoutes from './routes/cmsRoutes.js';
import estimateRoutes from './routes/estimateRoutes.js';
import inventoryStockroomRoutes from './routes/inventoryStockroomRoutes.js';
import mechanicsRoutes from './routes/mechanicsRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import partsMappingRoutes from './routes/partsMappingRoutes.js';
import posRoutes from './routes/posRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import reservationRoutes from './routes/reservationRoutes.js';
import serviceOrderRoutes from './routes/serviceOrderRoutes.js';
import stockroomRoutes from './routes/stockroomRoutes.js';
import userRoutes from './routes/userRoutes.js';

const defaultReadinessCheck = createSupabaseReadinessCheck({
  supabaseUrl: env.supabaseUrl,
  supabaseAnonKey: env.supabaseAnonKey,
  timeoutMs: env.readinessTimeoutMs,
  cacheMs: env.readinessCacheMs,
});

function createHealthPayload(ok, phase, dependencies = undefined) {
  return {
    ok,
    service: 'limen-backend',
    phase,
    ...(dependencies ? { dependencies } : {}),
    timestamp: new Date().toISOString(),
  };
}

export function createApp({
  runtimeEnv = env,
  applicationLogger = logger,
  lifecycle = runtimeState,
  readinessCheck = defaultReadinessCheck,
} = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', runtimeEnv.proxyHops);
  app.use(createRequestContext({ logger: applicationLogger }));
  app.use(createSecurityHeaders({ enableHsts: runtimeEnv.isDeployed }));
  app.use(createRequestTimeout({
    timeoutMs: runtimeEnv.requestTimeoutMs,
    logger: applicationLogger,
  }));
  app.use(cors(createCorsOptions(runtimeEnv.frontendUrls)));

  function sendLiveness(_req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.json(createHealthPayload(true, lifecycle.getPhase()));
  }

  // Preserve the original endpoint for existing Render probes while exposing
  // explicit Kubernetes-style liveness and readiness contracts.
  app.get('/api/health', sendLiveness);
  app.get('/api/health/live', sendLiveness);
  app.get('/api/health/ready', async (req, res, next) => {
    try {
      if (!lifecycle.isAcceptingTraffic()) {
        res.setHeader('Cache-Control', 'no-store');
        res.status(503).json(createHealthPayload(false, lifecycle.getPhase()));
        return;
      }

      const dependencyResult = await readinessCheck();
      const dependencies = {
        supabaseAuth: dependencyResult.status,
      };

      if (!dependencyResult.ok) {
        applicationLogger.warn('readiness.failed', {
          requestId: req.requestId,
          dependency: dependencyResult.dependency,
          statusCode: dependencyResult.statusCode,
          latencyMs: dependencyResult.latencyMs,
          error: dependencyResult.error,
        });
        res.setHeader('Cache-Control', 'no-store');
        res.status(503).json(createHealthPayload(false, lifecycle.getPhase(), dependencies));
        return;
      }

      res.setHeader('Cache-Control', 'no-store');
      res.json(createHealthPayload(true, lifecycle.getPhase(), dependencies));
    } catch (error) {
      next(error);
    }
  });

  const globalRateLimiter = createInMemoryRateLimiter({
    windowMs: runtimeEnv.globalRateLimitWindowMs,
    limit: runtimeEnv.globalRateLimitMax,
    maxEntries: runtimeEnv.globalRateLimitMaxEntries,
    onLimitReached(req, details) {
      applicationLogger.warn('rate_limit.exceeded', {
        requestId: req.requestId,
        clientIp: req.ip,
        path: req.path,
        limit: details.limit,
        windowMs: details.windowMs,
        resetSeconds: details.resetSeconds,
      });
    },
  });

  app.use('/api', globalRateLimiter);
  app.use(express.json({ limit: '1mb' }));
  app.use(publicResponseCache);
  app.use(attachUser);

  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/cms', cmsRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/pos', posRoutes);
  app.use('/api/estimates', estimateRoutes);
  app.use('/api/mechanics', mechanicsRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/reservations', reservationRoutes);
  app.use('/api/service-orders', serviceOrderRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/inventory/stockroom', inventoryStockroomRoutes);
  app.use('/api/parts-mapping', partsMappingRoutes);
  app.use('/api/stockroom', stockroomRoutes);

  app.use(createNotFoundHandler());
  app.use(createErrorHandler({ logger: applicationLogger }));

  return app;
}

const app = createApp();

export default app;
