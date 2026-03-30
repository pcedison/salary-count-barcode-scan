import type { Express } from 'express';

import { insertTemporaryAttendanceSchema } from '@shared/schema';

import { requireAdmin } from '../middleware/requireAdmin';
import { storage } from '../storage';
import { createLogger } from '../utils/logger';

import { filterAttendanceRecordsByDate, getTodayDateKey } from './attendance-helpers';
import { handleRouteError, parseNumericId } from './route-helpers';

const log = createLogger('attendance');

function toPublicTodayAttendanceRecord(
  record: Awaited<ReturnType<typeof storage.getTemporaryAttendance>>[number],
  employeeDirectory: Map<number, { name: string; department: string | null }>
) {
  const employeeId = record.employeeId ?? null;
  const employee = employeeId === null ? undefined : employeeDirectory.get(employeeId);

  return {
    id: record.id,
    employeeId,
    employeeName: employee?.name ?? 'Unknown employee',
    department: employee?.department ?? null,
    date: record.date,
    clockIn: record.clockIn,
    clockOut: record.clockOut,
    isBarcodeScanned: Boolean(record.isBarcodeScanned)
  };
}

export function registerAttendanceRoutes(app: Express): void {
  app.get('/api/attendance', requireAdmin(), async (_req, res) => {
    try {
      log.debug('Loading all attendance records');
      const attendanceRecords = await storage.getTemporaryAttendance();
      return res.json(attendanceRecords);
    } catch (err) {
      log.error('Failed to load attendance records', err);
      return handleRouteError(err, res);
    }
  });

  app.get('/api/attendance/today', async (_req, res) => {
    try {
      const startTime = Date.now();
      const todayDateKey = getTodayDateKey();
      const allAttendanceRecords = await storage.getTemporaryAttendance();
      const todayRecords = filterAttendanceRecordsByDate(allAttendanceRecords, todayDateKey)
        .filter((record) => record.isBarcodeScanned === true);
      const employees = await storage.getAllEmployees();
      const employeeDirectory = new Map(
        employees.map((employee) => [
          employee.id,
          {
            name: employee.name,
            department: employee.department ?? null
          }
        ])
      );

      log.debug(
        `Loaded public today attendance payload in ${Date.now() - startTime}ms (${todayRecords.length} records)`
      );

      return res.json(
        todayRecords.map((record) => toPublicTodayAttendanceRecord(record, employeeDirectory))
      );
    } catch (err) {
      log.error('Failed to load today attendance records', err);
      return handleRouteError(err, res);
    }
  });

  app.post('/api/attendance', requireAdmin(), async (req, res) => {
    try {
      const validatedData = insertTemporaryAttendanceSchema.parse(req.body);
      const attendance = await storage.createTemporaryAttendance(validatedData);
      return res.status(201).json(attendance);
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.put('/api/attendance/:id', requireAdmin(), async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const validatedData = insertTemporaryAttendanceSchema.partial().parse(req.body);
      const updatedAttendance = await storage.updateTemporaryAttendance(id, validatedData);

      if (!updatedAttendance) {
        return res.status(404).json({ message: 'Attendance record not found' });
      }

      return res.json(updatedAttendance);
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.delete('/api/attendance/:id', requireAdmin(), async (req, res) => {
    try {
      const id = parseNumericId(req.params.id);
      if (id === null) {
        return res.status(400).json({ message: 'Invalid ID' });
      }

      const success = await storage.deleteTemporaryAttendance(id);
      if (!success) {
        return res.status(404).json({ message: 'Attendance record not found' });
      }

      return res.status(204).end();
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.delete('/api/attendance', requireAdmin(), async (_req, res) => {
    try {
      await storage.deleteAllTemporaryAttendance();
      return res.status(204).end();
    } catch (err) {
      return handleRouteError(err, res);
    }
  });

  app.delete('/api/attendance/employee/:employeeId', requireAdmin(), async (req, res) => {
    try {
      const employeeId = parseNumericId(req.params.employeeId);
      if (employeeId === null) {
        return res.status(400).json({ message: 'Invalid employee ID' });
      }

      await storage.deleteTemporaryAttendanceByEmployeeId(employeeId);
      return res.status(204).end();
    } catch (err) {
      return handleRouteError(err, res);
    }
  });
}
