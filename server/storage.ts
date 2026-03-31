import { eq, and, desc, or, sql as drizzleSql } from "drizzle-orm";
import { normalizeDateToDash, normalizeDateToSlash } from "../shared/utils/specialLeaveSync";
import { createLogger } from "./utils/logger";
import {
  buildEmployeeIdentityLookupCandidates,
  encryptEmployeeIdentityForStorage,
  getEmployeeDisplayId,
  maskEmployeeIdentityForLog,
  matchesEmployeeIdentity,
  normalizeEmployeeIdentity,
  prepareUpdatedEmployeeIdentityForStorage
} from "./utils/employeeIdentity";
import { isAESEncrypted } from "@shared/utils/encryption";

import {
  users, type User, type InsertUser,
  temporaryAttendance, type TemporaryAttendance, type InsertTemporaryAttendance,
  settings, type Settings, type InsertSettings,
  salaryRecords, type SalaryRecord, type InsertSalaryRecord,
  holidays, type Holiday, type InsertHoliday,
  employees, type Employee, type InsertEmployee,
  pendingBindings, type PendingBinding, type InsertPendingBinding,
  oauthStates, type OAuthState, type InsertOAuthState
} from "@shared/schema";

import { db } from './db';

const log = createLogger('storage');

export interface IStorage {
  // User methods (kept for reference)
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Employee methods - for barcode scanning
  getAllEmployees(): Promise<Employee[]>;
  getEmployeeById(id: number): Promise<Employee | undefined>;
  getEmployeeByIdNumber(idNumber: string): Promise<Employee | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: number): Promise<boolean>;

  // Temporary attendance methods
  getTemporaryAttendance(): Promise<TemporaryAttendance[]>;
  getTemporaryAttendanceById(id: number): Promise<TemporaryAttendance | undefined>;
  getTemporaryAttendanceByEmployeeAndDate(employeeId: number, date: string): Promise<TemporaryAttendance[]>; // 查詢特定員工特定日期的考勤記錄
  createTemporaryAttendance(attendance: InsertTemporaryAttendance): Promise<TemporaryAttendance>;
  updateTemporaryAttendance(id: number, attendance: Partial<InsertTemporaryAttendance>): Promise<TemporaryAttendance | undefined>;
  deleteTemporaryAttendance(id: number): Promise<boolean>;
  deleteAllTemporaryAttendance(): Promise<boolean>;
  deleteTemporaryAttendanceByEmployeeId(employeeId: number): Promise<void>; // 刪除特定員工的所有考勤記錄
  recordBarcodeAttendance(idNumber: string): Promise<TemporaryAttendance | null>; // 專用於條碼掃描的考勤記錄方法

  // Settings methods
  getSettings(): Promise<Settings | undefined>;
  createOrUpdateSettings(newSettings: InsertSettings): Promise<Settings>;

  // Salary record methods
  getAllSalaryRecords(): Promise<SalaryRecord[]>;
  getSalaryRecordById(id: number): Promise<SalaryRecord | undefined>;
  getSalaryRecordByYearMonth(year: number, month: number): Promise<SalaryRecord | undefined>;
  createSalaryRecord(record: InsertSalaryRecord): Promise<SalaryRecord>;
  updateSalaryRecord(id: number, record: Partial<InsertSalaryRecord>): Promise<SalaryRecord | undefined>;
  deleteSalaryRecord(id: number): Promise<boolean>;

  // Holiday methods
  getAllHolidays(): Promise<Holiday[]>;
  getHolidayById(id: number): Promise<Holiday | undefined>;
  createHoliday(holiday: InsertHoliday): Promise<Holiday>;
  deleteHoliday(id: number): Promise<boolean>;
  deleteAllHolidays(): Promise<boolean>;
  deleteTemporaryAttendanceByEmployeeAndDate(employeeId: number, date: string): Promise<boolean>;
  deleteTemporaryAttendanceByHolidayId(holidayId: number): Promise<boolean>;
  getAttendanceByHolidayId(holidayId: number): Promise<TemporaryAttendance | undefined>;

  // LINE binding methods
  getEmployeeByLineUserId(lineUserId: string): Promise<Employee | undefined>;
  getPendingBindings(): Promise<PendingBinding[]>;
  getPendingBindingById(id: number): Promise<PendingBinding | undefined>;
  getPendingBindingByLineUserId(lineUserId: string): Promise<PendingBinding | undefined>;
  createPendingBinding(binding: InsertPendingBinding): Promise<PendingBinding>;
  approvePendingBinding(id: number, reviewedBy: string): Promise<PendingBinding | undefined>;
  rejectPendingBinding(id: number, reviewedBy: string, reason: string): Promise<PendingBinding | undefined>;
  deletePendingBinding(id: number): Promise<boolean>;

  // OAuth state methods
  createOAuthState(state: InsertOAuthState): Promise<OAuthState>;
  getOAuthState(stateValue: string): Promise<OAuthState | undefined>;
  deleteOAuthState(stateValue: string): Promise<boolean>;
  cleanupExpiredOAuthStates(): Promise<void>;

  // Encryption migration
  encryptAllPlaintextEmployees(): Promise<{ migrated: number; skipped: number }>;
}

