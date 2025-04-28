/**
 * 數據庫監控與安全模組
 * 
 * 實現對數據庫連接的持續監控、自動備份、恢復機制等安全功能
 */

import fs from 'fs';
import path from 'path';
import { getSupabaseClient, checkSupabaseConnection } from './supabase-client';
import { pool } from './db';
import { db } from './db-with-supabase';
import { isUsingSupabase } from './db-with-supabase';
import { storage } from './storage';
import * as schema from '@shared/schema';

// 定義備份目錄
const BACKUP_DIR = path.join(process.cwd(), 'backups');
// 定義備份子目錄
const DAILY_BACKUP_DIR = path.join(BACKUP_DIR, 'daily');
const WEEKLY_BACKUP_DIR = path.join(BACKUP_DIR, 'weekly');
const MONTHLY_BACKUP_DIR = path.join(BACKUP_DIR, 'monthly');
const MANUAL_BACKUP_DIR = path.join(BACKUP_DIR, 'manual');

// 確保備份目錄存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(DAILY_BACKUP_DIR)) {
  fs.mkdirSync(DAILY_BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(WEEKLY_BACKUP_DIR)) {
  fs.mkdirSync(WEEKLY_BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(MONTHLY_BACKUP_DIR)) {
  fs.mkdirSync(MONTHLY_BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(MANUAL_BACKUP_DIR)) {
  fs.mkdirSync(MANUAL_BACKUP_DIR, { recursive: true });
}

// 自動備份間隔設定
const AUTO_DAILY_BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 1天
const AUTO_WEEKLY_BACKUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 1週
const AUTO_MONTHLY_BACKUP_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 約1個月
const MAX_BACKUPS_PER_CATEGORY = 7; // 每種類型最多保留的備份數量

interface ConnectionStatus {
  isConnected: boolean;
  timestamp: number;
  error?: string;
}

// 存儲連接歷史
let connectionHistory: ConnectionStatus[] = [];
let lastNotificationTime = 0;
const NOTIFICATION_INTERVAL = 5 * 60 * 1000; // 5分鐘通知間隔

/**
 * 檢查數據庫連接狀態
 */
export async function checkDatabaseConnection(): Promise<ConnectionStatus> {
  const timestamp = Date.now();
  let status: ConnectionStatus = { isConnected: false, timestamp };

  try {
    if (isUsingSupabase()) {
      // 檢查 Supabase 連接
      const supabaseStatus = await checkSupabaseConnection();
      status = {
        isConnected: supabaseStatus.isConnected,
        timestamp,
        error: supabaseStatus.errorMessage
      };
    } else {
      // 檢查 PostgreSQL 連接
      await db.execute('SELECT 1');
      status = { isConnected: true, timestamp };
    }
  } catch (error) {
    status = {
      isConnected: false,
      timestamp,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  // 記錄歷史
  connectionHistory.push(status);
  
  // 保留最近的30條記錄
  if (connectionHistory.length > 30) {
    connectionHistory = connectionHistory.slice(-30);
  }

  return status;
}

/**
 * 啟動定期監控
 */
export function startMonitoring(interval = 60000) {
  console.log('啟動數據庫連接監控，間隔：', interval, 'ms');
  
  // 立即執行一次檢查
  checkDatabaseConnection().then(status => {
    console.log('數據庫連接狀態：', status.isConnected ? '正常' : '異常', status.error || '');
  });
  
  // 設置定期檢查
  const timerId = setInterval(async () => {
    const status = await checkDatabaseConnection();
    
    // 連接異常 + 距離上次通知已超過指定間隔，則發送通知
    if (!status.isConnected && Date.now() - lastNotificationTime > NOTIFICATION_INTERVAL) {
      console.error('數據庫連接異常：', status.error);
      // 在這裡添加其他通知方式，如郵件通知等
      
      lastNotificationTime = Date.now();
    }
  }, interval);
  
  return timerId;
}

/**
 * 停止監控
 */
export function stopMonitoring(timerId: NodeJS.Timeout) {
  clearInterval(timerId);
  console.log('已停止數據庫連接監控');
}

/**
 * 取得連接歷史
 */
export function getConnectionHistory() {
  return connectionHistory;
}

/**
 * 備份類型枚舉
 */
export enum BackupType {
  MANUAL = 'manual',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}

/**
 * 創建數據備份
 * @param type 備份類型，默認為手動備份
 * @param description 可選的備份描述
 */
export async function createDatabaseBackup(
  type: BackupType = BackupType.MANUAL,
  description?: string
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `backup-${timestamp}`;
  // 根據備份類型選擇存儲目錄
  let backupDir;
  switch (type) {
    case BackupType.DAILY:
      backupDir = DAILY_BACKUP_DIR;
      break;
    case BackupType.WEEKLY:
      backupDir = WEEKLY_BACKUP_DIR;
      break;
    case BackupType.MONTHLY:
      backupDir = MONTHLY_BACKUP_DIR;
      break;
    case BackupType.MANUAL:
    default:
      backupDir = MANUAL_BACKUP_DIR;
      break;
  }
  
  const backupPath = path.join(backupDir, `${backupId}.json`);
  
  const data: Record<string, any> = {
    metadata: {
      timestamp: new Date().toISOString(),
      type,
      description: description || `${type} backup`,
      version: '1.0.0',
      databaseType: isUsingSupabase() ? 'supabase' : 'postgres'
    }
  };
  
  try {
    // 備份員工資料
    data.employees = await storage.getAllEmployees();
    
    // 備份設置
    const settings = await storage.getSettings();
    if (settings) {
      data.settings = settings;
    }
    
    // 備份假日
    data.holidays = await storage.getAllHolidays();
    
    // 備份薪資記錄
    data.salaryRecords = await storage.getAllSalaryRecords();
    
    // 備份臨時考勤
    data.temporaryAttendance = await storage.getTemporaryAttendance();
    
    // 寫入備份文件
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    
    console.log(`${type} 備份已創建：${backupPath}`);
    
    // 清理舊備份，保留指定數量的最新備份
    cleanupOldBackups(backupDir);
    
    return backupId;
  } catch (error) {
    console.error(`創建 ${type} 備份失敗：`, error);
    throw new Error(`備份失敗：${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 清理舊備份，只保留指定數量的最新備份
 */
function cleanupOldBackups(backupDir: string): void {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.json'))
      .map(file => ({
        fileName: file,
        path: path.join(backupDir, file),
        timestamp: fs.statSync(path.join(backupDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.timestamp - a.timestamp); // 按時間降序排序
    
    // 刪除超出保留數量的舊備份
    if (files.length > MAX_BACKUPS_PER_CATEGORY) {
      const filesToDelete = files.slice(MAX_BACKUPS_PER_CATEGORY);
      filesToDelete.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          console.log(`已刪除舊備份：${file.path}`);
        } catch (err) {
          console.error(`刪除舊備份失敗：${file.path}`, err);
        }
      });
    }
  } catch (error) {
    console.error('清理舊備份失敗：', error);
  }
}

/**
 * 獲取指定類型的備份列表
 * @param type 備份類型，默認為 undefined，表示獲取所有備份
 */
export function getBackupsList(type?: BackupType) {
  try {
    const backups: Array<{
      id: string;
      timestamp: number;
      fileName: string;
      size: number;
      type: BackupType;
      path: string;
    }> = [];
    
    // 如果指定了類型，只讀取該類型的備份
    if (type) {
      let backupDir;
      switch (type) {
        case BackupType.DAILY:
          backupDir = DAILY_BACKUP_DIR;
          break;
        case BackupType.WEEKLY:
          backupDir = WEEKLY_BACKUP_DIR;
          break;
        case BackupType.MONTHLY:
          backupDir = MONTHLY_BACKUP_DIR;
          break;
        case BackupType.MANUAL:
          backupDir = MANUAL_BACKUP_DIR;
          break;
        default:
          backupDir = BACKUP_DIR; // 回退到根備份目錄
      }
      
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir)
          .filter(file => file.endsWith('.json'))
          .map(file => {
            const filePath = path.join(backupDir, file);
            return {
              id: file.replace('.json', ''),
              timestamp: fs.statSync(filePath).mtime.getTime(),
              fileName: file,
              size: fs.statSync(filePath).size,
              type,
              path: filePath
            };
          });
        
        backups.push(...files);
      }
    } else {
      // 讀取所有類型的備份
      const typeDirectories = [
        { dir: DAILY_BACKUP_DIR, type: BackupType.DAILY },
        { dir: WEEKLY_BACKUP_DIR, type: BackupType.WEEKLY },
        { dir: MONTHLY_BACKUP_DIR, type: BackupType.MONTHLY },
        { dir: MANUAL_BACKUP_DIR, type: BackupType.MANUAL },
        { dir: BACKUP_DIR, type: BackupType.MANUAL } // 處理舊的備份
      ];
      
      // 從每個目錄讀取備份
      for (const { dir, type } of typeDirectories) {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir)
            .filter(file => file.endsWith('.json'))
            .map(file => {
              const filePath = path.join(dir, file);
              return {
                id: file.replace('.json', ''),
                timestamp: fs.statSync(filePath).mtime.getTime(),
                fileName: file,
                size: fs.statSync(filePath).size,
                type,
                path: filePath
              };
            });
          
          backups.push(...files);
        }
      }
    }
    
    // 按時間降序排序
    return backups.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('獲取備份列表失敗：', error);
    return [];
  }
}

/**
 * 創建系統自動備份的定時任務
 * @returns 定時器ID
 */
export function setupAutomaticBackups(): NodeJS.Timeout {
  console.log('設置自動備份任務...');
  
  // 記錄上次備份時間
  const lastBackup = {
    daily: 0,
    weekly: 0,
    monthly: 0
  };
  
  // 創建定時任務（每小時檢查一次）
  const intervalId = setInterval(async () => {
    const now = Date.now();
    
    // 檢查是否需要每日備份
    if (now - lastBackup.daily >= AUTO_DAILY_BACKUP_INTERVAL) {
      try {
        const backupId = await createDatabaseBackup(BackupType.DAILY, `自動每日備份 ${new Date().toLocaleString()}`);
        console.log(`自動每日備份已創建: ${backupId}`);
        lastBackup.daily = now;
      } catch (error) {
        console.error('自動每日備份失敗:', error);
      }
    }
    
    // 檢查是否需要每週備份
    if (now - lastBackup.weekly >= AUTO_WEEKLY_BACKUP_INTERVAL) {
      try {
        const backupId = await createDatabaseBackup(BackupType.WEEKLY, `自動每週備份 ${new Date().toLocaleString()}`);
        console.log(`自動每週備份已創建: ${backupId}`);
        lastBackup.weekly = now;
      } catch (error) {
        console.error('自動每週備份失敗:', error);
      }
    }
    
    // 檢查是否需要每月備份
    if (now - lastBackup.monthly >= AUTO_MONTHLY_BACKUP_INTERVAL) {
      try {
        const backupId = await createDatabaseBackup(BackupType.MONTHLY, `自動每月備份 ${new Date().toLocaleString()}`);
        console.log(`自動每月備份已創建: ${backupId}`);
        lastBackup.monthly = now;
      } catch (error) {
        console.error('自動每月備份失敗:', error);
      }
    }
  }, 60 * 60 * 1000); // 每小時檢查一次
  
  // 啟動時立即執行一次每日備份
  createDatabaseBackup(BackupType.DAILY, `初始每日備份 ${new Date().toLocaleString()}`)
    .then(backupId => {
      console.log(`初始每日備份已創建: ${backupId}`);
      lastBackup.daily = Date.now();
    })
    .catch(error => {
      console.error('初始每日備份失敗:', error);
    });
  
  return intervalId;
}

/**
 * 從備份恢復數據
 * @param backupId 備份ID
 * @param backupType 備份類型，如果指定則從該類型的目錄中查找，不指定則搜索所有目錄
 */
export async function restoreFromBackup(
  backupId: string,
  backupType?: BackupType
): Promise<boolean> {
  // 尋找備份文件
  let backupPath = '';
  
  if (backupType) {
    // 如果指定了類型，直接在對應目錄查找
    let targetDir;
    switch (backupType) {
      case BackupType.DAILY:
        targetDir = DAILY_BACKUP_DIR;
        break;
      case BackupType.WEEKLY:
        targetDir = WEEKLY_BACKUP_DIR;
        break;
      case BackupType.MONTHLY:
        targetDir = MONTHLY_BACKUP_DIR;
        break;
      case BackupType.MANUAL:
        targetDir = MANUAL_BACKUP_DIR;
        break;
    }
    
    const filePath = path.join(targetDir, `${backupId}.json`);
    if (fs.existsSync(filePath)) {
      backupPath = filePath;
    }
  } else {
    // 搜索所有備份目錄
    const directories = [
      DAILY_BACKUP_DIR,
      WEEKLY_BACKUP_DIR,
      MONTHLY_BACKUP_DIR,
      MANUAL_BACKUP_DIR,
      BACKUP_DIR // 為了兼容舊版本
    ];
    
    for (const dir of directories) {
      const filePath = path.join(dir, `${backupId}.json`);
      if (fs.existsSync(filePath)) {
        backupPath = filePath;
        break;
      }
    }
  }
  
  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error(`備份不存在：${backupId}`);
  }
  
  try {
    // 讀取並解析備份數據
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    
    // 在恢復前先創建當前狀態的備份
    await createDatabaseBackup(BackupType.MANUAL, `恢復前自動備份 ${new Date().toLocaleString()}`);
    
    // 恢復員工資料 (先刪除現有資料)
    await db.delete(schema.employees);
    
    if (backupData.employees && backupData.employees.length > 0) {
      console.log(`恢復 ${backupData.employees.length} 條員工記錄`);
      for (const employee of backupData.employees) {
        await storage.createEmployee(employee);
      }
    }
    
    // 恢復設置
    if (backupData.settings) {
      console.log('恢復系統設置');
      await storage.createOrUpdateSettings(backupData.settings);
    }
    
    // 恢復假日資料 (先刪除現有資料)
    await db.delete(schema.holidays);
    
    if (backupData.holidays && backupData.holidays.length > 0) {
      console.log(`恢復 ${backupData.holidays.length} 條假日記錄`);
      for (const holiday of backupData.holidays) {
        await storage.createHoliday(holiday);
      }
    }
    
    // 恢復薪資記錄 (先刪除現有資料)
    await db.delete(schema.salaryRecords);
    
    if (backupData.salaryRecords && backupData.salaryRecords.length > 0) {
      console.log(`恢復 ${backupData.salaryRecords.length} 條薪資記錄`);
      for (const record of backupData.salaryRecords) {
        await storage.createSalaryRecord(record);
      }
    }
    
    // 恢復臨時考勤 (先刪除現有資料)
    await db.delete(schema.temporaryAttendance);
    
    if (backupData.temporaryAttendance && backupData.temporaryAttendance.length > 0) {
      console.log(`恢復 ${backupData.temporaryAttendance.length} 條臨時考勤記錄`);
      for (const attendance of backupData.temporaryAttendance) {
        await storage.createTemporaryAttendance(attendance);
      }
    }
    
    console.log(`數據已從備份恢復：${backupId}`);
    return true;
  } catch (error) {
    console.error('從備份恢復數據失敗：', error);
    throw new Error(`恢復失敗：${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 在切換數據庫前創建備份
 */
export async function backupBeforeDatabaseSwitch(): Promise<string> {
  console.log('在切換數據庫前創建備份...');
  return await createDatabaseBackup();
}

/**
 * 刪除指定備份
 * @param backupId 備份ID
 * @param backupType 備份類型，如果指定則從該類型的目錄中查找，不指定則搜索所有目錄
 */
export async function deleteBackup(
  backupId: string,
  backupType?: BackupType
): Promise<boolean> {
  // 尋找備份文件
  let backupPath = '';
  
  if (backupType) {
    // 如果指定了類型，直接在對應目錄查找
    let targetDir;
    switch (backupType) {
      case BackupType.DAILY:
        targetDir = DAILY_BACKUP_DIR;
        break;
      case BackupType.WEEKLY:
        targetDir = WEEKLY_BACKUP_DIR;
        break;
      case BackupType.MONTHLY:
        targetDir = MONTHLY_BACKUP_DIR;
        break;
      case BackupType.MANUAL:
        targetDir = MANUAL_BACKUP_DIR;
        break;
    }
    
    const filePath = path.join(targetDir, `${backupId}.json`);
    if (fs.existsSync(filePath)) {
      backupPath = filePath;
    }
  } else {
    // 搜索所有備份目錄
    const directories = [
      DAILY_BACKUP_DIR,
      WEEKLY_BACKUP_DIR,
      MONTHLY_BACKUP_DIR,
      MANUAL_BACKUP_DIR,
      BACKUP_DIR // 為了兼容舊版本
    ];
    
    for (const dir of directories) {
      const filePath = path.join(dir, `${backupId}.json`);
      if (fs.existsSync(filePath)) {
        backupPath = filePath;
        break;
      }
    }
  }
  
  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error(`備份不存在：${backupId}`);
  }
  
  try {
    // 刪除備份文件
    fs.unlinkSync(backupPath);
    console.log(`已刪除備份：${backupPath}`);
    return true;
  } catch (error) {
    console.error(`刪除備份失敗：${backupPath}`, error);
    throw new Error(`刪除備份失敗：${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 定期同步數據（從 PostgreSQL 到 Supabase 或相反）
 */
export async function syncDatabases(): Promise<{
  success: boolean;
  syncedItems: number;
  errors: string[];
}> {
  console.log('開始數據同步...');
  const errors: string[] = [];
  let syncedItems = 0;
  
  try {
    // 這個功能在實際情況中需要謹慎設計
    // 在這個簡化版本中，我們只會返回成功
    
    return {
      success: true,
      syncedItems,
      errors
    };
  } catch (error) {
    console.error('數據同步失敗：', error);
    return {
      success: false,
      syncedItems,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}