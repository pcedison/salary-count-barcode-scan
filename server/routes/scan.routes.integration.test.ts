import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { caesarEncrypt } from '@shared/utils/caesarCipher';
import { normalizeDateToSlash } from '@shared/utils/specialLeaveSync';
import { buildEmployeeIdentityLookupCandidates, matchesEmployeeIdentity } from '../utils/employeeIdentity';

import { createJsonTestServer, jsonRequest } from '../test-utils/http-test-server';

const scanState = vi.hoisted(() => ({
  currentDateKey: '2026/03/12',
  currentTime: '08:30',
  currentTimestamp: '2026-03-12T00:30:00.000Z',
  employees: [] as Array<Record<string, any>>,
  holidays: [] as Array<Record<string, any>>,
  attendanceRecords: [] as Array<Record<string, any>>,
  nextAttendanceId: 1
}));

const storageMock = vi.hoisted(() => ({
  getEmployeeByIdNumber: vi.fn(async (idNumber: string) => {
    const lookupCandidates = buildEmployeeIdentityLookupCandidates(idNumber);
    return (
      scanState.employees.find((employee) => lookupCandidates.includes(employee.idNumber)) ||
      scanState.employees.find((employee) => matchesEmployeeIdentity(employee, idNumber))
    );
  }),
  getAllEmployees: vi.fn(async () => scanState.employees),
  getAllHolidays: vi.fn(async () => scanState.holidays),
  getTemporaryAttendanceByEmployeeAndDate: vi.fn(async (employeeId: number, date: string) =>
    scanState.attendanceRecords.filter(
      (record) =>
        record.employeeId === employeeId &&
        normalizeDateToSlash(record.date) === normalizeDateToSlash(date)
    )
  ),
  updateTemporaryAttendance: vi.fn(async (id: number, updates: Record<string, unknown>) => {
    const index = scanState.attendanceRecords.findIndex((record) => record.id === id);
    if (index === -1) {
      return undefined;
    }

    scanState.attendanceRecords[index] = {
      ...scanState.attendanceRecords[index],
      ...updates
    };

    return scanState.attendanceRecords[index];
  }),
  createTemporaryAttendance: vi.fn(async (payload: Record<string, unknown>) => {
    const record = {
      id: scanState.nextAttendanceId,
      holidayId: null,
      holidayType: null,
      createdAt: new Date(scanState.currentTimestamp),
      ...payload
    };

    scanState.nextAttendanceId += 1;
    scanState.attendanceRecords.push(record);
    return record;
  }),
  getTemporaryAttendance: vi.fn(async () => scanState.attendanceRecords),
  getEmployeeById: vi.fn(async (id: number) =>
    scanState.employees.find((employee) => employee.id === id)
  )
}));

vi.mock('../storage', () => ({
  storage: storageMock
}));

vi.mock('./scan-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./scan-helpers')>();
  return {
    ...actual,
    getTaiwanDateTimeParts: vi.fn(() => ({
      dateKey: scanState.currentDateKey,
      time: scanState.currentTime,
      timestamp: scanState.currentTimestamp
    }))
  };
});

let registerScanRoutes: typeof import('./scan.routes').registerScanRoutes;

beforeAll(async () => {
  ({ registerScanRoutes } = await import('./scan.routes'));
});

