import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJsonTestServer, jsonRequest } from '../test-utils/http-test-server';
import { TEST_ADMIN_HEADER, setupTestAdminSession } from '../test-utils/admin-test-session';

const salaryState = vi.hoisted(() => ({
  records: [
    {
      id: 7,
      salaryYear: 2026,
      salaryMonth: 3,
      employeeId: 5,
      employeeName: '測試員工',
      baseSalary: 30000,
      housingAllowance: 0,
      welfareAllowance: 500,
      totalOT1Hours: 2,
      totalOT2Hours: 1,
      totalOvertimePay: 800,
      holidayDays: 0,
      holidayDailySalary: 0,
      totalHolidayPay: 0,
      grossSalary: 31300,
      deductions: [],
      totalDeductions: 0,
      netSalary: 31300,
      attendanceData: [],
      createdAt: new Date('2026-03-12T00:00:00.000Z')
    }
  ] as Array<Record<string, unknown>>
}));

const storageMock = vi.hoisted(() => ({
  getAllSalaryRecords: vi.fn(async () => salaryState.records),
  getSalaryRecordById: vi.fn(async (id: number) =>
    salaryState.records.find((record) => record.id === id)
  )
}));

vi.mock('../storage', () => ({
  storage: storageMock
}));

vi.mock('../middleware/requireAdmin', () => ({
  requireAdmin: () => (req: { session?: { adminAuth?: { isAdmin?: boolean } } }, res: any, next: () => void) => {
    if (!req.session?.adminAuth?.isAdmin) {
      return res.status(401).json({
        success: false,
        message: '缺少管理員授權，請重新登入管理員模式'
      });
    }

    next();
  }
}));

let registerSalaryRoutes: typeof import('./salary.routes').registerSalaryRoutes;

beforeAll(async () => {
  ({ registerSalaryRoutes } = await import('./salary.routes'));
});

beforeEach(() => {
  salaryState.records = [
    {
      id: 7,
      salaryYear: 2026,
      salaryMonth: 3,
      employeeId: 5,
      employeeName: '測試員工',
      baseSalary: 30000,
      housingAllowance: 0,
      welfareAllowance: 500,
      totalOT1Hours: 2,
      totalOT2Hours: 1,
      totalOvertimePay: 800,
      holidayDays: 0,
      holidayDailySalary: 0,
      totalHolidayPay: 0,
      grossSalary: 31300,
      deductions: [],
      totalDeductions: 0,
      netSalary: 31300,
      attendanceData: [],
      createdAt: new Date('2026-03-12T00:00:00.000Z')
    }
  ];
  vi.clearAllMocks();
});

describe('salary routes integration', () => {
  it('requires admin authorization for salary record reads and debug endpoints', async () => {
    const server = await createJsonTestServer(registerSalaryRoutes, {
      setupApp: async (app) => {
        setupTestAdminSession(app);
      }
    });

    try {
      const endpoints = [
        { path: '/api/salary-records', method: 'GET' },
        { path: '/api/salary-records/7', method: 'GET' },
        { path: '/api/salary-records/7/pdf', method: 'GET' },
        { path: '/api/test-salary-calculation', method: 'GET' }
      ];

      for (const endpoint of endpoints) {
        const result = await jsonRequest<{ success: boolean; message: string }>(
          server.baseUrl,
          endpoint.path,
          {
            method: endpoint.method,
            redirect: 'manual'
          }
        );

        expect(result.response.status).toBe(401);
      }
    } finally {
      await server.close();
    }
  });

  it('returns salary data and print redirect for authorized admin requests', async () => {
    const server = await createJsonTestServer(registerSalaryRoutes, {
      setupApp: async (app) => {
        setupTestAdminSession(app);
      }
    });

    try {
      const headers = {
        [TEST_ADMIN_HEADER]: 'true'
      };

      const listResult = await jsonRequest<Array<Record<string, unknown>>>(
        server.baseUrl,
        '/api/salary-records',
        { headers }
      );
      expect(listResult.response.status).toBe(200);
      expect(listResult.body).toEqual([
        expect.objectContaining({
          id: 7,
          employeeName: '測試員工',
          netSalary: 31300
        })
      ]);

      const detailResult = await jsonRequest<Record<string, unknown>>(
        server.baseUrl,
        '/api/salary-records/7',
        { headers }
      );
      expect(detailResult.response.status).toBe(200);
      expect(detailResult.body).toEqual(
        expect.objectContaining({
          id: 7,
          salaryYear: 2026,
          salaryMonth: 3
        })
      );

      const pdfResult = await jsonRequest<null>(
        server.baseUrl,
        '/api/salary-records/7/pdf',
        {
          headers,
          redirect: 'manual'
        }
      );
      expect(pdfResult.response.status).toBe(302);
      expect(pdfResult.response.headers.get('location')).toBe('/print-salary?id=7');
    } finally {
      await server.close();
    }
  });
});
