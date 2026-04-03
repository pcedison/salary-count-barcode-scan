import type { Express, Request } from 'express';

import { insertEmployeeSchema } from '@shared/schema';
import {
  diffSpecialLeaveDates,
  normalizeDateToSlash,
} from '@shared/utils/specialLeaveSync';
import type { Employee } from '@shared/schema';

import { requireAdmin } from '../middleware/requireAdmin';
import { storage } from '../storage';
import {
  getEmployeeDisplayId,
  getEmployeeScanId,
  maskEmployeeIdentityForLog
} from '../utils/employeeIdentity';
import { createLogger } from '../utils/logger';

import { handleRouteError, parseNumericId } from './route-helpers';

const log = createLogger('employees');

const employeePatchSchema = insertEmployeeSchema
  .pick({
    specialLeaveDays: true,
    specialLeaveWorkDateRange: true,
    specialLeaveUsedDates: true,
    specialLeaveCashDays: true,
    specialLeaveCashMonth: true,
    specialLeaveNotes: true,
    name: true,
    position: true,
    department: true,
    email: true,
    phone: true,
    active: true
  })
  .partial();

function applyCreateEmployeeEncryptionFlag(
  requestBody: Record<string, any>,
  validatedData: Record<string, any>
) {
  const useEncryption = requestBody.useEncryption === true;
  const maskedId = maskEmployeeIdentityForLog(validatedData.idNumber || '');

  if (validatedData.idNumber && useEncryption) {
    log.info(`新增員工，ID加密已啟用 ${maskedId}`);
    validatedData.isEncrypted = true;
    return;
  }

  log.info(`新增員工，ID加密未啟用 ${maskedId}`);
  validatedData.isEncrypted = false;
}

function applyUpdateEmployeeEncryptionFlag(
  requestBody: Record<string, any>,
  validatedData: Record<string, any>
) {
  const useEncryption = requestBody.useEncryption === true;
  const maskedId = maskEmployeeIdentityForLog(validatedData.idNumber || '');

  if (validatedData.idNumber && useEncryption) {
    log.info(`更新員工，ID加密已啟用 ${maskedId}`);
    validatedData.isEncrypted = true;
    return;
  }

  if ('useEncryption' in requestBody) {
    log.info(`更新員工，ID加密未啟用 ${maskedId}`);
    validatedData.isEncrypted = false;
  }
}

async function syncEmployeeSpecialLeaveDates(
  employeeId: number,
  employeeName: string,
  oldDates: string[] = [],
  newDates: string[] = []
) {
  const { addedDates, removedDates } = diffSpecialLeaveDates(oldDates, newDates);
  if (addedDates.length === 0 && removedDates.length === 0) {
    return;
  }

  const allHolidays = await storage.getAllHolidays();
  const uniqueAddedDates = Array.from(new Set(addedDates));
  const uniqueRemovedDates = Array.from(new Set(removedDates));

  for (const date of uniqueAddedDates) {
    const dateSlash = normalizeDateToSlash(date);

    try {
      const existingHoliday = allHolidays.find(holiday =>
        holiday.employeeId === employeeId &&
        holiday.holidayType === 'special_leave' &&
        (holiday.date === dateSlash || holiday.date === date)
      );

      if (existingHoliday) {
        continue;
      }

      const holiday = await storage.createHoliday({
        employeeId,
        date: dateSlash,
        name: '特別休假',
        holidayType: 'special_leave'
      });

      const existingAttendance = await storage.getTemporaryAttendanceByEmployeeAndDate(
        employeeId,
        dateSlash
      );

      if (existingAttendance.length === 0) {
        await storage.createTemporaryAttendance({
          employeeId,
          date: dateSlash,
          clockIn: '--:--',
          clockOut: '--:--',
          isHoliday: true,
          isBarcodeScanned: false,
          holidayId: holiday.id,
          holidayType: 'special_leave'
        });
      }

      allHolidays.push(holiday);
      log.info(`為員工 ${employeeName} 新增特別休假: ${dateSlash}`);
    } catch (err) {
      log.error(`新增 ${date} 失敗:`, err);
    }
  }

  for (const date of uniqueRemovedDates) {
    const dateSlash = normalizeDateToSlash(date);

    try {
      const holidaysToRemove = allHolidays.filter(holiday =>
        holiday.employeeId === employeeId &&
        holiday.holidayType === 'special_leave' &&
        (holiday.date === dateSlash || holiday.date === date)
      );

      for (const holiday of holidaysToRemove) {
        await storage.deleteTemporaryAttendanceByHolidayId(holiday.id);
        await storage.deleteHoliday(holiday.id);
        log.info(`為員工 ${employeeName} 移除特別休假: ${holiday.date}`);
      }
    } catch (err) {
      log.error(`移除 ${date} 失敗:`, err);
    }
  }
}

