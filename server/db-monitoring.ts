/**
 * 數據庫監控與安全模組
 * 
 * 實現對數據庫連接的持續監控、自動備份、恢復機制等安全功能
 */

import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { storage } from './storage';
import * as schema from '@shared/schema';
import { createLogger } from './utils/logger';

const log = createLogger('db-monitor');

// 定義備份目錄
const BACKUP_DIR = path.join(process.cwd(), 'backups');
// 定義備份子目錄
const DAILY_BACKUP_DIR = path.join(BACKUP_DIR, 'daily');
const WEEKLY_BACKUP_DIR = path.join(BACKUP_DIR, 'weekly');
const MONTHLY_BACKUP_DIR = path.join(BACKUP_DIR, 'monthly');
const MANUAL_BACKUP_DIR = path.join(BACKUP_DIR, 'manual');

// 確保備份目錄存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(DAILY_BACKUP_DIR)) {
  fs.mkdirSync(DAILY_BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(WEEKLY_BACKUP_DIR)) {
  fs.mkdirSync(WEEKLY_BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(MONTHLY_BACKUP_DIR)) {
  fs.mkdirSync(MONTHLY_BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(MANUAL_BACKUP_DIR)) {
  fs.mkdirSync(MANUAL_BACKUP_DIR, { recursive: true });
}

// 自動備份間隔設定
const AUTO_DAILY_BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 1天
const AUTO_WEEKLY_BACKUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 1週
const AUTO_MONTHLY_BACKUP_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 約1個月
const MAX_BACKUPS_PER_CATEGORY = 7; // 每種類型最多保留的備份數量
const AUTO_BACKUP_CHECK_INTERVAL = 60 * 60 * 1000; // 每小時檢查一次

interface ConnectionStatus {
  isConnected: boolean;
  timestamp: number;
  error?: string;
}

// 存儲連接歷史
let connectionHistory: ConnectionStatus[] = [];
let lastNotificationTime = 0;
const NOTIFICATION_INTERVAL = 5 * 60 * 1000; // 5分鐘通知間隔
let monitoringTimer: NodeJS.Timeout | null = null;
let monitoringIntervalMs: number | null = null;
let automaticBackupTimer: NodeJS.Timeout | null = null;

type BackupTimestamps = {
  daily: number;
  weekly: number;
  monthly: number;
};

let automaticBackupTimestamps: BackupTimestamps | null = null;

type BackupPayload = {
  metadata?: {
    timestamp?: string;
    type?: string;
    description?: string;
    version?: string;
    databaseType?: string;
  };
  employees?: typeof schema.employees.$inferSelect[];
  settings?: typeof schema.settings.$inferSelect | null;
  holidays?: typeof schema.holidays.$inferSelect[];
  pendingBindings?: typeof schema.pendingBindings.$inferSelect[];
  salaryRecords?: typeof schema.salaryRecords.$inferSelect[];
  temporaryAttendance?: typeof schema.temporaryAttendance.$inferSelect[];
};

type NormalizedBackupPayload = {
  metadata: BackupPayload['metadata'] | null;
  employees: typeof schema.employees.$inferSelect[];
  settings: typeof schema.settings.$inferSelect | null;
  holidays: typeof schema.holidays.$inferSelect[];
  pendingBindings: typeof schema.pendingBindings.$inferSelect[];
  salaryRecords: typeof schema.salaryRecords.$inferSelect[];
  temporaryAttendance: typeof schema.temporaryAttendance.$inferSelect[];
};

export type BackupInspection = {
  backupId: string;
  backupType: BackupType | 'unknown';
  path: string;
  metadata: BackupPayload['metadata'] | null;
  counts: {
    employees: number;
    holidays: number;
    pendingBindings: number;
    salaryRecords: number;
    temporaryAttendance: number;
    hasSettings: boolean;
  };
  restoreOrder: string[];
  errors: string[];
  warnings: string[];
};

type RestoreExecutor = Pick<typeof db, 'delete' | 'insert' | 'execute'>;
type CountExecutor = Pick<typeof db, 'execute'>;

export type DatabaseCounts = {
  employees: number;
  holidays: number;
  pendingBindings: number;
  salaryRecords: number;
  temporaryAttendance: number;
  hasSettings: boolean;
};

export type RestoreRehearsalResult = {
  backupId: string;
  backupType: BackupType | 'unknown';
  path: string;
  metadata: BackupPayload['metadata'] | null;
  warnings: string[];
  restoreOrder: string[];
  backupCounts: DatabaseCounts;
  liveCountsBefore: DatabaseCounts;
  restoredCountsInTransaction: DatabaseCounts;
  rehearsalRolledBack: true;
};

type RestoreFromBackupOptions = {
  skipPreRestoreBackup?: boolean;
};

class RestoreRehearsalRollback extends Error {
  readonly result: RestoreRehearsalResult;

  constructor(result: RestoreRehearsalResult) {
    super('RESTORE_REHEARSAL_ROLLBACK');
    this.name = 'RestoreRehearsalRollback';
    this.result = result;
  }
}

/**
 * 檢查數據庫連接狀態
 */
export async function checkDatabaseConnection(): Promise<ConnectionStatus> {
  const timestamp = Date.now();
  let status: ConnectionStatus = { isConnected: false, timestamp };

  try {
    await db.execute('SELECT 1');
    status = { isConnected: true, timestamp };
  } catch (error) {
    status = {
      isConnected: false,
      timestamp,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  // 記錄歷史
  connectionHistory.push(status);
  
  // 保留最近的30條記錄
  if (connectionHistory.length > 30) {
    connectionHistory = connectionHistory.slice(-30);
  }

  return status;
}

/**
 * 啟動定期監控
 */
export function startMonitoring(interval = 60000) {
  if (monitoringTimer) {
    if (monitoringIntervalMs !== interval) {
      log.warn(
        `數據庫監控已啟動，沿用既有排程（existing=${monitoringIntervalMs}ms, requested=${interval}ms）`
      );
    } else {
      log.info('數據庫監控已啟動，沿用既有排程');
    }

    return monitoringTimer;
  }

  log.info('啟動數據庫連接監控，間隔：', interval, 'ms');
  monitoringIntervalMs = interval;
  
  // 立即執行一次檢查
  checkDatabaseConnection().then(status => {
    log.info('數據庫連接狀態：', status.isConnected ? '正常' : '異常', status.error || '');
  });
  
  // 設置定期檢查
  monitoringTimer = setInterval(async () => {
    const status = await checkDatabaseConnection();
    
    // 連接異常 + 距離上次通知已超過指定間隔，則發送通知
    if (!status.isConnected && Date.now() - lastNotificationTime > NOTIFICATION_INTERVAL) {
      log.error('數據庫連接異常：', status.error);
      // 在這裡添加其他通知方式，如郵件通知等
      
      lastNotificationTime = Date.now();
    }
  }, interval);
  
  return monitoringTimer;
}

/**
 * 停止監控
 */
export function stopMonitoring(timerId?: NodeJS.Timeout) {
  const targetTimer = timerId ?? monitoringTimer;

  if (!targetTimer) {
    return;
  }

  clearInterval(targetTimer);

  if (!timerId || targetTimer === monitoringTimer) {
    monitoringTimer = null;
    monitoringIntervalMs = null;
  }

  log.info('已停止數據庫連接監控');
}

/**
 * 取得連接歷史
 */
export function getConnectionHistory() {
  return connectionHistory;
}

function createInitialBackupTimestamps(): BackupTimestamps {
  return {
    daily: 0,
    weekly: 0,
    monthly: 0
  };
}

function normalizeRecordArray<T>(value: unknown, label: string): T[] {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`備份欄位格式錯誤：${label} 必須是陣列`);
  }

  return value as T[];
}

function normalizeOptionalObject<T extends object>(value: unknown, label: string): T | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`備份欄位格式錯誤：${label} 必須是物件`);
  }

  return value as T;
}

