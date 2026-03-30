import type { Express, Response } from 'express';

import {
  getAvailableLogDates,
  getOperationLogs,
  logOperation,
  OperationType,
  PermissionLevel
} from './admin-auth';
import {
  BackupType,
  checkDatabaseConnection,
  createDatabaseBackup,
  deleteBackup,
  getBackupsList,
  getConnectionHistory,
  restoreFromBackup
} from './db-monitoring';
import { strictLimiter } from './middleware/rateLimiter';
import { requireAdmin } from './middleware/requireAdmin';
import { handleRouteError } from './routes/route-helpers';
import { createLogger } from './utils/logger';

const log = createLogger('dashboard');

function setNoStore(res: Response) {
  res.setHeader('Cache-Control', 'no-store');
}

function parseBackupType(value?: string): BackupType | undefined {
  switch (value) {
    case 'daily':
      return BackupType.DAILY;
    case 'weekly':
      return BackupType.WEEKLY;
    case 'monthly':
      return BackupType.MONTHLY;
    case 'manual':
      return BackupType.MANUAL;
    default:
      return undefined;
  }
}

function handleDashboardError(res: Response, err: unknown, message: string) {
  log.error(message, err);
  return handleRouteError(err, res);
}

export function registerDashboardRoutes(app: Express) {
  const requireSuperAdmin = requireAdmin(PermissionLevel.SUPER);

  app.get('/api/dashboard/connection-history', requireSuperAdmin, async (_req, res) => {
    try {
      setNoStore(res);
      return res.json({
        success: true,
        data: getConnectionHistory()
      });
    } catch (err) {
      return handleDashboardError(res, err, 'Failed to load connection history');
    }
  });

  app.post('/api/dashboard/backups', strictLimiter, requireSuperAdmin, async (req, res) => {
    try {
      setNoStore(res);
      const type = typeof req.body?.type === 'string' ? req.body.type : 'manual';
      const description = typeof req.body?.description === 'string' ? req.body.description : undefined;
      const backupType = parseBackupType(type) ?? BackupType.MANUAL;
      const backupId = await createDatabaseBackup(
        backupType,
        description || `Dashboard ${type} backup`
      );

      logOperation(OperationType.BACKUP, `Created ${type} backup ${backupId}`, {
        success: true
      });

      return res.json({
        success: true,
        message: 'Backup created successfully.',
        backupId,
        backupType: type
      });
    } catch (err) {
      logOperation(OperationType.BACKUP, 'Backup creation failed', {
        success: false,
        errorMessage: err instanceof Error ? err.message : 'unknown_error'
      });
      return handleDashboardError(res, err, 'Failed to create backup');
    }
  });

  app.get('/api/dashboard/backups', requireSuperAdmin, async (req, res) => {
    try {
      setNoStore(res);
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      return res.json({
        success: true,
        data: getBackupsList(parseBackupType(type)),
        backupType: type || 'all'
      });
    } catch (err) {
      return handleDashboardError(res, err, 'Failed to list backups');
    }
  });

  app.post('/api/dashboard/backups/:backupId/restore', strictLimiter, requireSuperAdmin, async (req, res) => {
    const backupId = req.params.backupId;
    if (!backupId) {
      return res.status(400).json({
        success: false,
        message: 'Backup id is required.'
      });
    }

    try {
      setNoStore(res);
      const type = typeof req.body?.type === 'string' ? req.body.type : undefined;
      const backupType = parseBackupType(type);
      const currentBackupId = await createDatabaseBackup(
        BackupType.MANUAL,
        `Pre-restore safeguard ${new Date().toISOString()}`
      );

      await restoreFromBackup(backupId, backupType, {
        skipPreRestoreBackup: true
      });

      logOperation(OperationType.RESTORE, `Restored backup ${backupId}`, {
        success: true
      });

      return res.json({
        success: true,
        message: 'Backup restored successfully.',
        currentBackupId,
        restoredFrom: {
          backupId,
          backupType: type || 'unknown'
        }
      });
    } catch (err) {
      logOperation(OperationType.RESTORE, `Restore failed for backup ${backupId}`, {
        success: false,
        errorMessage: err instanceof Error ? err.message : 'unknown_error'
      });
      return handleDashboardError(res, err, 'Failed to restore backup');
    }
  });

  app.get('/api/dashboard/logs', requireSuperAdmin, async (req, res) => {
    try {
      setNoStore(res);
      const date = typeof req.query.date === 'string' ? new Date(req.query.date) : undefined;
      const parsedDate = date && !Number.isNaN(date.getTime()) ? date : undefined;
      const type =
        typeof req.query.type === 'string' ? (req.query.type as OperationType) : undefined;

      return res.json({
        success: true,
        data: getOperationLogs(parsedDate, type)
      });
    } catch (err) {
      return handleDashboardError(res, err, 'Failed to load dashboard logs');
    }
  });

  app.get('/api/dashboard/logs/dates', requireSuperAdmin, async (_req, res) => {
    try {
      setNoStore(res);
      return res.json({
        success: true,
        data: getAvailableLogDates()
      });
    } catch (err) {
      return handleDashboardError(res, err, 'Failed to list dashboard log dates');
    }
  });

  app.post('/api/dashboard/sync', strictLimiter, requireSuperAdmin, async (_req, res) => {
    setNoStore(res);
    return res.status(409).json({
      success: false,
      message: 'Runtime database sync is disabled because production runs in PostgreSQL-only mode.',
      disabled: true
    });
  });

  app.get('/api/dashboard/consistency', requireSuperAdmin, async (_req, res) => {
    setNoStore(res);
    return res.status(409).json({
      success: false,
      message: 'Consistency repair is disabled because production runs in PostgreSQL-only mode.',
      disabled: true
    });
  });

  app.delete('/api/dashboard/backups/:backupId', strictLimiter, requireSuperAdmin, async (req, res) => {
    const backupId = req.params.backupId;
    if (!backupId) {
      return res.status(400).json({
        success: false,
        message: 'Backup id is required.'
      });
    }

    try {
      setNoStore(res);
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      await deleteBackup(backupId, parseBackupType(type));

      logOperation(OperationType.DELETE, `Deleted backup ${backupId}`, {
        success: true
      });

      return res.json({
        success: true,
        message: `Deleted backup ${backupId}.`
      });
    } catch (err) {
      logOperation(OperationType.DELETE, `Delete failed for backup ${backupId}`, {
        success: false,
        errorMessage: err instanceof Error ? err.message : 'unknown_error'
      });
      return handleDashboardError(res, err, 'Failed to delete backup');
    }
  });

  app.get('/api/dashboard/connection', requireSuperAdmin, async (_req, res) => {
    try {
      setNoStore(res);
      const status = await checkDatabaseConnection();

      return res.json({
        success: true,
        status
      });
    } catch (err) {
      return handleDashboardError(res, err, 'Failed to check dashboard database connection');
    }
  });
}
