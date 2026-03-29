import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@shared/schema';

const executeMock = vi.hoisted(() => vi.fn(async () => []));
const deleteMock = vi.hoisted(() => vi.fn(async () => []));
const txDeleteMock = vi.hoisted(() => vi.fn(async () => []));
const txExecuteMock = vi.hoisted(() => vi.fn(async () => []));
const txInsertValuesMock = vi.hoisted(() => vi.fn(async () => []));
const txInsertMock = vi.hoisted(() =>
  vi.fn(() => ({
    values: txInsertValuesMock
  }))
);
const transactionMock = vi.hoisted(() =>
  vi.fn(async (callback: (tx: { delete: typeof txDeleteMock; insert: typeof txInsertMock; execute: typeof txExecuteMock }) => unknown) =>
    callback({
      delete: txDeleteMock,
      insert: txInsertMock,
      execute: txExecuteMock
    })
  )
);
const getAllEmployeesMock = vi.hoisted(() => vi.fn(async () => []));
const getSettingsMock = vi.hoisted(() => vi.fn(async () => null));
const getAllHolidaysMock = vi.hoisted(() => vi.fn(async () => []));
const getAllSalaryRecordsMock = vi.hoisted(() => vi.fn(async () => []));
const getTemporaryAttendanceMock = vi.hoisted(() => vi.fn(async () => []));
const createEmployeeMock = vi.hoisted(() => vi.fn());
const createOrUpdateSettingsMock = vi.hoisted(() => vi.fn());
const createHolidayMock = vi.hoisted(() => vi.fn());
const createSalaryRecordMock = vi.hoisted(() => vi.fn());
const createTemporaryAttendanceMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn(() => true));
const mkdirSyncMock = vi.hoisted(() => vi.fn());
const writeFileSyncMock = vi.hoisted(() => vi.fn());
const readdirSyncMock = vi.hoisted(() => vi.fn(() => []));
const statSyncMock = vi.hoisted(() =>
  vi.fn(() => ({
    mtime: new Date('2026-03-14T00:00:00.000Z'),
    size: 0
  }))
);
const unlinkSyncMock = vi.hoisted(() => vi.fn());
const readFileSyncMock = vi.hoisted(() => vi.fn(() => '{}'));

vi.mock('./db', () => ({
  db: {
    execute: executeMock,
    delete: deleteMock,
    transaction: transactionMock
  }
}));

vi.mock('./storage', () => ({
  storage: {
    getAllEmployees: getAllEmployeesMock,
    getSettings: getSettingsMock,
    getAllHolidays: getAllHolidaysMock,
    getAllSalaryRecords: getAllSalaryRecordsMock,
    getTemporaryAttendance: getTemporaryAttendanceMock,
    createEmployee: createEmployeeMock,
    createOrUpdateSettings: createOrUpdateSettingsMock,
    createHoliday: createHolidayMock,
    createSalaryRecord: createSalaryRecordMock,
    createTemporaryAttendance: createTemporaryAttendanceMock
  }
}));

vi.mock('./utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('fs', () => ({
  default: {
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
    writeFileSync: writeFileSyncMock,
    readdirSync: readdirSyncMock,
    statSync: statSyncMock,
    unlinkSync: unlinkSyncMock,
    readFileSync: readFileSyncMock
  }
}));

import {
  inspectBackupFileAtPath,
  rehearseRestoreFromBackup,
  restoreFromBackup,
  setupAutomaticBackups,
  startMonitoring,
  stopAutomaticBackups,
  stopMonitoring
} from './db-monitoring';

