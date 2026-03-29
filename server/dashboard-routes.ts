/**
 * 儀表板相關的API路由
 */

import { Request, Response } from 'express';
import { PermissionLevel, logOperation, OperationType, getOperationLogs, getAvailableLogDates } from './admin-auth';
import {
  checkDatabaseConnection, createDatabaseBackup, BackupType,
  getBackupsList, restoreFromBackup, deleteBackup, getConnectionHistory
} from './db-monitoring';
import { Express } from 'express';
import { requireAdmin } from './middleware/requireAdmin';
import { createLogger } from './utils/logger';

const log = createLogger('dashboard');

export function registerDashboardRoutes(app: Express) {
  const requireSuperAdmin = requireAdmin(PermissionLevel.SUPER);

  // 獲取數據庫連接狀態歷史
  app.get('/api/dashboard/connection-history', requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const history = getConnectionHistory();
      
      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      log.error('獲取連接歷史失敗：', error);
      res.status(500).json({
        success: false,
        message: `獲取連接歷史失敗：${error instanceof Error ? error.message : '未知錯誤'}`
      });
    }
  });
  
  // 創建數據庫備份
  app.post('/api/dashboard/backups', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      // 獲取備份類型和描述
      const { type = 'manual', description } = req.body as { 
        type?: string, 
        description?: string 
      };
      
      // 將字符串類型轉換為枚舉
      let backupType = BackupType.MANUAL;
      switch (type) {
        case 'daily':
          backupType = BackupType.DAILY;
          break;
        case 'weekly':
          backupType = BackupType.WEEKLY;
          break;
        case 'monthly':
          backupType = BackupType.MONTHLY;
          break;
        case 'manual':
        default:
          backupType = BackupType.MANUAL;
      }
      
      const backupId = await createDatabaseBackup(
        backupType, 
        description || `管理員手動創建的${type}備份`
      );
      
      // 記錄操作日誌
      logOperation(
        OperationType.BACKUP,
        `創建${type}類型備份，ID: ${backupId}${description ? ` (${description})` : ''}`,
        { success: true }
      );
      
      res.json({
        success: true,
        message: "備份創建成功",
        backupId,
        backupType: type
      });
    } catch (error) {
      log.error('創建備份失敗：', error);
      
      // 記錄操作日誌
      logOperation(
        OperationType.BACKUP,
        `嘗試創建數據庫備份失敗`,
        { 
          success: false,
          errorMessage: error instanceof Error ? error.message : '未知錯誤'
        }
      );
      
      res.status(500).json({
        success: false,
        message: `創建備份失敗：${error instanceof Error ? error.message : '未知錯誤'}`
      });
    }
  });
  
  // 獲取備份列表
  app.get('/api/dashboard/backups', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      // 從查詢參數獲取備份類型
      const typeParam = req.query.type as string | undefined;
      let backupType: BackupType | undefined;
      
      if (typeParam) {
        switch (typeParam) {
          case 'daily':
            backupType = BackupType.DAILY;
            break;
          case 'weekly':
            backupType = BackupType.WEEKLY;
            break;
          case 'monthly':
            backupType = BackupType.MONTHLY;
            break;
          case 'manual':
            backupType = BackupType.MANUAL;
            break;
        }
      }
      
      // 獲取指定類型的備份列表
      const backups = getBackupsList(backupType);
      
      res.json({
        success: true,
        data: backups,
        backupType: typeParam || 'all'
      });
    } catch (error) {
      log.error('獲取備份列表失敗：', error);
      res.status(500).json({
        success: false,
        message: `獲取備份列表失敗：${error instanceof Error ? error.message : '未知錯誤'}`
      });
    }
  });
  
  // 從備份恢復
  app.post('/api/dashboard/backups/:backupId/restore', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { backupId } = req.params;
      
      if (!backupId) {
        return res.status(400).json({
          success: false,
          message: "備份ID不能為空"
        });
      }
      
      // 從請求體獲取備份類型
      const { type } = req.body as { type?: string };
      let backupType: BackupType | undefined;
      
      if (type) {
        switch (type) {
          case 'daily':
            backupType = BackupType.DAILY;
            break;
          case 'weekly':
            backupType = BackupType.WEEKLY;
            break;
          case 'monthly':
            backupType = BackupType.MONTHLY;
            break;
          case 'manual':
            backupType = BackupType.MANUAL;
            break;
        }
      }
      
      // 恢復前先做一個當前狀態的備份
      const currentBackupId = await createDatabaseBackup(
        BackupType.MANUAL, 
        `恢復操作前的自動備份 ${new Date().toLocaleString()}`
      );
      
      // 嘗試從指定類型的備份中恢復
      const result = await restoreFromBackup(backupId, backupType, {
        skipPreRestoreBackup: true
      });
      
      // 記錄操作日誌
      logOperation(
        OperationType.RESTORE,
        `從${type ? type + '類型' : ''}備份恢復數據，備份ID: ${backupId}`,
        { success: true }
      );
      
      res.json({
        success: true,
        message: `從${type ? type + '類型' : ''}備份恢復成功`,
        currentBackupId,
        restoredFrom: {
          backupId,
          backupType: type || 'unknown'
        }
      });
    } catch (error) {
      log.error('從備份恢復失敗：', error);
      
      // 記錄操作日誌
      logOperation(
        OperationType.RESTORE,
        `嘗試從備份恢復失敗: ${error instanceof Error ? error.message : '未知錯誤'}`,
        { 
          success: false,
          errorMessage: error instanceof Error ? error.message : '未知錯誤'
        }
      );
      
      res.status(500).json({
        success: false,
        message: `從備份恢復失敗：${error instanceof Error ? error.message : '未知錯誤'}`
      });
    }
  });
  
  // 獲取操作日誌
  app.get('/api/dashboard/logs', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      // 解析日期參數
      const dateStr = req.query.date as string;
      let date: Date | undefined = undefined;
      
      if (dateStr) {
        date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          date = undefined;
        }
      }
      
      // 解析操作類型參數
      const operationType = req.query.type as OperationType | undefined;
      
      const logs = getOperationLogs(date, operationType);
      
      res.json({
        success: true,
        data: logs
      });
    } catch (error) {
      log.error('獲取操作日誌失敗：', error);
      res.status(500).json({
        success: false,
        message: `獲取操作日誌失敗：${error instanceof Error ? error.message : '未知錯誤'}`
      });
    }
  });
  
  // 獲取可用的日誌日期
  app.get('/api/dashboard/logs/dates', requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const dates = getAvailableLogDates();
      
      res.json({
        success: true,
        data: dates
      });
    } catch (error) {
      log.error('獲取日誌日期列表失敗：', error);
      res.status(500).json({
        success: false,
        message: `獲取日誌日期列表失敗：${error instanceof Error ? error.message : '未知錯誤'}`
      });
    }
  });
  
  // 同步數據庫（已停用 — 系統為 PostgreSQL-only）
  app.post('/api/dashboard/sync', requireSuperAdmin, async (_req: Request, res: Response) => {
    return res.status(409).json({
      success: false,
      message: '系統已收斂為 PostgreSQL-only，資料庫同步已停用',
      disabled: true
    });
  });

  // 檢查數據一致性（已停用 — 系統為 PostgreSQL-only）
  app.get('/api/dashboard/consistency', requireSuperAdmin, async (_req: Request, res: Response) => {
    return res.status(409).json({
      success: false,
      message: '系統已收斂為 PostgreSQL-only，一致性檢查已停用',
      disabled: true
    });
  });
  
  // 刪除備份
  app.delete('/api/dashboard/backups/:backupId', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { backupId } = req.params;
      
      if (!backupId) {
        return res.status(400).json({
          success: false,
          message: "備份ID不能為空"
        });
      }
      
      // 從查詢參數獲取備份類型
      const { type } = req.query as { type?: string };
      let backupType: BackupType | undefined;
      
      if (type) {
        switch (type) {
          case 'daily':
            backupType = BackupType.DAILY;
            break;
          case 'weekly':
            backupType = BackupType.WEEKLY;
            break;
          case 'monthly':
            backupType = BackupType.MONTHLY;
            break;
          case 'manual':
            backupType = BackupType.MANUAL;
            break;
        }
      }
      
      // 刪除指定的備份
      await deleteBackup(backupId, backupType);
      
      // 記錄操作日誌
      logOperation(
        OperationType.DELETE,
        `刪除${type ? type + '類型' : ''}備份，ID: ${backupId}`,
        { success: true }
      );
      
      res.json({
        success: true,
        message: `已成功刪除備份 ${backupId}`
      });
    } catch (error) {
      log.error('刪除備份失敗：', error);
      
      // 記錄操作日誌
      logOperation(
        OperationType.DELETE,
        `嘗試刪除備份失敗: ${error instanceof Error ? error.message : '未知錯誤'}`,
        { 
          success: false,
          errorMessage: error instanceof Error ? error.message : '未知錯誤'
        }
      );
      
      res.status(500).json({
        success: false,
        message: `刪除備份失敗：${error instanceof Error ? error.message : '未知錯誤'}`
      });
    }
  });
  
  // 檢查當前數據庫連接狀態
  app.get('/api/dashboard/connection', requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const status = await checkDatabaseConnection();
      
      res.json({
        success: true,
        status
      });
    } catch (error) {
      log.error('檢查數據庫連接失敗：', error);
      res.status(500).json({
        success: false,
        message: `檢查數據庫連接失敗：${error instanceof Error ? error.message : '未知錯誤'}`
      });
    }
  });
}
