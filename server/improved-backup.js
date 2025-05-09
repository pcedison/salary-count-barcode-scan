/**
 * 改進的備份系統
 * 
 * 功能：
 * 1. 實現智能備份保留策略
 * 2. 防止刪除重要的歷史備份
 * 3. 在刪除備份前進行數據完整性檢查
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getRetentionPolicy } from './db-config.js';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 備份目錄
const BACKUPS_DIR = path.join(__dirname, '..', 'backups');

/**
 * 備份類型定義
 */
export const BackupType = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  MANUAL: 'manual'
};

/**
 * 確保備份目錄存在
 * @returns {boolean} 是否成功
 */
function ensureBackupDirectories() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    
    // 確保各類型目錄存在
    for (const type of Object.values(BackupType)) {
      const typeDir = path.join(BACKUPS_DIR, type);
      if (!fs.existsSync(typeDir)) {
        fs.mkdirSync(typeDir, { recursive: true });
      }
    }
    
    return true;
  } catch (error) {
    console.error('創建備份目錄時出錯:', error);
    return false;
  }
}

/**
 * 獲取備份列表
 * @param {string} type 備份類型
 * @returns {Array} 備份列表
 */
export function getBackups(type = null) {
  try {
    ensureBackupDirectories();
    
    let backups = [];
    
    // 如果指定了類型，只獲取該類型的備份
    if (type) {
      const typeDir = path.join(BACKUPS_DIR, type);
      backups = getBackupsFromDirectory(typeDir, type);
    } else {
      // 否則獲取所有類型的備份
      for (const t of Object.values(BackupType)) {
        const typeDir = path.join(BACKUPS_DIR, t);
        backups = [...backups, ...getBackupsFromDirectory(typeDir, t)];
      }
    }
    
    // 按時間排序，最新的在前
    return backups.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('獲取備份列表時出錯:', error);
    return [];
  }
}

/**
 * 從指定目錄獲取備份
 * @param {string} dir 目錄路徑
 * @param {string} type 備份類型
 * @returns {Array} 備份列表
 */
function getBackupsFromDirectory(dir, type) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      try {
        // 嘗試讀取備份文件以獲取元數據
        const backupData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const metadata = backupData.metadata || {};
        
        return {
          id: file.replace('.json', ''),
          type,
          path: filePath,
          timestamp: new Date(metadata.createdAt || stats.mtime),
          size: stats.size,
          metadata
        };
      } catch (error) {
        // 如果讀取失敗，使用文件統計信息
        return {
          id: file.replace('.json', ''),
          type,
          path: filePath,
          timestamp: new Date(stats.mtime),
          size: stats.size,
          metadata: {}
        };
      }
    });
}

/**
 * 計算文件的校驗和
 * @param {string} filePath 文件路徑
 * @returns {string} 校驗和
 */
function calculateChecksum(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    console.error('計算校驗和時出錯:', error);
    return null;
  }
}

/**
 * 驗證備份數據
 * @param {string} filePath 備份文件路徑
 * @returns {Object} 驗證結果
 */
function validateBackup(filePath) {
  try {
    // 檢查文件是否存在
    if (!fs.existsSync(filePath)) {
      return { valid: false, reason: '文件不存在' };
    }
    
    // 讀取備份數據
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // 基本驗證
    if (!data) {
      return { valid: false, reason: '無效的 JSON 文件' };
    }
    
    // 檢查是否包含必要的數據
    const requiredSections = ['metadata', 'employees', 'salaryRecords', 'settings'];
    for (const section of requiredSections) {
      if (!data[section]) {
        return { valid: false, reason: `缺少必要部分: ${section}` };
      }
    }
    
    // 檢查是否包含薪資記錄
    if (data.salaryRecords.length === 0) {
      return { valid: false, reason: '備份不包含薪資記錄' };
    }
    
    // 檢查設定是否完整
    if (!data.settings || !data.settings.base_hourly_rate || !data.settings.ot1_multiplier || !data.settings.ot2_multiplier) {
      return { valid: false, reason: '設定數據不完整' };
    }
    
    // 計算校驗和
    const checksum = calculateChecksum(filePath);
    
    return { 
      valid: true, 
      checksum,
      recordCount: {
        employees: data.employees.length,
        salaryRecords: data.salaryRecords.length,
        attendance: (data.attendance || []).length,
        holidays: (data.holidays || []).length
      }
    };
  } catch (error) {
    console.error('驗證備份時出錯:', error);
    return { valid: false, reason: `驗證出錯: ${error.message}` };
  }
}

/**
 * 創建備份
 * @param {string} type 備份類型
 * @param {Object} data 備份數據
 * @returns {Object} 創建結果
 */
export function createBackup(type, data) {
  try {
    if (!Object.values(BackupType).includes(type)) {
      return { success: false, error: `無效的備份類型: ${type}` };
    }
    
    ensureBackupDirectories();
    
    // 生成備份 ID
    const timestamp = new Date();
    const backupId = `backup-${timestamp.toISOString().replace(/:/g, '-')}`;
    const typeDir = path.join(BACKUPS_DIR, type);
    const filePath = path.join(typeDir, `${backupId}.json`);
    
    // 添加元數據
    const backupData = {
      ...data,
      metadata: {
        id: backupId,
        type,
        createdAt: timestamp.toISOString(),
        version: '2.0'
      }
    };
    
    // 寫入文件
    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
    
    // 驗證備份
    const validation = validateBackup(filePath);
    
    if (!validation.valid) {
      // 如果驗證失敗，刪除備份
      fs.unlinkSync(filePath);
      return { success: false, error: `備份驗證失敗: ${validation.reason}` };
    }
    
    // 清理舊備份
    cleanupOldBackups(type);
    
    return { 
      success: true, 
      id: backupId, 
      path: filePath,
      checksum: validation.checksum,
      recordCount: validation.recordCount
    };
  } catch (error) {
    console.error('創建備份時出錯:', error);
    return { success: false, error: `創建備份時出錯: ${error.message}` };
  }
}