function normalizeTimestampValue<T>(value: T): T | Date | null {
  if (value == null || value instanceof Date) {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? value : parsedDate;
}

function normalizeBackupPayload(payload: unknown): NormalizedBackupPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('備份檔內容格式錯誤：根物件不存在或格式不正確');
  }

  const parsed = payload as BackupPayload;

  return {
    metadata: normalizeOptionalObject<NonNullable<BackupPayload['metadata']>>(parsed.metadata, 'metadata'),
    employees: normalizeRecordArray<typeof schema.employees.$inferSelect>(parsed.employees, 'employees').map((employee) => ({
      ...employee,
      createdAt: normalizeTimestampValue(employee.createdAt),
      lineBindingDate: normalizeTimestampValue(employee.lineBindingDate)
    })),
    settings: (() => {
      const normalizedSettings = normalizeOptionalObject<typeof schema.settings.$inferSelect>(parsed.settings, 'settings');

      if (!normalizedSettings) {
        return null;
      }

      return {
        ...normalizedSettings,
        updatedAt: normalizeTimestampValue(normalizedSettings.updatedAt)
      };
    })(),
    holidays: normalizeRecordArray<typeof schema.holidays.$inferSelect>(parsed.holidays, 'holidays').map((holiday) => ({
      ...holiday,
      createdAt: normalizeTimestampValue(holiday.createdAt)
    })),
    pendingBindings: normalizeRecordArray<typeof schema.pendingBindings.$inferSelect>(
      parsed.pendingBindings,
      'pendingBindings'
    ).map((binding) => ({
      ...binding,
      requestedAt: normalizeTimestampValue(binding.requestedAt),
      reviewedAt: normalizeTimestampValue(binding.reviewedAt)
    })),
    salaryRecords: normalizeRecordArray<typeof schema.salaryRecords.$inferSelect>(
      parsed.salaryRecords,
      'salaryRecords'
    ).map((salaryRecord) => ({
      ...salaryRecord,
      createdAt: normalizeTimestampValue(salaryRecord.createdAt)
    })),
    temporaryAttendance: normalizeRecordArray<typeof schema.temporaryAttendance.$inferSelect>(
      parsed.temporaryAttendance,
      'temporaryAttendance'
    ).map((attendance) => ({
      ...attendance,
      createdAt: normalizeTimestampValue(attendance.createdAt)
    }))
  };
}

