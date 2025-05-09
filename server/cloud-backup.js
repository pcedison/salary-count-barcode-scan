/**
 * Google Drive 雲端備份工具
 * 
 * 功能：
 * 1. 將系統備份上傳到 Google Drive
 * 2. 管理多個備份版本
 * 3. 定期清理舊備份
 * 
 * 使用方式:
 * node server/cloud-backup.js backup    # 執行備份
 * node server/cloud-backup.js cleanup   # 清理舊備份
 * node server/cloud-backup.js restore   # 列出可還原的備份
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import zlib from 'zlib';
import { promisify } from 'util';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const CONFIG_DIR = path.join(ROOT_DIR, 'config');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'google-credentials.json');
const TOKEN_PATH = path.join(CONFIG_DIR, 'google-token.json');

// 備份配置
const BACKUP_CONFIG = {
  maxDailyBackups: 7,
  maxWeeklyBackups: 4,
  maxMonthlyBackups: 12,
  folderName: '系統備份',
};

// 需要的授權範圍
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// 日誌路徑
const LOG_DIR = path.join(ROOT_DIR, 'logs');
const BACKUP_LOG_PATH = path.join(LOG_DIR, 'cloud-backup.log');

// 確保日誌目錄存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 寫入日誌
function logMessage(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  fs.appendFileSync(BACKUP_LOG_PATH, logMessage);
  console.log(message);
}

/**
 * 獲取授權客戶端
 * @returns {Promise<google.auth.OAuth2|null>} OAuth2 客戶端
 */
async function getAuthClient() {
  try {
    // 檢查憑證是否存在
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      logMessage(`找不到 Google Drive API 憑證: ${CREDENTIALS_PATH}`);
      logMessage('請先運行 google-drive-auth.js 設置授權');
      return null;
    }
    
    // 檢查令牌是否存在
    if (!fs.existsSync(TOKEN_PATH)) {
      logMessage(`找不到 Google Drive API 令牌: ${TOKEN_PATH}`);
      logMessage('請先運行 google-drive-auth.js 進行授權');
      return null;
    }
    
    // 讀取憑證
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    
    // 創建 OAuth2 客戶端
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]
    );
    
    // 讀取令牌
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    
    return oAuth2Client;
  } catch (error) {
    logMessage(`獲取授權客戶端時出錯: ${error.message}`);
    return null;
  }
}

/**
 * 獲取或創建備份文件夾
 * @param {google.drive_v3.Drive} drive Drive API 客戶端
 * @returns {Promise<string|null>} 文件夾 ID
 */
