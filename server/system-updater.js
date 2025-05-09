/**
 * 系統更新工具
 * 
 * 功能：
 * 1. 檢查依賴包的更新
 * 2. 自動更新安全相關組件
 * 3. 管理系統版本和升級
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// 配置
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const PACKAGE_LOCK_PATH = path.join(ROOT_DIR, 'package-lock.json');
const UPDATE_LOG_PATH = path.join(ROOT_DIR, 'logs', 'updates.log');

// 確保日誌目錄存在
if (!fs.existsSync(path.dirname(UPDATE_LOG_PATH))) {
  fs.mkdirSync(path.dirname(UPDATE_LOG_PATH), { recursive: true });
}

/**
 * 寫入更新日誌
 * @param {string} message 日誌訊息
 */
function logUpdate(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  fs.appendFileSync(UPDATE_LOG_PATH, logMessage);
  console.log(message);
}

/**
 * 取得當前已安裝的套件版本
 * @returns {Object} 套件版本映射
 */
function getInstalledPackages() {
  if (!fs.existsSync(PACKAGE_JSON_PATH)) {
    throw new Error(`找不到 package.json: ${PACKAGE_JSON_PATH}`);
  }
  
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  
  // 合併 dependencies 和 devDependencies
  return {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {})
  };
}

/**
 * 檢查套件更新
 * @param {Object} options 選項
 * @param {boolean} options.includeDevDependencies 是否包含開發依賴
 * @param {boolean} options.onlySecurity 是否只檢查安全相關的更新
 * @returns {Promise<Object>} 檢查結果
 */
export async function checkUpdates(options = {}) {
  const { includeDevDependencies = false, onlySecurity = false } = options;
  
  try {
    logUpdate('開始檢查套件更新...');
    
    // 執行 npm outdated --json 命令
    const { stdout } = await execAsync('npm outdated --json');
    
    // 解析輸出
    let outdatedPackages = {};
    try {
      outdatedPackages = JSON.parse(stdout);
    } catch (error) {
      // 如果沒有過時的套件，stdout 可能為空
      logUpdate('沒有過時的套件');
      return { 
        outdated: {}, 
        securityUpdates: {}, 
        totalCount: 0, 
        securityCount: 0 
      };
    }
    
    const currentPackages = getInstalledPackages();
    
    // 根據選項過濾套件
    const filteredPackages = {};
    for (const [pkg, info] of Object.entries(outdatedPackages)) {
      // 檢查是否為開發依賴
      const isDev = currentPackages[pkg] && !packageJson.dependencies?.[pkg];
      
      if (!includeDevDependencies && isDev) {
        continue;
      }
      
      filteredPackages[pkg] = info;
    }
    
    // 檢查安全更新
    let securityUpdates = {};
    
    if (onlySecurity) {
      // 執行 npm audit --json 命令
      try {
        const { stdout: auditOutput } = await execAsync('npm audit --json');
        const auditResult = JSON.parse(auditOutput);
        
        // 提取有安全問題的套件
        if (auditResult.vulnerabilities) {
          for (const [pkg, vulnInfo] of Object.entries(auditResult.vulnerabilities)) {
            if (filteredPackages[pkg]) {
              securityUpdates[pkg] = {
                ...filteredPackages[pkg],
                vulnerabilities: vulnInfo.vulnerabilities,
                severity: vulnInfo.severity,
                recommendation: vulnInfo.recommendation
              };
            }
          }
        }
      } catch (error) {
        logUpdate(`執行安全審計時出錯: ${error.message}`);
      }
    } else {
      securityUpdates = { ...filteredPackages };
    }
    
    // 記錄結果
    logUpdate(`找到 ${Object.keys(filteredPackages).length} 個可更新的套件`);
    if (Object.keys(securityUpdates).length > 0) {
      logUpdate(`其中 ${Object.keys(securityUpdates).length} 個套件有安全更新`);
    }
    
    return {
      outdated: filteredPackages,
      securityUpdates,
      totalCount: Object.keys(filteredPackages).length,
      securityCount: Object.keys(securityUpdates).length
    };
  } catch (error) {
    logUpdate(`檢查更新時出錯: ${error.message}`);
    throw error;
  }
}

/**
 * 更新套件
 * @param {Object} options 選項
 * @param {Array<string>} options.packages 要更新的套件列表，為空則更新全部
 * @param {boolean} options.securityOnly 是否只更新安全相關的套件
 * @param {boolean} options.saveBackup 是否在更新前保存備份
 * @returns {Promise<Object>} 更新結果
 */
