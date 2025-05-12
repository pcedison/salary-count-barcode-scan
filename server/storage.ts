// @ts-nocheck
import { eq, and, desc } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { caesarEncrypt, caesarDecrypt, isEncrypted } from "../shared/utils/caesarCipher";

import {
  users, type User, type InsertUser,
  temporaryAttendance, type TemporaryAttendance, type InsertTemporaryAttendance,
  settings, type Settings, type InsertSettings,
  salaryRecords, type SalaryRecord, type InsertSalaryRecord,
  holidays, type Holiday, type InsertHoliday,
  employees, type Employee, type InsertEmployee
} from "@shared/schema";

// Create the database connection
const sql = neon(process.env.DATABASE_URL!);
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
  createHoliday(holiday: InsertHoliday): Promise<Holiday>;
  deleteHoliday(id: number): Promise<boolean>;
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
    const [employee] = await db.select().from(employees).where(eq(employees.idNumber, idNumber));
    return employee;
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    // 處理加密選項，如果有的話
    const processedEmployee = { ...employee };
    
    // 如果設定了isEncrypted為true，這表示需要對ID進行加密
    // 此時isEncrypted已在路由中根據useEncryption參數設置
    if (processedEmployee.isEncrypted === true) {
      try {
        // 記錄原始ID
        const originalId = processedEmployee.idNumber;
        
        // 檢查ID是否已被加密，避免重複加密
        if (!isEncrypted(originalId)) {
          // 進行加密處理
          processedEmployee.idNumber = caesarEncrypt(originalId);
          
          // 僅在開發環境下輸出日誌
          if (process.env.NODE_ENV !== 'production') {
            console.log(`建立員工：對ID進行加密 - 原始：${originalId} -> 加密後：${processedEmployee.idNumber}`);
          }
        } else {
          console.log(`建立員工：ID已經是加密狀態，無需再次加密 - ${originalId}`);
        }
      } catch (error) {
        console.error('加密ID時發生錯誤:', error);
      }
    } else {
      // 確保未加密狀態下使用原始ID
      console.log(`建立員工：使用原始ID（不加密）- ${processedEmployee.idNumber}`);
    }
    
    // 刪除非資料庫欄位
    delete processedEmployee.useEncryption;
    
    const [newEmployee] = await db.insert(employees).values(processedEmployee).returning();
    return newEmployee;
  }

  async updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
    // 使用更簡潔的日誌輸出
    if (process.env.NODE_ENV !== 'production') {
      console.log(`更新員工 ID ${id}, 接收到的數據:`, JSON.stringify(employee));
    }
    
    // 取得原始員工數據用於比較
    const originalEmployee = await this.getEmployeeById(id);
    if (!originalEmployee) {
      console.error(`找不到要更新的員工 ID ${id}`);
      return undefined;
    }
    
    // 處理加密選項，如果有的話
    const processedEmployee = { ...employee };
    
    // 如果提供了身分證號碼，需要處理加密
    if (processedEmployee.idNumber) {
      try {
        // 使用資料庫中的加密標記，而不是依賴偵測函數
        const isCurrentlyEncrypted = originalEmployee.isEncrypted || false;
        // isEncrypted 標記現在由路由處理，這裡直接檢查它的值
        const wantsEncryption = processedEmployee.isEncrypted === true;
        
        // 檢查ID是否已變更
        const hasIdChanged = originalEmployee.idNumber !== processedEmployee.idNumber;
        
        // 特殊處理情況:
        // 1. 如果原始ID已加密，且使用者想保持加密狀態
        if (isCurrentlyEncrypted && wantsEncryption) {
          if (hasIdChanged && !isEncrypted(processedEmployee.idNumber)) {
            // 只在新ID未加密時加密
            processedEmployee.idNumber = caesarEncrypt(processedEmployee.idNumber);
          }
          // 不需要設置 isEncrypted = true，因為已經在路由中設置過了
        }
        // 2. 如果原始ID已加密，但使用者不想加密
        else if (isCurrentlyEncrypted && !wantsEncryption) {
          if (!hasIdChanged) {
            // 如果ID沒變，但想取消加密，則解密原本的ID
            processedEmployee.idNumber = caesarDecrypt(originalEmployee.idNumber);
          }
          // 不需要設置 isEncrypted = false，因為已經在路由中設置過了
        }
        // 3. 如果原始ID未加密，但使用者想加密
        else if (!isCurrentlyEncrypted && wantsEncryption) {
          if (!isEncrypted(processedEmployee.idNumber)) {
            // 只在新ID未加密時加密
            processedEmployee.idNumber = caesarEncrypt(processedEmployee.idNumber);
          }
          // 不需要設置 isEncrypted = true，因為已經在路由中設置過了
        }
        // 4. 如果原始ID未加密，使用者也不想加密，不需特殊處理
        
        if (process.env.NODE_ENV !== 'production') {
          console.log(`ID處理: ${originalEmployee.idNumber} -> ${processedEmployee.idNumber} (加密=${processedEmployee.isEncrypted})`);
        }
      } catch (error) {
        console.error('處理ID加密狀態時發生錯誤:', error);
      }
    }
    
    // 刪除非資料庫欄位
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
      // 使用精確匹配查詢
      const records = await db.select()
        .from(temporaryAttendance)
        .where(
          and(
            eq(temporaryAttendance.date, date),
            eq(temporaryAttendance.employeeId, employeeId)
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
      // 導入加密工具
      const { caesarEncrypt, caesarDecrypt } = require('../shared/utils/caesarCipher');
      
      // 僅在開發環境輸出
      if (process.env.NODE_ENV !== 'production') {
        console.log(`掃描處理過程: 原始輸入的ID = ${idNumber}`);
      }
      
      // 1. 查找員工 - 處理可能的加密ID
      // 先直接嘗試查找員工
      let employee = await this.getEmployeeByIdNumber(idNumber);
      
      // 嘗試解密後再查找
      if (!employee) {
        // 嘗試解密掃描的ID
        const decrypted = caesarDecrypt(idNumber); 
        
        if (decrypted !== idNumber) {  // 如果解密結果不同
          employee = await this.getEmployeeByIdNumber(decrypted);
        }
      }
      
      // 如果仍然找不到，嘗試獲取所有員工並進行智能比對
      if (!employee) {
        const allEmployees = await this.getAllEmployees();
        
        // 使用更高效的比對邏輯
        for (const emp of allEmployees) {
          // 情況1：直接匹配
          if (emp.idNumber === idNumber) {
            employee = emp;
            break;
          }
          
          // 情況2：掃描的是原始ID，資料庫儲存的是加密ID
          if (emp.isEncrypted) {
            const decryptedEmpId = caesarDecrypt(emp.idNumber);
            if (decryptedEmpId === idNumber) {
              employee = emp;
              break;
            }
          }
          
          // 情況3：掃描的是加密ID，資料庫儲存的是原始ID
          if (!emp.isEncrypted) {
            const encryptedId = caesarEncrypt(emp.idNumber);
            if (encryptedId === idNumber) {
              employee = emp;
              break;
            }
          }
        }
      }
      
      if (!employee) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`找不到匹配的員工，ID: ${idNumber}`);
        }
        return null; // 找不到員工
      }
      
      // 2. 獲取當前日期和時間
      const now = new Date();
      const currentDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      // 3. 檢查是否為假日
      const holidays = await this.getAllHolidays();
      const isHoliday = holidays.some(holiday => holiday.date === currentDate);
      
      // 4. 查找今天是否已有該員工打卡記錄
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
      
      // 查找未完成的記錄（無下班時間）
      const incompleteRecords = attendanceRecords.filter(
        record => !record.clockOut || record.clockOut === ''
      );
      
      console.log(`[打卡處理] 其中有 ${incompleteRecords.length} 筆未完成的記錄`);
      
      // 5. 判斷是上班還是下班打卡
      if (incompleteRecords.length === 0) {
        // 沒有未完成記錄，創建新的上班打卡記錄
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
        // 已有未完成記錄，更新為下班打卡（使用最新未完成記錄）
        // 按時間排序，獲取最新的未完成記錄
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
    const [newRecord] = await db.insert(salaryRecords).values(record).returning();
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