async function getOrCreateBackupFolder(drive) {
  try {
    // 查詢備份文件夾
    const response = await drive.files.list({
      q: `name='${BACKUP_CONFIG.folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name)',
    });
    
    const folders = response.data.files;
    
    // 如果存在，返回第一個匹配的文件夾 ID
    if (folders && folders.length > 0) {
      logMessage(`找到備份文件夾: ${folders[0].name} (${folders[0].id})`);
      return folders[0].id;
    }
    
    // 否則創建新文件夾
    logMessage(`創建新的備份文件夾: ${BACKUP_CONFIG.folderName}`);
    const fileMetadata = {
      name: BACKUP_CONFIG.folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    
    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: 'id',
    });
    
    logMessage(`成功創建備份文件夾 (${folder.data.id})`);
    return folder.data.id;
  } catch (error) {
    logMessage(`獲取或創建備份文件夾時出錯: ${error.message}`);
    return null;
  }
}

/**
 * 壓縮數據
 * @param {string} data 要壓縮的數據
 * @returns {Promise<Buffer>} 壓縮後的數據
 */
async function compressData(data) {
  const gzip = promisify(zlib.gzip);
  return gzip(Buffer.from(data));
}

/**
 * 解壓數據
 * @param {Buffer} data 壓縮的數據
 * @returns {Promise<string>} 解壓後的數據
 */
async function decompressData(data) {
  const gunzip = promisify(zlib.gunzip);
  const buffer = await gunzip(data);
  return buffer.toString();
}

/**
 * 上傳備份到 Google Drive
 * @param {string} backupPath 備份文件路徑
 * @param {string} backupType 備份類型 (daily, weekly, monthly)
 * @returns {Promise<boolean>} 是否成功
 */
async function uploadBackup(backupPath, backupType = 'daily') {
  try {
    // 檢查備份文件是否存在
    if (!fs.existsSync(backupPath)) {
      logMessage(`備份文件不存在: ${backupPath}`);
      return false;
    }
    
    // 獲取授權客戶端
    const auth = await getAuthClient();
    if (!auth) {
      return false;
    }
    
    // 創建 Drive API 客戶端
    const drive = google.drive({ version: 'v3', auth });
    
    // 獲取備份文件夾
    const folderId = await getOrCreateBackupFolder(drive);
    if (!folderId) {
      return false;
    }
    
    // 讀取並壓縮備份文件
    const backupData = fs.readFileSync(backupPath, 'utf8');
    const compressedData = await compressData(backupData);
    
    // 生成備份文件名
    const date = new Date();
    const dateStr = date.toISOString().substring(0, 10);
    const timeStr = date.toISOString().substring(11, 19).replace(/:/g, '-');
    const fileName = `${backupType}_backup_${dateStr}_${timeStr}.json.gz`;
    
    // 創建上傳任務
    logMessage(`開始上傳備份: ${fileName}`);
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
      properties: {
        backupType,
        date: dateStr,
        time: timeStr,
      },
    };
    
    const media = {
      mimeType: 'application/gzip',
      body: fs.createReadStream(backupPath).pipe(zlib.createGzip()),
    };
    
    // 上傳文件
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name',
    });
    
    logMessage(`備份上傳成功: ${fileName} (${file.data.id})`);
    
    // 清理舊備份
    await cleanupOldBackups(drive, folderId, backupType);
    
    return true;
  } catch (error) {
    logMessage(`上傳備份時出錯: ${error.message}`);
    return false;
  }
}

/**
 * 清理舊備份
 * @param {google.drive_v3.Drive} drive Drive API 客戶端
 * @param {string} folderId 備份文件夾 ID
 * @param {string} backupType 備份類型
 * @returns {Promise<number>} 刪除的文件數量
 */
async function cleanupOldBackups(drive, folderId, backupType) {
  try {
    // 確定最大保留數量
    let maxBackups;
    switch (backupType) {
      case 'daily':
        maxBackups = BACKUP_CONFIG.maxDailyBackups;
        break;
      case 'weekly':
        maxBackups = BACKUP_CONFIG.maxWeeklyBackups;
        break;
      case 'monthly':
        maxBackups = BACKUP_CONFIG.maxMonthlyBackups;
        break;
      default:
        maxBackups = 5; // 默認值
    }
    
    // 獲取特定類型的備份列表
    const query = `'${folderId}' in parents and properties.backupType='${backupType}' and trashed=false`;
    const response = await drive.files.list({
      q: query,
      spaces: 'drive',
      orderBy: 'createdTime desc',
      fields: 'files(id, name, createdTime)',
    });
    
    const backups = response.data.files;
    
    // 如果備份數量超過最大值，刪除最舊的備份
    if (backups.length > maxBackups) {
      logMessage(`清理舊的 ${backupType} 備份，保留 ${maxBackups} 個，當前有 ${backups.length} 個`);
      
      // 對備份按創建時間排序
      backups.sort((a, b) => {
        return new Date(b.createdTime) - new Date(a.createdTime);
      });
      
      // 刪除最舊的備份
      const toDelete = backups.slice(maxBackups);
      
      for (const file of toDelete) {
        await drive.files.delete({ fileId: file.id });
        logMessage(`已刪除舊備份: ${file.name} (${file.id})`);
      }
      
      return toDelete.length;
    }
    
    return 0;
  } catch (error) {
    logMessage(`清理舊備份時出錯: ${error.message}`);
    return 0;
  }
}

/**
 * 列出可用的備份
 * @returns {Promise<Array|null>} 備份列表
 */
async function listBackups() {
  try {
    // 獲取授權客戶端
    const auth = await getAuthClient();
    if (!auth) {
      return null;
    }
    
    // 創建 Drive API 客戶端
    const drive = google.drive({ version: 'v3', auth });
    
    // 獲取備份文件夾
    const folderId = await getOrCreateBackupFolder(drive);
    if (!folderId) {
      return null;
    }
    
    // 獲取備份列表
    const query = `'${folderId}' in parents and trashed=false`;
    const response = await drive.files.list({
      q: query,
      spaces: 'drive',
      orderBy: 'createdTime desc',
      fields: 'files(id, name, createdTime, properties)',
    });
    
    const backups = response.data.files;
    
    if (backups.length === 0) {
      logMessage('沒有找到可用的備份');
      return [];
    }
    
    // 格式化備份信息
    const formatted = backups.map(backup => {
      const createdTime = new Date(backup.createdTime).toLocaleString();
      const type = backup.properties?.backupType || '未知';
      
      return {
        id: backup.id,
        name: backup.name,
        type: type,
        createdTime: createdTime,
        properties: backup.properties
      };
    });
    
    // 按類型和時間分組
    const grouped = {
      daily: formatted.filter(b => b.type === 'daily'),
      weekly: formatted.filter(b => b.type === 'weekly'),
      monthly: formatted.filter(b => b.type === 'monthly'),
      other: formatted.filter(b => !['daily', 'weekly', 'monthly'].includes(b.type))
    };
    
    // 打印備份信息
    logMessage(`找到 ${backups.length} 個備份:`);
    logMessage(`- 每日備份: ${grouped.daily.length} 個`);
    logMessage(`- 每週備份: ${grouped.weekly.length} 個`);
    logMessage(`- 每月備份: ${grouped.monthly.length} 個`);
    logMessage(`- 其他備份: ${grouped.other.length} 個`);
    
    return grouped;
  } catch (error) {
    logMessage(`列出備份時出錯: ${error.message}`);
    return null;
  }
}

/**
 * 下載備份
 * @param {string} fileId 備份文件 ID
 * @param {string} outputPath 輸出路徑
 * @returns {Promise<boolean>} 是否成功
 */
async function downloadBackup(fileId, outputPath) {
  try {
    // 獲取授權客戶端
    const auth = await getAuthClient();
    if (!auth) {
      return false;
    }
    
    // 創建 Drive API 客戶端
    const drive = google.drive({ version: 'v3', auth });
    
    // 獲取文件信息
    const file = await drive.files.get({
      fileId: fileId,
      fields: 'name',
    });
    
    logMessage(`開始下載備份: ${file.data.name}`);
    
    // 下載文件
    const response = await drive.files.get({
      fileId: fileId,
      alt: 'media',
    }, { responseType: 'stream' });
    
    // 創建輸出流
    const destPath = outputPath || path.join(ROOT_DIR, 'restore', file.data.name);
    const destDir = path.dirname(destPath);
    
    // 確保目標目錄存在
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // 如果檔案名以 .gz 結尾，則解壓縮
    if (destPath.endsWith('.gz')) {
      const uncompressedPath = destPath.slice(0, -3); // 移除 .gz
      const dest = fs.createWriteStream(uncompressedPath);
      const gunzip = zlib.createGunzip();
      
      response.data
        .pipe(gunzip)
        .pipe(dest);
      
      return new Promise((resolve, reject) => {
        dest.on('finish', () => {
          logMessage(`備份已下載並解壓縮到: ${uncompressedPath}`);
          resolve(true);
        });
        
        dest.on('error', (error) => {
          logMessage(`下載備份時出錯: ${error.message}`);
          reject(error);
        });
      });
    } else {
      // 直接保存
      const dest = fs.createWriteStream(destPath);
      
      response.data.pipe(dest);
      
      return new Promise((resolve, reject) => {
        dest.on('finish', () => {
          logMessage(`備份已下載到: ${destPath}`);
          resolve(true);
        });
        
        dest.on('error', (error) => {
          logMessage(`下載備份時出錯: ${error.message}`);
          reject(error);
        });
      });
    }
  } catch (error) {
    logMessage(`下載備份時出錯: ${error.message}`);
    return false;
  }
}

/**
 * 主函數
 */
async function main() {
  const action = process.argv[2] || 'help';
  
  switch (action) {
    case 'backup': {
      // 獲取備份路徑和類型
      const backupPath = process.argv[3] || path.join(ROOT_DIR, 'backup.json');
      const backupType = process.argv[4] || 'daily';
      
      if (!['daily', 'weekly', 'monthly'].includes(backupType)) {
        logMessage('無效的備份類型，有效值為: daily, weekly, monthly');
        return;
      }
      
      // 執行備份
      const success = await uploadBackup(backupPath, backupType);
      if (success) {
        logMessage(`${backupType} 備份已成功上傳到 Google Drive`);
      } else {
        logMessage(`${backupType} 備份上傳失敗`);
      }
      break;
    }
    
    case 'cleanup':
      // 列出備份
      const backups = await listBackups();
      
      if (!backups) {
        logMessage('無法獲取備份列表');
        return;
      }
      
      // 獲取授權客戶端
      const auth = await getAuthClient();
      if (!auth) {
        return;
      }
      
      // 創建 Drive API 客戶端
      const drive = google.drive({ version: 'v3', auth });
      
      // 獲取備份文件夾
      const folderId = await getOrCreateBackupFolder(drive);
      if (!folderId) {
        return;
      }
      
      // 清理每種類型的備份
      for (const type of ['daily', 'weekly', 'monthly']) {
        const deleted = await cleanupOldBackups(drive, folderId, type);
        logMessage(`清理了 ${deleted} 個舊的 ${type} 備份`);
      }
      break;
    
    case 'restore':
      // 列出備份
      await listBackups();
      
      // 說明如何使用
      logMessage('\n如何還原備份:');
      logMessage('1. 選擇要還原的備份 ID');
      logMessage('2. 運行命令: node server/cloud-backup.js download <backup_id> [output_path]');
      logMessage('3. 使用下載的備份文件運行還原腳本');
      break;
    
    case 'download': {
      // 獲取備份 ID 和輸出路徑
      const fileId = process.argv[3];
      const outputPath = process.argv[4];
      
      if (!fileId) {
        logMessage('缺少備份 ID，請指定要下載的備份 ID');
        return;
      }
      
      // 下載備份
      const success = await downloadBackup(fileId, outputPath);
      if (success) {
        logMessage('備份下載成功');
      } else {
        logMessage('備份下載失敗');
      }
      break;
    }
    
    case 'help':
    default:
      logMessage('Google Drive 雲端備份工具');
      logMessage('用法:');
      logMessage('  node server/cloud-backup.js backup [backup_path] [backup_type]  # 上傳備份到 Google Drive');
      logMessage('  node server/cloud-backup.js cleanup                            # 清理舊備份');
      logMessage('  node server/cloud-backup.js restore                           # 列出可還原的備份');
      logMessage('  node server/cloud-backup.js download <backup_id> [output_path] # 下載備份');
      logMessage('  node server/cloud-backup.js help                              # 顯示幫助信息');
      break;
  }
}

// 如果直接運行腳本，執行主函數
if (process.argv[1].endsWith('cloud-backup.js')) {
  main()
    .catch(error => {
      console.error('執行過程中發生錯誤:', error);
      process.exit(1);
    });
}