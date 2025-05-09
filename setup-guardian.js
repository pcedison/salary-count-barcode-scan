/**
 * 系統守護腳本
 * 
 * 功能：
 * 1. 設置自動運行的監控和備份
 * 2. 檢查和修復資料庫連接配置
 * 3. 添加新的環境變數來支持更穩定的操作
 * 
 * 這個腳本應該在系統初始設置或更新後運行一次
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const config = {
  // 預設監控間隔（分鐘）
  defaultMonitoringInterval: 60,
  
  // 自動備份設置
  backupSettings: {
    daily: true,
    weekly: true,
    monthly: true,
    maxBackupsPerType: 10 // 每種類型最多保留的備份數量
  },
  
  // 系統關鍵文件
  systemFiles: {
    monitoringScript: path.join(__dirname, 'db-stability-tools.js'),
    healthCheckScript: path.join(__dirname, 'db-health-check.js'),
    integrityCheckScript: path.join(__dirname, 'integrity-check.js')
  },
  
  // 自啟動腳本設置
  autostart: {
    enabled: true,
    cronExpression: '0 * * * *' // 每小時執行一次
  },
  
  // 恢復與故障轉移配置
  recovery: {
    maxRetries: 3,
    retryDelaySeconds: 300, // 5分鐘
    automaticFallback: true
  }
};

/**
 * 檢查系統文件是否都存在
 * @returns {boolean} 是否所有文件都存在
 */
function checkSystemFiles() {
  let allExist = true;
  
  for (const [name, filePath] of Object.entries(config.systemFiles)) {
    if (!fs.existsSync(filePath)) {
      console.error(`系統文件不存在: ${name} (${filePath})`);
      allExist = false;
    }
  }
  
  return allExist;
}

/**
 * 設置環境變數
 * @param {Object} envVars 要設置的環境變數
 */
function setupEnvironmentVariables(envVars) {
  const envFilePath = path.join(__dirname, '.env');
  
  // 讀取現有的環境變數
  let existingEnv = {};
  if (fs.existsSync(envFilePath)) {
    const envContent = fs.readFileSync(envFilePath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        existingEnv[match[1]] = match[2];
      }
    });
  }
  
  // 合併新的環境變數
  const mergedEnv = { ...existingEnv, ...envVars };
  
  // 生成新的環境變數文件內容
  const newEnvContent = Object.entries(mergedEnv)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  // 寫入文件
  fs.writeFileSync(envFilePath, newEnvContent);
  console.log(`環境變數已更新: ${Object.keys(envVars).join(', ')}`);
}

/**
 * 設置自動運行的監控任務
 */
function setupAutomaticMonitoring() {
  // 創建一個 cron job 每小時運行健康檢查
  const cronJobContent = `${config.autostart.cronExpression} cd ${__dirname} && node ${config.systemFiles.healthCheckScript} --restore-if-needed >> ./logs/health-check.log 2>&1\n`;
  
  // 確保日誌目錄存在
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  // 寫入臨時 crontab 文件
  const tempCronFile = path.join(__dirname, 'temp-crontab');
  fs.writeFileSync(tempCronFile, cronJobContent);
  
  // 添加到 crontab（僅在 Linux/Unix 系統上有效）
  try {
    exec(`crontab -l | cat - ${tempCronFile} | crontab -`, (error, stdout, stderr) => {
      if (error) {
        console.warn(`無法設置 crontab (可能不是 Linux/Unix 系統): ${error.message}`);
        console.log('請手動設置定期運行以下命令:');
        console.log(`node ${config.systemFiles.healthCheckScript} --restore-if-needed`);
      } else {
        console.log('自動監控已設置');
      }
      
      // 刪除臨時文件
      fs.unlinkSync(tempCronFile);
    });
  } catch (error) {
    console.warn(`無法執行 crontab 命令: ${error.message}`);
    console.log('請手動設置定期運行以下命令:');
    console.log(`node ${config.systemFiles.healthCheckScript} --restore-if-needed`);
  }
}

/**
 * 創建備份目錄結構
 */
function createBackupDirectories() {
  const backupsBaseDir = path.join(__dirname, 'backups');
  
  // 創建主備份目錄
  if (!fs.existsSync(backupsBaseDir)) {
    fs.mkdirSync(backupsBaseDir, { recursive: true });
  }
  
  // 創建各類型的備份子目錄
  const types = ['daily', 'weekly', 'monthly', 'manual'];
  for (const type of types) {
    const typeDir = path.join(backupsBaseDir, type);
    if (!fs.existsSync(typeDir)) {
      fs.mkdirSync(typeDir, { recursive: true });
    }
  }
  
  console.log('備份目錄結構已創建');
}

/**
 * 生成一個日誌文件寫入器
 * @param {string} logFileName 日誌文件名
 * @returns {Function} 寫入日誌的函數
 */
function createLogger(logFileName) {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  const logFilePath = path.join(logsDir, logFileName);
  
  return (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    fs.appendFileSync(logFilePath, logMessage);
    console.log(message);
  };
}

/**
 * 主函數
 */
async function setup() {
  const logger = createLogger('setup-guardian.log');
  
  logger('開始設置系統守護...');
  
  // 檢查系統文件
  if (!checkSystemFiles()) {
    logger('部分系統文件缺失，請確保所有必要文件都存在');
    return;
  }
  
  // 設置環境變數
  logger('設置環境變數...');
  setupEnvironmentVariables({
    // 監控設置
    MONITORING_INTERVAL_MINUTES: String(config.defaultMonitoringInterval),
    // 備份設置
    BACKUP_DAILY_ENABLED: String(config.backupSettings.daily),
    BACKUP_WEEKLY_ENABLED: String(config.backupSettings.weekly),
    BACKUP_MONTHLY_ENABLED: String(config.backupSettings.monthly),
    BACKUP_MAX_PER_TYPE: String(config.backupSettings.maxBackupsPerType),
    // 恢復設置
    RECOVERY_MAX_RETRIES: String(config.recovery.maxRetries),
    RECOVERY_RETRY_DELAY_SECONDS: String(config.recovery.retryDelaySeconds),
    RECOVERY_AUTOMATIC_FALLBACK: String(config.recovery.automaticFallback)
  });
  
  // 創建備份目錄
  logger('創建備份目錄結構...');
  createBackupDirectories();
  
  // 設置自動監控
  if (config.autostart.enabled) {
    logger('設置自動監控...');
    setupAutomaticMonitoring();
  }
  
  // 執行初始備份
  logger('執行初始備份...');
  try {
    exec(`node ${config.systemFiles.monitoringScript}`, (error, stdout, stderr) => {
      if (error) {
        logger(`執行初始備份時出錯: ${error.message}`);
        if (stderr) {
          logger(`錯誤輸出: ${stderr}`);
        }
      } else {
        logger('初始備份完成');
        logger(stdout);
      }
    });
  } catch (error) {
    logger(`無法執行初始備份: ${error.message}`);
  }
  
  logger('系統守護設置完成');
}

// 執行設置
setup();