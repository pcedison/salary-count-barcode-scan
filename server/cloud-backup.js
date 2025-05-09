/**
 * 外部雲端備份工具
 * 
 * 功能：
 * 1. 自動將備份文件上傳到 Google Drive
 * 2. 實現定期備份排程
 * 3. 管理雲端備份的生命週期
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const BACKUPS_DIR = path.join(__dirname, '..', 'backups');
const CREDENTIALS_PATH = path.join(__dirname, '..', 'config', 'google-credentials.json');
const TOKEN_PATH = path.join(__dirname, '..', 'config', 'google-token.json');

// 確保配置目錄存在
if (!fs.existsSync(path.dirname(CREDENTIALS_PATH))) {
  fs.mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });
}

/**
 * 格式化日期為 YYYY-MM-DD 格式
 * @param {Date} date 日期對象
 * @returns {string} 格式化的日期字串
 */
function formatDate(date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

/**
 * 獲取 Google Drive API 客戶端
 * @returns {Promise<google.drive.Drive>} Google Drive API 客戶端
 */
async function getDriveClient() {
  // 檢查是否有憑證文件
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`Google Drive 憑證文件不存在: ${CREDENTIALS_PATH}`);
  }

  // 讀取憑證
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  
  // 設置 OAuth2 客戶端
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]
  );

  // 檢查是否有 token
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(`Google Drive token 文件不存在，請先執行授權流程`);
  }

  // 讀取 token
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  oAuth2Client.setCredentials(token);

  // 創建 Drive 客戶端
  return google.drive({ version: 'v3', auth: oAuth2Client });
}

/**
 * 獲取或創建備份資料夾
 * @param {google.drive.Drive} drive Google Drive API 客戶端
 * @param {string} folderName 資料夾名稱
 * @returns {Promise<string>} 資料夾 ID
 */
async function getFolderIdByName(drive, folderName) {
  try {
    // 查詢是否已存在同名資料夾
    const response = await drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    // 如果找到資料夾，返回第一個
    if (response.data.files.length > 0) {
      return response.data.files[0].id;
    }

    // 如果沒有找到，創建一個新資料夾
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      fields: 'id'
    });

    return file.data.id;
  } catch (error) {
    console.error('獲取或創建資料夾時出錯:', error);
    throw error;
  }
}

/**
 * 上傳文件到 Google Drive
 * @param {google.drive.Drive} drive Google Drive API 客戶端
 * @param {string} filePath 本地文件路徑
 * @param {string} folderId 目標資料夾 ID
 * @returns {Promise<Object>} 上傳結果
 */
async function uploadFile(drive, filePath, folderId) {
  try {
    const fileName = path.basename(filePath);
    
    // 檢查文件是否已存在
    const response = await drive.files.list({
      q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, modifiedTime)',
      spaces: 'drive'
    });

    // 如果文件已存在
    if (response.data.files.length > 0) {
      const existingFile = response.data.files[0];
      const existingFileTime = new Date(existingFile.modifiedTime);
      const localFileTime = fs.statSync(filePath).mtime;
      
      // 如果本地文件較新，更新雲端文件
      if (localFileTime > existingFileTime) {
        await drive.files.update({
          fileId: existingFile.id,
          media: {
            body: fs.createReadStream(filePath)
          }
        });
        
        return {
          success: true,
          fileId: existingFile.id,
          fileName,
          updated: true
        };
      }
      
      // 本地文件不比雲端新，跳過上傳
      return {
        success: true,
        fileId: existingFile.id,
        fileName,
        updated: false,
        skipped: true
      };
    }

    // 上傳新文件
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    const media = {
      body: fs.createReadStream(filePath)
    };

    const file = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id'
    });

    return {
      success: true,
      fileId: file.data.id,
      fileName,
      created: true
    };
  } catch (error) {
    console.error(`上傳文件 ${filePath} 時出錯:`, error);
    return {
      success: false,
      fileName: path.basename(filePath),
      error: error.message
    };
  }
}