/**
 * 智能清理舊備份
 * @param {string} type 備份類型
 * @returns {Array} 已刪除的備份
 */
export function cleanupOldBackups(type) {
  try {
    // 獲取保留策略
    const policy = getRetentionPolicy();
    
    // 獲取保留數量
    const retentionCount = policy[type] || 7; // 默認保留 7 個
    
    // 獲取備份列表
    const backups = getBackups(type);
    
    if (backups.length <= retentionCount) {
      // 備份數量未超過保留限制，不需要清理
      return [];
    }
    
    // 要刪除的備份
    const backupsToDelete = backups.slice(retentionCount);
    const deletedBackups = [];
    
    for (const backup of backupsToDelete) {
      // 驗證備份
      const validation = validateBackup(backup.path);
      
      if (validation.valid) {
        // 如果是有效的備份，先檢查是否有更新的有效備份
        // 這是為了確保至少保留一個有效備份
        let hasNewerValidBackup = false;
        
        for (let i = 0; i < retentionCount; i++) {
          if (i < backups.length) {
            const newerBackup = backups[i];
            const newerValidation = validateBackup(newerBackup.path);
            
            if (newerValidation.valid) {
              hasNewerValidBackup = true;
              break;
            }
          }
        }
        
        if (!hasNewerValidBackup) {
          // 如果沒有更新的有效備份，保留這個備份
          console.log(`保留備份 ${backup.id} 作為最後的有效備份`);
          continue;
        }
      }
      
      // 刪除備份
      fs.unlinkSync(backup.path);
      console.log(`已刪除舊備份：${backup.path}`);
      deletedBackups.push(backup);
    }
    
    return deletedBackups;
  } catch (error) {
    console.error('清理舊備份時出錯:', error);
    return [];
  }
}

/**
 * 刪除備份
 * @param {string} backupId 備份 ID
 * @param {string} type 備份類型
 * @returns {boolean} 是否刪除成功
 */
export function deleteBackup(backupId, type = null) {
  try {
    // 找到備份
    let backup = null;
    
    if (type) {
      // 如果指定了類型，直接在該類型目錄中查找
      const filePath = path.join(BACKUPS_DIR, type, `${backupId}.json`);
      
      if (fs.existsSync(filePath)) {
        backup = { id: backupId, path: filePath, type };
      }
    } else {
      // 否則在所有類型目錄中查找
      const backups = getBackups();
      backup = backups.find(b => b.id === backupId);
    }
    
    if (!backup) {
      console.error(`找不到備份 ${backupId}`);
      return false;
    }
    
    // 驗證備份
    const validation = validateBackup(backup.path);
    
    if (validation.valid) {
      // 獲取該類型的所有備份
      const backups = getBackups(backup.type);
      
      // 檢查是否至少有兩個有效備份
      let validBackupsCount = 0;
      
      for (const b of backups) {
        if (b.id !== backupId) {
          const v = validateBackup(b.path);
          if (v.valid) {
            validBackupsCount++;
          }
        }
      }
      
      if (validBackupsCount === 0) {
        console.error(`無法刪除備份 ${backupId}，這是唯一一個有效的備份`);
        return false;
      }
    }
    
    // 刪除備份
    fs.unlinkSync(backup.path);
    console.log(`已刪除備份 ${backupId}`);
    return true;
  } catch (error) {
    console.error(`刪除備份 ${backupId} 時出錯:`, error);
    return false;
  }
}

/**
 * 從備份還原
 * @param {string} backupId 備份 ID
 * @param {string} type 備份類型
 * @returns {Object} 還原結果
 */
export function restoreFromBackup(backupId, type = null) {
  try {
    // 找到備份
    let backupPath = null;
    
    if (type) {
      // 如果指定了類型，直接在該類型目錄中查找
      backupPath = path.join(BACKUPS_DIR, type, `${backupId}.json`);
      
      if (!fs.existsSync(backupPath)) {
        return { success: false, error: `找不到備份 ${backupId}` };
      }
    } else {
      // 否則在所有類型目錄中查找
      const backups = getBackups();
      const backup = backups.find(b => b.id === backupId);
      
      if (!backup) {
        return { success: false, error: `找不到備份 ${backupId}` };
      }
      
      backupPath = backup.path;
    }
    
    // 驗證備份
    const validation = validateBackup(backupPath);
    
    if (!validation.valid) {
      return { success: false, error: `備份無效: ${validation.reason}` };
    }
    
    // 讀取備份數據
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    
    return { 
      success: true, 
      data: backupData,
      checksum: validation.checksum,
      recordCount: validation.recordCount
    };
  } catch (error) {
    console.error(`從備份 ${backupId} 還原時出錯:`, error);
    return { success: false, error: `還原時出錯: ${error.message}` };
  }
}

// 確保備份目錄存在
ensureBackupDirectories();