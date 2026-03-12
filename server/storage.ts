// @ts-nocheck
import { eq, and, desc, or } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { normalizeDateToDash, normalizeDateToSlash } from "../shared/utils/specialLeaveSync";
import {
  buildEmployeeIdentityLookupCandidates,
  encryptEmployeeIdentityForStorage,
  getEmployeeDisplayId,
  matchesEmployeeIdentity,
  prepareUpdatedEmployeeIdentityForStorage
} from "./utils/employeeIdentity";

import {
  users, type User, type InsertUser,
  temporaryAttendance, type TemporaryAttendance, type InsertTemporaryAttendance,
  settings, type Settings, type InsertSettings,
  salaryRecords, type SalaryRecord, type InsertSalaryRecord,
  holidays, type Holiday, type InsertHoliday,
  employees, type Employee, type InsertEmployee
} from "@shared/schema";

// Create the database connection using standard PostgreSQL driver
const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql);

// Define the storage interface
// 將所有類型重新導出，讓其他文件可以引用
export type {
  User, InsertUser,
  Employee, InsertEmployee,
  TemporaryAttendance, InsertTemporaryAttendance, 
  Settings, InsertSettings,
  SalaryRecord, InsertSalaryRecord,
  Holiday, InsertHoliday
};

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

    delete processedEmployee.useEncryption;

    const [newEmployee] = await db.insert(employees).values(processedEmployee).returning();
    return newEmployee;
  }

  async updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`更新員工 ID ${id}, 接收到的數據:`, JSON.stringify(employee));
    }

    const originalEmployee = await this.getEmployeeById(id);
    if (!originalEmployee) {
      console.error(`找不到要更新的員工 ID ${id}`);
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
      console.log(
        `ID處理: ${getEmployeeDisplayId(originalEmployee)} -> ${getEmployeeDisplayId({
          idNumber: processedEmployee.idNumber,
          isEncrypted: wantsEncryption
        })} (加密=${wantsEncryption})`
      );
    }

    if ('useEncryption' in processedEmployee) {
      delete processedEmployee.useEncryption;
    }

    const [updatedEmployee] = await db
      .update(employees)
      .set(processedEmployee)
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
    console.log(`[數據查詢] 查詢員工ID: ${employeeId}, 日期: ${date} 的考勤記錄`);
    
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
      
      console.log(`[數據查詢] 找到 ${records.length} 筆考勤記錄`);
      if (records.length > 0) {
        console.log(`[數據查詢] 第一筆記錄日期: ${records[0].date}`);
      }
      
      return records;
    } catch (error) {
      console.error(`[數據查詢錯誤] 查詢考勤記錄失敗:`, error);
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
    console.log(`刪除員工ID為 ${employeeId} 的所有考勤記錄`);
    
    await db
      .delete(temporaryAttendance)
      .where(eq(temporaryAttendance.employeeId, employeeId));
    
    console.log(`成功刪除員工ID為 ${employeeId} 的所有考勤記錄`);
  }
  
  async recordBarcodeAttendance(idNumber: string): Promise<TemporaryAttendance | null> {
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`掃描處理過程: 原始輸入的ID = ${idNumber}`);
      }

      let employee = await this.getEmployeeByIdNumber(idNumber);

      if (!employee) {
        const allEmployees = await this.getAllEmployees();
        employee = allEmployees.find((emp) => matchesEmployeeIdentity(emp, idNumber));
      }

      if (!employee) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`找不到匹配的員工，ID: ${idNumber}`);
        }
        return null;
      }

      const now = new Date();
      const currentDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const holidays = await this.getAllHolidays();
      const isHoliday = holidays.some(holiday => holiday.date === currentDate);

      const attendanceRecords = await db
        .select()
        .from(temporaryAttendance)
        .where(
          and(
            eq(temporaryAttendance.date, currentDate),
            eq(temporaryAttendance.employeeId, employee.id)
          )
        );
      
      console.log(`[打卡處理] 員工ID ${employee.id}，日期 ${currentDate} 找到 ${attendanceRecords.length} 筆考勤記錄`);

      const incompleteRecords = attendanceRecords.filter(
        record => !record.clockOut || record.clockOut === ''
      );

      console.log(`[打卡處理] 其中有 ${incompleteRecords.length} 筆未完成的記錄`);

      if (incompleteRecords.length === 0) {
        console.log(`[打卡處理] 沒有未完成記錄，建立新的上班打卡`);
        const newAttendance = await this.createTemporaryAttendance({
          employeeId: employee.id,
          date: currentDate,
          clockIn: currentTime,
          clockOut: '', // 下班時間暫時為空
          isHoliday: isHoliday,
          isBarcodeScanned: true
        });
        return newAttendance;
      } else {
        const latestIncompleteRecord = incompleteRecords.sort((a, b) => {
          const timeA = a.clockIn ? a.clockIn.split(':').map(Number) : [0, 0];
          const timeB = b.clockIn ? b.clockIn.split(':').map(Number) : [0, 0];
          return (timeB[0] * 60 + timeB[1]) - (timeA[0] * 60 + timeA[1]);
        })[0];
        
        console.log(`[打卡處理] 找到未完成記錄 ID: ${latestIncompleteRecord.id}，更新為下班打卡`);
        const updatedAttendance = await this.updateTemporaryAttendance(
          latestIncompleteRecord.id,
          { clockOut: currentTime }
        );
        return updatedAttendance || null;
      }
    } catch (error) {
      console.error('Error recording barcode attendance:', error);
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
        .set({ ...newSettings, updatedAt: new Date() })
        .where(eq(settings.id, existingSettings.id))
        .returning();
      return updatedSettings;
    } else {
      const [createdSettings] = await db
        .insert(settings)
        .values(newSettings)
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
      .set(record)
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
      console.error('Error deleting all holidays:', error);
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
      console.error('Error deleting attendance by employee and date:', error);
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
      console.error('Error deleting attendance by holiday ID:', error);
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
}

import { SupabaseStorage } from './supabase-storage';
import { isUsingSupabase } from './db-with-supabase';

// 創建存儲實例的工廠函數
function createStorage(): IStorage {
  // 根據配置決定使用哪種存儲實現
  if (isUsingSupabase()) {
    console.log('Using Supabase storage implementation');
    return new SupabaseStorage();
  } else {
    console.log('Using PostgreSQL storage implementation');
    return new DatabaseStorage();
  }
}

export const storage = createStorage();
