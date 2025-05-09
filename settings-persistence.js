/**
 * 系統設定持久化工具
 * 
 * 用途：
 * 1. 確保系統設定（包括勞健保扣款項目和管理員密碼）在資料庫異常時仍能恢復
 * 2. 定期將設定備份到單獨的檔案，以便在資料庫連接異常時能夠恢復
 * 3. 在系統啟動時自動檢查並恢復正確的設定
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定文件路徑
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings-backup.json');

// 創建 PostgreSQL 客戶端
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * 確保必要的目錄存在
 */
function ensureDirectoriesExist() {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * 從資料庫獲取當前設定
 * @returns {Promise<Object|null>} 設定對象，獲取失敗則返回 null
 */
async function getSettingsFromDatabase() {
  const client = await pool.connect();
  
  try {
    const result = await client.query('SELECT * FROM settings WHERE id = 1');
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    
    return null;
  } catch (error) {
    console.error('從資料庫獲取設定時出錯:', error);
    return null;
  } finally {
    client.release();
  }
}

/**
 * 讀取備份的設定文件
 * @returns {Object|null} 設定對象，讀取失敗或文件不存在則返回 null
 */
function getSettingsFromFile() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const settingsData = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return JSON.parse(settingsData);
    }
    
    return null;
  } catch (error) {
    console.error('讀取設定文件時出錯:', error);
    return null;
  }
}

/**
 * 將設定保存到文件
 * @param {Object} settings 要保存的設定
 * @returns {boolean} 是否保存成功
 */
function saveSettingsToFile(settings) {
  try {
    ensureDirectoriesExist();
    
    // 在保存前添加時間戳
    const settingsWithTimestamp = {
      ...settings,
      _backupTimestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsWithTimestamp, null, 2));
    console.log('設定已保存到文件:', SETTINGS_FILE);
    return true;
  } catch (error) {
    console.error('保存設定到文件時出錯:', error);
    return false;
  }
}

/**
 * 更新資料庫中的設定
 * @param {Object} settings 要更新的設定
 * @returns {Promise<boolean>} 是否更新成功
 */
async function updateSettingsInDatabase(settings) {
  const client = await pool.connect();
  
  try {
    const { 
      base_hourly_rate, ot1_multiplier, ot2_multiplier, 
      base_month_salary, welfare_allowance, deductions, admin_pin 
    } = settings;
    
    await client.query(`
      UPDATE settings SET
        base_hourly_rate = $1,
        ot1_multiplier = $2,
        ot2_multiplier = $3,
        base_month_salary = $4,
        welfare_allowance = $5,
        deductions = $6,
        admin_pin = $7,
        updated_at = NOW()
      WHERE id = 1
    `, [
      base_hourly_rate, ot1_multiplier, ot2_multiplier,
      base_month_salary, welfare_allowance, 
      typeof deductions === 'string' ? deductions : JSON.stringify(deductions),
      admin_pin
    ]);
    
    console.log('設定已更新到資料庫');
    return true;
  } catch (error) {
    console.error('更新資料庫設定時出錯:', error);
    return false;
  } finally {
    client.release();
  }
}

/**
 * 驗證設定是否完整有效
 * @param {Object} settings 要驗證的設定
 * @returns {boolean} 設定是否有效
 */
function validateSettings(settings) {
  // 檢查必要的字段是否存在且有效
  if (!settings) return false;
  
  // 檢查基本欄位
  const requiredFields = ['base_hourly_rate', 'ot1_multiplier', 'ot2_multiplier', 'admin_pin'];
  for (const field of requiredFields) {
    if (settings[field] === undefined) {
      console.warn(`設定缺少必要欄位: ${field}`);
      return false;
    }
  }
  
  // 檢查扣款項目
  if (!settings.deductions) {
    console.warn('設定缺少扣款項目');
    return false;
  }
  
  let deductions;
  if (typeof settings.deductions === 'string') {
    try {
      deductions = JSON.parse(settings.deductions);
    } catch (error) {
      console.warn('解析扣款項目JSON失敗');
      return false;
    }
  } else {
    deductions = settings.deductions;
  }
  
  // 確保扣款項目是一個數組
  if (!Array.isArray(deductions)) {
    console.warn('扣款項目不是有效的數組');
    return false;
  }
  
  // 確保每個扣款項目都有必要的字段
  for (const item of deductions) {
    if (!item.name || !item.amount) {
      console.warn('某個扣款項目缺少必要欄位 (name 或 amount)');
      return false;
    }
  }
  
  return true;
}

/**
 * 檢查並同步設定
 * 1. 嘗試從資料庫獲取設定
 * 2. 如果成功，保存到文件作為備份
 * 3. 如果失敗，從文件讀取設定並更新資料庫
 * @returns {Promise<Object|null>} 同步後的設定，操作失敗則返回 null
 */
