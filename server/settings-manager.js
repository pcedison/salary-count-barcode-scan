/**
 * 設定管理器
 * 
 * 功能：
 * 1. 提供統一的系統設定存取介面
 * 2. 確保設定的持久性和一致性
 * 3. 在系統啟動時自動同步設定
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { syncSettings, updateDeductions, updateAdminPin } from '../settings-persistence.js';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定緩存
let settingsCache = null;
let lastSyncTime = 0;

/**
 * 初始化設定管理器
 * 在系統啟動時調用
 */
export async function initializeSettings() {
  console.log('初始化設定管理器...');
  
  try {
    // 同步設定
    const settings = await syncSettings();
    
    if (settings) {
      // 更新緩存
      settingsCache = settings;
      lastSyncTime = Date.now();
      
      console.log('設定初始化成功');
      
      // 設置定期備份
      setInterval(() => {
        syncSettings().then(updatedSettings => {
          if (updatedSettings) {
            settingsCache = updatedSettings;
            lastSyncTime = Date.now();
            console.log('設定自動同步完成');
          }
        }).catch(err => {
          console.error('設定自動同步失敗:', err);
        });
      }, 30 * 60 * 1000); // 每30分鐘同步一次
      
      return true;
    } else {
      console.error('設定初始化失敗');
      return false;
    }
  } catch (error) {
    console.error('初始化設定管理器時出錯:', error);
    return false;
  }
}

/**
 * 獲取系統設定
 * 如果緩存過期或不存在，會重新同步
 * @param {boolean} forceSync 是否強制同步
 * @returns {Promise<Object|null>} 設定對象
 */
export async function getSettings(forceSync = false) {
  // 檢查緩存是否有效
  const cacheExpired = Date.now() - lastSyncTime > 5 * 60 * 1000; // 5分鐘過期
  
  if (!settingsCache || cacheExpired || forceSync) {
    // 同步設定
    const settings = await syncSettings();
    
    if (settings) {
      // 更新緩存
      settingsCache = settings;
      lastSyncTime = Date.now();
    } else if (!settingsCache) {
      // 如果沒有緩存且同步失敗，返回null
      return null;
    }
    // 如果同步失敗但有緩存，使用舊緩存
  }
  
  return settingsCache;
}

/**
 * 更新扣款設定
 * @param {Array} deductions 扣款項目數組
 * @returns {Promise<boolean>} 是否更新成功
 */
export async function setDeductions(deductions) {
  const success = await updateDeductions(deductions);
  
  if (success) {
    // 更新緩存
    const settings = await getSettings(true);
    return !!settings;
  }
  
  return false;
}

/**
 * 更新管理員密碼
 * @param {string} newPin 新密碼
 * @returns {Promise<boolean>} 是否更新成功
 */
export async function setAdminPin(newPin) {
  const success = await updateAdminPin(newPin);
  
  if (success) {
    // 更新緩存
    const settings = await getSettings(true);
    return !!settings;
  }
  
  return false;
}

/**
 * 獲取當前的扣款項目
 * @returns {Promise<Array|null>} 扣款項目數組
 */
export async function getDeductions() {
  const settings = await getSettings();
  
  if (!settings || !settings.deductions) {
    return null;
  }
  
  let deductions = settings.deductions;
  
  if (typeof deductions === 'string') {
    try {
      deductions = JSON.parse(deductions);
    } catch (error) {
      console.error('解析扣款項目失敗:', error);
      return null;
    }
  }
  
  return deductions;
}

/**
 * 驗證管理員密碼
 * @param {string} pin 要驗證的密碼
 * @returns {Promise<boolean>} 密碼是否正確
 */
export async function verifyAdminPin(pin) {
  const settings = await getSettings();
  
  if (!settings) {
    return false;
  }
  
  return settings.admin_pin === pin;
}

/**
 * 獲取系統的基本工資設定
 * @returns {Promise<Object|null>} 基本工資設定
 */
export async function getSalarySettings() {
  const settings = await getSettings();
  
  if (!settings) {
    return null;
  }
  
  return {
    baseHourlyRate: settings.base_hourly_rate,
    ot1Multiplier: settings.ot1_multiplier,
    ot2Multiplier: settings.ot2_multiplier,
    baseMonthSalary: settings.base_month_salary,
    welfareAllowance: settings.welfare_allowance
  };
}

/**
 * 更新基本工資設定
 * @param {Object} salarySettings 基本工資設定
 * @returns {Promise<boolean>} 是否更新成功
 */
export async function updateSalarySettings(salarySettings) {
  const settings = await getSettings();
  
  if (!settings) {
    return false;
  }
  
  // 更新設定
  settings.base_hourly_rate = salarySettings.baseHourlyRate;
  settings.ot1_multiplier = salarySettings.ot1Multiplier;
  settings.ot2_multiplier = salarySettings.ot2Multiplier;
  settings.base_month_salary = salarySettings.baseMonthSalary;
  settings.welfare_allowance = salarySettings.welfareAllowance;
  
  // 保存設定
  return await updateSettingsInDatabase(settings);
}