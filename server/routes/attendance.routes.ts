import type { Express } from 'express';

import { insertTemporaryAttendanceSchema } from '@shared/schema';

import { requireAdmin } from '../middleware/requireAdmin';
import { storage } from '../storage';
import { createLogger } from '../utils/logger';

import { filterAttendanceRecordsByDate, getTodayDateKey } from './attendance-helpers';
import { handleRouteError, parseNumericId } from './route-helpers';

const log = createLogger('attendance');

export function registerAttendanceRoutes(app: Express): void {
  app.get('/api/attendance', requireAdmin(), async (_req, res) => {
    try {
      log.debug('獲取所有考勤記錄');
      const attendanceRecords = await storage.getTemporaryAttendance();

      log.debug(`成功從儲存層獲取考勤記錄，數量: ${attendanceRecords.length}`);
      return res.json(attendanceRecords);
    } catch (err) {
      log.error('獲取考勤記錄失敗:', err);
      return handleRouteError(err, res);
    }
  });

  app.get('/api/attendance/today', async (_req, res) => {
    try {
      const startTime = Date.now();
      const todayDateKey = getTodayDateKey();

      log.debug('獲取今日考勤記錄');

      const allAttendanceRecords = await storage.getTemporaryAttendance();
      const todayRecords = filterAttendanceRecordsByDate(allAttendanceRecords, todayDateKey);

      const endTime = Date.now();
      log.debug(
        `今日考勤API響應時間: ${endTime - startTime}ms，找到 ${todayRecords.length} 筆記錄`
      );

      return res.json(todayRecords);
    } catch (err) {
      log.error('獲取今日考勤記錄失敗:', err);
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
