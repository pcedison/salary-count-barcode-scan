import crypto from 'crypto';
import type { Express } from 'express';

import { insertSettingsSchema, type InsertSettings } from '@shared/schema';

import { PermissionLevel } from '../admin-auth';
import { db } from '../db';
import { strictLimiter } from '../middleware/rateLimiter';
import { requireAdmin } from '../middleware/requireAdmin';
import { storage } from '../storage';
import { hashAdminPin, isHashedPin } from '../utils/adminPinAuth';
import { createLogger } from '../utils/logger';

import { handleRouteError } from './route-helpers';

const log = createLogger('settings');

function sanitizeSettingsResponse(settings: Record<string, any>) {
  const { adminPin, ...settingsToReturn } = settings;
  return settingsToReturn;
}

function normalizeAdminPinForStorage<T extends InsertSettings>(settings: T): T {
  if (!settings.adminPin || isHashedPin(settings.adminPin)) {
    return settings;
  }

  return {
    ...settings,
    adminPin: hashAdminPin(settings.adminPin)
  };
}

export function registerSettingsRoutes(app: Express): void {
  app.get('/api/settings', async (_req, res) => {
    try {
      let settings = await storage.getSettings();

      if (!settings) {
        const defaultPin = process.env.DEFAULT_ADMIN_PIN || crypto.randomBytes(3).toString('hex');
        log.warn(`系統初始化：使用${process.env.DEFAULT_ADMIN_PIN ? '環境變數' : '隨機生成'}的管理員 PIN。請登入後立即更改。`);
        settings = await storage.createOrUpdateSettings(normalizeAdminPinForStorage({
          baseHourlyRate: 119,
          ot1Multiplier: 1.34,
          ot2Multiplier: 1.67,
          baseMonthSalary: 28590,
          welfareAllowance: 0,
          adminPin: defaultPin,
          deductions: [
            { name: '勞保費', amount: 525, description: '勞工保險費用' },
            { name: '健保費', amount: 372, description: '全民健康保險費用' }
          ]
        }));
      }

      return res.json(sanitizeSettingsResponse(settings));
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/settings', requireAdmin(), async (req, res) => {
    try {
      const validatedData = insertSettingsSchema.parse(req.body);
      const settings = await storage.createOrUpdateSettings(
        normalizeAdminPinForStorage(validatedData)
      );
      return res.json(sanitizeSettingsResponse(settings));
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
        log.error('PostgreSQL 連接測試失敗:', error);
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
        log.error('PostgreSQL 連接測試失敗:', error);
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