/**
 * 備份文件格式說明
 * 
 * 備份文件是 JSON 格式，包含以下內容：
 * 1. metadata - 備份元數據
 *    - id - 備份ID
 *    - type - 備份類型（daily, weekly, monthly, manual）
 *    - createdAt - 創建時間
 *    - version - 版本號
 * 2. employees - 員工資料數組
 * 3. salaryRecords - 薪資記錄數組
 * 4. attendance - 考勤記錄數組
 * 5. holidays - 假期記錄數組
 * 6. settings - 系統設定
 */

/**
 * 獲取待備份的文件
 * @param {Object} options 選項
 * @param {string} options.type 備份類型 (all, daily, weekly, monthly, manual)
 * @param {number} options.days 最近幾天內創建的備份
 * @returns {Array<string>} 文件路徑數組
 */
function getBackupFiles(options = {}) {
  const { type = 'all', days = 7 } = options;
  
  // 確保備份目錄存在
  if (!fs.existsSync(BACKUPS_DIR)) {
    console.warn(`備份目錄不存在: ${BACKUPS_DIR}`);
    return [];
  }
  
  // 定義要查找的目錄
  const directories = [];
  if (type === 'all') {
    directories.push('daily', 'weekly', 'monthly', 'manual');
  } else {
    directories.push(type);
  }
  
  // 計算日期範圍
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  // 收集符合條件的文件
  const files = [];
  
  for (const dir of directories) {
    const dirPath = path.join(BACKUPS_DIR, dir);
    
    if (!fs.existsSync(dirPath)) {
      continue;
    }
    
    // 獲取目錄中的所有 JSON 文件
    const dirFiles = fs.readdirSync(dirPath)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        return { path: filePath, mtime: stats.mtime };
      })
      .filter(fileInfo => fileInfo.mtime >= cutoffDate)
      .map(fileInfo => fileInfo.path);
    
    files.push(...dirFiles);
  }
  
  return files;
}

/**
 * 清理舊的雲端備份
 * @param {google.drive.Drive} drive Google Drive API 客戶端
 * @param {string} folderId 資料夾 ID
 * @param {Object} options 選項
 * @param {number} options.keepDays 保留天數
 * @returns {Promise<Array>} 已刪除的文件
 */
async function cleanupOldCloudBackups(drive, folderId, options = {}) {
  const { keepDays = 30 } = options;
  
  try {
    // 計算截止日期
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    const cutoffTime = cutoffDate.toISOString();
    
    // 查詢舊文件
    const response = await drive.files.list({
      q: `'${folderId}' in parents and modifiedTime < '${cutoffTime}' and trashed=false`,
      fields: 'files(id, name, modifiedTime)',
      spaces: 'drive'
    });
    
    const oldFiles = response.data.files;
    const deletedFiles = [];
    
    // 刪除舊文件
    for (const file of oldFiles) {
      try {
        await drive.files.delete({
          fileId: file.id
        });
        
        deletedFiles.push({
          id: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime
        });
        
        console.log(`已刪除舊的雲端備份文件: ${file.name}`);
      } catch (error) {
        console.error(`刪除雲端文件 ${file.name} 時出錯:`, error);
      }
    }
    
    return deletedFiles;
  } catch (error) {
    console.error('清理舊的雲端備份時出錯:', error);
    return [];
  }
}

/**
 * 執行雲端備份
 * @param {Object} options 選項
 * @param {string} options.backupType 備份類型 (all, daily, weekly, monthly, manual)
 * @param {number} options.recentDays 最近幾天內創建的備份
 * @param {number} options.keepDays 在雲端保留多少天
 * @param {boolean} options.cleanupOld 是否清理舊備份
 * @returns {Promise<Object>} 備份結果
 */