function collectDuplicateIds<T extends { id?: number | null }>(
  rows: T[],
  label: string,
  target: string[]
): void {
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  for (const row of rows) {
    if (typeof row.id !== 'number') {
      continue;
    }

    if (seen.has(row.id)) {
      duplicates.add(row.id);
      continue;
    }

    seen.add(row.id);
  }

  if (duplicates.size > 0) {
    target.push(`${label} 包含重複 ID：${Array.from(duplicates).sort((left, right) => left - right).join(', ')}`);
  }
}

function collectMissingReferences(
  ids: Array<number | null | undefined>,
  existingIds: Set<number>,
  label: string,
  target: string[]
): void {
  const missingIds = Array.from(
    new Set(ids.filter((id): id is number => typeof id === 'number' && !existingIds.has(id)))
  ).sort((left, right) => left - right);

  if (missingIds.length > 0) {
    target.push(`${label}：${missingIds.join(', ')}`);
  }
}

function inspectNormalizedBackupPayload(
  backupId: string,
  backupType: BackupType | 'unknown',
  backupPath: string,
  payload: NormalizedBackupPayload
): BackupInspection {
  const errors: string[] = [];
  const warnings: string[] = [];
  const employeeIds = new Set(
    payload.employees
      .map((employee) => employee.id)
      .filter((id): id is number => typeof id === 'number')
  );
  const holidayIds = new Set(
    payload.holidays
      .map((holiday) => holiday.id)
      .filter((id): id is number => typeof id === 'number')
  );

  collectDuplicateIds(payload.employees, '員工資料', errors);
  collectDuplicateIds(payload.holidays, '假日資料', errors);
  collectDuplicateIds(payload.pendingBindings, '待綁定資料', errors);
  collectDuplicateIds(payload.salaryRecords, '薪資紀錄', errors);
  collectDuplicateIds(payload.temporaryAttendance, '臨時考勤資料', errors);

  collectMissingReferences(
    payload.holidays.map((holiday) => holiday.employeeId),
    employeeIds,
    '假日資料引用不存在的員工 ID',
    errors
  );

  collectMissingReferences(
    payload.pendingBindings.map((binding) => binding.employeeId),
    employeeIds,
    '待綁定資料引用不存在的員工 ID',
    errors
  );

  collectMissingReferences(
    payload.salaryRecords.map((record) => record.employeeId),
    employeeIds,
    '薪資紀錄引用不存在的員工 ID',
    warnings
  );

  collectMissingReferences(
    payload.temporaryAttendance.map((attendance) => attendance.employeeId),
    employeeIds,
    '臨時考勤引用不存在的員工 ID',
    warnings
  );

  collectMissingReferences(
    payload.temporaryAttendance.map((attendance) => attendance.holidayId),
    holidayIds,
    '臨時考勤引用不存在的假日 ID',
    warnings
  );

  if (!payload.metadata?.timestamp) {
    warnings.push('備份 metadata 缺少 timestamp');
  }

  if (payload.metadata?.databaseType && payload.metadata.databaseType !== 'postgres') {
    warnings.push(`備份 metadata.databaseType 為 ${payload.metadata.databaseType}，與目前 PostgreSQL-only 主線不一致`);
  }

  return {
    backupId,
    backupType,
    path: backupPath,
    metadata: payload.metadata,
    counts: {
      employees: payload.employees.length,
      holidays: payload.holidays.length,
      pendingBindings: payload.pendingBindings.length,
      salaryRecords: payload.salaryRecords.length,
      temporaryAttendance: payload.temporaryAttendance.length,
      hasSettings: payload.settings !== null
    },
    restoreOrder: [
      'delete temporary_attendance',
      'delete salary_records',
      'delete holidays',
      'delete pending_bindings',
      'delete settings',
      'delete employees',
      'insert employees',
      'insert settings',
      'insert pending_bindings',
      'insert holidays',
      'insert salary_records',
      'insert temporary_attendance',
      'reset serial sequences'
    ],
    errors,
    warnings
  };
}

