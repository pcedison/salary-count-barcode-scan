import crypto from 'crypto';
import type { Express } from 'express';

import { insertSettingsSchema, type InsertSettings } from '@shared/schema';

import { PermissionLevel } from '../admin-auth';
import { getDatabaseProviderInfo } from '../config/databaseUrl';
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
    adminPin: hashAdminPin(settings.adminPin),
  };
}

export function registerSettingsRoutes(app: Express): void {
  app.get('/api/settings', async (_req, res) => {
    try {
      let settings = await storage.getSettings();

      if (!settings) {
        const defaultPin = process.env.DEFAULT_ADMIN_PIN || crypto.randomBytes(3).toString('hex');
        log.warn(
          `Settings missing; bootstrapping defaults with ${process.env.DEFAULT_ADMIN_PIN ? 'configured' : 'generated'} admin PIN.`,
        );
        settings = await storage.createOrUpdateSettings(
          normalizeAdminPinForStorage({
            baseHourlyRate: 119,
            ot1Multiplier: 1.34,
            ot2Multiplier: 1.67,
            baseMonthSalary: 28590,
            welfareAllowance: 0,
            adminPin: defaultPin,
            deductions: [
              { name: '勞保費', amount: 525, description: '勞工保險費用' },
              { name: '健保費', amount: 372, description: '全民健康保險費用' },
            ],
          }),
        );
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
        normalizeAdminPinForStorage(validatedData),
      );
      return res.json(sanitizeSettingsResponse(settings));
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/db-status', requireAdmin(PermissionLevel.SUPER), async (_req, res) => {
    try {
      const databaseProvider = getDatabaseProviderInfo(process.env.DATABASE_URL);
      let postgresConnection = false;

      try {
        await db.execute('SELECT 1');
        postgresConnection = true;
      } catch (error) {
        log.error('PostgreSQL health check failed:', error);
      }

      return res.json({
        currentStorage: databaseProvider.key === 'supabase' ? 'supabase_postgres' : 'postgres',
        storageMode: databaseProvider.isExternal ? 'external_postgres' : 'local_postgres',
        databaseProvider,
        environment: {
          DATABASE_URL: 'configured',
          externalDatabase: databaseProvider.isExternal,
        },
        features: {
          databaseSwitching: false,
          supabaseMigration: false,
        },
        connections: {
          postgres: postgresConnection,
          supabase: {
            isConnected: databaseProvider.key === 'supabase' ? postgresConnection : false,
            disabled: databaseProvider.key !== 'supabase',
          },
        },
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/supabase-config', requireAdmin(PermissionLevel.SUPER), async (_req, res) => {
    try {
      const databaseProvider = getDatabaseProviderInfo(process.env.DATABASE_URL);

      return res.json({
        mode: databaseProvider.isExternal ? 'external_postgres' : 'local_postgres',
        disabled: true,
        url: '',
        key: '',
        isConfigured: databaseProvider.key === 'supabase',
        isActive: databaseProvider.key === 'supabase',
        provider: databaseProvider,
        message: `系統目前固定透過伺服器端 DATABASE_URL 連到 ${databaseProvider.label}，因此前端不提供直接切換資料源的入口。`,
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/supabase-config', strictLimiter, requireAdmin(PermissionLevel.SUPER), async (_req, res) => {
    try {
      const databaseProvider = getDatabaseProviderInfo(process.env.DATABASE_URL);

      return res.status(409).json({
        success: false,
        message: `系統目前固定透過伺服器端 DATABASE_URL 連到 ${databaseProvider.label}，不接受在前端直接改寫資料庫連線。`,
        disabled: true,
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/supabase-connection', requireAdmin(PermissionLevel.SUPER), async (_req, res) => {
    try {
      const databaseProvider = getDatabaseProviderInfo(process.env.DATABASE_URL);
      let isConnected = false;

      try {
        await db.execute('SELECT 1');
        isConnected = true;
      } catch (error) {
        log.error('PostgreSQL connection probe failed:', error);
      }

      return res.json({
        success: true,
        isConnected,
        errorMessage: isConnected ? null : 'PostgreSQL connection failed',
        isActive: databaseProvider.key === 'supabase',
        mode: databaseProvider.isExternal ? 'external_postgres' : 'local_postgres',
        provider: databaseProvider,
        disabled: true,
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/supabase-toggle', strictLimiter, requireAdmin(PermissionLevel.SUPER), async (_req, res) => {
    try {
      const databaseProvider = getDatabaseProviderInfo(process.env.DATABASE_URL);

      return res.status(409).json({
        success: false,
        message: `系統目前固定透過 ${databaseProvider.label} 運作，不提供前端切換入口。`,
        disabled: true,
        isActive: databaseProvider.key === 'supabase',
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/supabase-migrate', strictLimiter, requireAdmin(PermissionLevel.SUPER), async (_req, res) => {
    try {
      const databaseProvider = getDatabaseProviderInfo(process.env.DATABASE_URL);

      return res.status(409).json({
        success: false,
        message: `系統目前已直接使用 ${databaseProvider.label} 作為正式資料庫，不需要再從前端觸發遷移。`,
        disabled: true,
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });
}