export class DatabaseStorage implements IStorage {
  // User methods (kept for reference)
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Employee methods - for barcode scanning
  async getAllEmployees(): Promise<Employee[]> {
    return await db.select().from(employees).orderBy(employees.name);
  }

  async getEmployeeById(id: number): Promise<Employee | undefined> {
    const [employee] = await db.select().from(employees).where(eq(employees.id, id));
    return employee;
  }

  async getEmployeeByIdNumber(idNumber: string): Promise<Employee | undefined> {
    const lookupCandidates = buildEmployeeIdentityLookupCandidates(idNumber);

    for (const candidate of lookupCandidates) {
      const [employee] = await db
        .select()
        .from(employees)
        .where(eq(employees.idNumber, candidate))
        .limit(1);

      if (employee) {
        return employee;
      }
    }

    if (lookupCandidates.length === 0) {
      return undefined;
    }

    const allEmployees = await this.getAllEmployees();
    return allEmployees.find((employee) => matchesEmployeeIdentity(employee, idNumber));
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const processedEmployee = { ...employee };

    processedEmployee.idNumber = encryptEmployeeIdentityForStorage(
      processedEmployee.idNumber,
      processedEmployee.isEncrypted === true
    );

    // Strip the non-schema useEncryption flag before DB insert.
    // Zod .parse() already strips unknown keys, but this is a safety net.
    const { useEncryption: _, ...employeeForDb } = processedEmployee as typeof processedEmployee & { useEncryption?: unknown };

    // Cast: Zod infers readonly arrays for JSON columns; Drizzle expects mutable arrays.
    const [newEmployee] = await db.insert(employees).values(employeeForDb as typeof employees.$inferInsert).returning();
    return newEmployee;
  }

  async updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
    if (process.env.NODE_ENV !== 'production') {
      log.debug(`更新員工 ID ${id}, 接收到的數據:`, JSON.stringify(employee));
    }

    const originalEmployee = await this.getEmployeeById(id);
    if (!originalEmployee) {
      log.error(`找不到要更新的員工 ID ${id}`);
      return undefined;
    }

    const processedEmployee = { ...employee };

    const wantsEncryption =
      processedEmployee.isEncrypted !== undefined
        ? processedEmployee.isEncrypted === true
        : originalEmployee.isEncrypted === true;

    if (processedEmployee.idNumber !== undefined || processedEmployee.isEncrypted !== undefined) {
      processedEmployee.idNumber = prepareUpdatedEmployeeIdentityForStorage({
        currentEmployee: originalEmployee,
        nextIdNumber: processedEmployee.idNumber,
        shouldEncrypt: wantsEncryption
      });
    }