describe('db-monitoring scheduler guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockImplementation(() => true);
    readFileSyncMock.mockReturnValue('{}');
    stopMonitoring();
    stopAutomaticBackups();
  });

  afterEach(() => {
    stopMonitoring();
    stopAutomaticBackups();
    vi.restoreAllMocks();
  });

  it('starts monitoring only once when called repeatedly', async () => {
    const timer = { kind: 'monitor-timer' } as unknown as NodeJS.Timeout;
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(timer);
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);

    const first = startMonitoring(5000);
    const second = startMonitoring(5000);

    await Promise.resolve();
    await Promise.resolve();

    expect(first).toBe(timer);
    expect(second).toBe(timer);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledTimes(1);

    stopMonitoring();
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });

  it('starts automatic backups only once and avoids duplicate bootstrap backups', async () => {
    const timer = { kind: 'backup-timer' } as unknown as NodeJS.Timeout;
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(timer);
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);

    const first = setupAutomaticBackups();
    const second = setupAutomaticBackups();

    await Promise.resolve();
    await Promise.resolve();

    expect(first).toBe(timer);
    expect(second).toBe(timer);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(getAllEmployeesMock).toHaveBeenCalledTimes(1);

    stopAutomaticBackups();
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });

  it('allows monitoring and backup schedulers to restart after stop', async () => {
    const monitoringTimer1 = { kind: 'monitor-1' } as unknown as NodeJS.Timeout;
    const monitoringTimer2 = { kind: 'monitor-2' } as unknown as NodeJS.Timeout;
    const backupTimer1 = { kind: 'backup-1' } as unknown as NodeJS.Timeout;
    const backupTimer2 = { kind: 'backup-2' } as unknown as NodeJS.Timeout;
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockReturnValueOnce(monitoringTimer1)
      .mockReturnValueOnce(monitoringTimer2)
      .mockReturnValueOnce(backupTimer1)
      .mockReturnValueOnce(backupTimer2);

    const firstMonitoring = startMonitoring(1000);
    stopMonitoring();
    const secondMonitoring = startMonitoring(1000);

    const firstBackup = setupAutomaticBackups();
    stopAutomaticBackups();
    const secondBackup = setupAutomaticBackups();

    await Promise.resolve();
    await Promise.resolve();

    expect(firstMonitoring).toBe(monitoringTimer1);
    expect(secondMonitoring).toBe(monitoringTimer2);
    expect(firstBackup).toBe(backupTimer1);
    expect(secondBackup).toBe(backupTimer2);
    expect(setIntervalSpy).toHaveBeenCalledTimes(4);
  });
});

