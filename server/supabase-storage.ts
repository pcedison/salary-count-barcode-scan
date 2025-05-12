// @ts-nocheck
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, supabaseHelpers } from './supabase-client';
import { IStorage } from './storage';
import { 
  User, InsertUser,
  Employee, InsertEmployee, 
  TemporaryAttendance, InsertTemporaryAttendance,
  Settings, InsertSettings,
  SalaryRecord, InsertSalaryRecord,
  Holiday, InsertHoliday
} from '@shared/schema';
import { getTodayDate, getCurrentTime } from '../client/src/lib/utils';

/**
 * 簡單的內存緩存系統，用於提高查詢效能
 */
class QueryCache {
  private cache: Map<string, { data: any, timestamp: number }> = new Map();
  private readonly TTL: number = 60 * 1000; // 緩存存活時間 (1分鐘)
  
  /**
   * 獲取緩存資料
   * @param key 緩存鍵
   * @returns 如果緩存有效則返回數據，否則返回 null
   */
  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    // 如果沒有緩存項或已過期
    if (!entry || Date.now() - entry.timestamp > this.TTL) {
      if (entry) {
        this.cache.delete(key); // 刪除過期項
      }
      return null;
    }
    
    return entry.data;
  }
  
  /**
   * 設置緩存資料
   * @param key 緩存鍵
   * @param data 緩存數據
   */
  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  /**
   * 使緩存失效
   * @param keyPrefix 緩存鍵前綴，用於失效特定表或操作的所有緩存
   */
  invalidate(keyPrefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * 清除所有緩存
   */
  clear(): void {
    this.cache.clear();
  }
}

// 創建全局緩存實例
const queryCache = new QueryCache();

