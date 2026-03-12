import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJsonTestServer, jsonRequest } from '../test-utils/http-test-server';

const employeeState = vi.hoisted(() => ({
  employee: {
    id: 5,
    name: '測試員工',
    idNumber: 'A123456789',
    isEncrypted: false,
    position: null,
    department: '生產部',
    email: null,
    phone: null,
    active: true,
    specialLeaveDays: 0,
    specialLeaveWorkDateRange: null,
    specialLeaveUsedDates: [] as string[],
    specialLeaveCashDays: 0,
    specialLeaveCashMonth: null,
    specialLeaveNotes: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z')
  },
  holidays: [] as Array<Record<string, any>>,
  temporaryAttendance: [] as Array<Record<string, any>>,
  createdHolidays: [] as Array<Record<string, any>>,
  createdAttendance: [] as Array<Record<string, any>>,
  deletedHolidayIds: [] as number[],
  deletedAttendanceHolidayIds: [] as number[],
  nextHolidayId: 1
}));

const storageMock = vi.hoisted(() => ({
  getAllEmployees: vi.fn(async () => [employeeState.employee]),
  getEmployeeById: vi.fn(async (id: number) => (id === employeeState.employee.id ? employeeState.employee : undefined)),
  updateEmployee: vi.fn(async (id: number, payload: Record<string, unknown>) => {
    if (id !== employeeState.employee.id) {
      return undefined;
    }

    employeeState.employee = {
      ...employeeState.employee,
      ...payload
    };

    return employeeState.employee;
  }),
  getAllHolidays: vi.fn(async () => employeeState.holidays),
  createHoliday: vi.fn(async (payload: Record<string, any>) => {
    const holiday = {
      id: employeeState.nextHolidayId,
      description: null,
      createdAt: new Date('2026-03-12T00:00:00.000Z'),
      ...payload
    };

    employeeState.nextHolidayId += 1;
    employeeState.createdHolidays.push(holiday);
    employeeState.holidays.push(holiday);
    return holiday;
  }),
  getTemporaryAttendanceByEmployeeAndDate: vi.fn(async (employeeId: number, date: string) =>
    employeeState.temporaryAttendance.filter(
      (record) => record.employeeId === employeeId && record.date === date
    )
  ),
  createTemporaryAttendance: vi.fn(async (payload: Record<string, any>) => {
    const attendance = {
      id: employeeState.createdAttendance.length + 1,
      createdAt: new Date('2026-03-12T00:00:00.000Z'),
      ...payload
    };

    employeeState.createdAttendance.push(attendance);
    employeeState.temporaryAttendance.push(attendance);
    return attendance;
  }),
  deleteTemporaryAttendanceByHolidayId: vi.fn(async (holidayId: number) => {
    employeeState.deletedAttendanceHolidayIds.push(holidayId);
    employeeState.temporaryAttendance = employeeState.temporaryAttendance.filter(
      (record) => record.holidayId !== holidayId
    );
    return true;
  }),
  deleteHoliday: vi.fn(async (holidayId: number) => {
    employeeState.deletedHolidayIds.push(holidayId);
    employeeState.holidays = employeeState.holidays.filter((holiday) => holiday.id !== holidayId);
    return true;
  })
}));

vi.mock('../storage', () => ({
  storage: storageMock
}));

vi.mock('../middleware/requireAdmin', () => ({
  requireAdmin: () => (req: { headers: Record<string, string | undefined> }, res: any, next: () => void) => {
    if (!req.headers['x-admin-pin']) {
      return res.status(401).json({
        success: false,
        message: '缺少管理員授權，請重新登入管理員模式'
      });
    }

    next();
  }
}));

let registerEmployeeRoutes: typeof import('./employees.routes').registerEmployeeRoutes;

beforeAll(async () => {
  ({ registerEmployeeRoutes } = await import('./employees.routes'));
});

beforeEach(() => {
  employeeState.employee = {
    id: 5,
    name: '測試員工',
    idNumber: 'A123456789',
    isEncrypted: false,
    position: null,
    department: '生產部',
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
  };
  employeeState.holidays = [];
  employeeState.temporaryAttendance = [];
  employeeState.createdHolidays = [];
  employeeState.createdAttendance = [];
  employeeState.deletedHolidayIds = [];
  employeeState.deletedAttendanceHolidayIds = [];
  employeeState.nextHolidayId = 1;
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('employee routes integration', () => {
  it('adds special leave holidays and placeholder attendance when specialLeaveUsedDates grow', async () => {
    const server = await createJsonTestServer(registerEmployeeRoutes);

    try {
      const result = await jsonRequest<{ specialLeaveUsedDates: string[] }>(
        server.baseUrl,
        '/api/employees/5',
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-admin-pin': '123456'
          },
          body: JSON.stringify({
            specialLeaveUsedDates: ['2026-03-12']
          })
        }
      );

      expect(result.response.status).toBe(200);
      expect(result.body?.specialLeaveUsedDates).toEqual(['2026-03-12']);
      expect(employeeState.createdHolidays).toEqual([
        expect.objectContaining({
          employeeId: 5,
          date: '2026/03/12',
          name: '特別休假',
          holidayType: 'special_leave'
        })
      ]);
      expect(employeeState.createdAttendance).toEqual([
        expect.objectContaining({
          employeeId: 5,
          date: '2026/03/12',
          clockIn: '--:--',
          clockOut: '--:--',
          holidayType: 'special_leave'
        })
      ]);
    } finally {
      await server.close();
    }
  });

  it('removes linked holiday attendance when specialLeaveUsedDates shrink', async () => {
    employeeState.employee.specialLeaveUsedDates = ['2026/03/12'];
    employeeState.holidays = [
      {
        id: 9,
        employeeId: 5,
        date: '2026/03/12',
        name: '特別休假',
        holidayType: 'special_leave',
        description: null,
        createdAt: new Date('2026-03-12T00:00:00.000Z')
      }
    ];
    employeeState.temporaryAttendance = [
      {
        id: 1,
        employeeId: 5,
        date: '2026/03/12',
        clockIn: '--:--',
        clockOut: '--:--',
        isHoliday: true,
        isBarcodeScanned: false,
        holidayId: 9,
        holidayType: 'special_leave',
        createdAt: new Date('2026-03-12T00:00:00.000Z')
      }
    ];

    const server = await createJsonTestServer(registerEmployeeRoutes);

    try {
      const result = await jsonRequest<{ specialLeaveUsedDates: string[] }>(
        server.baseUrl,
        '/api/employees/5',
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-admin-pin': '123456'
          },
          body: JSON.stringify({
            specialLeaveUsedDates: []
          })
        }
      );

      expect(result.response.status).toBe(200);
      expect(result.body?.specialLeaveUsedDates).toEqual([]);
      expect(employeeState.deletedAttendanceHolidayIds).toEqual([9]);
      expect(employeeState.deletedHolidayIds).toEqual([9]);
    } finally {
      await server.close();
    }
  });
});
