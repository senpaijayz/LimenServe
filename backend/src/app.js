import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { attachUser } from './middleware/auth.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import catalogRoutes from './routes/catalogRoutes.js';
import estimateRoutes from './routes/estimateRoutes.js';

const app = express();
const allowedOriginPatterns = env.frontendUrls;

function normalizeOrigin(value) {
  return value?.trim().replace(/\/$/, '');
}

function isAllowedOrigin(origin) {
  const normalizedOrigin = normalizeOrigin(origin);

  if (!normalizedOrigin) {
    return true;
  }

  return allowedOriginPatterns.some((pattern) => {
    const normalizedPattern = normalizeOrigin(pattern);

    if (!normalizedPattern) {
      return false;
    }

    if (!normalizedPattern.includes('*')) {
      return normalizedPattern === normalizedOrigin;
    }

    const escapedPattern = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');

    return new RegExp(`^${escapedPattern}$`, 'i').test(normalizedOrigin);
  });
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(attachUser);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'limen-backend',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/estimates', estimateRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);

  res.status(error.statusCode || 500).json({
    error: error.message || 'Internal server error.',
  });
});

export default app;