    if (process.env.NODE_ENV !== 'production' && processedEmployee.idNumber !== undefined) {
      log.debug(
        `ID處理: ${maskEmployeeIdentityForLog(originalEmployee.idNumber)} -> ${maskEmployeeIdentityForLog(
          processedEmployee.idNumber
        )} (加密=${wantsEncryption})`
      );
    }

    const { useEncryption: _, ...employeeForDb } = processedEmployee as typeof processedEmployee & { useEncryption?: unknown };

    const [updatedEmployee] = await db
      .update(employees)
      .set(employeeForDb as typeof employees.$inferInsert)
      .where(eq(employees.id, id))
      .returning();
    return updatedEmployee;
  }

  async deleteEmployee(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(employees)
      .where(eq(employees.id, id))
      .returning();
    return !!deleted;
  }

  // Temporary attendance methods
  async getTemporaryAttendance(): Promise<TemporaryAttendance[]> {
    return await db.select().from(temporaryAttendance);
  }

  async getTemporaryAttendanceById(id: number): Promise<TemporaryAttendance | undefined> {
    const [attendance] = await db.select().from(temporaryAttendance).where(eq(temporaryAttendance.id, id));
    return attendance;
  }
  
  async getTemporaryAttendanceByEmployeeAndDate(employeeId: number, date: string): Promise<TemporaryAttendance[]> {
    log.debug(`[數據查詢] 查詢員工ID: ${employeeId}, 日期: ${date} 的考勤記錄`);
    
    try {
      const slashDate = normalizeDateToSlash(date);
      const dashDate = normalizeDateToDash(date);

      // 使用精確匹配查詢
      const records = await db.select()
        .from(temporaryAttendance)
        .where(
          and(
            eq(temporaryAttendance.employeeId, employeeId),
            or(
              eq(temporaryAttendance.date, slashDate),
              eq(temporaryAttendance.date, dashDate)
            )
          )
        );
      
      log.debug(`[數據查詢] 找到 ${records.length} 筆考勤記錄`);
      if (records.length > 0) {
        log.debug(`[數據查詢] 第一筆記錄日期: ${records[0].date}`);
      }
      
      return records;
    } catch (error) {
      log.error(`[數據查詢錯誤] 查詢考勤記錄失敗:`, error);
      return []; // 返回空數組而不是拋出錯誤
    }
  }

  async createTemporaryAttendance(attendance: InsertTemporaryAttendance): Promise<TemporaryAttendance> {
    const [newAttendance] = await db.insert(temporaryAttendance).values(attendance).returning();
    return newAttendance;
  }

  async updateTemporaryAttendance(id: number, attendance: Partial<InsertTemporaryAttendance>): Promise<TemporaryAttendance | undefined> {
    const [updatedAttendance] = await db
      .update(temporaryAttendance)
      .set(attendance)
      .where(eq(temporaryAttendance.id, id))
      .returning();
    return updatedAttendance;
  }

  async deleteTemporaryAttendance(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(temporaryAttendance)
      .where(eq(temporaryAttendance.id, id))
      .returning();
    return !!deleted;
  }

  async deleteAllTemporaryAttendance(): Promise<boolean> {
    await db.delete(temporaryAttendance);
    return true;
  }
  
  async deleteTemporaryAttendanceByEmployeeId(employeeId: number): Promise<void> {
    log.info(`刪除員工ID為 ${employeeId} 的所有考勤記錄`);
    
    await db
      .delete(temporaryAttendance)
      .where(eq(temporaryAttendance.employeeId, employeeId));
    
    log.info(`成功刪除員工ID為 ${employeeId} 的所有考勤記錄`);
  }
  
  async recordBarcodeAttendance(idNumber: string): Promise<TemporaryAttendance | null> {
    try {
      if (process.env.NODE_ENV !== 'production') {
        log.debug(`掃描處理過程: 原始輸入的ID = ${maskEmployeeIdentityForLog(idNumber)}`);
      }

      const employee = await this.getEmployeeByIdNumber(idNumber);

      if (!employee) {
        if (process.env.NODE_ENV !== 'production') {
          log.debug(`找不到匹配的員工，ID: ${maskEmployeeIdentityForLog(idNumber)}`);
        }
        return null;
      }

      const now = new Date();
      const currentDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const holidays = await this.getAllHolidays();
      const isHoliday = holidays.some(holiday => holiday.date === currentDate);

      // Use a transaction with an advisory lock to prevent duplicate records
      // from rapid consecutive scans for the same employee.
      return await db.transaction(async (tx) => {
        // Advisory lock key: combine a namespace (0xBA5C = "BASC" for barcode-scan)
        // with the employee ID to serialize per-employee scans.
        await tx.execute(drizzleSql`SELECT pg_advisory_xact_lock(${0xBA5C}, ${employee.id})`);

        const attendanceRecords = await tx
          .select()
          .from(temporaryAttendance)
          .where(
            and(
              eq(temporaryAttendance.date, currentDate),
              eq(temporaryAttendance.employeeId, employee.id)
            )
          );

        log.debug(`[打卡處理] 員工ID ${employee.id}，日期 ${currentDate} 找到 ${attendanceRecords.length} 筆考勤記錄`);

        const incompleteRecords = attendanceRecords.filter(
          record => !record.clockOut || record.clockOut === ''
        );

        log.debug(`[打卡處理] 其中有 ${incompleteRecords.length} 筆未完成的記錄`);

        if (incompleteRecords.length === 0) {
          log.debug(`[打卡處理] 沒有未完成記錄，建立新的上班打卡`);
          const [newAttendance] = await tx
            .insert(temporaryAttendance)
            .values({
              employeeId: employee.id,
              date: currentDate,
              clockIn: currentTime,
              clockOut: '',
              isHoliday: isHoliday,
              isBarcodeScanned: true
            })
            .returning();
          return newAttendance;
        } else {
          const latestIncompleteRecord = incompleteRecords.sort((a, b) => {
            const timeA = a.clockIn ? a.clockIn.split(':').map(Number) : [0, 0];
            const timeB = b.clockIn ? b.clockIn.split(':').map(Number) : [0, 0];
            return (timeB[0] * 60 + timeB[1]) - (timeA[0] * 60 + timeA[1]);
          })[0];

          log.debug(`[打卡處理] 找到未完成記錄 ID: ${latestIncompleteRecord.id}，更新為下班打卡`);
          const [updatedAttendance] = await tx
            .update(temporaryAttendance)
            .set({ clockOut: currentTime })
            .where(eq(temporaryAttendance.id, latestIncompleteRecord.id))
            .returning();
          return updatedAttendance || null;
        }
      });
    } catch (error) {
      log.error('Error recording barcode attendance:', error);
      return null;
    }
  }

  // Settings methods
  async getSettings(): Promise<Settings | undefined> {
    const [setting] = await db.select().from(settings);
    return setting;
  }

  async createOrUpdateSettings(newSettings: InsertSettings): Promise<Settings> {
    const existingSettings = await this.getSettings();

    if (existingSettings) {
      const [updatedSettings] = await db
        .update(settings)
        .set({ ...newSettings, updatedAt: new Date() } as typeof settings.$inferInsert)
        .where(eq(settings.id, existingSettings.id))
        .returning();
      return updatedSettings;
    } else {
      const [createdSettings] = await db
        .insert(settings)
        .values(newSettings as typeof settings.$inferInsert)
        .returning();
      return createdSettings;
    }
  }

  // Salary record methods
  async getAllSalaryRecords(): Promise<SalaryRecord[]> {
    return await db
      .select()
      .from(salaryRecords)
      .orderBy(desc(salaryRecords.salaryYear), desc(salaryRecords.salaryMonth));
  }

  async getSalaryRecordById(id: number): Promise<SalaryRecord | undefined> {
    const [record] = await db.select().from(salaryRecords).where(eq(salaryRecords.id, id));
    return record;
  }

  async getSalaryRecordByYearMonth(year: number, month: number): Promise<SalaryRecord | undefined> {
    const [record] = await db
      .select()
      .from(salaryRecords)
      .where(
        and(
          eq(salaryRecords.salaryYear, year),
          eq(salaryRecords.salaryMonth, month)
        )
      );
    return record;
  }

  async createSalaryRecord(record: InsertSalaryRecord): Promise<SalaryRecord> {
    // 確保移除 ID 欄位以避免主鍵衝突
    const { id, ...recordWithoutId } = record as any;
    const [newRecord] = await db.insert(salaryRecords).values(recordWithoutId).returning();
    return newRecord;
  }
  
  async updateSalaryRecord(id: number, record: Partial<InsertSalaryRecord>): Promise<SalaryRecord | undefined> {
    const [updatedRecord] = await db
      .update(salaryRecords)
      .set(record as typeof salaryRecords.$inferInsert)
      .where(eq(salaryRecords.id, id))
      .returning();
    return updatedRecord;
  }
  
  async deleteSalaryRecord(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(salaryRecords)
      .where(eq(salaryRecords.id, id))
      .returning();
    return !!deleted;
  }

  // Holiday methods
  async getAllHolidays(): Promise<Holiday[]> {
    return await db.select().from(holidays);
  }

  async getHolidayById(id: number): Promise<Holiday | undefined> {
    const [holiday] = await db.select().from(holidays).where(eq(holidays.id, id));
    return holiday;
  }

  async createHoliday(holiday: InsertHoliday): Promise<Holiday> {
    const [newHoliday] = await db.insert(holidays).values(holiday).returning();
    return newHoliday;
  }

  async deleteHoliday(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(holidays)
      .where(eq(holidays.id, id))
      .returning();
    return !!deleted;
  }

  async deleteAllHolidays(): Promise<boolean> {
    try {
      await db.delete(holidays);
      return true;
    } catch (error) {
      log.error('Error deleting all holidays:', error);
      return false;
    }
  }

  async deleteTemporaryAttendanceByEmployeeAndDate(employeeId: number, date: string): Promise<boolean> {
    try {
      await db
        .delete(temporaryAttendance)
        .where(
          and(
            eq(temporaryAttendance.employeeId, employeeId),
            eq(temporaryAttendance.date, date)
          )
        );
      return true;
    } catch (error) {
      log.error('Error deleting attendance by employee and date:', error);
      return false;
    }
  }

  async deleteTemporaryAttendanceByHolidayId(holidayId: number): Promise<boolean> {
    try {
      await db
        .delete(temporaryAttendance)
        .where(eq(temporaryAttendance.holidayId, holidayId));
      return true;
    } catch (error) {
      log.error('Error deleting attendance by holiday ID:', error);
      return false;
    }
  }

  async getAttendanceByHolidayId(holidayId: number): Promise<TemporaryAttendance | undefined> {
    const [record] = await db
      .select()
      .from(temporaryAttendance)
      .where(eq(temporaryAttendance.holidayId, holidayId));
    return record;
  }

  // ── LINE binding methods ──────────────────────────────────────────────────

  async getEmployeeByLineUserId(lineUserId: string): Promise<Employee | undefined> {
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.lineUserId, lineUserId));
    return employee;
  }

  async getPendingBindings(): Promise<PendingBinding[]> {
    return db
      .select()
      .from(pendingBindings)
      .where(eq(pendingBindings.status, 'pending'))
      .orderBy(desc(pendingBindings.requestedAt));
  }

  async getPendingBindingById(id: number): Promise<PendingBinding | undefined> {
    const [binding] = await db
      .select()
      .from(pendingBindings)
      .where(eq(pendingBindings.id, id));
    return binding;
  }

  async getPendingBindingByLineUserId(lineUserId: string): Promise<PendingBinding | undefined> {
    const [binding] = await db
      .select()
      .from(pendingBindings)
      .where(eq(pendingBindings.lineUserId, lineUserId))
      .orderBy(desc(pendingBindings.requestedAt));
    return binding;
  }

  async createPendingBinding(binding: InsertPendingBinding): Promise<PendingBinding> {
    const [created] = await db
      .insert(pendingBindings)
      .values(binding)
      .returning();
    return created;
  }

  async approvePendingBinding(id: number, reviewedBy: string): Promise<PendingBinding | undefined> {
    return db.transaction(async (tx) => {
      const [binding] = await tx
        .select()
        .from(pendingBindings)
        .where(eq(pendingBindings.id, id));
      if (!binding) return undefined;

      await tx
        .update(employees)
        .set({
          lineUserId: binding.lineUserId,
          lineDisplayName: binding.lineDisplayName,
          linePictureUrl: binding.linePictureUrl,
          lineBindingDate: new Date()
        })
        .where(eq(employees.id, binding.employeeId));

      const [updated] = await tx
        .update(pendingBindings)
        .set({ status: 'approved', reviewedAt: new Date(), reviewedBy })
        .where(eq(pendingBindings.id, id))
        .returning();
      return updated;
    });
  }

  async rejectPendingBinding(id: number, reviewedBy: string, reason: string): Promise<PendingBinding | undefined> {
    const [updated] = await db
      .update(pendingBindings)
      .set({ status: 'rejected', reviewedAt: new Date(), reviewedBy, rejectReason: reason })
      .where(eq(pendingBindings.id, id))
      .returning();
    return updated;
  }

  async deletePendingBinding(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(pendingBindings)
      .where(eq(pendingBindings.id, id))
      .returning();
    return !!deleted;
  }

  // ── OAuth state methods ──────────────────────────────────────────────────

  async createOAuthState(state: InsertOAuthState): Promise<OAuthState> {
    const [created] = await db
      .insert(oauthStates)
      .values(state)
      .returning();
    return created;
  }

  async getOAuthState(stateValue: string): Promise<OAuthState | undefined> {
    const [record] = await db
      .select()
      .from(oauthStates)
      .where(eq(oauthStates.state, stateValue));
    return record;
  }

  async deleteOAuthState(stateValue: string): Promise<boolean> {
    const [deleted] = await db
      .delete(oauthStates)
      .where(eq(oauthStates.state, stateValue))
      .returning();
    return !!deleted;
  }

  async cleanupExpiredOAuthStates(): Promise<void> {
    await db
      .delete(oauthStates)
      .where(drizzleSql`${oauthStates.expiresAt} < now()`);
  }

  async encryptAllPlaintextEmployees(): Promise<{ migrated: number; skipped: number }> {
    const allEmployees = await this.getAllEmployees();
    let migrated = 0;
    let skipped = 0;

    await db.transaction(async (tx) => {
      for (const employee of allEmployees) {
        if (!employee.idNumber || isAESEncrypted(employee.idNumber)) {
          skipped++;
          continue;
        }

        const displayId = getEmployeeDisplayId(employee);
        if (!displayId) {
          skipped++;
          continue;
        }

        const encryptedId = encryptEmployeeIdentityForStorage(displayId, true);

        const decryptedId = getEmployeeDisplayId({ idNumber: encryptedId, isEncrypted: true });
        if (normalizeEmployeeIdentity(decryptedId) !== normalizeEmployeeIdentity(displayId)) {
          throw new Error(`員工 ${employee.name} (ID: ${employee.id}) 加密驗證失敗`);
        }

        await tx
          .update(employees)
          .set({ idNumber: encryptedId, isEncrypted: true })
          .where(eq(employees.id, employee.id));

        log.info(`員工 ${employee.name} (ID: ${employee.id}) 身分證已加密為 AES-256-GCM`);
        migrated++;
      }
    });

    return { migrated, skipped };
  }
}

// Production strategy: PostgreSQL is the single supported runtime storage.
// Supabase storage has been deprecated and removed from the active code path.

export const storage: IStorage = new DatabaseStorage();
