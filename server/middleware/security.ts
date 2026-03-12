import cors from 'cors';
import type { Express } from 'express';
import helmet from 'helmet';

function getAllowedOrigins(): string[] {
  return process.env.ALLOWED_ORIGINS?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean) || [];
}

export function setupSecurity(app: Express): void {
  const allowedOrigins = getAllowedOrigins();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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
        'X-Requested-With'
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
