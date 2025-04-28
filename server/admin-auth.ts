/**
 * 管理員權限與認證增強模組
 * 
 * 實現管理員權限分級、多因素認證、操作日誌記錄等安全功能
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { storage } from './storage';

// 操作日誌目錄
const AUDIT_LOG_DIR = path.join(process.cwd(), 'logs');

// 確保日誌目錄存在
if (!fs.existsSync(AUDIT_LOG_DIR)) {
  fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
}

// 權限級別定義
export enum PermissionLevel {
  BASIC = 1,    // 基本權限 - 查看
  STANDARD = 2, // 標準權限 - 查看、添加、編輯
  ADMIN = 3,    // 管理員權限 - 標準 + 刪除
  SUPER = 4     // 超級管理員 - 系統設置、資料庫操作
}

// 操作類型定義
export enum OperationType {
  VIEW = 'view',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DB_CONFIG = 'db_config',
  SYSTEM_CONFIG = 'system_config',
  BACKUP = 'backup',
  RESTORE = 'restore',
  LOGIN = 'login',
  LOGOUT = 'logout'
}

// 操作日誌結構
interface AuditLog {
  timestamp: number;
  operation: OperationType;
  userId?: string;
  userName?: string;
  details: string;
  ip?: string;
  success: boolean;
  errorMessage?: string;
}

// 一次性驗證碼
interface OTP {
  code: string;
  expiresAt: number;
  userId: string;
}

// 存儲活動的一次性驗證碼
const activeOTPs: OTP[] = [];

/**
 * 生成隨機的一次性驗證碼
 */
export function generateOTP(userId: string, expiresInMinutes = 5): string {
  // 生成6位數字驗證碼
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  // 設置過期時間
  const expiresAt = Date.now() + (expiresInMinutes * 60 * 1000);
  
  // 清理該用戶之前的OTP
  const userIndex = activeOTPs.findIndex(otp => otp.userId === userId);
  if (userIndex !== -1) {
    activeOTPs.splice(userIndex, 1);
  }
  
  // 存儲新OTP
  activeOTPs.push({ code, expiresAt, userId });
  
  // 清理過期的OTP
  cleanupExpiredOTPs();
  
  return code;
}

/**
 * 驗證一次性驗證碼
 */
export function verifyOTP(userId: string, code: string): boolean {
  // 清理過期的OTP
  cleanupExpiredOTPs();
  
  // 查找並驗證OTP
  const otpIndex = activeOTPs.findIndex(
    otp => otp.userId === userId && otp.code === code && otp.expiresAt > Date.now()
  );
  
  if (otpIndex !== -1) {
    // 使用後立即刪除OTP
    activeOTPs.splice(otpIndex, 1);
    return true;
  }
  
  return false;
}

/**
 * 清理過期的OTP
 */
function cleanupExpiredOTPs() {
  const now = Date.now();
  for (let i = activeOTPs.length - 1; i >= 0; i--) {
    if (activeOTPs[i].expiresAt < now) {
      activeOTPs.splice(i, 1);
    }
  }
}

/**
 * 驗證管理員權限
 */
export async function verifyAdminPermission(
  pin: string,
  requiredLevel: PermissionLevel = PermissionLevel.ADMIN
): Promise<boolean> {
  try {
    const settings = await storage.getSettings();
    
    if (!settings || !settings.adminPin) {
      return false;
    }
    
    // 基本PIN碼驗證
    const isPinValid = settings.adminPin === pin;
    
    // 這裡可以擴展為根據用戶ID或其他標識符檢查不同的權限級別
    // 在此簡化版本中，我們假定正確的PIN碼具有最高權限
    
    return isPinValid;
  } catch (error) {
    console.error('驗證管理員權限失敗：', error);
    return false;
  }
}

/**
 * 驗證多因素認證
 */
export async function verifyMFA(pin: string, otpCode: string): Promise<boolean> {
  try {
    // 首先驗證PIN碼
    const isPinValid = await verifyAdminPermission(pin);
    
    if (!isPinValid) {
      return false;
    }
    
    // 再驗證OTP
    // 在實際應用中，我們需要一個用戶ID，這裡使用固定的'admin'
    const userId = 'admin';
    
    return verifyOTP(userId, otpCode);
  } catch (error) {
    console.error('驗證多因素認證失敗：', error);
    return false;
  }
}

/**
 * 記錄操作日誌
 */
