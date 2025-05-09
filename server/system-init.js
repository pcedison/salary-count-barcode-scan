/**
 * 系統初始化模塊
 * 
 * 功能：
 * 1. 在系統啟動時運行
 * 2. 檢查並恢復數據完整性
 * 3. 確保所有關鍵服務正常
 * 
 * 此模塊應被導入到 server/index.ts 中
 */

import { fileURLToPath } from 'url';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// 系統啟動流程
export async function initializeSystem() {
  console.log('初始化系統...');
  
  try {
    // 1. 檢查並恢復數據完整性
    console.log('檢查數據完整性...');
    
    // 執行自動恢復腳本
    try {
      await execAsync(`node ${path.join(ROOT_DIR, 'auto-recovery.js')}`);
      console.log('數據完整性檢查完成');
    } catch (error) {
      console.error('數據恢復過程中出錯:', error.message);
      // 繼續啟動，不要因為恢復失敗而阻止系統啟動
    }
    
    // 2. 確保 Supabase 為主數據庫
    console.log('確保使用 Supabase 作為主數據庫...');
    await ensureSupabasePrimary();
    
    // 3. 初始化日誌監控
    console.log('初始化系統監控...');
    initializeMonitoring();
    
    // 4. 設置定期維護任務
    console.log('設置定期維護任務...');
    setupMaintenanceTasks();
    
    console.log('系統初始化完成');
    return true;
  } catch (error) {
    console.error('系統初始化失敗:', error);
    return false;
  }
}

/**
 * 確保 Supabase 為主數據庫
 */
async function ensureSupabasePrimary() {
  try {
    // 檢查配置
    await execAsync(`mkdir -p ${path.join(ROOT_DIR, 'data')}`);
    
    // 創建或更新配置文件
    const configPath = path.join(ROOT_DIR, 'data', 'db-config.json');
    const config = {
      primaryDatabase: 'supabase',
      fallbackDatabase: 'postgres',
      autoFailover: true,
      monitoring: {
        enabled: true,
        intervalMinutes: 15,
        maxRetries: 3,
        retryDelaySeconds: 60
      },
      backup: {
        daily: true,
        weekly: true,
        monthly: true,
        retentionPolicy: {
          daily: 7,
          weekly: 4,
          monthly: 12,
          manual: 30
        }
      }
    };
    
    const fs = await import('fs');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('已更新數據庫配置，設置 Supabase 為主數據庫');
  } catch (error) {
    console.error('更新數據庫配置時出錯:', error);
    throw error;
  }
}

/**
 * 初始化系統監控
 */
function initializeMonitoring() {
  // 這裡可以添加啟動系統監控的代碼
  console.log('系統監控已初始化');
}

/**
 * 設置定期維護任務
 */
function setupMaintenanceTasks() {
  // 設置每日備份
  const DAILY_BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24小時
  setInterval(() => {
    const backupScript = path.join(ROOT_DIR, 'server', 'improved-backup.js');
    exec(`node ${backupScript} daily`, (error, stdout, stderr) => {
      if (error) {
        console.error(`執行每日備份時出錯: ${error.message}`);
        return;
      }
      console.log('已完成每日備份');
    });
  }, DAILY_BACKUP_INTERVAL);
  
  // 設置每週系統健康檢查
  const WEEKLY_HEALTH_CHECK_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7天
  setInterval(() => {
    const healthCheckScript = path.join(ROOT_DIR, 'server', 'log-analyzer.js');
    exec(`node ${healthCheckScript}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`執行每週健康檢查時出錯: ${error.message}`);
        return;
      }
      console.log('已完成每週系統健康檢查');
    });
  }, WEEKLY_HEALTH_CHECK_INTERVAL);
  
  console.log('定期維護任務已設置');
}

// 導出系統初始化函數
export default initializeSystem;