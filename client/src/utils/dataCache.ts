/**
 * 數據緩存工具
 * 
 * 提供客戶端數據緩存功能，用於在網絡故障時提供離線數據訪問
 * 1. 保存API響應到localStorage
 * 2. 在網絡故障時提供緩存數據
 * 3. 自動管理緩存過期
 */

// 緩存鍵
const CACHE_KEYS = {
  EMPLOYEES: 'cache_employees',
  SALARY_RECORDS: 'cache_salary_records',
  SETTINGS: 'cache_settings',
  ATTENDANCE: 'cache_attendance',
  HOLIDAYS: 'cache_holidays'
};

// 緩存有效期（毫秒）
const CACHE_TTL = {
  SHORT: 5 * 60 * 1000,    // 5分鐘
  MEDIUM: 30 * 60 * 1000,  // 30分鐘
  LONG: 24 * 60 * 60 * 1000 // 24小時
};

// 緩存項目接口
interface CacheItem<T> {
  data: T;
  expires: number;
}

/**
 * 保存數據到緩存
 * @param key 緩存鍵
 * @param data 數據
 * @param ttl 過期時間（毫秒）
 */
function saveToCache<T>(key: string, data: T, ttl: number = CACHE_TTL.MEDIUM): void {
  if (!data) return;
  
  try {
    const cacheItem: CacheItem<T> = {
      data,
      expires: Date.now() + ttl
    };
    
    localStorage.setItem(key, JSON.stringify(cacheItem));
  } catch (error) {
    console.error(`保存到緩存時出錯 (${key}):`, error);
  }
}

/**
 * 從緩存獲取數據
 * @param key 緩存鍵
 * @returns 緩存的數據，如果過期則返回null
 */
function getFromCache<T>(key: string): T | null {
  try {
    const cacheJson = localStorage.getItem(key);
    
    if (!cacheJson) return null;
    
    const cache = JSON.parse(cacheJson) as CacheItem<T>;
    
    // 檢查是否過期
    if (cache.expires < Date.now()) {
      localStorage.removeItem(key);
      return null;
    }
    
    return cache.data;
  } catch (error) {
    console.error(`從緩存獲取數據時出錯 (${key}):`, error);
    return null;
  }
}

/**
 * 清除特定緩存
 * @param key 緩存鍵
 */
function clearCache(key: string): void {
  localStorage.removeItem(key);
}

/**
 * 清除所有緩存
 */
function clearAllCache(): void {
  Object.values(CACHE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
}

// 員工接口
export interface Employee {
  id: number;
  name: string;
  idNumber: string;
  department: string;
  position: string;
  isEncrypted: boolean;
  active: boolean;
  phone?: string;
}

// 薪資記錄接口
export interface SalaryRecord {
  id: number;
  employeeId: number;
  employeeName: string;
  salaryYear: number;
  salaryMonth: number;
  baseSalary: number;
  overtimePay: number;
  deductions: number;
  totalSalary: number;
  details?: object;
  createdAt: string;
  updatedAt: string;
}

// 系統設置接口
export interface Settings {
  id: number;
  baseHourlyRate: number;
  ot1Multiplier: number;
  ot2Multiplier: number;
  minimumWage: number;
  laborInsuranceRate: number;
  healthInsuranceRate: number;
  [key: string]: any;
}

// 考勤記錄接口
export interface Attendance {
  id: number;
  employeeId: number;
  employeeName: string;
  date: string;
  clockIn: string;
  clockOut: string;
  status: string;
  [key: string]: any;
}

// 假日接口
export interface Holiday {
  id: number;
  date: string;
  name: string;
  type: string;
  [key: string]: any;
}

/**
 * 員工數據緩存
 */
export function cacheEmployees(employees: Employee[]): void {
  console.log(`儲存 ${employees.length} 名員工資料到緩存`);
  saveToCache<Employee[]>(CACHE_KEYS.EMPLOYEES, employees, CACHE_TTL.LONG);
}

export function getCachedEmployees(): Employee[] | null {
  const cachedEmployees = getFromCache<Employee[]>(CACHE_KEYS.EMPLOYEES);
  if (cachedEmployees) {
    console.log(`從緩存取得 ${cachedEmployees.length} 名員工資料`);
    // 打印一些員工信息以便驗證
    if (cachedEmployees.length > 0) {
      console.log('緩存中的第一位員工:', {
        id: cachedEmployees[0].id,
        name: cachedEmployees[0].name,
        department: cachedEmployees[0].department
      });
    }
  } else {
    console.log('員工資料緩存為空或已過期');
  }
  return cachedEmployees;
}

/**
 * 薪資記錄緩存
 */
export function cacheSalaryRecords(records: SalaryRecord[]): void {
  saveToCache<SalaryRecord[]>(CACHE_KEYS.SALARY_RECORDS, records, CACHE_TTL.MEDIUM);
}

export function getCachedSalaryRecords(): SalaryRecord[] | null {
  return getFromCache<SalaryRecord[]>(CACHE_KEYS.SALARY_RECORDS);
}

/**
 * 系統設定緩存
 */
export function cacheSettings(settings: Settings): void {
  saveToCache<Settings>(CACHE_KEYS.SETTINGS, settings, CACHE_TTL.LONG);
}

export function getCachedSettings(): Settings | null {
  return getFromCache<Settings>(CACHE_KEYS.SETTINGS);
}

/**
 * 考勤數據緩存
 */
export function cacheAttendance(attendance: Attendance[]): void {
  saveToCache<Attendance[]>(CACHE_KEYS.ATTENDANCE, attendance, CACHE_TTL.SHORT);
}

export function getCachedAttendance(): Attendance[] | null {
  return getFromCache<Attendance[]>(CACHE_KEYS.ATTENDANCE);
}

/**
 * 假日數據緩存
 */
export function cacheHolidays(holidays: Holiday[]): void {
  saveToCache<Holiday[]>(CACHE_KEYS.HOLIDAYS, holidays, CACHE_TTL.LONG);
}

export function getCachedHolidays(): Holiday[] | null {
  return getFromCache<Holiday[]>(CACHE_KEYS.HOLIDAYS);
}

export default {
  cacheEmployees,
  getCachedEmployees,
  cacheSalaryRecords,
  getCachedSalaryRecords,
  cacheSettings,
  getCachedSettings,
  cacheAttendance,
  getCachedAttendance,
  cacheHolidays,
  getCachedHolidays,
  clearCache,
  clearAllCache
};