function getBackupSearchDirectories(type?: BackupType): string[] {
  if (!type) {
    return [
      DAILY_BACKUP_DIR,
      WEEKLY_BACKUP_DIR,
      MONTHLY_BACKUP_DIR,
      MANUAL_BACKUP_DIR,
      BACKUP_DIR
    ];
  }

  switch (type) {
    case BackupType.DAILY:
      return [DAILY_BACKUP_DIR];
    case BackupType.WEEKLY:
      return [WEEKLY_BACKUP_DIR];
    case BackupType.MONTHLY:
      return [MONTHLY_BACKUP_DIR];
    case BackupType.MANUAL:
    default:
      return [MANUAL_BACKUP_DIR, BACKUP_DIR];
  }
}

function resolveBackupPath(backupId: string, backupType?: BackupType): string {
  for (const dir of getBackupSearchDirectories(backupType)) {
    const filePath = path.join(dir, `${backupId}.json`);

    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  throw new Error(`備份不存在：${backupId}`);
}

function readBackupInspectionFromPath(
  backupPath: string,
  options: { backupId: string; backupType?: BackupType | 'unknown' }
): { inspection: BackupInspection; payload: NormalizedBackupPayload } {
  const rawBackup = fs.readFileSync(backupPath, 'utf8');
  const parsedBackup = JSON.parse(rawBackup) as unknown;
  const normalizedPayload = normalizeBackupPayload(parsedBackup);
  const inspection = inspectNormalizedBackupPayload(
    options.backupId,
    options.backupType ?? 'unknown',
    backupPath,
    normalizedPayload
  );

  return {
    inspection,
    payload: normalizedPayload
  };
}

export function inspectBackupFileAtPath(
  backupPath: string,
  options: { backupId: string; backupType?: BackupType | 'unknown' }
): BackupInspection {
  return readBackupInspectionFromPath(backupPath, options).inspection;
}

export function inspectBackupFile(backupId: string, backupType?: BackupType): BackupInspection {
  const backupPath = resolveBackupPath(backupId, backupType);
  return inspectBackupFileAtPath(backupPath, {
    backupId,
    backupType: backupType ?? 'unknown'
  });
}

function extractRowList(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result as Array<Record<string, unknown>>;
  }

  if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: Array<Record<string, unknown>> }).rows;
  }

  return [];
}