export class SupabaseStorage implements IStorage {
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const user = await supabaseHelpers.getById<User>('users', id);
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error || !data) {
      return undefined;
    }
    
    return data as User;
  }

  async createUser(user: InsertUser): Promise<User> {
    return supabaseHelpers.create<User>('users', user);
  }

  // Employee methods - 使用緩存優化
  async getAllEmployees(): Promise<Employee[]> {
    // 緩存鍵
    const cacheKey = 'employees:all';
    
    // 嘗試從緩存獲取
    const cachedData = queryCache.get(cacheKey);
    if (cachedData) {
      console.log('Using cached employees data');
      return cachedData;
    }
    
    // 緩存未命中，從數據庫獲取
    const employees = await supabaseHelpers.getAll<Employee>('employees');
    
    // 存入緩存
    queryCache.set(cacheKey, employees);
    
    return employees;
  }

  async getEmployeeById(id: number): Promise<Employee | undefined> {
    // 緩存鍵
    const cacheKey = `employees:id:${id}`;
    
    // 嘗試從緩存獲取
    const cachedData = queryCache.get(cacheKey);
    if (cachedData) {
      console.log(`Using cached employee data for ID: ${id}`);
      return cachedData;
    }
    
    // 緩存未命中，從數據庫獲取
    const employee = await supabaseHelpers.getById<Employee>('employees', id);
    
    // 存入緩存
    if (employee) {
      queryCache.set(cacheKey, employee);
    }
    
    return employee || undefined;
  }

  async getEmployeeByIdNumber(idNumber: string): Promise<Employee | undefined> {
    // 緩存鍵
    const cacheKey = `employees:idNumber:${idNumber}`;
    
    // 嘗試從緩存獲取
    const cachedData = queryCache.get(cacheKey);
    if (cachedData) {
      console.log(`Using cached employee data for ID Number: ${idNumber}`);
      return cachedData;
    }
    
    // 緩存未命中，從數據庫獲取
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('employees')
      .select('*')
      .eq('id_number', idNumber)
      .single();
    
    if (error || !data) {
      return undefined;
    }
    
    // 存入緩存
    queryCache.set(cacheKey, data);
    
    return data as Employee;
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    // 處理加密選項，如果有的話
    const processedEmployee = { ...employee };
    // 如果設定了useEncryption選項，這表示需要對ID進行加密
    if (processedEmployee.useEncryption) {
      try {
        // 導入加密函數
        const { ensureEncrypted } = require('../shared/utils/caesarCipher');
        // 進行加密
        processedEmployee.idNumber = ensureEncrypted(processedEmployee.idNumber);
      } catch (error) {
        console.error('加密ID時發生錯誤:', error);
      }
      // 刪除非資料庫欄位
      delete processedEmployee.useEncryption;
    }
    
    const result = await supabaseHelpers.create<Employee>('employees', processedEmployee);
    
    // 使緩存失效
    queryCache.invalidate('employees:');
    
    return result;
  }

  async updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
    // 處理加密選項，如果有的話
    const processedEmployee = { ...employee };
    // 如果設定了useEncryption選項，這表示需要對ID進行加密
    if (processedEmployee.useEncryption && processedEmployee.idNumber) {
      try {
        // 導入加密函數
        const { ensureEncrypted } = require('../shared/utils/caesarCipher');
        // 進行加密
        processedEmployee.idNumber = ensureEncrypted(processedEmployee.idNumber);
      } catch (error) {
        console.error('加密ID時發生錯誤:', error);
      }
      // 刪除非資料庫欄位
      delete processedEmployee.useEncryption;
    }
    
    const result = await supabaseHelpers.update<Employee>('employees', id, processedEmployee);
    
    // 使緩存失效
    if (result) {
      queryCache.invalidate('employees:');
      queryCache.invalidate(`employees:id:${id}`);
      if (result.idNumber) {
        queryCache.invalidate(`employees:idNumber:${result.idNumber}`);
      }
    }
    
    return result || undefined;
  }

  async deleteEmployee(id: number): Promise<boolean> {
    // 獲取員工信息用於後續緩存失效
    const employee = await this.getEmployeeById(id);
    
    const result = await supabaseHelpers.delete('employees', id);
    
    // 使緩存失效
    queryCache.invalidate('employees:');
    queryCache.invalidate(`employees:id:${id}`);
    if (employee && employee.idNumber) {
      queryCache.invalidate(`employees:idNumber:${employee.idNumber}`);
    }
    
    return result;
  }

  // Temporary attendance methods
  async getTemporaryAttendance(): Promise<TemporaryAttendance[]> {
    // 嘗試從緩存中獲取數據
    const cachedData = queryCache.get('temporary_attendance:all');
    if (cachedData) {
      console.log('[緩存] 使用緩存的考勤記錄數據，跳過資料庫查詢');
      return cachedData as TemporaryAttendance[];
    }
    
    console.log('[緩存] 未找到緩存數據，從資料庫獲取考勤記錄');
    const startTime = Date.now();
    const client = await getSupabaseClient();
    
    // 首先獲取所有臨時考勤記錄
    const { data: attendanceData, error: attendanceError } = await client
      .from('temporary_attendance')
      .select('*');
    
    if (attendanceError) {
      console.error('Error fetching attendance records:', attendanceError);
      throw attendanceError;
    }
    
    // 如果沒有考勤記錄，則返回空數組
    if (!attendanceData || attendanceData.length === 0) {
      // 緩存空結果（60秒）
      queryCache.set('temporary_attendance:all', [], 60 * 1000);
      return [];
    }
    
    // 使用緩存的員工數據
    let employeeMap = new Map<number, Employee>();
    const cachedEmployees = queryCache.get('employees:all');
    
    if (cachedEmployees) {
      console.log('[緩存] 使用緩存的員工數據');
      cachedEmployees.forEach((employee: Employee) => {
        employeeMap.set(employee.id, employee);
      });
    } else {
      console.log('[緩存] 未找到緩存的員工數據，從資料庫獲取');
      
      // 獲取所有員工，用於將員工資訊添加到考勤記錄中
      const { data: employeesData, error: employeesError } = await client
        .from('employees')
        .select('*');
      
      if (employeesError) {
        console.error('Error fetching employees:', employeesError);
        throw employeesError;
      }
      
      // 創建員工ID到員工資訊的映射
      if (employeesData) {
        employeesData.forEach((employee: Employee) => {
          employeeMap.set(employee.id, employee);
        });
        
        // 緩存員工數據（5分鐘）
        queryCache.set('employees:all', employeesData, 5 * 60 * 1000);
      }
    }
    
    // 將員工資訊添加到考勤記錄中
    const enrichedAttendance = attendanceData.map((record: any) => {
      const employee = record.employeeId ? employeeMap.get(record.employeeId) : undefined;
      
      return {
        ...record,
        _employeeName: employee?.name,
        _employeeDepartment: employee?.department
      };
    });
    
    const result = enrichedAttendance as TemporaryAttendance[];
    
    // 緩存結果（30秒）
    queryCache.set('temporary_attendance:all', result, 30 * 1000);
    
    const endTime = Date.now();
    console.log(`[緩存] 資料庫查詢耗時: ${endTime - startTime}ms，已緩存結果`);
    
    return result;
  }

  // 高效獲取今日考勤記錄
  async getTodayAttendance(): Promise<TemporaryAttendance[]> {
    // 獲取今日日期格式 (YYYY/MM/DD)
    const todayDate = new Date().toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/\//g, '/');
    
    // 緩存鍵
    const cacheKey = `temporary_attendance:today:${todayDate}`;
    
    // 先嘗試從緩存取得
    const cachedData = queryCache.get(cacheKey);
    if (cachedData) {
      console.log('[緩存] 使用緩存的今日考勤數據');
      return cachedData as TemporaryAttendance[];
    }
    
    console.log('[緩存] 未找到今日考勤緩存，從所有考勤記錄中篩選');
    const startTime = Date.now();
    
    // 獲取所有考勤記錄
    const allRecords = await this.getTemporaryAttendance();
    
    // 篩選今日記錄
    const todayRecords = allRecords.filter(record => record.date === todayDate);
    
    // 緩存結果（10秒 - 因為今日記錄變動頻繁）
    queryCache.set(cacheKey, todayRecords, 10 * 1000);
    
    const endTime = Date.now();
    console.log(`[緩存] 今日考勤篩選耗時: ${endTime - startTime}ms，找到 ${todayRecords.length} 筆記錄`);
    
    return todayRecords;
  }

  async getTemporaryAttendanceById(id: number): Promise<TemporaryAttendance | undefined> {
    // 優先從緩存獲取
    const cacheKey = `temporary_attendance:id:${id}`;
    const cachedRecord = queryCache.get(cacheKey);
    if (cachedRecord) {
      console.log(`[緩存] 使用緩存的考勤記錄 ID:${id}`);
      return cachedRecord as TemporaryAttendance;
    }
    
    const attendance = await supabaseHelpers.getById<TemporaryAttendance>('temporary_attendance', id);
    
    // 緩存結果（30秒）
    if (attendance) {
      queryCache.set(cacheKey, attendance, 30 * 1000);
    }
    
    return attendance || undefined;
  }

  async createTemporaryAttendance(attendance: InsertTemporaryAttendance): Promise<TemporaryAttendance> {
    const result = await supabaseHelpers.create<TemporaryAttendance>('temporary_attendance', attendance);
    
    // 創建新記錄後使相關緩存失效
    this.invalidateAttendanceCache();
    
    return result;
  }

  async updateTemporaryAttendance(id: number, attendance: Partial<InsertTemporaryAttendance>): Promise<TemporaryAttendance | undefined> {
    const result = await supabaseHelpers.update<TemporaryAttendance>('temporary_attendance', id, attendance);
    
    // 更新記錄後使相關緩存失效
    this.invalidateAttendanceCache();
    if (result) {
      queryCache.invalidate(`temporary_attendance:id:${id}`);
    }
    
    return result || undefined;
  }
  
  // 使所有考勤相關緩存失效的輔助方法
  private invalidateAttendanceCache(): void {
    console.log('[緩存] 使所有考勤緩存失效');
    queryCache.invalidate('temporary_attendance:all');
    
    // 使今日記錄緩存失效
    const todayDate = new Date().toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/\//g, '/');
    queryCache.invalidate(`temporary_attendance:today:${todayDate}`);
  }

  async deleteTemporaryAttendance(id: number): Promise<boolean> {
    const result = await supabaseHelpers.delete('temporary_attendance', id);
    
    // 刪除考勤記錄後使緩存失效
    if (result) {
      this.invalidateAttendanceCache();
      queryCache.invalidate(`temporary_attendance:id:${id}`);
    }
    
    return result;
  }

  async deleteAllTemporaryAttendance(): Promise<boolean> {
    const client = await getSupabaseClient();
    const { error } = await client.from('temporary_attendance').delete().neq('id', 0);
    
    if (error) {
      console.error('Error deleting all temporary attendance records:', error);
      throw error;
    }
    
    // 刪除所有記錄後，使相關緩存全部失效
    this.invalidateAttendanceCache();
    
    return true;
  }
  
  async deleteTemporaryAttendanceByEmployeeId(employeeId: number): Promise<void> {
    const client = await getSupabaseClient();
    console.log(`刪除員工ID為 ${employeeId} 的所有考勤記錄`);
    
    const { error } = await client
      .from('temporary_attendance')
      .delete()
      .eq('employee_id', employeeId);
    
    if (error) {
      console.error(`Error deleting attendance records for employee ${employeeId}:`, error);
      throw error;
    }
    
    // 刪除員工相關記錄後使緩存失效
    this.invalidateAttendanceCache();
    
    console.log(`成功刪除員工ID為 ${employeeId} 的所有考勤記錄`);
  }

  async recordBarcodeAttendance(idNumber: string): Promise<TemporaryAttendance | null> {
    try {
      // 導入加密工具
      const { tryDecrypt, isEncrypted } = require('../shared/utils/caesarCipher');
      
      // 查找員工 - 處理可能的加密ID
      // 先直接嘗試查找員工（有可能資料庫中存的是已加密數據）
      let employee = await this.getEmployeeByIdNumber(idNumber);
      
      // 如果找不到，嘗試解密後再查找（處理掃描條碼是未加密，但資料庫存的是加密數據的情況）
      if (!employee && isEncrypted(idNumber)) {
        const decryptedIdNumber = tryDecrypt(idNumber);
        employee = await this.getEmployeeByIdNumber(decryptedIdNumber);
      }
      
      // 如果仍然找不到，嘗試使用所有員工進行匹配（處理掃描條碼是加密的，但資料庫存的是未加密數據的情況）
      if (!employee && !isEncrypted(idNumber)) {
        console.log('嘗試查找可能加密存儲的員工ID');
        const allEmployees = await this.getAllEmployees();
        employee = allEmployees.find(emp => tryDecrypt(emp.idNumber) === idNumber);
      }
      
      if (!employee) {
        console.log(`員工未找到，ID號碼: ${idNumber}`);
        return null;
      }
      
      const currentDate = getTodayDate();
      const currentTime = getCurrentTime();
      
      console.log(`處理員工打卡: ${employee.name}, ID: ${employee.id}, 日期: ${currentDate}, 時間: ${currentTime}`);
      
      // 檢查是否為假日
      const holidays = await this.getAllHolidays();
      const isHoliday = holidays.some(holiday => holiday.date === currentDate);
      
      // 查找今天是否已有該員工打卡記錄
      const client = await getSupabaseClient();
      
      // 使用直接的 Supabase 查詢，確保列名正確
      const { data: attendanceRecords, error: queryError } = await client
        .from('temporary_attendance')
        .select('*')
        .eq('date', currentDate)
        .eq('employee_id', employee.id);
      
      if (queryError) {
        console.error('查詢考勤記錄錯誤:', queryError);
        throw queryError;
      }
      
      console.log('找到的考勤記錄:', attendanceRecords);
      
      // 準備返回的結果
      let result: TemporaryAttendance | null = null;
      
      // 如果沒有記錄，創建上班打卡記錄
      if (!attendanceRecords || attendanceRecords.length === 0) {
        console.log('創建新的上班打卡記錄');
        
        // 直接插入使用蛇形命名的記錄
        const snakeRecord = {
          employee_id: employee.id,
          date: currentDate,
          clock_in: currentTime,
          clock_out: '', // 下班時間暫時為空
          is_holiday: isHoliday,
          is_barcode_scanned: true
        };
        
        const { data: newRecord, error: insertError } = await client
          .from('temporary_attendance')
          .insert(snakeRecord)
          .select()
          .single();
          
        if (insertError) {
          console.error('創建考勤記錄錯誤:', insertError);
          throw insertError;
        }
        
        console.log('新創建的記錄:', newRecord);
        
        // 手動將結果映射為應用程式需要的駝峰式命名
        result = {
          id: newRecord.id,
          employeeId: employee.id,
          date: newRecord.date,
          clockIn: newRecord.clock_in,
          clockOut: newRecord.clock_out,
          isHoliday: newRecord.is_holiday,
          isBarcodeScanned: newRecord.is_barcode_scanned
        };
      } else {
        // 已有記錄，處理打卡邏輯
        const existingRecord = attendanceRecords[0];
        console.log('已有考勤記錄:', existingRecord);
        
        // 檢查記錄狀態
        if (!existingRecord.clock_out || existingRecord.clock_out === '') {
          console.log('更新下班打卡時間');
          
          // 直接更新使用蛇形命名的記錄
          const { data: updatedRecord, error: updateError } = await client
            .from('temporary_attendance')
            .update({ clock_out: currentTime })
            .eq('id', existingRecord.id)
            .select()
            .single();
            
          if (updateError) {
            console.error('更新考勤記錄錯誤:', updateError);
            throw updateError;
          }
          
          console.log('更新後的記錄:', updatedRecord);
          
          // 手動將結果映射為應用程式需要的駝峰式命名
          result = {
            id: updatedRecord.id,
            employeeId: employee.id,
            date: updatedRecord.date,
            clockIn: updatedRecord.clock_in,
            clockOut: updatedRecord.clock_out,
            isHoliday: updatedRecord.is_holiday,
            isBarcodeScanned: updatedRecord.is_barcode_scanned
          };
        } else {
          console.log('刪除舊記錄並創建新的上班打卡');
          
          // 刪除舊記錄
          const { error: deleteError } = await client
            .from('temporary_attendance')
            .delete()
            .eq('id', existingRecord.id);
            
          if (deleteError) {
            console.error('刪除考勤記錄錯誤:', deleteError);
            throw deleteError;
          }
          
          // 創建新記錄使用蛇形命名
          const snakeRecord = {
            employee_id: employee.id,
            date: currentDate,
            clock_in: currentTime,
            clock_out: '',
            is_holiday: isHoliday,
            is_barcode_scanned: true
          };
          
          const { data: newRecord, error: insertError } = await client
            .from('temporary_attendance')
            .insert(snakeRecord)
            .select()
            .single();
            
          if (insertError) {
            console.error('創建新考勤記錄錯誤:', insertError);
            throw insertError;
          }
          
          console.log('新創建的記錄:', newRecord);
          
          // 手動將結果映射為應用程式需要的駝峰式命名
          result = {
            id: newRecord.id,
            employeeId: employee.id,
            date: newRecord.date,
            clockIn: newRecord.clock_in,
            clockOut: newRecord.clock_out,
            isHoliday: newRecord.is_holiday,
            isBarcodeScanned: newRecord.is_barcode_scanned
          };
        }
      }
      
      console.log('返回的結果:', result);
      return result;
    } catch (error) {
      console.error('recordBarcodeAttendance 發生錯誤:', error);
      
      // 在出現錯誤時，嘗試切換到 PostgreSQL 作為後備
      console.log('切換到 PostgreSQL 作為後備操作');
      
      // 手動調用 DatabaseStorage 的實現
      const postgresStorage = new DatabaseStorage();
      return postgresStorage.recordBarcodeAttendance(idNumber);
    }
  }

  // Settings methods - 緩存優化
  async getSettings(): Promise<Settings | undefined> {
    // 緩存鍵
    const cacheKey = 'settings:global';
    
    // 嘗試從緩存獲取
    const cachedData = queryCache.get(cacheKey);
    if (cachedData) {
      console.log('Using cached settings data');
      return cachedData;
    }
    
    // 從數據庫獲取
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('settings')
      .select('*')
      .limit(1)
      .single();
    
    if (error || !data) {
      return undefined;
    }
    
    // 存入緩存
    queryCache.set(cacheKey, data);
    
    return data as Settings;
  }

  async createOrUpdateSettings(newSettings: InsertSettings): Promise<Settings> {
    const client = await getSupabaseClient();
    
    // 首先檢查是否存在設置
    const { data: existingSettings } = await client
      .from('settings')
      .select('id')
      .limit(1);
    
    let result: Settings;
    
    if (existingSettings && existingSettings.length > 0) {
      // 更新現有設置
      const { data, error } = await client
        .from('settings')
        .update({
          ...newSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingSettings[0].id)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating settings:', error);
        throw error;
      }
      
      result = data as Settings;
    } else {
      // 創建新設置
      const { data, error } = await client
        .from('settings')
        .insert([newSettings])
        .select()
        .single();
      
      if (error) {
        console.error('Error creating settings:', error);
        throw error;
      }
      
      result = data as Settings;
    }
    
    // 更新緩存
    queryCache.invalidate('settings:');
    
    return result;
  }

  // Salary record methods
  async getAllSalaryRecords(): Promise<SalaryRecord[]> {
    return supabaseHelpers.getAll<SalaryRecord>('salary_records');
  }

  async getSalaryRecordById(id: number): Promise<SalaryRecord | undefined> {
    const record = await supabaseHelpers.getById<SalaryRecord>('salary_records', id);
    return record || undefined;
  }

  async getSalaryRecordByYearMonth(year: number, month: number): Promise<SalaryRecord | undefined> {
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('salary_records')
      .select('*')
      .eq('salary_year', year)
      .eq('salary_month', month)
      .single();
    
    if (error || !data) {
      return undefined;
    }
    
    return data as SalaryRecord;
  }

  async createSalaryRecord(record: InsertSalaryRecord): Promise<SalaryRecord> {
    return supabaseHelpers.create<SalaryRecord>('salary_records', record);
  }

  async updateSalaryRecord(id: number, record: Partial<InsertSalaryRecord>): Promise<SalaryRecord | undefined> {
    const result = await supabaseHelpers.update<SalaryRecord>('salary_records', id, record);
    return result || undefined;
  }

  async deleteSalaryRecord(id: number): Promise<boolean> {
    return supabaseHelpers.delete('salary_records', id);
  }

  // Holiday methods - 緩存優化
  async getAllHolidays(): Promise<Holiday[]> {
    // 緩存鍵
    const cacheKey = 'holidays:all';
    
    // 嘗試從緩存獲取
    const cachedData = queryCache.get(cacheKey);
    if (cachedData) {
      console.log('Using cached holidays data');
      return cachedData;
    }
    
    // 從 Supabase 獲取
    const holidays = await supabaseHelpers.getAll<Holiday>('holidays');
    
    // 存入緩存
    queryCache.set(cacheKey, holidays);
    
    return holidays;
  }

  async createHoliday(holiday: InsertHoliday): Promise<Holiday> {
    const result = await supabaseHelpers.create<Holiday>('holidays', holiday);
    
    // 使緩存失效
    queryCache.invalidate('holidays:');
    
    return result;
  }

  async deleteHoliday(id: number): Promise<boolean> {
    const result = await supabaseHelpers.delete('holidays', id);
    
    // 使緩存失效
    queryCache.invalidate('holidays:');
    
    return result;
  }
}