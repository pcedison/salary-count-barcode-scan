import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJsonTestServer, jsonRequest } from '../test-utils/http-test-server';

const settingsState = vi.hoisted(() => ({
  settings: null as null | Record<string, any>,
  savedSettings: null as null | Record<string, any>
}));

const storageMock = vi.hoisted(() => ({
  getSettings: vi.fn(async () => settingsState.settings),
  createOrUpdateSettings: vi.fn(async (payload: Record<string, any>) => {
    settingsState.savedSettings = payload;
    settingsState.settings = {
      id: 1,
      updatedAt: new Date('2026-03-12T00:00:00.000Z'),
      ...payload
    };
    return settingsState.settings;
  })
}));

vi.mock('../storage', () => ({
  storage: storageMock
}));

vi.mock('../db', () => ({
  db: {
    execute: vi.fn(async () => [{ '?column?': 1 }])
  }
}));

vi.mock('../middleware/rateLimiter', () => ({
  strictLimiter: (_req: unknown, _res: unknown, next: () => void) => next()
}));

vi.mock('../middleware/requireAdmin', () => ({
  requireAdmin: () => (req: { headers: Record<string, string | undefined> }, res: any, next: () => void) => {
    if (!req.headers['x-admin-pin']) {
      return res.status(401).json({
        success: false,
        message: '缺少管理員授權，請重新登入管理員模式'
      });
    }

    next();
  }
}));

let registerSettingsRoutes: typeof import('./settings.routes').registerSettingsRoutes;

beforeAll(async () => {
  ({ registerSettingsRoutes } = await import('./settings.routes'));
});

beforeEach(() => {
  settingsState.settings = null;
  settingsState.savedSettings = null;
  vi.clearAllMocks();
});

describe('settings routes integration', () => {
  it('creates default settings on first read and does not expose adminPin', async () => {
    const server = await createJsonTestServer(registerSettingsRoutes);

    try {
      const result = await jsonRequest<Record<string, any>>(server.baseUrl, '/api/settings');

      expect(result.response.status).toBe(200);
      expect(result.body?.adminPin).toBeUndefined();
      expect(settingsState.savedSettings).toMatchObject({
        baseHourlyRate: 119,
        baseMonthSalary: 28590,
        adminPin: '123456'
      });
    } finally {
      await server.close();
    }
  });

  it('updates settings through the protected route', async () => {
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

    const server = await createJsonTestServer(registerSettingsRoutes);

    try {
      const result = await jsonRequest<Record<string, any>>(server.baseUrl, '/api/settings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-pin': '123456'
        },
        body: JSON.stringify({
          baseHourlyRate: 125,
          ot1Multiplier: 1.34,
          ot2Multiplier: 1.67,
          baseMonthSalary: 30000,
          welfareAllowance: 500,
          adminPin: '654321',
          deductions: [],
          allowances: []
        })
      });

      expect(result.response.status).toBe(200);
      expect(settingsState.savedSettings).toMatchObject({
        baseHourlyRate: 125,
        baseMonthSalary: 30000,
        welfareAllowance: 500,
        adminPin: '654321'
      });
      expect(result.body).toMatchObject({
        baseHourlyRate: 125,
        baseMonthSalary: 30000,
        welfareAllowance: 500,
        adminPin: '654321'
      });
    } finally {
      await server.close();
    }
  });
});
