// @ts-nocheck
import { eq, and, desc } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { caesarEncrypt, caesarDecrypt, isEncrypted } from "../shared/utils/caesarCipher";

import {
  users, type User, type InsertUser,
  temporaryAttendance, type TemporaryAttendance, type InsertTemporaryAttendance,
  settings, type Settings, type InsertSettings,
  salaryRecords, type SalaryRecord, type InsertSalaryRecord,
  holidays, type Holiday, type InsertHoliday,
  employees, type Employee, type InsertEmployee
} from "@shared/schema";

// Supabase PostgreSQL connection using postgres-js driver
const createSupabaseConnection = () => {
  // 正確的 Supabase 連接格式：postgres.PROJECT_ID
  const supabaseUrl = "postgresql://postgres.pezkrfptwoudqpruaier:43Marcus43@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
  
  try {
    const sql = postgres(supabaseUrl, {
      ssl: 'require',
      connect_timeout: 10,
      max: 1, // 限制連接數
    });
    return drizzle(sql);
  } catch (error) {
    console.error('Supabase 連接失敗:', error);
    throw error;
  }
};

let db: any;

try {
  db = createSupabaseConnection();
  console.log('✅ Supabase 連接已建立');
} catch (error) {
  console.error('❌ 無法建立 Supabase 連接:', error);
  throw error;
}

// 測試連接函數
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const result = await db.execute('SELECT 1 as test');
    console.log('Supabase 連接測試成功');
    return true;
  } catch (error) {
    console.error('Supabase 連接測試失敗:', error);
    return false;
  }
}

// Storage interface implementation
export class SupabaseStorage {
  // Test connection
  async testConnection(): Promise<boolean> {
    return await testSupabaseConnection();
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  // Employee methods
  async getAllEmployees(): Promise<Employee[]> {
    const allEmployees = await db.select().from(employees);
    return allEmployees.map(employee => ({
      ...employee,
      idNumber: isEncrypted(employee.idNumber) 
        ? caesarDecrypt(employee.idNumber) 
        : employee.idNumber
    }));
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
    if (result.length === 0) return undefined;
    
    const employee = result[0];
    return {
      ...employee,
      idNumber: isEncrypted(employee.idNumber) 
        ? caesarDecrypt(employee.idNumber) 
        : employee.idNumber
    };
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const encryptedEmployee = {
      ...employee,
      idNumber: caesarEncrypt(employee.idNumber)
    };
    
    const result = await db.insert(employees).values(encryptedEmployee).returning();
    const newEmployee = result[0];
    
    return {
      ...newEmployee,
      idNumber: caesarDecrypt(newEmployee.idNumber)
    };
  }

  async updateEmployee(id: number, updates: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const encryptedUpdates = updates.idNumber 
      ? { ...updates, idNumber: caesarEncrypt(updates.idNumber) }
      : updates;
      
    const result = await db.update(employees)
      .set(encryptedUpdates)
      .where(eq(employees.id, id))
      .returning();
      
    if (result.length === 0) return undefined;
    
    const updatedEmployee = result[0];
    return {
      ...updatedEmployee,
      idNumber: isEncrypted(updatedEmployee.idNumber) 
        ? caesarDecrypt(updatedEmployee.idNumber) 
        : updatedEmployee.idNumber
    };
  }

  async deleteEmployee(id: number): Promise<boolean> {
    const result = await db.delete(employees).where(eq(employees.id, id)).returning();
    return result.length > 0;
  }

  // Attendance methods
  async getTemporaryAttendance(): Promise<TemporaryAttendance[]> {
    return await db.select().from(temporaryAttendance).orderBy(desc(temporaryAttendance.date));
  }

  async createTemporaryAttendance(attendance: InsertTemporaryAttendance): Promise<TemporaryAttendance> {
    const result = await db.insert(temporaryAttendance).values(attendance).returning();
    return result[0];
  }

  async updateTemporaryAttendance(id: number, updates: Partial<InsertTemporaryAttendance>): Promise<TemporaryAttendance | undefined> {
    const result = await db.update(temporaryAttendance)
      .set(updates)
      .where(eq(temporaryAttendance.id, id))
      .returning();
    return result[0];
  }

  async deleteTemporaryAttendance(id: number): Promise<boolean> {
    const result = await db.delete(temporaryAttendance).where(eq(temporaryAttendance.id, id)).returning();
    return result.length > 0;
  }

  // Settings methods
  async getSettings(): Promise<Settings | undefined> {
    const result = await db.select().from(settings).limit(1);
    return result[0];
  }

  async updateSettings(updates: Partial<InsertSettings>): Promise<Settings> {
    const existing = await this.getSettings();
    if (existing) {
      const result = await db.update(settings)
        .set(updates)
        .where(eq(settings.id, existing.id))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(settings).values(updates as InsertSettings).returning();
      return result[0];
    }
  }

  // Salary records methods
  async getAllSalaryRecords(): Promise<SalaryRecord[]> {
    return await db.select().from(salaryRecords).orderBy(desc(salaryRecords.salaryYear), desc(salaryRecords.salaryMonth));
  }

  async getSalaryRecord(id: number): Promise<SalaryRecord | undefined> {
    const result = await db.select().from(salaryRecords).where(eq(salaryRecords.id, id)).limit(1);
    return result[0];
  }

  async createSalaryRecord(record: InsertSalaryRecord): Promise<SalaryRecord> {
    const result = await db.insert(salaryRecords).values(record).returning();
    return result[0];
  }

  async deleteSalaryRecord(id: number): Promise<boolean> {
    const result = await db.delete(salaryRecords).where(eq(salaryRecords.id, id)).returning();
    return result.length > 0;
  }

  // Holidays methods
  async getAllHolidays(): Promise<Holiday[]> {
    return await db.select().from(holidays).orderBy(desc(holidays.date));
  }

  async getHolidayById(id: number): Promise<Holiday | undefined> {
    const result = await db.select().from(holidays).where(eq(holidays.id, id)).limit(1);
    return result[0];
  }

  async createHoliday(holiday: InsertHoliday): Promise<Holiday> {
    const result = await db.insert(holidays).values(holiday).returning();
    return result[0];
  }

  async updateHoliday(id: number, updates: Partial<InsertHoliday>): Promise<Holiday | undefined> {
    const result = await db.update(holidays)
      .set(updates)
      .where(eq(holidays.id, id))
      .returning();
    return result[0];
  }

  async deleteHoliday(id: number): Promise<boolean> {
    const result = await db.delete(holidays).where(eq(holidays.id, id)).returning();
    return result.length > 0;
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
}

// Export the storage instance
export const supabaseStorage = new SupabaseStorage();