beforeEach(() => {
  scanState.currentDateKey = '2026/03/12';
  scanState.currentTime = '08:30';
  scanState.currentTimestamp = '2026-03-12T00:30:00.000Z';
  scanState.holidays = [];
  scanState.attendanceRecords = [];
  scanState.nextAttendanceId = 1;
  scanState.employees = [
    {
      id: 5,
      name: '測試員工',
      idNumber: caesarEncrypt('A123456789'),
      isEncrypted: true,
      department: '生產部',
      position: null,
      email: null,
      phone: null,
      active: true,
      specialLeaveDays: 0,
      specialLeaveWorkDateRange: null,
      specialLeaveUsedDates: [],
      specialLeaveCashDays: 0,
      specialLeaveCashMonth: null,
      specialLeaveNotes: null,
      createdAt: new Date('2026-03-01T00:00:00.000Z')
    }
  ];
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('scan routes integration', () => {
  it('creates a clock-in then clock-out flow for encrypted employee ids', async () => {
    const server = await createJsonTestServer(registerScanRoutes);

    try {
      const firstScan = await jsonRequest<{
        success: boolean;
        isClockIn: boolean;
        action: string;
        employeeName: string;
        clockTime: string;
      }>(server.baseUrl, '/api/barcode-scan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          idNumber: 'A123456789'
        })
      });

      expect(firstScan.response.status).toBe(200);
      expect(firstScan.body).toMatchObject({
        success: true,
        isClockIn: true,
        action: 'clock-in',
        employeeName: '測試員工',
        clockTime: '08:30'
      });
      expect(storageMock.getAllEmployees).not.toHaveBeenCalled();
      expect(scanState.attendanceRecords).toHaveLength(1);
      expect(scanState.attendanceRecords[0]).toMatchObject({
        employeeId: 5,
        date: '2026/03/12',
        clockIn: '08:30',
        clockOut: ''
      });

      scanState.currentTime = '17:45';
      scanState.currentTimestamp = '2026-03-12T09:45:00.000Z';

      const secondScan = await jsonRequest<{
        success: boolean;
        isClockIn: boolean;
        action: string;
        clockTime: string;
      }>(server.baseUrl, '/api/barcode-scan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          idNumber: 'A123456789'
        })
      });

      expect(secondScan.response.status).toBe(200);
      expect(secondScan.body).toMatchObject({
        success: true,
        isClockIn: false,
        action: 'clock-out',
        clockTime: '17:45'
      });
      expect(scanState.attendanceRecords[0]).toMatchObject({
        employeeId: 5,
        clockIn: '08:30',
        clockOut: '17:45'
      });
    } finally {
      await server.close();
    }
  });

  it('rebuilds the last scan result from persisted attendance after in-memory cache is lost', async () => {
    scanState.attendanceRecords = [
      {
        id: 10,
        employeeId: 5,
        date: '2026-03-12',
        clockIn: '08:30',
        clockOut: '17:30',
        isHoliday: false,
        isBarcodeScanned: true,
        holidayId: null,
        holidayType: null,
        createdAt: new Date('2026-03-12T00:30:00.000Z')
      }
    ];

    const server = await createJsonTestServer(registerScanRoutes);

    try {
      const result = await jsonRequest<{
        employeeName: string;
        action: string;
        isClockIn: boolean;
        clockTime: string;
      }>(server.baseUrl, '/api/last-scan-result');

      expect(result.response.status).toBe(200);
      expect(result.body).toMatchObject({
        employeeName: '測試員工',
        action: 'clock-out',
        isClockIn: false,
        clockTime: '17:30'
      });
    } finally {
      await server.close();
    }
  });

  it('returns a compact raspberry payload while reusing the same scan pipeline', async () => {
    const server = await createJsonTestServer(registerScanRoutes);

    try {
      const result = await jsonRequest<{
        success: boolean;
        code: string;
        action: string;
        name: string;
        time: string;
      }>(server.baseUrl, '/api/raspberry-scan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          idNumber: 'A123456789',
          deviceId: 'raspi-01'
        })
      });

      expect(result.response.status).toBe(200);
      expect(result.body).toMatchObject({
        success: true,
        code: 'SUCCESS',
        action: 'clock-in',
        name: '測試員工',
        time: '08:30'
      });
    } finally {
      await server.close();
    }
  });

  it('supports encrypted scan tokens for plaintext employee ids without route-level full scans', async () => {
    scanState.employees = [
      {
        ...scanState.employees[0],
        idNumber: 'A123456789',
        isEncrypted: false
      }
    ];

    const server = await createJsonTestServer(registerScanRoutes);

    try {
      const result = await jsonRequest<{
        success: boolean;
        employeeName: string;
        action: string;
      }>(server.baseUrl, '/api/barcode-scan', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          idNumber: caesarEncrypt('A123456789')
        })
      });

      expect(result.response.status).toBe(200);
      expect(result.body).toMatchObject({
        success: true,
        employeeName: '測試員工',
        action: 'clock-in'
      });
      expect(storageMock.getAllEmployees).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });
});
