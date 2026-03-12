import type { Express } from 'express';

import { insertSettingsSchema } from '@shared/schema';

import { PermissionLevel } from '../admin-auth';
import { db } from '../db';
import { strictLimiter } from '../middleware/rateLimiter';
import { requireAdmin } from '../middleware/requireAdmin';
import { storage } from '../storage';

import { handleRouteError } from './route-helpers';

export function registerSettingsRoutes(app: Express): void {
  app.get('/api/settings', async (_req, res) => {
    try {
      let settings = await storage.getSettings();

      if (!settings) {
        settings = await storage.createOrUpdateSettings({
          baseHourlyRate: 119,
          ot1Multiplier: 1.34,
          ot2Multiplier: 1.67,
          baseMonthSalary: 28590,
          welfareAllowance: 0,
          adminPin: '123456',
          deductions: [
            { name: '勞保費', amount: 525, description: '勞工保險費用' },
            { name: '健保費', amount: 372, description: '全民健康保險費用' }
          ]
        });
      }

      const { adminPin, ...settingsToReturn } = settings;
      return res.json(settingsToReturn);
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/settings', requireAdmin(), async (req, res) => {
    try {
      const validatedData = insertSettingsSchema.parse(req.body);
      const settings = await storage.createOrUpdateSettings(validatedData);
      return res.json(settings);
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/db-status', requireAdmin(PermissionLevel.SUPER), async (_req, res) => {
    try {
      let postgresConnection = false;

      try {
        await db.execute('SELECT 1');
        postgresConnection = true;
      } catch (error) {
        console.error('PostgreSQL 連接測試失敗:', error);
      }

      return res.json({
        currentStorage: 'postgres',
        storageMode: 'postgres_only',
        environment: {
          DATABASE_URL: 'configured'
        },
        features: {
          databaseSwitching: false,
          supabaseMigration: false
        },
        connections: {
          postgres: postgresConnection,
          supabase: { isConnected: false, disabled: true }
        }
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/supabase-config', requireAdmin(PermissionLevel.SUPER), async (_req, res) => {
    try {
      return res.json({
        mode: 'postgres_only',
        disabled: true,
        url: '',
        key: '',
        isConfigured: false,
        isActive: false,
        message: '系統已收斂為 PostgreSQL-only，前端不再支援 Supabase 切換'
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/supabase-config', strictLimiter, requireAdmin(PermissionLevel.SUPER), async (_req, res) => {
    try {
      return res.status(409).json({
        success: false,
        message: '系統已收斂為 PostgreSQL-only，Supabase 配置入口已停用',
        disabled: true
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/supabase-connection', requireAdmin(PermissionLevel.SUPER), async (_req, res) => {
    try {
      let isConnected = false;

      try {
        await db.execute('SELECT 1');
        isConnected = true;
      } catch (error) {
        console.error('PostgreSQL 連接測試失敗:', error);
      }

      return res.json({
        success: true,
        isConnected,
        errorMessage: isConnected ? null : 'PostgreSQL connection failed',
        isActive: false,
        mode: 'postgres_only',
        disabled: true
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/supabase-toggle', strictLimiter, requireAdmin(PermissionLevel.SUPER), async (_req, res) => {
    try {
      return res.status(409).json({
        success: false,
        message: '系統已收斂為 PostgreSQL-only，資料庫切換已停用',
        disabled: true,
        isActive: false
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/supabase-migrate', strictLimiter, requireAdmin(PermissionLevel.SUPER), async (_req, res) => {
    try {
      return res.status(409).json({
        success: false,
        message: '系統已收斂為 PostgreSQL-only，Supabase 遷移入口已停用',
        disabled: true
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });
}