export function logOperation(
  operation: OperationType,
  details: string,
  options?: {
    userId?: string;
    userName?: string;
    ip?: string;
    success?: boolean;
    errorMessage?: string;
  }
): void {
  const timestamp = Date.now();
  const log: AuditLog = {
    timestamp,
    operation,
    details,
    success: options?.success !== undefined ? options.success : true,
    ...options
  };
  
  // 日誌文件名格式：YYYY-MM-DD.log
  const date = new Date(timestamp);
  const fileName = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}.log`;
  const logPath = path.join(AUDIT_LOG_DIR, fileName);
  
  // 寫入日誌
  try {
    const logString = JSON.stringify(log) + '\n';
    fs.appendFileSync(logPath, logString);
    
    // 控制台也顯示重要操作
    if (
      operation === OperationType.DB_CONFIG ||
      operation === OperationType.SYSTEM_CONFIG ||
      operation === OperationType.BACKUP ||
      operation === OperationType.RESTORE ||
      !log.success
    ) {
      console.log(`[操作日誌] ${new Date(timestamp).toLocaleString()} ${operation}: ${details}${log.success ? '' : ' (失敗)'}`);
    }
  } catch (error) {
    console.error('寫入操作日誌失敗：', error);
  }
}

/**
 * 獲取操作日誌
 */
export function getOperationLogs(date?: Date, filterType?: OperationType): AuditLog[] {
  try {
    // 如果沒有指定日期，使用今天
    const targetDate = date || new Date();
    const fileName = `${targetDate.getFullYear()}-${(targetDate.getMonth() + 1).toString().padStart(2, '0')}-${targetDate.getDate().toString().padStart(2, '0')}.log`;
    const logPath = path.join(AUDIT_LOG_DIR, fileName);
    
    if (!fs.existsSync(logPath)) {
      return [];
    }
    
    // 讀取日誌文件
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    let logs: AuditLog[] = [];
    
    for (const line of lines) {
      try {
        const log = JSON.parse(line) as AuditLog;
        logs.push(log);
      } catch (err) {
        console.error('解析日誌行失敗：', line, err);
      }
    }
    
    // 如果指定了過濾類型，進行過濾
    if (filterType) {
      logs = logs.filter(log => log.operation === filterType);
    }
    
    // 按時間戳降序排序
    logs.sort((a, b) => b.timestamp - a.timestamp);
    
    return logs;
  } catch (error) {
    console.error('獲取操作日誌失敗：', error);
    return [];
  }
}

/**
 * 獲取可用的日誌日期列表
 */
export function getAvailableLogDates(): { date: Date; count: number }[] {
  try {
    const files = fs.readdirSync(AUDIT_LOG_DIR)
      .filter(file => file.endsWith('.log'));
    
    return files.map(file => {
      const [year, month, day] = file.replace('.log', '').split('-').map(Number);
      const date = new Date(year, month - 1, day);
      
      // 簡單計算該文件中的日誌條數
      const content = fs.readFileSync(path.join(AUDIT_LOG_DIR, file), 'utf8');
      const count = content.split('\n').filter(line => line.trim()).length;
      
      return { date, count };
    }).sort((a, b) => b.date.getTime() - a.date.getTime());
  } catch (error) {
    console.error('獲取可用日誌日期失敗：', error);
    return [];
  }
}

/**
 * 獲取指定權限級別的名稱
 */
export function getPermissionLevelName(level: PermissionLevel): string {
  switch (level) {
    case PermissionLevel.BASIC:
      return '基本權限';
    case PermissionLevel.STANDARD:
      return '標準權限';
    case PermissionLevel.ADMIN:
      return '管理員權限';
    case PermissionLevel.SUPER:
      return '超級管理員';
    default:
      return '未知權限';
  }
}

/**
 * 安全地雜湊密碼
 */
export function hashPassword(password: string): string {
  // 生成隨機鹽值
  const salt = crypto.randomBytes(16).toString('hex');
  
  // 使用PBKDF2進行雜湊
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  
  // 返回格式：鹽值:雜湊值
  return `${salt}:${hash}`;
}

/**
 * 驗證雜湊密碼
 */
export function verifyPassword(storedHash: string, providedPassword: string): boolean {
  const [salt, hash] = storedHash.split(':');
  
  // 使用相同參數生成雜湊
  const providedHash = crypto.pbkdf2Sync(providedPassword, salt, 1000, 64, 'sha512').toString('hex');
  
  return hash === providedHash;
}