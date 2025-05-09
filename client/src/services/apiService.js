/**
 * API服務
 * 
 * 提供增強的API請求功能:
 * 1. 自動重試失敗的請求
 * 2. 在網絡故障時使用本地緩存
 * 3. 統一錯誤處理和通知
 */

import { 
  cacheEmployees, getCachedEmployees,
  cacheSalaryRecords, getCachedSalaryRecords,
  cacheSettings, getCachedSettings
} from '../utils/dataCache';

// 默認配置
const DEFAULT_CONFIG = {
  retries: 3,           // 最大重試次數
  retryDelay: 1000,     // 重試延遲（毫秒）
  timeout: 15000,       // 請求超時（毫秒）
  useCache: true,       // 是否使用緩存
  cacheOnError: true    // 錯誤時是否使用緩存
};

/**
 * 延遲函數
 * @param {number} ms 延遲毫秒數
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 增強的fetch函數，支持重試和緩存
 * @param {string} url 請求URL
 * @param {Object} options 請求選項
 * @param {Object} config 配置
 * @returns {Promise<any>} 響應數據
 */
export async function fetchWithRetry(url, options = {}, config = {}) {
  // 合併配置
  const { retries, retryDelay, timeout, useCache, cacheOnError } = { 
    ...DEFAULT_CONFIG, 
    ...config 
  };
  
  // 創建帶超時的AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  // 添加signal到options
  const fetchOptions = {
    ...options,
    signal: controller.signal
  };
  
  let error;
  
  // 嘗試指定次數
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);
      
      // 清除超時
      clearTimeout(timeoutId);
      
      // 檢查響應
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      // 解析響應
      const data = await response.json();
      
      // 緩存數據（如果啟用）
      if (useCache) {
        cacheResponse(url, data);
      }
      
      return data;
    } catch (err) {
      error = err;
      
      // 如果是最後一次嘗試，不等待
      if (attempt < retries) {
        // 等待一段時間後重試（可以使用指數回退）
        await delay(retryDelay * Math.pow(2, attempt));
      }
    }
  }
  
  // 所有嘗試都失敗，嘗試從緩存獲取
  if (cacheOnError) {
    const cachedData = getCachedResponse(url);
    
    if (cachedData) {
      console.warn(`使用緩存的數據: ${url}`);
      return cachedData;
    }
  }
  
  // 沒有緩存或緩存已過期，拋出最後一個錯誤
  throw error;
}

/**
 * 緩存API響應
 * @param {string} url 請求URL
 * @param {any} data 響應數據
 */
function cacheResponse(url, data) {
  if (!data) return;
  
  // 根據URL路徑選擇緩存方法
  if (url.includes('/api/employees')) {
    cacheEmployees(data);
  } else if (url.includes('/api/salary-records')) {
    cacheSalaryRecords(data);
  } else if (url.includes('/api/settings')) {
    cacheSettings(data);
  }
}

/**
 * 獲取緩存的API響應
 * @param {string} url 請求URL
 * @returns {any|null} 緩存的數據
 */
function getCachedResponse(url) {
  // 根據URL路徑選擇緩存方法
  if (url.includes('/api/employees')) {
    return getCachedEmployees();
  } else if (url.includes('/api/salary-records')) {
    return getCachedSalaryRecords();
  } else if (url.includes('/api/settings')) {
    return getCachedSettings();
  }
  
  return null;
}

/**
 * GET請求
 * @param {string} url 請求URL
 * @param {Object} config 配置
 * @returns {Promise<any>} 響應數據
 */
export async function get(url, config = {}) {
  return fetchWithRetry(url, { method: 'GET' }, config);
}

/**
 * POST請求
 * @param {string} url 請求URL
 * @param {any} body 請求體
 * @param {Object} config 配置
 * @returns {Promise<any>} 響應數據
 */
export async function post(url, body, config = {}) {
  return fetchWithRetry(
    url, 
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }, 
    config
  );
}

/**
 * PATCH請求
 * @param {string} url 請求URL
 * @param {any} body 請求體
 * @param {Object} config 配置
 * @returns {Promise<any>} 響應數據
 */
export async function patch(url, body, config = {}) {
  return fetchWithRetry(
    url, 
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }, 
    config
  );
}

/**
 * DELETE請求
 * @param {string} url 請求URL
 * @param {Object} config 配置
 * @returns {Promise<any>} 響應數據
 */
export async function del(url, config = {}) {
  return fetchWithRetry(
    url, 
    { method: 'DELETE' }, 
    config
  );
}

export default {
  get,
  post,
  patch,
  delete: del,
  fetchWithRetry
};