import cors from 'cors';
import type { Express } from 'express';
import helmet from 'helmet';

import { createLogger } from '../utils/logger';

const log = createLogger('security');

function getAllowedOrigins(): string[] {
  return process.env.ALLOWED_ORIGINS?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean) || [];
}

export function setupSecurity(app: Express): void {
  const allowedOrigins = getAllowedOrigins();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && allowedOrigins.length === 0) {
    log.warn(
      'ALLOWED_ORIGINS is not set in production — cross-origin requests will be blocked. ' +
      'Set ALLOWED_ORIGINS to a comma-separated list of allowed origins.'
    );
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );

  // CORS only applies to API routes — static assets are same-origin and do not need CORS
  app.use(
    '/api',
    cors({
      origin: (origin, callback) => {
        // Same-origin / server-to-server requests don't send an Origin header
        if (!origin) {
          callback(null, true);
          return;
        }

        // In development with no allowlist configured, allow all origins
        if (!isProduction && allowedOrigins.length === 0) {
          callback(null, true);
          return;
        }

        // Check against explicit allowlist
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('不允許的來源'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-Force-Update'
      ]
    })
  );

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }

    res.removeHeader('X-Powered-By');
    next();
  });
}

export function setupTrustProxy(app: Express): void {
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }
}
