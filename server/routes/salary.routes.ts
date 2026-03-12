import type { Express } from 'express';

import { insertSalaryRecordSchema, type InsertSalaryRecord, type Settings } from '@shared/schema';

import { requireAdmin } from '../middleware/requireAdmin';
import { storage } from '../storage';
import type { OvertimeHours } from '../utils/salaryCalculator';

import {
  deriveHolidayPayBase,
  filterAttendanceForSalaryMonth,
  mergeSalaryDeductions,
  normalizeSalaryDeductions,
  shouldRecalculateSalary,
  toCalculationSettings
} from './salary-helpers';
import { handleRouteError, parseNumericId } from './route-helpers';

async function loadSalaryCalculator() {
  return import('../utils/salaryCalculator');
}

function logHolidayAdjustmentSummary(
  employeeId: number | null | undefined,
  salaryYear: number,
  salaryMonth: number,
  holidayAdjustments: {
    sickLeaveDays: number;
    sickLeaveDeduction: number;
    personalLeaveDays: number;
    personalLeaveDeduction: number;
    typhoonLeaveDays: number;
    typhoonLeaveDeduction: number;
    workedHolidayDays: number;
    workedHolidayPay: number;
  }
) {
  if (
    holidayAdjustments.sickLeaveDays === 0 &&
    holidayAdjustments.personalLeaveDays === 0 &&
    holidayAdjustments.typhoonLeaveDays === 0 &&
    holidayAdjustments.workedHolidayDays === 0
  ) {
    return;
  }

  console.log(
    `員工 ${employeeId || 'unknown'} ${salaryYear}年${salaryMonth}月 請假扣款: ` +
      `病假${holidayAdjustments.sickLeaveDays}天(${holidayAdjustments.sickLeaveDeduction}元) ` +
      `事假${holidayAdjustments.personalLeaveDays}天(${holidayAdjustments.personalLeaveDeduction}元) ` +
      `颱風假${holidayAdjustments.typhoonLeaveDays}天(${holidayAdjustments.typhoonLeaveDeduction}元) ` +
      `假日出勤加給${holidayAdjustments.workedHolidayDays}天(${holidayAdjustments.workedHolidayPay}元)`
  );
}

async function buildCalculatedSalaryRecord(
  draft: InsertSalaryRecord,
  settings: Settings,
  options?: {
    previousRecord?: {
      employeeId?: number | null;
      salaryYear?: number | null;
      salaryMonth?: number | null;
      totalHolidayPay?: number | null;
      baseSalary?: number | null;
    };
  }
): Promise<InsertSalaryRecord> {
  const { calculateSalary, calculateHolidayPayAdjustments } = await loadSalaryCalculator();

  const allAttendance = await storage.getTemporaryAttendance();
  const relevantAttendance = filterAttendanceForSalaryMonth(
    allAttendance,
    draft.employeeId,
    draft.salaryYear,
    draft.salaryMonth
  );
  const calculatorAttendanceRecords = relevantAttendance.map(record => ({
    ...record,
    employeeId: record.employeeId ?? undefined,
    clockOut: record.clockOut ?? undefined
  }));

  const holidayAdjustments = calculateHolidayPayAdjustments(
    calculatorAttendanceRecords,
    draft.baseSalary
  );
  const allDeductions = mergeSalaryDeductions(
    normalizeSalaryDeductions(draft.deductions),
    holidayAdjustments.deductionItems
  );
  const totalDeductions = allDeductions.reduce(
    (sum, deduction) => sum + (deduction.amount || 0),
    0
  );

  const previousRelevantAttendance = options?.previousRecord
    ? filterAttendanceForSalaryMonth(
        allAttendance,
        options.previousRecord.employeeId,
        options.previousRecord.salaryYear || draft.salaryYear,
        options.previousRecord.salaryMonth || draft.salaryMonth
      ).map(record => ({
        ...record,
        employeeId: record.employeeId ?? undefined,
        clockOut: record.clockOut ?? undefined
      }))
    : [];
  const previousWorkedHolidayPay = options?.previousRecord
    ? calculateHolidayPayAdjustments(
        previousRelevantAttendance,
        options.previousRecord.baseSalary || draft.baseSalary
      ).workedHolidayPay || 0
    : 0;

  const holidayPayBase = deriveHolidayPayBase({
    explicitHolidayPay: draft.totalHolidayPay,
    storedTotalHolidayPay: options?.previousRecord?.totalHolidayPay,
    previousWorkedHolidayPay
  });
  const totalHolidayPay = holidayPayBase + (holidayAdjustments.workedHolidayPay || 0);

  const salaryResult = calculateSalary(
    draft.salaryYear,
    draft.salaryMonth,
    {
      totalOT1Hours: draft.totalOT1Hours || 0,
      totalOT2Hours: draft.totalOT2Hours || 0
    } satisfies OvertimeHours,
    draft.baseSalary,
    totalDeductions,
    toCalculationSettings(settings),
    totalHolidayPay,
    draft.welfareAllowance ?? undefined,
    draft.housingAllowance || 0,
    draft.employeeId || 1
  );

  logHolidayAdjustmentSummary(draft.employeeId, draft.salaryYear, draft.salaryMonth, holidayAdjustments);

  return {
    ...draft,
    deductions: allDeductions,
    totalOT1Hours: salaryResult.totalOT1Hours,
    totalOT2Hours: salaryResult.totalOT2Hours,
    totalOvertimePay: salaryResult.totalOvertimePay,
    totalHolidayPay,
    grossSalary: salaryResult.grossSalary,
    totalDeductions,
    netSalary: salaryResult.netSalary
  };
}