function coerceNumber(value: unknown, label: string): number {
  const normalized =
    typeof value === 'bigint'
      ? Number(value)
      : typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;

  if (!Number.isFinite(normalized)) {
    throw new Error(`無法解析資料庫計數欄位：${label}`);
  }

  return normalized;
}

async function queryTableCount(executor: CountExecutor, tableName: string): Promise<number> {
  const rows = extractRowList(
    await executor.execute(sql.raw(`SELECT COUNT(*)::int AS count FROM ${tableName};`))
  );

  return coerceNumber(rows[0]?.count, `${tableName}.count`);
}

async function collectDatabaseCounts(executor: CountExecutor): Promise<DatabaseCounts> {
  const [employees, holidays, pendingBindings, salaryRecords, temporaryAttendance, settingsCount] = await Promise.all([
    queryTableCount(executor, 'employees'),
    queryTableCount(executor, 'holidays'),
    queryTableCount(executor, 'pending_bindings'),
    queryTableCount(executor, 'salary_records'),
    queryTableCount(executor, 'temporary_attendance'),
    queryTableCount(executor, 'settings')
  ]);

  return {
    employees,
    holidays,
    pendingBindings,
    salaryRecords,
    temporaryAttendance,
    hasSettings: settingsCount > 0
  };
}

export async function getLiveDatabaseCounts(): Promise<DatabaseCounts> {
  return collectDatabaseCounts(db);
}

async function resetSerialSequence(executor: RestoreExecutor, tableName: string): Promise<void> {
  await executor.execute(
    sql.raw(
      `SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${tableName};`
    )
  );
}

async function clearTablesForRestore(executor: RestoreExecutor): Promise<void> {
  await executor.delete(schema.temporaryAttendance);
  await executor.delete(schema.salaryRecords);
  await executor.delete(schema.holidays);
  await executor.delete(schema.pendingBindings);
  await executor.delete(schema.settings);
  await executor.delete(schema.employees);
}

async function restoreTableData(
  executor: RestoreExecutor,
  payload: NormalizedBackupPayload
): Promise<void> {
  if (payload.employees.length > 0) {
    await executor.insert(schema.employees).values(payload.employees as typeof schema.employees.$inferInsert[]);
  }

  if (payload.settings) {
    await executor.insert(schema.settings).values(payload.settings as typeof schema.settings.$inferInsert);
  }

  if (payload.pendingBindings.length > 0) {
    await executor.insert(schema.pendingBindings).values(
      payload.pendingBindings as typeof schema.pendingBindings.$inferInsert[]
    );
  }

  if (payload.holidays.length > 0) {
    await executor.insert(schema.holidays).values(payload.holidays as typeof schema.holidays.$inferInsert[]);
  }

  if (payload.salaryRecords.length > 0) {
    await executor.insert(schema.salaryRecords).values(payload.salaryRecords as typeof schema.salaryRecords.$inferInsert[]);
  }

  if (payload.temporaryAttendance.length > 0) {
    await executor
      .insert(schema.temporaryAttendance)
      .values(payload.temporaryAttendance as typeof schema.temporaryAttendance.$inferInsert[]);
  }
}

async function resetRestoreSequences(executor: RestoreExecutor): Promise<void> {
  await resetSerialSequence(executor, 'employees');
  await resetSerialSequence(executor, 'settings');
  await resetSerialSequence(executor, 'pending_bindings');
  await resetSerialSequence(executor, 'holidays');
  await resetSerialSequence(executor, 'salary_records');
  await resetSerialSequence(executor, 'temporary_attendance');
}

