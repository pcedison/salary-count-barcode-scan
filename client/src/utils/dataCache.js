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

/**
 * 保存數據到緩存
 * @param {string} key 緩存鍵
 * @param {any} data 數據
 * @param {number} ttl 過期時間（毫秒）
 */
function saveToCache(key, data, ttl = CACHE_TTL.MEDIUM) {
  if (!data) return;
  
  try {
    const cacheItem = {
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
 * @param {string} key 緩存鍵
 * @returns {any|null} 緩存的數據，如果過期則返回null
 */
function getFromCache(key) {
  try {
    const cacheJson = localStorage.getItem(key);
    
    if (!cacheJson) return null;
    
    const cache = JSON.parse(cacheJson);
    
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
 * @param {string} key 緩存鍵
 */
function clearCache(key) {
  localStorage.removeItem(key);
}

/**
 * 清除所有緩存
 */
function clearAllCache() {
  Object.values(CACHE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
}

/**
 * 員工數據緩存
 */
export function cacheEmployees(employees) {
  saveToCache(CACHE_KEYS.EMPLOYEES, employees, CACHE_TTL.LONG);
}

export function getCachedEmployees() {
  return getFromCache(CACHE_KEYS.EMPLOYEES);
}

/**
 * 薪資記錄緩存
 */
export function cacheSalaryRecords(records) {
  saveToCache(CACHE_KEYS.SALARY_RECORDS, records, CACHE_TTL.MEDIUM);
}

export function getCachedSalaryRecords() {
  return getFromCache(CACHE_KEYS.SALARY_RECORDS);
}

/**
 * 系統設定緩存
 */
export function cacheSettings(settings) {
  saveToCache(CACHE_KEYS.SETTINGS, settings, CACHE_TTL.LONG);
}

export function getCachedSettings() {
  return getFromCache(CACHE_KEYS.SETTINGS);
}

/**
 * 考勤數據緩存
 */
export function cacheAttendance(attendance) {
  saveToCache(CACHE_KEYS.ATTENDANCE, attendance, CACHE_TTL.SHORT);
}

export function getCachedAttendance() {
  return getFromCache(CACHE_KEYS.ATTENDANCE);
}

/**
 * 假日數據緩存
 */
export function cacheHolidays(holidays) {
  saveToCache(CACHE_KEYS.HOLIDAYS, holidays, CACHE_TTL.LONG);
}

export function getCachedHolidays() {
  return getFromCache(CACHE_KEYS.HOLIDAYS);
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