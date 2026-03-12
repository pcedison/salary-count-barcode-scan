import type { Express } from 'express';

import { normalizeDateToSlash } from '@shared/utils/specialLeaveSync';

import { storage, type Employee, type Holiday, type TemporaryAttendance } from '../storage';
import { normalizeEmployeeIdentity } from '../utils/employeeIdentity';

import { handleRouteError } from './route-helpers';
import {
  buildEmployeeCacheKey,
  buildScanSuccessResult,
  filterAttendanceByDate,
  getLatestAttendanceRecord,
  getLatestIncompleteAttendanceRecord,
  getTaiwanDateTimeParts,
  type ScanSuccessResult
} from './scan-helpers';

const EMPLOYEE_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const HOLIDAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface HolidayCache {
  entries: Holiday[];
  expiresAt: number;
}

function getCachedValue<T>(entry: CacheEntry<T> | null | undefined, now: number): T | undefined {
  if (!entry || entry.expiresAt <= now) {
    return undefined;
  }
  return entry.value;
}

function setCachedValue<T>(value: T, ttlMs: number, now: number): CacheEntry<T> {
  return {
    value,
    expiresAt: now + ttlMs
  };
}

export function registerScanRoutes(app: Express): void {
  const employeeCache = new Map<string, CacheEntry<Employee>>();
  let holidayCache: HolidayCache | null = null;
  let lastScanResult: ScanSuccessResult | null = null;

  async function findEmployee(rawIdNumber: string): Promise<Employee | undefined> {
    const now = Date.now();
    const normalizedInput = normalizeEmployeeIdentity(rawIdNumber);
    const cacheKey = buildEmployeeCacheKey(normalizedInput);
    const cachedEmployee = getCachedValue(employeeCache.get(cacheKey), now);
    if (cachedEmployee) {
      return cachedEmployee;
    }

    const directEmployee = await storage.getEmployeeByIdNumber(normalizedInput);
    if (directEmployee) {
      employeeCache.set(cacheKey, setCachedValue(directEmployee, EMPLOYEE_CACHE_TTL_MS, now));
      return directEmployee;
    }

    return undefined;
  }

  async function isHoliday(dateKey: string): Promise<boolean> {
    const now = Date.now();
    if (!holidayCache || holidayCache.expiresAt <= now) {
      const holidays = await storage.getAllHolidays();
      holidayCache = {
        entries: holidays,
        expiresAt: now + HOLIDAY_CACHE_TTL_MS
      };
    }

    const normalizedDateKey = normalizeDateToSlash(dateKey);
    return holidayCache.entries.some(holiday => normalizeDateToSlash(holiday.date) === normalizedDateKey);
  }

  async function getPersistedLastScanResult(dateKey: string): Promise<ScanSuccessResult | undefined> {
    const records = filterAttendanceByDate(await storage.getTemporaryAttendance(), dateKey);
    const latestRecord = getLatestAttendanceRecord(records);

    if (!latestRecord?.employeeId) {
      return undefined;
    }

    const employee = await storage.getEmployeeById(latestRecord.employeeId);
    if (!employee) {
      return undefined;
    }

    return buildScanSuccessResult(employee, latestRecord, new Date().toISOString());
  }

  async function upsertAttendanceScan(employee: Employee): Promise<ScanSuccessResult> {
    const { dateKey, time, timestamp } = getTaiwanDateTimeParts();
    const isHolidayRecord = await isHoliday(dateKey);
    const existingRecords = filterAttendanceByDate(
      await storage.getTemporaryAttendanceByEmployeeAndDate(employee.id, dateKey),
      dateKey
    );
    const latestIncompleteRecord = getLatestIncompleteAttendanceRecord(existingRecords);

    let attendanceRecord: TemporaryAttendance | undefined;

    if (latestIncompleteRecord) {
      attendanceRecord = await storage.updateTemporaryAttendance(latestIncompleteRecord.id, {
        clockOut: time
      });
    } else {
      attendanceRecord = await storage.createTemporaryAttendance({
        employeeId: employee.id,
        date: dateKey,
        clockIn: time,
        clockOut: '',
        isHoliday: isHolidayRecord,
        isBarcodeScanned: true
      });
    }

    if (!attendanceRecord) {
      throw new Error('打卡失敗，請稍後再試');
    }

    const result = buildScanSuccessResult(employee, attendanceRecord, timestamp);
    lastScanResult = result;
    return result;
  }

  app.get('/api/last-scan-result', async (_req, res) => {
    try {
      const { dateKey } = getTaiwanDateTimeParts();
      if (lastScanResult && normalizeDateToSlash(lastScanResult.attendance.date) === normalizeDateToSlash(dateKey)) {
        return res.json(lastScanResult);
      }

      const persistedResult = await getPersistedLastScanResult(dateKey);
      if (!persistedResult) {
        return res.status(404).json({ error: '今日尚無掃描記錄' });
      }

      lastScanResult = persistedResult;
      return res.json(persistedResult);
    } catch (err) {
      console.error('[最後掃描結果] 出錯:', err);
      return handleRouteError(err, res);
    }
  });

  app.post('/api/barcode-scan', async (req, res) => {
    try {
      const idNumber = typeof req.body?.idNumber === 'string' ? req.body.idNumber.trim() : '';
      if (!idNumber) {
        return res.status(400).json({
          success: false,
          message: '必須提供身分證號碼或居留證號碼'
        });
      }

      const employee = await findEmployee(idNumber);
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: '找不到匹配的員工',
          code: 'EMPLOYEE_NOT_FOUND'
        });
      }

      const result = await upsertAttendanceScan(employee);
      return res.json(result);
    } catch (err) {
      console.error('條碼掃描打卡錯誤:', err);
      return res.status(500).json({
        success: false,
        message: err instanceof Error ? err.message : '內部處理錯誤',
        code: 'INTERNAL_ERROR'
      });
    }
  });

  app.post('/api/raspberry-scan', async (req, res) => {
    try {
      const idNumber = typeof req.body?.idNumber === 'string' ? req.body.idNumber.trim() : '';
      const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : 'unknown';

      if (!idNumber) {
        return res.status(400).json({
          success: false,
          message: '必須提供身分證號碼或居留證號碼',
          code: 'MISSING_ID'
        });
      }

      console.log(`Received scan from device: ${deviceId}, ID: ${idNumber}`);

      const employee = await findEmployee(idNumber);
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: '找不到匹配的員工',
          code: 'EMPLOYEE_NOT_FOUND'
        });
      }

      const result = await upsertAttendanceScan(employee);
      return res.json({
        success: true,
        code: 'SUCCESS',
        action: result.action,
        name: result.employeeName,
        department: result.department,
        time: result.clockTime,
        isHoliday: result.attendance.isHoliday ?? false
      });
    } catch (err) {
      console.error('Raspberry Pi 打卡錯誤:', err);
      return res.status(500).json({
        success: false,
        message: err instanceof Error ? err.message : '內部處理錯誤',
        code: 'INTERNAL_ERROR'
      });
    }
  });
}