async function runAutomaticBackupCycle(lastBackup: BackupTimestamps): Promise<void> {
  const now = Date.now();

  if (now - lastBackup.daily >= AUTO_DAILY_BACKUP_INTERVAL) {
    try {
      const backupId = await createDatabaseBackup(BackupType.DAILY, `自動每日備份 ${new Date().toLocaleString()}`);
      log.info(`自動每日備份已創建: ${backupId}`);
      lastBackup.daily = now;
    } catch (error) {
      log.error('自動每日備份失敗:', error);
    }
  }

  if (now - lastBackup.weekly >= AUTO_WEEKLY_BACKUP_INTERVAL) {
    try {
      const backupId = await createDatabaseBackup(BackupType.WEEKLY, `自動每週備份 ${new Date().toLocaleString()}`);
      log.info(`自動每週備份已創建: ${backupId}`);
      lastBackup.weekly = now;
    } catch (error) {
      log.error('自動每週備份失敗:', error);
    }
  }

  if (now - lastBackup.monthly >= AUTO_MONTHLY_BACKUP_INTERVAL) {
    try {
      const backupId = await createDatabaseBackup(BackupType.MONTHLY, `自動每月備份 ${new Date().toLocaleString()}`);
      log.info(`自動每月備份已創建: ${backupId}`);
      lastBackup.monthly = now;
    } catch (error) {
      log.error('自動每月備份失敗:', error);
    }
  }
}

async function runInitialDailyBackup(lastBackup: BackupTimestamps): Promise<void> {
  try {
    const backupId = await createDatabaseBackup(BackupType.DAILY, `初始每日備份 ${new Date().toLocaleString()}`);
    log.info(`初始每日備份已創建: ${backupId}`);
    lastBackup.daily = Date.now();
  } catch (error) {
    log.error('初始每日備份失敗:', error);
  }
}

/**
 * 備份類型枚舉
 */
export enum BackupType {
  MANUAL = 'manual',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}

/**
 * 創建數據備份
 * @param type 備份類型，默認為手動備份
 * @param description 可選的備份描述
 */
