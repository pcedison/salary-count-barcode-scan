/**
 * 數據緩存工具
 * 
 * 功能：
 * 1. 在本地存儲保存關鍵數據的副本
 * 2. 當API請求失敗時提供備用數據
 * 3. 自動同步本地和服務器數據
 */

// 緩存鍵
const CACHE_KEYS = {
  EMPLOYEES: 'cached_employees',
  SETTINGS: 'cached_settings',
  SALARY_RECORDS: 'cached_salary_records',
  LAST_SYNC: 'last_cache_sync'
};

// 緩存TTL（時間到期限制，單位：毫秒）
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7天

/**
 * 保存數據到緩存
 * @param {string} key 緩存鍵
 * @param {any} data 要緩存的數據
 */
export function saveToCache(key, data) {
  try {
    const cacheData = {
      data,
      timestamp: Date.now()
    };
    
    localStorage.setItem(key, JSON.stringify(cacheData));
    console.log(`數據已緩存: ${key}`);
    
    // 更新上次同步時間
    localStorage.setItem(CACHE_KEYS.LAST_SYNC, Date.now().toString());
  } catch (error) {
    console.error(`緩存數據時出錯: ${error.message}`);
  }
}

/**
 * 從緩存讀取數據
 * @param {string} key 緩存鍵
 * @param {boolean} checkExpiry 是否檢查過期
 * @returns {any|null} 緩存的數據，如果不存在或已過期則返回null
 */
export function getFromCache(key, checkExpiry = true) {
  try {
    const cachedString = localStorage.getItem(key);
    
    if (!cachedString) {
      return null;
    }
    
    const cached = JSON.parse(cachedString);
    
    // 檢查是否過期
    if (checkExpiry && Date.now() - cached.timestamp > CACHE_TTL) {
      console.log(`緩存已過期: ${key}`);
      localStorage.removeItem(key);
      return null;
    }
    
    return cached.data;
  } catch (error) {
    console.error(`讀取緩存時出錯: ${error.message}`);
    return null;
  }
}

/**
 * 緩存員工數據
 * @param {Array} employees 員工數據
 */
export function cacheEmployees(employees) {
  if (employees && Array.isArray(employees) && employees.length > 0) {
    saveToCache(CACHE_KEYS.EMPLOYEES, employees);
  }
}

/**
 * 獲取緩存的員工數據
 * @returns {Array|null} 員工數據
 */
export function getCachedEmployees() {
  return getFromCache(CACHE_KEYS.EMPLOYEES);
}

/**
 * 緩存設定數據
 * @param {Object} settings 設定數據
 */
export function cacheSettings(settings) {
  if (settings) {
    saveToCache(CACHE_KEYS.SETTINGS, settings);
  }
}

/**
 * 獲取緩存的設定數據
 * @returns {Object|null} 設定數據
 */
export function getCachedSettings() {
  return getFromCache(CACHE_KEYS.SETTINGS);
}

/**
 * 緩存薪資記錄
 * @param {Array} records 薪資記錄
 */
export function cacheSalaryRecords(records) {
  if (records && Array.isArray(records) && records.length > 0) {
    saveToCache(CACHE_KEYS.SALARY_RECORDS, records);
  }
}

/**
 * 獲取緩存的薪資記錄
 * @returns {Array|null} 薪資記錄
 */
export function getCachedSalaryRecords() {
  return getFromCache(CACHE_KEYS.SALARY_RECORDS);
}

/**
 * 清除特定緩存
 * @param {string} key 緩存鍵
 */
export function clearCache(key) {
  localStorage.removeItem(key);
  console.log(`緩存已清除: ${key}`);
}

/**
 * 清除所有緩存
 */
export function clearAllCache() {
  for (const key of Object.values(CACHE_KEYS)) {
    localStorage.removeItem(key);
  }
  console.log('所有緩存已清除');
}

/**
 * 檢查緩存是否過期
 * @returns {boolean} 緩存是否過期
 */
export function isCacheExpired() {
  const lastSync = localStorage.getItem(CACHE_KEYS.LAST_SYNC);
  
  if (!lastSync) {
    return true;
  }
  
  return Date.now() - parseInt(lastSync) > CACHE_TTL;
}

/**
 * 獲取緩存狀態
 * @returns {Object} 緩存狀態
 */
export function getCacheStatus() {
  const employees = getFromCache(CACHE_KEYS.EMPLOYEES, false);
  const settings = getFromCache(CACHE_KEYS.SETTINGS, false);
  const salaryRecords = getFromCache(CACHE_KEYS.SALARY_RECORDS, false);
  const lastSync = localStorage.getItem(CACHE_KEYS.LAST_SYNC);
  
  return {
    hasEmployees: !!employees,
    employeesCount: employees ? employees.length : 0,
    hasSettings: !!settings,
    hasSalaryRecords: !!salaryRecords,
    salaryRecordsCount: salaryRecords ? salaryRecords.length : 0,
    lastSync: lastSync ? new Date(parseInt(lastSync)) : null,
    isExpired: isCacheExpired()
  };
}