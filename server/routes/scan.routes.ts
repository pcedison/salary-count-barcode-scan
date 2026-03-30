import crypto from 'crypto';
import type { Express, Request, Response } from 'express';

import { normalizeDateToSlash } from '@shared/utils/specialLeaveSync';
import type { Employee, Holiday, TemporaryAttendance } from '@shared/schema';

import { PermissionLevel, verifyAdminPermission } from '../admin-auth';
import { deviceScanLimiter, scanLimiter, scanUnlockLimiter } from '../middleware/rateLimiter';
import {
  clearScanAccessSession,
  createScanAccessSession,
  getScanAccessSession,
  hasActiveScanAccessSession,
  hasAdminSession
} from '../session';
import { storage } from '../storage';
import { maskEmployeeIdentityForLog, normalizeEmployeeIdentity } from '../utils/employeeIdentity';
import { createLogger } from '../utils/logger';

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

const log = createLogger('scan');

const EMPLOYEE_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const HOLIDAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEVICE_TOKEN_HEADER = 'x-scan-device-token';

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

function isBrowserScanUnlockRequired(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isDeviceTokenRequired(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.SCAN_DEVICE_TOKEN?.trim());
}

function getConfiguredDeviceToken(): string | null {
  const token = process.env.SCAN_DEVICE_TOKEN?.trim();
  return token ? token : null;
}

function hasUnlockedBrowserScanAccess(req: Pick<Request, 'session'>): boolean {
  return (
    !isBrowserScanUnlockRequired() ||
    hasAdminSession(req, PermissionLevel.ADMIN) ||
    hasActiveScanAccessSession(req)
  );
}

function buildScanSessionPayload(req: Pick<Request, 'session'>) {
  const adminSession = hasAdminSession(req, PermissionLevel.ADMIN);
  const scanSession = getScanAccessSession(req);
  const required = isBrowserScanUnlockRequired();

  return {
    required,
    unlocked: !required || adminSession || Boolean(scanSession),
    expiresAt: scanSession ? new Date(scanSession.expiresAt).toISOString() : null,
    authMode: adminSession ? 'admin_session' : scanSession ? 'scan_session' : 'none'
  } as const;
}

function respondScanUnlockRequired(res: Response) {
  res.setHeader('X-Scan-Session-Required', 'true');
  return res.status(401).json({
    success: false,
    code: 'SCAN_SESSION_REQUIRED',
    message: 'Barcode scan access is locked. Please unlock this kiosk with the admin PIN.'
  });
}

function hasValidDeviceToken(req: Request): boolean {
  const expected = getConfiguredDeviceToken();
  if (!expected) {
    return !isDeviceTokenRequired();
  }

  const provided = req.header(DEVICE_TOKEN_HEADER)?.trim() ?? '';
  if (!provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');

  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

function respondDeviceTokenRequired(res: Response, statusCode: 401 | 503 = 401) {
  res.setHeader('X-Scan-Device-Token-Required', 'true');
  return res.status(statusCode).json({
    success: false,
    code: statusCode === 503 ? 'SCAN_DEVICE_TOKEN_MISSING' : 'SCAN_DEVICE_TOKEN_REQUIRED',
    message:
      statusCode === 503
        ? 'Raspberry Pi scan endpoint is disabled until SCAN_DEVICE_TOKEN is configured.'
        : 'A valid device scan token is required.'
  });
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
    return holidayCache.entries.some(
      holiday => normalizeDateToSlash(holiday.date) === normalizedDateKey
    );
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
      throw new Error('Unable to persist scan attendance record');
    }

    const result = buildScanSuccessResult(employee, attendanceRecord, timestamp);
    lastScanResult = result;
    return result;
  }

  app.get('/api/scan/session', (req, res) => {
    res.json(buildScanSessionPayload(req));
  });

  app.post('/api/scan/session/unlock', scanUnlockLimiter, async (req, res) => {
    try {
      if (hasAdminSession(req, PermissionLevel.ADMIN) && !hasActiveScanAccessSession(req)) {
        await createScanAccessSession(req);
      }

      if (!hasUnlockedBrowserScanAccess(req)) {
        const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
        if (!pin) {
          return res.status(400).json({
            success: false,
            code: 'PIN_REQUIRED',
            message: 'Admin PIN is required to unlock barcode scan access.'
          });
        }

        const isValid = await verifyAdminPermission(pin, PermissionLevel.ADMIN);
        if (!isValid) {
          return res.status(401).json({
            success: false,
            code: 'INVALID_SCAN_PIN',
            message: 'The unlock PIN is incorrect.'
          });
        }

        await createScanAccessSession(req);
      }

      return res.json({
        success: true,
        ...buildScanSessionPayload(req)
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/scan/session/lock', async (req, res) => {
    try {
      await clearScanAccessSession(req);
      return res.json({
        success: true,
        ...buildScanSessionPayload(req)
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/last-scan-result', async (req, res) => {
    try {
      if (!hasUnlockedBrowserScanAccess(req)) {
        return respondScanUnlockRequired(res);
      }

      const { dateKey } = getTaiwanDateTimeParts();
      if (
        lastScanResult &&
        normalizeDateToSlash(lastScanResult.attendance.date) === normalizeDateToSlash(dateKey)
      ) {
        return res.json(lastScanResult);
      }

      const persistedResult = await getPersistedLastScanResult(dateKey);
      if (!persistedResult) {
        return res.status(404).json({ error: '今日尚無掃描記錄' });
      }

      lastScanResult = persistedResult;
      return res.json(persistedResult);
    } catch (err) {
      log.error('Failed to read last scan result', err);
      return handleRouteError(err, res);
    }
  });

  app.post('/api/barcode-scan', scanLimiter, async (req, res) => {
    try {
      if (!hasUnlockedBrowserScanAccess(req)) {
        return respondScanUnlockRequired(res);
      }

      const idNumber = typeof req.body?.idNumber === 'string' ? req.body.idNumber.trim() : '';
      if (!idNumber) {
        return res.status(400).json({
          success: false,
          message: 'A barcode or employee identifier is required.'
        });
      }

      const employee = await findEmployee(idNumber);
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found',
          code: 'EMPLOYEE_NOT_FOUND'
        });
      }

      const result = await upsertAttendanceScan(employee);
      return res.json(result);
    } catch (err) {
      log.error('Barcode scan request failed:', err);
      return handleRouteError(err, res);
    }
  });

  app.post('/api/raspberry-scan', deviceScanLimiter, async (req, res) => {
    try {
      if (isDeviceTokenRequired() && !getConfiguredDeviceToken()) {
        return respondDeviceTokenRequired(res, 503);
      }

      if (!hasValidDeviceToken(req)) {
        return respondDeviceTokenRequired(res);
      }

      const idNumber = typeof req.body?.idNumber === 'string' ? req.body.idNumber.trim() : '';
      const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : 'unknown';

      if (!idNumber) {
        return res.status(400).json({
          success: false,
          message: 'A barcode or employee identifier is required.',
          code: 'MISSING_ID'
        });
      }

      log.info(
        `Received scan from device ${deviceId}, identity=${maskEmployeeIdentityForLog(idNumber)}`
      );

      const employee = await findEmployee(idNumber);
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found',
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
      log.error('Raspberry Pi scan request failed:', err);
      return handleRouteError(err, res);
    }
  });
}