export async function createDatabaseBackup(
  type: BackupType = BackupType.MANUAL,
  description?: string
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `backup-${timestamp}`;
  // 根據備份類型選擇存儲目錄
  let backupDir;
  switch (type) {
    case BackupType.DAILY:
      backupDir = DAILY_BACKUP_DIR;
      break;
    case BackupType.WEEKLY:
      backupDir = WEEKLY_BACKUP_DIR;
      break;
    case BackupType.MONTHLY:
      backupDir = MONTHLY_BACKUP_DIR;
      break;
    case BackupType.MANUAL:
    default:
      backupDir = MANUAL_BACKUP_DIR;
      break;
  }
  
  const backupPath = path.join(backupDir, `${backupId}.json`);
  
  const data: Record<string, any> = {
    metadata: {
      timestamp: new Date().toISOString(),
      type,
      description: description || `${type} backup`,
      version: '1.0.0',
      databaseType: 'postgres'
    }
  };
  
  try {
    // 備份員工資料
    data.employees = await storage.getAllEmployees();
    
    // 備份設置
    const settings = await storage.getSettings();
    if (settings) {
      data.settings = settings;
    }
    
    // 備份假日
    data.holidays = await storage.getAllHolidays();

    // 備份待綁定資料
    data.pendingBindings = await db.select().from(schema.pendingBindings);
    
    // 備份薪資記錄
    data.salaryRecords = await storage.getAllSalaryRecords();
    
    // 備份臨時考勤
    data.temporaryAttendance = await storage.getTemporaryAttendance();
    
    // 寫入備份文件
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    
    log.info(`${type} 備份已創建：${backupPath}`);
    
    // 清理舊備份，保留指定數量的最新備份
    cleanupOldBackups(backupDir);
    
    return backupId;
  } catch (error) {
    log.error(`創建 ${type} 備份失敗：`, error);
    throw new Error(`備份失敗：${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 清理舊備份，只保留指定數量的最新備份
 */
function cleanupOldBackups(backupDir: string): void {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(file => file.endsWith('.json'))
      .map(file => ({
        fileName: file,
        path: path.join(backupDir, file),
        timestamp: fs.statSync(path.join(backupDir, file)).mtime.getTime()
      }))
      .sort((a, b) => b.timestamp - a.timestamp); // 按時間降序排序
    
    // 刪除超出保留數量的舊備份
    if (files.length > MAX_BACKUPS_PER_CATEGORY) {
      const filesToDelete = files.slice(MAX_BACKUPS_PER_CATEGORY);
      filesToDelete.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          log.info(`已刪除舊備份：${file.path}`);
        } catch (err) {
          log.error(`刪除舊備份失敗：${file.path}`, err);
        }
      });
    }
  } catch (error) {
    log.error('清理舊備份失敗：', error);
  }
}

/**
 * 獲取指定類型的備份列表
 * @param type 備份類型，默認為 undefined，表示獲取所有備份
 */
export function getBackupsList(type?: BackupType) {
  try {
    const backups: Array<{
      id: string;
      timestamp: number;
      fileName: string;
      size: number;
      type: BackupType;
      path: string;
    }> = [];
    
    // 如果指定了類型，只讀取該類型的備份
    if (type) {
      let backupDir;
      switch (type) {
        case BackupType.DAILY:
          backupDir = DAILY_BACKUP_DIR;
          break;
        case BackupType.WEEKLY:
          backupDir = WEEKLY_BACKUP_DIR;
          break;
        case BackupType.MONTHLY:
          backupDir = MONTHLY_BACKUP_DIR;
          break;
        case BackupType.MANUAL:
          backupDir = MANUAL_BACKUP_DIR;
          break;
        default:
          backupDir = BACKUP_DIR; // 回退到根備份目錄
      }
      
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir)
          .filter(file => file.endsWith('.json'))
          .map(file => {
            const filePath = path.join(backupDir, file);
            return {
              id: file.replace('.json', ''),
              timestamp: fs.statSync(filePath).mtime.getTime(),
              fileName: file,
              size: fs.statSync(filePath).size,
              type,
              path: filePath
            };
          });
        
        backups.push(...files);
      }
    } else {
      // 讀取所有類型的備份
      const typeDirectories = [
        { dir: DAILY_BACKUP_DIR, type: BackupType.DAILY },
        { dir: WEEKLY_BACKUP_DIR, type: BackupType.WEEKLY },
        { dir: MONTHLY_BACKUP_DIR, type: BackupType.MONTHLY },
        { dir: MANUAL_BACKUP_DIR, type: BackupType.MANUAL },
        { dir: BACKUP_DIR, type: BackupType.MANUAL } // 處理舊的備份
      ];
      
      // 從每個目錄讀取備份
      for (const { dir, type } of typeDirectories) {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir)
            .filter(file => file.endsWith('.json'))
            .map(file => {
              const filePath = path.join(dir, file);
              return {
                id: file.replace('.json', ''),
                timestamp: fs.statSync(filePath).mtime.getTime(),
                fileName: file,
                size: fs.statSync(filePath).size,
                type,
                path: filePath
              };
            });
          
          backups.push(...files);
        }
      }
    }
    
    // 按時間降序排序
    return backups.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    log.error('獲取備份列表失敗：', error);
    return [];
  }
}

/**
 * 創建系統自動備份的定時任務
 * @returns 定時器ID
 */
export function setupAutomaticBackups(): NodeJS.Timeout {
  if (automaticBackupTimer) {
    log.info('自動備份任務已啟動，沿用既有排程');
    return automaticBackupTimer;
  }

  log.info('設置自動備份任務...');

  automaticBackupTimestamps = createInitialBackupTimestamps();

  automaticBackupTimer = setInterval(() => {
    if (!automaticBackupTimestamps) {
      return;
    }

    void runAutomaticBackupCycle(automaticBackupTimestamps);
  }, AUTO_BACKUP_CHECK_INTERVAL);

  void runInitialDailyBackup(automaticBackupTimestamps);

  return automaticBackupTimer;
}

export function stopAutomaticBackups(timerId?: NodeJS.Timeout): void {
  const targetTimer = timerId ?? automaticBackupTimer;

  if (!targetTimer) {
    return;
  }

  clearInterval(targetTimer);

  if (!timerId || targetTimer === automaticBackupTimer) {
    automaticBackupTimer = null;
    automaticBackupTimestamps = null;
  }

  log.info('已停止自動備份任務');
}

/**
 * 從備份恢復數據
 * @param backupId 備份ID
 * @param backupType 備份類型，如果指定則從該類型的目錄中查找，不指定則搜索所有目錄
 */
export async function restoreFromBackup(
  backupId: string,
  backupType?: BackupType,
  options: RestoreFromBackupOptions = {}
): Promise<boolean> {
  const backupPath = resolveBackupPath(backupId, backupType);

  try {
    const { inspection, payload } = readBackupInspectionFromPath(backupPath, {
      backupId,
      backupType: backupType ?? 'unknown'
    });

    if (inspection.errors.length > 0) {
      throw new Error(`備份驗證失敗：${inspection.errors.join('；')}`);
    }

    if (inspection.warnings.length > 0) {
      log.warn(`恢復前檢查包含警告：${inspection.warnings.join('；')}`);
    }

    if (!options.skipPreRestoreBackup) {
      await createDatabaseBackup(BackupType.MANUAL, `恢復前自動備份 ${new Date().toLocaleString()}`);
    }

    await db.transaction(async (tx) => {
      await clearTablesForRestore(tx);
      await restoreTableData(tx, payload);
      await resetRestoreSequences(tx);
    });

    log.info(`數據已從備份恢復：${backupId}`);
    return true;
  } catch (error) {
    log.error('從備份恢復數據失敗：', error);
    throw new Error(`恢復失敗：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function rehearseRestoreFromBackup(
  backupId: string,
  backupType?: BackupType
): Promise<RestoreRehearsalResult> {
  const backupPath = resolveBackupPath(backupId, backupType);

  try {
    const { inspection, payload } = readBackupInspectionFromPath(backupPath, {
      backupId,
      backupType: backupType ?? 'unknown'
    });

    if (inspection.errors.length > 0) {
      throw new Error(`備份驗證失敗：${inspection.errors.join('；')}`);
    }

    if (inspection.warnings.length > 0) {
      log.warn(`restore rehearsal 包含警告：${inspection.warnings.join('；')}`);
    }

    const liveCountsBefore = await collectDatabaseCounts(db);

    await db.transaction(async (tx) => {
      await clearTablesForRestore(tx);
      await restoreTableData(tx, payload);
      await resetRestoreSequences(tx);

      const restoredCountsInTransaction = await collectDatabaseCounts(tx);

      throw new RestoreRehearsalRollback({
        backupId: inspection.backupId,
        backupType: inspection.backupType,
        path: inspection.path,
        metadata: inspection.metadata,
        warnings: inspection.warnings,
        restoreOrder: inspection.restoreOrder,
        backupCounts: inspection.counts,
        liveCountsBefore,
        restoredCountsInTransaction,
        rehearsalRolledBack: true
      });
    });

    throw new Error('restore rehearsal 未正確觸發 rollback');
  } catch (error) {
    if (error instanceof RestoreRehearsalRollback) {
      log.info(`restore rehearsal 已完成並回滾：${backupId}`);
      return error.result;
    }

    log.error('restore rehearsal 失敗：', error);
    throw new Error(`restore rehearsal 失敗：${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 刪除指定備份
 * @param backupId 備份ID
 * @param backupType 備份類型，如果指定則從該類型的目錄中查找，不指定則搜索所有目錄
 */
export async function deleteBackup(
  backupId: string,
  backupType?: BackupType
): Promise<boolean> {
  const backupPath = resolveBackupPath(backupId, backupType);

  try {
    // 刪除備份文件
    fs.unlinkSync(backupPath);
    log.info(`已刪除備份：${backupPath}`);
    return true;
  } catch (error) {
    log.error(`刪除備份失敗：${backupPath}`, error);
    throw new Error(`刪除備份失敗：${error instanceof Error ? error.message : String(error)}`);
  }
}
