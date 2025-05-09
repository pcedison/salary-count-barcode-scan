/**
 * 數據庫配置管理器
 * 
 * 功能：
 * 1. 明確設置數據庫優先級，默認以 Supabase 為主
 * 2. 提供統一的配置接口
 * 3. 確保所有系統組件使用一致的數據庫策略
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置文件路徑
const CONFIG_FILE = path.join(__dirname, '..', 'data', 'db-config.json');

// 默認配置
const DEFAULT_CONFIG = {
  // 明確設置 Supabase 為默認主數據庫
  primaryDatabase: 'supabase',
  // 後備數據庫
  fallbackDatabase: 'postgres',
  // 自動故障轉移設置
  autoFailover: true,
  // 數據庫監控設置
  monitoring: {
    enabled: true,
    intervalMinutes: 15, // 調整為15分鐘一次，減少系統負擔
    maxRetries: 3,
    retryDelaySeconds: 60
  },
  // 備份設置
  backup: {
    daily: true,
    weekly: true,
    monthly: true,
    retentionPolicy: {
      daily: 7,    // 保留7天的每日備份
      weekly: 4,   // 保留4週的每週備份
      monthly: 12, // 保留12個月的每月備份
      manual: 30   // 保留30個手動備份
    }
  }
};

/**
 * 確保目錄存在
 */
function ensureDirectoryExists() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * 讀取配置
 * @returns {Object} 當前配置
 */
export function getConfig() {
  try {
    ensureDirectoryExists();
    
    if (fs.existsSync(CONFIG_FILE)) {
      const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
      const config = JSON.parse(configData);
      
      // 合併默認配置和現有配置，確保所有必要的字段都存在
      return { ...DEFAULT_CONFIG, ...config };
    } else {
      // 如果配置文件不存在，創建默認配置
      saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
  } catch (error) {
    console.error('讀取數據庫配置時出錯:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * 保存配置
 * @param {Object} config 要保存的配置
 * @returns {boolean} 是否保存成功
 */
export function saveConfig(config) {
  try {
    ensureDirectoryExists();
    
    // 合併默認配置，確保所有必要的字段都存在
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(mergedConfig, null, 2));
    console.log('數據庫配置已保存');
    return true;
  } catch (error) {
    console.error('保存數據庫配置時出錯:', error);
    return false;
  }
}

/**
 * 更新配置項
 * @param {string} key 配置項的鍵
 * @param {any} value 配置項的值
 * @returns {boolean} 是否更新成功
 */
export function updateConfig(key, value) {
  const config = getConfig();
  
  // 如果配置項是嵌套的，支持使用點號分隔的路徑
  if (key.includes('.')) {
    const keys = key.split('.');
    let current = config;
    
    // 遍歷路徑
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    // 設置最後一個鍵的值
    current[keys[keys.length - 1]] = value;
  } else {
    // 直接設置頂層配置項
    config[key] = value;
  }
  
  return saveConfig(config);
}

/**
 * 獲取主數據庫類型
 * @returns {string} 主數據庫類型 ('supabase' 或 'postgres')
 */
export function getPrimaryDatabase() {
  const config = getConfig();
  return config.primaryDatabase;
}

/**
 * 設置主數據庫類型
 * @param {string} dbType 數據庫類型 ('supabase' 或 'postgres')
 * @returns {boolean} 是否設置成功
 */
export function setPrimaryDatabase(dbType) {
  if (dbType !== 'supabase' && dbType !== 'postgres') {
    console.error('無效的數據庫類型:', dbType);
    return false;
  }
  
  return updateConfig('primaryDatabase', dbType);
}

/**
 * 獲取監控間隔（分鐘）
 * @returns {number} 監控間隔
 */
export function getMonitoringInterval() {
  const config = getConfig();
  return config.monitoring.intervalMinutes;
}

/**
 * 設置監控間隔
 * @param {number} minutes 監控間隔（分鐘）
 * @returns {boolean} 是否設置成功
 */
export function setMonitoringInterval(minutes) {
  if (typeof minutes !== 'number' || minutes < 1) {
    console.error('無效的監控間隔:', minutes);
    return false;
  }
  
  return updateConfig('monitoring.intervalMinutes', minutes);
}

/**
 * 獲取備份保留策略
 * @returns {Object} 備份保留策略
 */
export function getRetentionPolicy() {
  const config = getConfig();
  return config.backup.retentionPolicy;
}

/**
 * 設置備份保留策略
 * @param {string} type 備份類型 ('daily', 'weekly', 'monthly', 'manual')
 * @param {number} count 保留的備份數量
 * @returns {boolean} 是否設置成功
 */
export function setRetentionPolicy(type, count) {
  if (!['daily', 'weekly', 'monthly', 'manual'].includes(type)) {
    console.error('無效的備份類型:', type);
    return false;
  }
  
  if (typeof count !== 'number' || count < 1) {
    console.error('無效的保留數量:', count);
    return false;
  }
  
  return updateConfig(`backup.retentionPolicy.${type}`, count);
}

// 初始化配置
getConfig();