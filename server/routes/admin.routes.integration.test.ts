import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJsonTestServer, jsonRequest } from '../test-utils/http-test-server';
import { setupAdminSession } from '../session';

const settingsState = vi.hoisted(() => ({
  settings: {
    id: 1,
    baseHourlyRate: 119,
    ot1Multiplier: 1.34,
    ot2Multiplier: 1.67,
    baseMonthSalary: 28590,
    welfareAllowance: 0,
    deductions: [],
    allowances: [],
    adminPin: '123456',
    updatedAt: new Date('2026-03-12T00:00:00.000Z')
  } as Record<string, any>,
  savedSettings: null as null | Record<string, any>
}));

const storageMock = vi.hoisted(() => ({
  getSettings: vi.fn(async () => settingsState.settings),
  createOrUpdateSettings: vi.fn(async (payload: Record<string, any>) => {
    settingsState.savedSettings = payload;
    settingsState.settings = {
      ...settingsState.settings,
      ...payload
    };
    return settingsState.settings;
  })
}));

vi.mock('../storage', () => ({
  storage: storageMock
}));

vi.mock('../middleware/rateLimiter', () => ({
  loginLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  strictLimiter: (_req: unknown, _res: unknown, next: () => void) => next()
}));

let registerAdminRoutes: typeof import('./admin.routes').registerAdminRoutes;

beforeAll(async () => {
  ({ registerAdminRoutes } = await import('./admin.routes'));
});

beforeEach(() => {
  settingsState.settings = {
    id: 1,
    baseHourlyRate: 119,
    ot1Multiplier: 1.34,
    ot2Multiplier: 1.67,
    baseMonthSalary: 28590,
    welfareAllowance: 0,
    deductions: [],
    allowances: [],
    adminPin: '123456',
    updatedAt: new Date('2026-03-12T00:00:00.000Z')
  };
  settingsState.savedSettings = null;
  vi.clearAllMocks();
});

describe('admin routes integration', () => {
  it('creates, restores, and destroys an admin session via cookie auth', async () => {
    const server = await createJsonTestServer(registerAdminRoutes, {
      setupApp: async (app) => {
        setupAdminSession(app);
      }
    });

    try {
      const loginResult = await jsonRequest<Record<string, any>>(server.baseUrl, '/api/verify-admin', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          pin: '123456'
        })
      });

      expect(loginResult.response.status).toBe(200);
      expect(loginResult.body).toMatchObject({
        success: true,
        authMode: 'session'
      });

      const sessionCookie = loginResult.response.headers.get('set-cookie');
      expect(sessionCookie).toContain('employee_salary_admin.sid=');
      const cookieHeader = sessionCookie?.split(';')[0];

      const sessionResult = await jsonRequest<Record<string, any>>(server.baseUrl, '/api/admin/session', {
        headers: {
          cookie: cookieHeader || ''
        }
      });
      expect(sessionResult.response.status).toBe(200);
      expect(sessionResult.body).toMatchObject({
        success: true,
        isAdmin: true,
        authMode: 'session'
      });

      const logoutResult = await jsonRequest<Record<string, any>>(server.baseUrl, '/api/admin/logout', {
        method: 'POST',
        headers: {
          cookie: cookieHeader || ''
        }
      });
      expect(logoutResult.response.status).toBe(200);
      expect(logoutResult.body).toEqual({ success: true });

      const postLogoutSession = await jsonRequest<Record<string, any>>(server.baseUrl, '/api/admin/session', {
        headers: {
          cookie: cookieHeader || ''
        }
      });
      expect(postLogoutSession.response.status).toBe(200);
      expect(postLogoutSession.body).toMatchObject({
        success: true,
        isAdmin: false
      });
    } finally {
      await server.close();
    }
  });

  it('updates admin pin through an authenticated session without x-admin-pin headers', async () => {
    const server = await createJsonTestServer(registerAdminRoutes, {
      setupApp: async (app) => {
        setupAdminSession(app);
      }
    });

    try {
      const loginResult = await jsonRequest<Record<string, any>>(server.baseUrl, '/api/verify-admin', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          pin: '123456'
        })
      });

      const sessionCookie = loginResult.response.headers.get('set-cookie');
      const cookieHeader = sessionCookie?.split(';')[0];

      const updateResult = await jsonRequest<Record<string, any>>(server.baseUrl, '/api/update-admin-pin', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieHeader || ''
        },
        body: JSON.stringify({
          oldPin: '123456',
          newPin: '602947'
        })
      });

      expect(updateResult.response.status).toBe(200);
      expect(updateResult.body).toMatchObject({
        success: true
      });
      expect(settingsState.savedSettings?.adminPin).toContain(':');
    } finally {
      await server.close();
    }
  });
});