export function registerSalaryRoutes(app: Express): void {
  app.get('/api/salary-records', async (_req, res) => {
    try {
      const records = await storage.getAllSalaryRecords();
      return res.json(records);
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/salary-records/:id', async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const record = await storage.getSalaryRecordById(id);
      if (!record) {
        return res.status(404).json({ message: 'Salary record not found' });
      }

      return res.json(record);
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/salary-records', requireAdmin(), async (req, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings) {
        return res.status(500).json({ message: '系統設置未找到，無法計算薪資' });
      }

      const validatedData = insertSalaryRecordSchema.parse(req.body);
      const finalData = await buildCalculatedSalaryRecord(validatedData, settings);
      const record = await storage.createSalaryRecord(finalData);

      return res.status(201).json(record);
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.patch('/api/salary-records/:id', requireAdmin(), async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const settings = await storage.getSettings();
      if (!settings) {
        return res.status(500).json({ message: '系統設置未找到，無法更新薪資計算' });
      }

      const existingRecord = await storage.getSalaryRecordById(id);
      if (!existingRecord) {
        return res.status(404).json({ message: 'Salary record not found' });
      }

      const validatedData = insertSalaryRecordSchema.partial().parse(req.body);
      const forceUpdate = req.headers['x-force-update'] === 'true';
      const updateData: Partial<InsertSalaryRecord> = { ...validatedData };

      if (shouldRecalculateSalary(updateData, forceUpdate)) {
        const mergedData = {
          ...existingRecord,
          ...updateData
        } as InsertSalaryRecord;

        const recalculatedRecord = await buildCalculatedSalaryRecord(mergedData, settings, {
          previousRecord: {
            employeeId: existingRecord.employeeId,
            salaryYear: existingRecord.salaryYear,
            salaryMonth: existingRecord.salaryMonth,
            totalHolidayPay: existingRecord.totalHolidayPay,
            baseSalary: existingRecord.baseSalary
          }
        });

        updateData.deductions = recalculatedRecord.deductions;
        updateData.totalOT1Hours = recalculatedRecord.totalOT1Hours;
        updateData.totalOT2Hours = recalculatedRecord.totalOT2Hours;
        updateData.totalOvertimePay = recalculatedRecord.totalOvertimePay;
        updateData.totalHolidayPay = recalculatedRecord.totalHolidayPay;
        updateData.grossSalary = recalculatedRecord.grossSalary;
        updateData.totalDeductions = recalculatedRecord.totalDeductions;
        updateData.netSalary = recalculatedRecord.netSalary;
      }

      const record = await storage.updateSalaryRecord(id, updateData);
      if (!record) {
        return res.status(404).json({ message: '找不到薪資記錄' });
      }

      return res.json(record);
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.delete('/api/salary-records/:id', requireAdmin(), async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const deleted = await storage.deleteSalaryRecord(id);
      if (!deleted) {
        return res.status(404).json({ message: 'Salary record not found' });
      }

      return res.status(204).end();
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/test-salary-calculation', async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      if (!settings) {
        return res.status(404).json({ message: '找不到設置' });
      }

      const {
        calculateSalary,
        calculateOvertimePay
      } = await loadSalaryCalculator();

      const march2025Result = calculateSalary(
        2025,
        3,
        { totalOT1Hours: 40, totalOT2Hours: 21 },
        settings.baseMonthSalary,
        5401,
        settings,
        0,
        settings.welfareAllowance,
        0
      );

      const april2025Result = calculateSalary(
        2025,
        4,
        { totalOT1Hours: 42, totalOT2Hours: 13 },
        settings.baseMonthSalary,
        5401,
        settings,
        0,
        settings.welfareAllowance,
        0
      );

      const calculationSettings = toCalculationSettings(settings);
      const marchOvertimeHours = { totalOT1Hours: 40, totalOT2Hours: 21 };
      const marchRawOvertimePay = calculateOvertimePay(marchOvertimeHours, calculationSettings);
      const marchFinalOvertimePay = march2025Result.totalOvertimePay;

      const aprilOvertimeHours = { totalOT1Hours: 42, totalOT2Hours: 13 };
      const aprilRawOvertimePay = calculateOvertimePay(aprilOvertimeHours, calculationSettings);
      const aprilFinalOvertimePay = april2025Result.totalOvertimePay;

      return res.json({
        settings: {
          baseHourlyRate: settings.baseHourlyRate,
          ot1Multiplier: settings.ot1Multiplier,
          ot2Multiplier: settings.ot2Multiplier,
          baseMonthSalary: settings.baseMonthSalary,
          welfareAllowance: settings.welfareAllowance
        },
        march2025: {
          ...march2025Result,
          rawOvertimePay: marchRawOvertimePay,
          finalOvertimePay: marchFinalOvertimePay,
          expectedNetSalary: 36248,
          difference: 36248 - march2025Result.netSalary
        },
        april2025: {
          ...april2025Result,
          rawOvertimePay: aprilRawOvertimePay,
          finalOvertimePay: aprilFinalOvertimePay,
          expectedNetSalary: 35054,
          difference: 35054 - april2025Result.netSalary
        },
        notes: '此路由使用伺服器端標準化薪資計算模組，確保所有計算使用相同的一致方法'
      });
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/salary-records/:id/pdf', async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const record = await storage.getSalaryRecordById(id);
      if (!record) {
        return res.status(404).json({ message: 'Salary record not found' });
      }

      return res.redirect(`/print-salary?id=${id}`);
    } catch (err) {
      return handleRouteError(err, res);
    }
  });
}
