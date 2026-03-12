import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJsonTestServer, jsonRequest } from './test-utils/http-test-server';

const checkDatabaseConnectionMock = vi.hoisted(() => vi.fn(async () => ({
  currentStorage: 'postgres',
  connections: {
    postgres: true,
    supabase: { isConnected: false, disabled: true }
  }
})));

vi.mock('./admin-auth', () => ({
  PermissionLevel: {
    SUPER: 4
  },
  logOperation: vi.fn(),
  OperationType: {
    BACKUP: 'backup',
    RESTORE: 'restore',
    SYSTEM_CONFIG: 'system_config',
    DELETE: 'delete'
  },
  getOperationLogs: vi.fn(() => []),
  getAvailableLogDates: vi.fn(() => [])
}));

vi.mock('./db-monitoring', () => ({
  checkDatabaseConnection: checkDatabaseConnectionMock,
  createDatabaseBackup: vi.fn(async () => 'backup-1'),
  BackupType: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    MANUAL: 'manual'
  },
  getBackupsList: vi.fn(() => []),
  restoreFromBackup: vi.fn(async () => ({ success: true })),
  deleteBackup: vi.fn(async () => true),
  getConnectionHistory: vi.fn(() => []),
  syncDatabases: vi.fn(async () => ({ success: true }))
}));

vi.mock('./data-sync', () => ({
  synchronizeDatabases: vi.fn(async () => ({
    success: true,
    tables: [],
    errors: []
  })),
  checkDataConsistency: vi.fn(async () => ({
    consistent: true,
    differences: []
  }))
}));

vi.mock('./middleware/requireAdmin', () => ({
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

let registerDashboardRoutes: typeof import('./dashboard-routes').registerDashboardRoutes;

beforeAll(async () => {
  ({ registerDashboardRoutes } = await import('./dashboard-routes'));
});

beforeEach(() => {
  checkDatabaseConnectionMock.mockClear();
  vi.clearAllMocks();
});

describe('dashboard routes integration', () => {
  it('requires admin authorization for all dashboard operations routes', async () => {
    const server = await createJsonTestServer(registerDashboardRoutes);

    try {
      const endpoints = [
        { method: 'GET', path: '/api/dashboard/connection-history' },
        { method: 'POST', path: '/api/dashboard/backups', body: {} },
        { method: 'GET', path: '/api/dashboard/backups' },
        { method: 'POST', path: '/api/dashboard/backups/backup-1/restore', body: {} },
        { method: 'GET', path: '/api/dashboard/logs' },
        { method: 'GET', path: '/api/dashboard/logs/dates' },
        { method: 'POST', path: '/api/dashboard/sync', body: {} },
        { method: 'GET', path: '/api/dashboard/consistency' },
        { method: 'DELETE', path: '/api/dashboard/backups/backup-1' },
        { method: 'GET', path: '/api/dashboard/connection' }
      ];

      for (const endpoint of endpoints) {
        const result = await jsonRequest<{ success: boolean; message: string }>(
          server.baseUrl,
          endpoint.path,
          {
            method: endpoint.method,
            headers: endpoint.body ? { 'content-type': 'application/json' } : undefined,
            body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
          }
        );

        expect(result.response.status).toBe(401);
      }
    } finally {
      await server.close();
    }
  });

  it('returns connection status for authorized admin requests', async () => {
    const server = await createJsonTestServer(registerDashboardRoutes);

    try {
      const result = await jsonRequest<Record<string, any>>(
        server.baseUrl,
        '/api/dashboard/connection',
        {
          headers: {
            'x-admin-pin': '123456'
          }
        }
      );

      expect(result.response.status).toBe(200);
      expect(checkDatabaseConnectionMock).toHaveBeenCalledTimes(1);
      expect(result.body).toEqual({
        success: true,
        status: {
          currentStorage: 'postgres',
          connections: {
            postgres: true,
            supabase: { isConnected: false, disabled: true }
          }
        }
      });
    } finally {
      await server.close();
    }
  });
});
