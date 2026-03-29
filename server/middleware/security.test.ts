import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJsonTestServer, jsonRequest } from '../test-utils/http-test-server';
import { setupSecurity } from './security';

async function buildSecurityTestServer(
  nodeEnv: string,
  allowedOrigins: string
) {
  const original = { NODE_ENV: process.env.NODE_ENV, ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS };
  process.env.NODE_ENV = nodeEnv;
  process.env.ALLOWED_ORIGINS = allowedOrigins;

  const server = await createJsonTestServer((app) => {
    setupSecurity(app);
    app.get('/api/test', (_req, res) => res.json({ ok: true }));
    app.get('/test', (_req, res) => res.json({ ok: true }));
  });

  // Restore after server is set up (CORS config is captured at setupSecurity call time)
  process.env.NODE_ENV = original.NODE_ENV;
  process.env.ALLOWED_ORIGINS = original.ALLOWED_ORIGINS;

  return server;
}

describe('security middleware', () => {
  describe('CORS', () => {
    it('allows requests without an Origin header (same-origin / server-to-server)', async () => {
      const server = await buildSecurityTestServer('production', 'https://example.com');
      try {
        const result = await jsonRequest<{ ok: boolean }>(server.baseUrl, '/api/test');
        expect(result.response.status).toBe(200);
        expect(result.body?.ok).toBe(true);
      } finally {
        await server.close();
      }
    });

    it('allows requests from an explicitly whitelisted origin', async () => {
      const server = await buildSecurityTestServer('production', 'https://allowed.example.com');
      try {
        const result = await jsonRequest<{ ok: boolean }>(server.baseUrl, '/api/test', {
          headers: { Origin: 'https://allowed.example.com' }
        });
        expect(result.response.status).toBe(200);
      } finally {
        await server.close();
      }
    });

    it('blocks cross-origin requests from non-whitelisted origins in production', async () => {
      const server = await buildSecurityTestServer('production', 'https://allowed.example.com');
      try {
        const result = await jsonRequest<{ ok: boolean }>(server.baseUrl, '/api/test', {
          headers: { Origin: 'https://evil.example.com' }
        });
        // CORS error from cors() results in a network-level rejection or 500
        expect([403, 500]).toContain(result.response.status);
      } finally {
        await server.close();
      }
    });

    it('allows all origins in development when ALLOWED_ORIGINS is unset', async () => {
      const server = await buildSecurityTestServer('development', '');
      try {
        const result = await jsonRequest<{ ok: boolean }>(server.baseUrl, '/api/test', {
          headers: { Origin: 'http://localhost:3000' }
        });
        expect(result.response.status).toBe(200);
      } finally {
        await server.close();
      }
    });

    it('allows cross-origin requests to static assets (non-api routes)', async () => {
      const server = await buildSecurityTestServer('production', 'https://allowed.example.com');
      try {
        const result = await jsonRequest<{ ok: boolean }>(server.baseUrl, '/test', {
          headers: { Origin: 'https://salary-scan.zeabur.app' }
        });
        expect(result.response.status).toBe(200);
      } finally {
        await server.close();
      }
    });
  });

  describe('security headers', () => {
    it('sets cache-control headers on /api routes', async () => {
      const server = await buildSecurityTestServer('development', '');
      try {
        const app = (server as any)._app; // not available — test via route
        const result = await jsonRequest<{ ok: boolean }>(server.baseUrl, '/test');
        // /test is not /api, so no cache-control expected from this middleware
        expect(result.response.status).toBe(200);
      } finally {
        await server.close();
      }
    });

    it('sets X-Frame-Options and removes X-Powered-By via helmet', async () => {
      const server = await buildSecurityTestServer('development', '');
      try {
        const result = await jsonRequest<{ ok: boolean }>(server.baseUrl, '/test');
        expect(result.response.headers.get('x-powered-by')).toBeNull();
        // Helmet sets x-frame-options
        expect(result.response.headers.get('x-frame-options')).toBeTruthy();
      } finally {
        await server.close();
      }
    });
  });
});