function toPublicEmployeeProfile(employee: Employee) {
  return {
    id: employee.id,
    name: employee.name,
    position: employee.position,
    department: employee.department,
    active: employee.active
  };
}

function toAdminEmployeeProfile(employee: Employee, includeScanId = true) {
  const base = {
    ...employee,
    idNumber: getEmployeeDisplayId(employee),
  };
  if (includeScanId) {
    return { ...base, scanIdNumber: getEmployeeScanId(employee) };
  }
  return base;
}

export function registerEmployeeRoutes(app: Express): void {
  app.get('/api/employees', async (_req, res) => {
    try {
      const employees = await storage.getAllEmployees();
      return res.json(employees.map(toPublicEmployeeProfile));
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/employees/admin', requireAdmin(), async (_req, res) => {
    try {
      const [employeeList, settings] = await Promise.all([
        storage.getAllEmployees(),
        storage.getSettings(),
      ]);
      const includeScanId = settings?.barcodeEnabled !== false;
      return res.json(employeeList.map(e => toAdminEmployeeProfile(e, includeScanId)));
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.get('/api/employees/:id', requireAdmin(), async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: '無效的ID' });
      }

      const [employee, settings] = await Promise.all([
        storage.getEmployeeById(id),
        storage.getSettings(),
      ]);
      if (!employee) {
        return res.status(404).json({ message: '找不到員工' });
      }

      const includeScanId = settings?.barcodeEnabled !== false;
      return res.json(toAdminEmployeeProfile(employee, includeScanId));
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.post('/api/employees', requireAdmin(), async (req, res) => {
    try {
      const validatedData = insertEmployeeSchema.parse(req.body);
      applyCreateEmployeeEncryptionFlag(req.body, validatedData);

      const employee = await storage.createEmployee(validatedData);
      return res.status(201).json(employee);
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.put('/api/employees/:id', requireAdmin(), async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: '無效的ID' });
      }

      const validatedData = insertEmployeeSchema.partial().parse(req.body);
      applyUpdateEmployeeEncryptionFlag(req.body, validatedData);

      const [updatedEmployee, settings] = await Promise.all([
        storage.updateEmployee(id, validatedData),
        storage.getSettings(),
      ]);
      if (!updatedEmployee) {
        return res.status(404).json({ message: '找不到員工' });
      }

      const includeScanId = settings?.barcodeEnabled !== false;
      return res.json(toAdminEmployeeProfile(updatedEmployee, includeScanId));
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.patch('/api/employees/:id', requireAdmin(), async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: '無效的ID' });
      }

      const filteredData = employeePatchSchema.parse(req.body);

      if (Object.keys(filteredData).length === 0) {
        const currentEmployee = await storage.getEmployeeById(id);
        if (!currentEmployee) return res.status(404).json({ message: '找不到員工' });
        const settings = await storage.getSettings();
        const includeScanId = settings?.barcodeEnabled !== false;
        return res.json(toAdminEmployeeProfile(currentEmployee, includeScanId));
      }

      if (filteredData.specialLeaveUsedDates !== undefined) {
        const existingEmployee = await storage.getEmployeeById(id);
        if (existingEmployee) {
          const oldDates = Array.isArray(existingEmployee.specialLeaveUsedDates)
            ? existingEmployee.specialLeaveUsedDates.filter(
                (date): date is string => typeof date === 'string'
              )
            : [];
          const newDates = Array.isArray(filteredData.specialLeaveUsedDates)
            ? filteredData.specialLeaveUsedDates.filter(
                (date): date is string => typeof date === 'string'
              )
            : [];

          await syncEmployeeSpecialLeaveDates(
            id,
            existingEmployee.name,
            oldDates,
            newDates
          );
        }
      }

      const [updatedEmployee, settings] = await Promise.all([
        storage.updateEmployee(id, filteredData),
        storage.getSettings()
      ]);
      if (!updatedEmployee) {
        return res.status(404).json({ message: '找不到員工' });
      }

      const includeScanId = settings?.barcodeEnabled !== false;
      return res.json(toAdminEmployeeProfile(updatedEmployee, includeScanId));
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.delete('/api/employees/:id', requireAdmin(), async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: '無效的ID' });
      }

      const success = await storage.deleteEmployee(id);
      if (!success) {
        return res.status(404).json({ message: '找不到員工' });
      }

      return res.status(204).end();
    } catch (err) {
      return handleRouteError(err, res);
    }
  });
}
