/**
 * 設定同步工具
 * 
 * 此腳本從資料庫中提取當前設定並保存到文件，
 * 或從文件還原設定到資料庫
 * 
 * 使用方式:
 * - node settings-sync.js backup  # 備份設定到文件
 * - node settings-sync.js restore # 從文件還原設定
 * - node settings-sync.js sync    # 雙向同步（預設）
 */

import { 
  syncSettings, 
  getSettingsFromDatabase, 
  getSettingsFromFile,
  saveSettingsToFile,
  updateSettingsInDatabase
} from './settings-persistence.js';

// 驗證設定是否完整有效
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

// 獲取命令行參數
const command = process.argv[2] || 'sync';

// 執行指定的操作
async function main() {
  try {
    switch (command) {
      case 'backup':
        await backupSettings();
        break;
      case 'restore':
        await restoreSettings();
        break;
      case 'sync':
      default:
        await syncSettings();
        break;
    }
  } catch (error) {
    console.error('執行設定同步時出錯:', error);
    process.exit(1);
  }
}

/**
 * 備份設定到文件
 */
async function backupSettings() {
  console.log('正在備份設定到文件...');
  const settings = await getSettingsFromDatabase();
  
  if (!settings) {
    console.error('無法從資料庫獲取設定，備份失敗');
    process.exit(1);
  }
  
  if (!validateSettings(settings)) {
    console.warn('資料庫中的設定不完整或無效');
    // 嘗試從檔案中讀取現有的設定
    const fileSettings = getSettingsFromFile();
    
    if (fileSettings && validateSettings(fileSettings)) {
      console.log('文件中已有有效設定，保留現有備份');
    } else {
      console.warn('即使設定不完整，仍進行備份');
      saveSettingsToFile(settings);
    }
  } else {
    saveSettingsToFile(settings);
    console.log('設定備份成功');
  }
}

/**
 * 從文件還原設定到資料庫
 */
async function restoreSettings() {
  console.log('正在從文件還原設定到資料庫...');
  const settings = getSettingsFromFile();
  
  if (!settings) {
    console.error('無法從文件獲取設定，還原失敗');
    process.exit(1);
  }
  
  if (!validateSettings(settings)) {
    console.error('文件中的設定不完整或無效，還原失敗');
    process.exit(1);
  }
  
  const success = await updateSettingsInDatabase(settings);
  
  if (success) {
    console.log('設定還原成功');
    
    // 顯示還原的設定摘要
    console.log('已還原的設定:');
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
    
    console.log('- 管理員密碼已更新');
  } else {
    console.error('設定還原失敗');
    process.exit(1);
  }
}

// 執行主函數
main();