export async function updatePackages(options = {}) {
  const { 
    packages = [], 
    securityOnly = true, 
    saveBackup = true 
  } = options;
  
  try {
    if (saveBackup) {
      // 保存 package.json 和 package-lock.json 的備份
      if (fs.existsSync(PACKAGE_JSON_PATH)) {
        fs.copyFileSync(
          PACKAGE_JSON_PATH, 
          `${PACKAGE_JSON_PATH}.backup-${Date.now()}`
        );
      }
      
      if (fs.existsSync(PACKAGE_LOCK_PATH)) {
        fs.copyFileSync(
          PACKAGE_LOCK_PATH, 
          `${PACKAGE_LOCK_PATH}.backup-${Date.now()}`
        );
      }
      
      logUpdate('已保存 package.json 和 package-lock.json 的備份');
    }
    
    // 準備更新命令
    let updateCmd = '';
    
    if (packages.length > 0) {
      // 更新指定的套件
      updateCmd = `npm update ${packages.join(' ')}`;
      logUpdate(`準備更新以下套件: ${packages.join(', ')}`);
    } else if (securityOnly) {
      // 只更新安全相關的套件
      const { securityUpdates } = await checkUpdates({ onlySecurity: true });
      const securityPackages = Object.keys(securityUpdates);
      
      if (securityPackages.length === 0) {
        logUpdate('沒有需要安全更新的套件');
        return { success: true, updated: [], message: '沒有需要安全更新的套件' };
      }
      
      updateCmd = `npm update ${securityPackages.join(' ')}`;
      logUpdate(`準備更新以下有安全問題的套件: ${securityPackages.join(', ')}`);
    } else {
      // 更新所有套件
      updateCmd = 'npm update';
      logUpdate('準備更新所有套件');
    }
    
    // 執行更新命令
    logUpdate(`執行: ${updateCmd}`);
    const { stdout, stderr } = await execAsync(updateCmd);
    
    // 檢查更新結果
    const updatedPackages = [];
    
    if (stdout) {
      logUpdate(`更新輸出:\n${stdout}`);
      
      // 嘗試從輸出解析更新的套件
      const changes = stdout.split('\n')
        .filter(line => line.includes('+') || line.includes('-'))
        .map(line => line.trim());
      
      if (changes.length > 0) {
        logUpdate('套件變更:');
        changes.forEach(change => logUpdate(`  ${change}`));
      }
    }
    
    if (stderr && !stderr.includes('npm WARN')) {
      logUpdate(`更新錯誤:\n${stderr}`);
      return { 
        success: false, 
        error: stderr,
        updated: updatedPackages
      };
    }
    
    // 取得更新後的套件版本
    const finalCheck = await checkUpdates();
    
    return {
      success: true,
      updated: updatedPackages,
      message: '更新完成',
      remainingUpdates: finalCheck.outdated
    };
  } catch (error) {
    logUpdate(`更新套件時出錯: ${error.message}`);
    return { success: false, error: error.message, updated: [] };
  }
}

/**
 * 設置定期更新檢查
 * @param {Object} options 選項
 * @param {number} options.intervalDays 檢查間隔（天）
 * @param {boolean} options.autoUpdateSecurity 是否自動更新安全相關的套件
 * @returns {NodeJS.Timeout} 定時器ID
 */
export function scheduleUpdateChecks(options = {}) {
  const { 
    intervalDays = 7, 
    autoUpdateSecurity = true 
  } = options;
  
  logUpdate(`設置定期更新檢查，每 ${intervalDays} 天執行一次`);
  
  // 立即執行一次
  checkUpdates({ onlySecurity: autoUpdateSecurity })
    .then(result => {
      if (autoUpdateSecurity && result.securityCount > 0) {
        logUpdate(`發現 ${result.securityCount} 個安全更新，自動更新中...`);
        return updatePackages({ securityOnly: true });
      }
      return result;
    })
    .catch(error => {
      logUpdate(`初始更新檢查失敗: ${error.message}`);
    });
  
  // 設置定期任務
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
  return setInterval(() => {
    checkUpdates({ onlySecurity: autoUpdateSecurity })
      .then(result => {
        if (autoUpdateSecurity && result.securityCount > 0) {
          logUpdate(`發現 ${result.securityCount} 個安全更新，自動更新中...`);
          return updatePackages({ securityOnly: true });
        }
        return result;
      })
      .catch(error => {
        logUpdate(`定期更新檢查失敗: ${error.message}`);
      });
  }, intervalMs);
}

// 如果直接運行腳本
if (process.argv[1].endsWith('system-updater.js')) {
  const command = process.argv[2] || 'check';
  
  if (command === 'check') {
    const securityOnly = process.argv.includes('--security');
    
    checkUpdates({ onlySecurity: securityOnly })
      .then(result => {
        console.log('檢查完成:', result);
      })
      .catch(console.error);
  } else if (command === 'update') {
    const packages = process.argv.slice(3).filter(arg => !arg.startsWith('--'));
    const securityOnly = process.argv.includes('--security');
    
    updatePackages({ packages, securityOnly })
      .then(result => {
        console.log('更新完成:', result);
      })
      .catch(console.error);
  } else {
    console.log(`未知命令: ${command}`);
    console.log('可用命令: check, update');
  }
}