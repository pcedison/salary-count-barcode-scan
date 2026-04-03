import cors from 'cors';
import type { Express, Request } from 'express';
import helmet from 'helmet';

import { createLogger } from '../utils/logger';

const log = createLogger('security');

function normalizeOrigin(origin: string): string {
  const trimmedOrigin = origin.trim();

  try {
    return new URL(trimmedOrigin).origin;
  } catch {
    return trimmedOrigin.replace(/\/+$/, '');
  }
}

function getAllowedOrigins(): string[] {
  return process.env.ALLOWED_ORIGINS?.split(',')
    .map(origin => normalizeOrigin(origin))
    .filter(Boolean) || [];
}

function isSameOriginRequest(req: Request, origin: string): boolean {
  const host = req.get('host');

  if (!host) {
    return false;
  }

  return normalizeOrigin(origin) === normalizeOrigin(`${req.protocol}://${host}`);
}

export function setupSecurity(app: Express): void {
  const allowedOrigins = getAllowedOrigins();
  const isProduction = process.env.NODE_ENV === 'production';
  const corsOptions = {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Force-Update',
      'X-Scan-Device-Token'
    ]
  };

  if (isProduction && allowedOrigins.length === 0) {
    log.warn(
      'ALLOWED_ORIGINS is not set in production; cross-origin requests will be blocked. ' +
      'Set ALLOWED_ORIGINS to a comma-separated list of allowed origins.'
    );
  }

  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              imgSrc: ["'self'", 'data:', 'https:'],
              fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: ["'self'"],
              manifestSrc: ["'self'"],
              mediaSrc: ["'self'", 'data:'],
              workerSrc: ["'self'", 'blob:'],
              upgradeInsecureRequests: []
            }
          }
        : false,
      crossOriginEmbedderPolicy: false
    })
  );

  app.use(
    '/api',
    (req, _res, next) => {
      const origin = req.get('origin');

      if (!origin) {
        next();
        return;
      }

      if (isSameOriginRequest(req, origin)) {
        next();
        return;
      }

      if (!isProduction && allowedOrigins.length === 0) {
        next();
        return;
      }

      if (allowedOrigins.includes(normalizeOrigin(origin))) {
        next();
        return;
      }

      next(new Error('Origin is not allowed'));
    }
  );

  app.use(
    '/api',
    cors({
      ...corsOptions,
      origin: true
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