async function syncSettings() {
  console.log('開始同步設定...');
  
  // 嘗試從資料庫獲取設定
  const dbSettings = await getSettingsFromDatabase();
  
  if (dbSettings && validateSettings(dbSettings)) {
    console.log('成功從資料庫獲取有效設定');
    
    // 保存到文件作為備份
    saveSettingsToFile(dbSettings);
    return dbSettings;
  } else {
    console.warn('從資料庫獲取設定失敗或設定無效，嘗試從文件恢復');
    
    // 從文件讀取設定
    const fileSettings = getSettingsFromFile();
    
    if (fileSettings && validateSettings(fileSettings)) {
      console.log('成功從文件獲取有效設定，正在更新資料庫');
      
      // 更新資料庫
      await updateSettingsInDatabase(fileSettings);
      return fileSettings;
    } else {
      console.error('無法從資料庫或文件獲取有效設定');
      return null;
    }
  }
}

/**
 * 設置定期同步任務
 * @param {number} intervalMinutes 同步間隔，單位為分鐘
 * @returns {NodeJS.Timeout} 定時器ID
 */
function setupPeriodicSync(intervalMinutes = 30) {
  console.log(`設置定期同步任務，間隔 ${intervalMinutes} 分鐘`);
  
  const intervalId = setInterval(async () => {
    await syncSettings();
  }, intervalMinutes * 60 * 1000);
  
  return intervalId;
}

/**
 * 直接更新扣款設定
 * @param {Array} deductions 扣款項目數組
 * @returns {Promise<boolean>} 是否更新成功
 */
async function updateDeductions(deductions) {
  const settings = await getSettingsFromDatabase();
  
  if (!settings) {
    console.error('更新扣款項目失敗：無法獲取當前設定');
    return false;
  }
  
  // 更新扣款項目
  settings.deductions = deductions;
  
  // 更新資料庫
  const dbUpdateSuccess = await updateSettingsInDatabase(settings);
  
  // 保存到文件
  const fileUpdateSuccess = saveSettingsToFile(settings);
  
  return dbUpdateSuccess && fileUpdateSuccess;
}

/**
 * 更新管理員密碼
 * @param {string} newPin 新密碼
 * @returns {Promise<boolean>} 是否更新成功
 */
async function updateAdminPin(newPin) {
  const settings = await getSettingsFromDatabase();
  
  if (!settings) {
    console.error('更新管理員密碼失敗：無法獲取當前設定');
    return false;
  }
  
  // 更新密碼
  settings.admin_pin = newPin;
  
  // 更新資料庫
  const dbUpdateSuccess = await updateSettingsInDatabase(settings);
  
  // 保存到文件
  const fileUpdateSuccess = saveSettingsToFile(settings);
  
  return dbUpdateSuccess && fileUpdateSuccess;
}

/**
 * 獲取當前的扣款項目
 * @returns {Promise<Array|null>} 扣款項目數組，失敗則返回 null
 */
async function getDeductions() {
  const settings = await getSettingsFromDatabase();
  
  if (!settings || !settings.deductions) {
    // 嘗試從文件獲取
    const fileSettings = getSettingsFromFile();
    
    if (fileSettings && fileSettings.deductions) {
      let deductions = fileSettings.deductions;
      
      if (typeof deductions === 'string') {
        deductions = JSON.parse(deductions);
      }
      
      return deductions;
    }
    
    return null;
  }
  
  let deductions = settings.deductions;
  
  if (typeof deductions === 'string') {
    deductions = JSON.parse(deductions);
  }
  
  return deductions;
}

// 如果直接運行此文件，則執行同步
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    // 執行同步
    const settings = await syncSettings();
    
    if (settings) {
      console.log('設定同步成功：');
      console.log('- 基本時薪:', settings.base_hourly_rate);
      console.log('- 加班倍率 1:', settings.ot1_multiplier);
      console.log('- 加班倍率 2:', settings.ot2_multiplier);
      
      let deductions;
      if (typeof settings.deductions === 'string') {
        deductions = JSON.parse(settings.deductions);
      } else {
        deductions = settings.deductions;
      }
      
      console.log('- 扣款項目:');
      deductions.forEach(item => {
        console.log(`  * ${item.name}: ${item.amount}`);
      });
      
      // 設置定期同步
      setupPeriodicSync();
    } else {
      console.error('設定同步失敗');
      process.exit(1);
    }
  })();
} else {
  console.log('設定持久化工具已加載，未自動同步');
}

// 導出功能
export {
  syncSettings,
  setupPeriodicSync,
  updateDeductions,
  updateAdminPin,
  getDeductions,
  getSettingsFromDatabase,
  getSettingsFromFile,
  saveSettingsToFile,
  updateSettingsInDatabase
};