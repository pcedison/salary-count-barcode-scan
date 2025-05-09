/**
 * 系統啟動腳本
 * 
 * 功能：
 * 1. 將最新的改進集成到系統啟動過程中
 * 2. 確保系統使用正確的數據庫配置
 * 3. 設置合理的監控間隔
 * 
 * 使用方式：將此文件的內容整合到服務器啟動流程中
 */

import { initializeDatabase, getCurrentDatabaseType } from './db-integration.js';
import { getConfig, setMonitoringInterval, setPrimaryDatabase } from './db-config.js';
import { initializeSettings } from './settings-manager.js';
import { BackupType, createBackup } from './improved-backup.js';

/**
 * 系統啟動初始化
 */
export async function systemStartup() {
  console.log('系統啟動中...');
  
  try {
    // 獲取配置
    const config = getConfig();
    console.log(`使用主數據庫: ${config.primaryDatabase}, 監控間隔: ${config.monitoring.intervalMinutes} 分鐘`);
    
    // 1. 初始化數據庫連接
    console.log('初始化數據庫連接...');
    const dbInitSuccess = await initializeDatabase();
    
    if (!dbInitSuccess) {
      console.error('數據庫初始化失敗，系統可能無法正常運行');
    } else {
      console.log(`數據庫初始化成功，使用 ${getCurrentDatabaseType()} 存儲`);
      
      // 如果實際使用的數據庫類型與配置不同，更新配置
      if (getCurrentDatabaseType() !== config.primaryDatabase) {
        console.log(`實際使用的數據庫 (${getCurrentDatabaseType()}) 與配置 (${config.primaryDatabase}) 不同，更新配置`);
        setPrimaryDatabase(getCurrentDatabaseType());
      }
    }
    
    // 2. 初始化設定管理器
    console.log('初始化設定管理器...');
    const settingsInitSuccess = await initializeSettings();
    
    if (!settingsInitSuccess) {
      console.warn('設定管理器初始化失敗，將使用默認設定');
    } else {
      console.log('設定管理器初始化成功');
    }
    
    // 3. 創建啟動時備份
    const shouldCreateBackup = process.env.CREATE_STARTUP_BACKUP !== 'false';
    
    if (shouldCreateBackup) {
      console.log('創建啟動時備份...');
      
      // 從數據庫獲取數據...
      // 這裡需要實現提取所有需要備份的數據
      // 簡化示例：
      const backupData = {
        employees: [],
        salaryRecords: [],
        attendance: [],
        holidays: [],
        settings: null
      };
      
      // 使用改進的備份系統創建備份
      const backupResult = createBackup(BackupType.DAILY, backupData);
      
      if (backupResult.success) {
        console.log(`啟動時備份創建成功: ${backupResult.id}`);
      } else {
        console.warn(`啟動時備份創建失敗: ${backupResult.error}`);
      }
    }
    
    // 4. 設置監控間隔
    // 根據您的反饋，60秒的監控間隔過於頻繁
    // 將其調整為15分鐘
    if (config.monitoring.intervalMinutes < 15) {
      console.log(`監控間隔 (${config.monitoring.intervalMinutes} 分鐘) 可能過於頻繁，調整為 15 分鐘`);
      setMonitoringInterval(15);
    }
    
    console.log('系統啟動初始化完成');
    return true;
  } catch (error) {
    console.error('系統啟動初始化時出錯:', error);
    return false;
  }
}

// 如果直接運行此文件，執行啟動初始化
if (process.argv[1].endsWith('startup-script.js')) {
  systemStartup()
    .then(success => {
      if (success) {
        console.log('系統啟動成功');
      } else {
        console.error('系統啟動失敗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('系統啟動過程中發生異常:', error);
      process.exit(1);
    });
}