describe('db-monitoring restore safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockImplementation(() => true);
    readFileSyncMock.mockReturnValue('{}');
  });

  it('restores inside a transaction using safe delete order and raw table inserts', async () => {
    const backupPayload = {
      metadata: {
        timestamp: '2026-03-14T00:00:00.000Z',
        type: 'manual',
        version: '1.0.0',
        databaseType: 'postgres'
      },
      employees: [
        {
          id: 7,
          name: 'Alice',
          idNumber: 'aes:encrypted-value',
          isEncrypted: true,
          position: 'Operator',
          department: 'Ops',
          email: null,
          phone: null,
          active: true,
          specialLeaveDays: 0,
          specialLeaveWorkDateRange: null,
          specialLeaveUsedDates: [],
          specialLeaveCashDays: 0,
          specialLeaveCashMonth: null,
          specialLeaveNotes: null,
          createdAt: '2026-03-01T00:00:00.000Z'
        }
      ],
      settings: {
        id: 3,
        baseHourlyRate: 200,
        ot1Multiplier: 1.34,
        ot2Multiplier: 1.67,
        baseMonthSalary: 30000,
        welfareAllowance: 1000,
        deductions: [],
        allowances: [],
        adminPin: 'hashed-pin',
        updatedAt: '2026-03-01T00:00:00.000Z'
      },
      holidays: [
        {
          id: 5,
          employeeId: 7,
          date: '2026/03/10',
          name: '國定假日',
          holidayType: 'national_holiday',
          description: null,
          createdAt: '2026-03-10T00:00:00.000Z'
        }
      ],
      pendingBindings: [
        {
          id: 4,
          employeeId: 7,
          lineUserId: 'line-user-7',
          lineDisplayName: 'Alice Line',
          linePictureUrl: null,
          status: 'approved',
          requestedAt: '2026-03-09T00:00:00.000Z',
          reviewedAt: '2026-03-09T01:00:00.000Z',
          reviewedBy: 'admin',
          rejectReason: null
        }
      ],
      salaryRecords: [
        {
          id: 9,
          salaryYear: 2026,
          salaryMonth: 3,
          employeeId: 7,
          employeeName: 'Alice',
          baseSalary: 30000,
          housingAllowance: 0,
          welfareAllowance: 0,
          totalOT1Hours: 0,
          totalOT2Hours: 0,
          totalOvertimePay: 0,
          holidayDays: 0,
          holidayDailySalary: 0,
          totalHolidayPay: 0,
          grossSalary: 30000,
          deductions: [],
          allowances: [],
          totalDeductions: 0,
          netSalary: 30000,
          attendanceData: [],
          specialLeaveInfo: null,
          createdAt: '2026-03-14T00:00:00.000Z'
        }
      ],
      temporaryAttendance: [
        {
          id: 11,
          employeeId: 7,
          date: '2026/03/14',
          clockIn: '08:00',
          clockOut: '17:00',
          isHoliday: false,
          isBarcodeScanned: true,
          holidayId: 5,
          holidayType: null,
          createdAt: '2026-03-14T00:00:00.000Z'
        }
      ]
    };

    readFileSyncMock.mockReturnValue(JSON.stringify(backupPayload));

    const restored = await restoreFromBackup('backup-restore-safe', undefined, {
      skipPreRestoreBackup: true
    });

    expect(restored).toBe(true);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txDeleteMock.mock.calls.map(([table]) => table)).toEqual([
      schema.temporaryAttendance,
      schema.salaryRecords,
      schema.holidays,
      schema.pendingBindings,
      schema.settings,
      schema.employees
    ]);
    expect(txInsertValuesMock.mock.calls.map(([values]) => values)).toEqual([
      [
        {
          ...backupPayload.employees[0],
          createdAt: new Date(backupPayload.employees[0].createdAt)
        }
      ],
      {
        ...backupPayload.settings,
        updatedAt: new Date(backupPayload.settings.updatedAt)
      },
      [
        {
          ...backupPayload.pendingBindings[0],
          requestedAt: new Date(backupPayload.pendingBindings[0].requestedAt),
          reviewedAt: new Date(backupPayload.pendingBindings[0].reviewedAt)
        }
      ],
      [
        {
          ...backupPayload.holidays[0],
          createdAt: new Date(backupPayload.holidays[0].createdAt)
        }
      ],
      [
        {
          ...backupPayload.salaryRecords[0],
          createdAt: new Date(backupPayload.salaryRecords[0].createdAt)
        }
      ],
      [
        {
          ...backupPayload.temporaryAttendance[0],
          createdAt: new Date(backupPayload.temporaryAttendance[0].createdAt)
        }
      ]
    ]);
    expect(txExecuteMock).toHaveBeenCalledTimes(6);
    expect(createEmployeeMock).not.toHaveBeenCalled();
    expect(createOrUpdateSettingsMock).not.toHaveBeenCalled();
    expect(createHolidayMock).not.toHaveBeenCalled();
    expect(createSalaryRecordMock).not.toHaveBeenCalled();
    expect(createTemporaryAttendanceMock).not.toHaveBeenCalled();
  });

  it('rejects backups that violate employee foreign-key readiness checks', async () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        metadata: {
          timestamp: '2026-03-14T00:00:00.000Z',
          type: 'manual',
          version: '1.0.0',
          databaseType: 'postgres'
        },
        employees: [],
        holidays: [
          {
            id: 1,
            employeeId: 999,
            date: '2026/03/14',
            name: '國定假日',
            holidayType: 'national_holiday',
            description: null,
            createdAt: '2026-03-14T00:00:00.000Z'
          }
        ],
        salaryRecords: [],
        temporaryAttendance: []
      })
    );

    await expect(
      restoreFromBackup('backup-invalid-fk', undefined, {
        skipPreRestoreBackup: true
      })
    ).rejects.toThrow('備份驗證失敗');

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('inspects legacy manual backup paths and surfaces warnings without failing', () => {
    readFileSyncMock.mockReturnValue('{}');

    const inspection = inspectBackupFileAtPath('/tmp/backups/manual/backup-legacy.json', {
      backupId: 'backup-legacy',
      backupType: 'manual'
    });

    expect(inspection.backupId).toBe('backup-legacy');
    expect(inspection.path).toBe('/tmp/backups/manual/backup-legacy.json');
    expect(inspection.errors).toEqual([]);
    expect(inspection.warnings).toContain('備份 metadata 缺少 timestamp');
  });

  it('rehearses restore inside a transaction and rolls back after collecting restored counts', async () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        metadata: {
          timestamp: '2026-03-15T00:00:00.000Z',
          type: 'manual',
          version: '1.0.0',
          databaseType: 'postgres'
        },
        employees: [
          {
            id: 3,
            name: 'Rehearsal Employee',
            idNumber: 'A123456789',
            isEncrypted: false,
            position: 'Tester',
            department: 'QA',
            email: null,
            phone: null,
            active: true,
            specialLeaveDays: 0,
            specialLeaveWorkDateRange: null,
            specialLeaveUsedDates: [],
            specialLeaveCashDays: 0,
            specialLeaveCashMonth: null,
            specialLeaveNotes: null,
            createdAt: '2026-03-15T00:00:00.000Z'
          }
        ],
        holidays: [],
        salaryRecords: [],
        temporaryAttendance: []
      })
    );

    executeMock
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 4 }])
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ count: 1 }]);

    txExecuteMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }]);

    const result = await rehearseRestoreFromBackup('backup-rehearsal-safe');

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(result.rehearsalRolledBack).toBe(true);
    expect(result.backupCounts).toEqual({
      employees: 1,
      holidays: 0,
      pendingBindings: 0,
      salaryRecords: 0,
      temporaryAttendance: 0,
      hasSettings: false
    });
    expect(result.liveCountsBefore).toEqual({
      employees: 2,
      holidays: 1,
      pendingBindings: 1,
      salaryRecords: 4,
      temporaryAttendance: 3,
      hasSettings: true
    });
    expect(result.restoredCountsInTransaction).toEqual({
      employees: 1,
      holidays: 0,
      pendingBindings: 0,
      salaryRecords: 0,
      temporaryAttendance: 0,
      hasSettings: false
    });
  });
});