export async function runCloudBackup(options = {}) {
  const {
    backupType = 'all',
    recentDays = 7,
    keepDays = 30,
    cleanupOld = true
  } = options;
  
  try {
    console.log(`開始執行雲端備份 (類型: ${backupType}, 最近 ${recentDays} 天)...`);
    
    // 獲取備份文件
    const backupFiles = getBackupFiles({
      type: backupType,
      days: recentDays
    });
    
    if (backupFiles.length === 0) {
      console.log('沒有找到符合條件的備份文件');
      return { success: false, error: '沒有找到備份文件' };
    }
    
    console.log(`找到 ${backupFiles.length} 個備份文件`);
    
    // 獲取 Google Drive 客戶端
    const drive = await getDriveClient();
    
    // 獲取或創建備份資料夾
    const folderName = `系統備份_${formatDate(new Date())}`;
    const folderId = await getFolderIdByName(drive, folderName);
    
    console.log(`使用雲端資料夾: ${folderName} (ID: ${folderId})`);
    
    // 上傳文件
    const results = [];
    
    for (const filePath of backupFiles) {
      console.log(`正在上傳: ${path.basename(filePath)}`);
      const result = await uploadFile(drive, filePath, folderId);
      results.push(result);
    }
    
    // 統計結果
    const stats = {
      total: results.length,
      success: results.filter(r => r.success).length,
      created: results.filter(r => r.created).length,
      updated: results.filter(r => r.updated).length,
      skipped: results.filter(r => r.skipped).length,
      failed: results.filter(r => !r.success).length
    };
    
    console.log(`雲端備份統計: 總計 ${stats.total}, 成功 ${stats.success}, 創建 ${stats.created}, 更新 ${stats.updated}, 跳過 ${stats.skipped}, 失敗 ${stats.failed}`);
    
    // 清理舊備份
    let cleanupResults = [];
    if (cleanupOld) {
      console.log(`清理超過 ${keepDays} 天的舊雲端備份...`);
      cleanupResults = await cleanupOldCloudBackups(drive, folderId, { keepDays });
      console.log(`已清理 ${cleanupResults.length} 個舊的雲端備份文件`);
    }
    
    return {
      success: true,
      stats,
      folderId,
      folderName,
      results,
      cleanupResults
    };
  } catch (error) {
    console.error('執行雲端備份時出錯:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 設置定期雲端備份
 * @param {Object} options 選項
 * @param {number} options.intervalDays 備份間隔（天）
 * @param {string} options.backupType 備份類型 (all, daily, weekly, monthly, manual)
 * @param {number} options.recentDays 最近幾天內創建的備份
 * @param {number} options.keepDays 在雲端保留多少天
 * @param {boolean} options.cleanupOld 是否清理舊備份
 * @returns {NodeJS.Timeout} 定時器ID
 */
export function scheduleCloudBackup(options = {}) {
  const {
    intervalDays = 1,
    backupType = 'all',
    recentDays = 1,
    keepDays = 30,
    cleanupOld = true
  } = options;
  
  console.log(`設置定期雲端備份，每 ${intervalDays} 天執行一次`);
  
  // 立即執行一次
  runCloudBackup({ backupType, recentDays, keepDays, cleanupOld });
  
  // 設置定期任務
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
  return setInterval(() => {
    runCloudBackup({ backupType, recentDays, keepDays, cleanupOld });
  }, intervalMs);
}

/**
 * Google Drive 授權指南
 * 
 * 要使用 Google Drive API，您需要：
 * 1. 創建 Google Cloud 專案
 * 2. 啟用 Google Drive API
 * 3. 創建 OAuth 2.0 憑證
 * 4. 下載憑證並保存為 config/google-credentials.json
 * 5. 執行授權流程獲取 token
 * 
 * 詳細請參考 Google Drive API 文檔：
 * https://developers.google.com/drive/api/v3/quickstart/nodejs
 */

// 如果直接運行腳本，執行一次備份
if (process.argv[1].endsWith('cloud-backup.js')) {
  const backupType = process.argv[2] || 'all';
  const recentDays = process.argv[3] ? parseInt(process.argv[3]) : 7;
  
  runCloudBackup({ backupType, recentDays })
    .then(result => {
      if (result.success) {
        console.log('雲端備份完成');
      } else {
        console.error('雲端備份失敗:', result.error);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('執行雲端備份時發生錯誤:', error);
      process.exit(1);
    });
}