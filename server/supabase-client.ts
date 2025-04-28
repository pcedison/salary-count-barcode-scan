import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './supabase-config';

/**
 * 將蛇形命名(snake_case)轉換為駝峰式命名(camelCase)
 * 例如：employee_id -> employeeId
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 將駝峰式命名(camelCase)轉換為蛇形命名(snake_case)
 * 例如：employeeId -> employee_id
 */
function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/**
 * 將對象所有鍵從蛇形命名轉換為駝峰式命名
 */
function mapColumnsToCamelCase(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map((item: any) => mapColumnsToCamelCase(item));
  }
  
  const result: any = {};
  
  Object.keys(obj).forEach((key: string) => {
    const camelKey = toCamelCase(key);
    const value = obj[key];
    
    result[camelKey] = typeof value === 'object' ? mapColumnsToCamelCase(value) : value;
  });
  
  return result;
}

/**
 * 將對象所有鍵從駝峰式命名轉換為蛇形命名
 */
function mapColumnsToSnakeCase(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map((item: any) => mapColumnsToSnakeCase(item));
  }
  
  const result: any = {};
  
  Object.keys(obj).forEach((key: string) => {
    // 跳過 id 字段，保持不變
    if (key === 'id') {
      result[key] = obj[key];
      return;
    }
    
    const snakeKey = toSnakeCase(key);
    const value = obj[key];
    
    result[snakeKey] = typeof value === 'object' ? mapColumnsToSnakeCase(value) : value;
  });
  
  return result;
}

// 單例模式的 Supabase 客戶端
let supabaseInstance: SupabaseClient | null = null;
let configCache: { url: string, key: string } | null = null;

/**
 * 初始化 Supabase 客戶端（優化版）
 * 使用緩存配置和單例模式避免創建多個實例
 */
export async function initSupabaseClient(): Promise<SupabaseClient> {
  // 如果已有實例，返回現有實例
  if (supabaseInstance) {
    return supabaseInstance;
  }

  try {
    // 獲取配置
    const config = configCache || await getSupabaseConfig();
    
    if (!config.url || !config.key) {
      throw new Error('Supabase URL or key is missing. Please check your configuration.');
    }
    
    // 緩存配置以便後續使用
    if (!configCache) {
      configCache = config;
    }
    
    // 創建單個客戶端實例
    supabaseInstance = createClient(config.url, config.key, {
      auth: {
        persistSession: false, // 避免自動持久化會話
        autoRefreshToken: false // 避免自動刷新令牌
      }
    });
    
    console.log('Supabase client initialized successfully');
    return supabaseInstance;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    throw error;
  }
}

// 獲取 Supabase 客戶端實例
export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (!supabaseInstance) {
    return initSupabaseClient();
  }
  return supabaseInstance;
}

/**
 * 重置客戶端（用於配置更改或測試）
 * 同時清除實例和配置緩存以確保下次獲取最新配置
 */
export function resetSupabaseClient(): void {
  supabaseInstance = null;
  configCache = null;
  console.log('Supabase client and config cache has been reset');
}

// 檢查 Supabase 連接狀態
export async function checkSupabaseConnection(): Promise<{isConnected: boolean, errorMessage?: string}> {
  try {
    const client = await getSupabaseClient();
    const { error } = await client.from('settings').select('id').limit(1);
    
    if (error) {
      console.error('Supabase connection error:', error.message);
      return { 
        isConnected: false, 
        errorMessage: error.message || '連接到Supabase時發生錯誤' 
      };
    }
    
    return { isConnected: true };
  } catch (error: any) {
    const errorMessage = error?.message || '連接到Supabase時發生未知錯誤';
    console.error('Supabase connection check failed:', errorMessage);
    return { 
      isConnected: false, 
      errorMessage 
    };
  }
}

// 常用的數據庫操作包裝器
export const supabaseHelpers = {
  // 從表中獲取所有記錄
  async getAll<T>(table: string): Promise<T[]> {
    const client = await getSupabaseClient();
    const { data, error } = await client.from(table).select('*');
    
    if (error) {
      console.error(`Error fetching all records from ${table}:`, error);
      throw error;
    }
    
    // 將蛇形命名轉換為駝峰式命名
    const transformedData = data ? data.map((item: any) => mapColumnsToCamelCase(item)) : [];
    return transformedData as T[];
  },
  
  // 通過 ID 獲取記錄
  async getById<T>(table: string, id: number): Promise<T | null> {
    const client = await getSupabaseClient();
    const { data, error } = await client.from(table).select('*').eq('id', id).single();
    
    if (error) {
      if (error.code === 'PGRST116') { // 記錄不存在的錯誤代碼
        return null;
      }
      console.error(`Error fetching record by ID from ${table}:`, error);
      throw error;
    }
    
    // 將蛇形命名轉換為駝峰式命名
    return data ? mapColumnsToCamelCase(data) as T : null;
  },
  
  // 創建記錄
  async create<T>(table: string, record: any): Promise<T> {
    // 將駝峰式命名轉換為蛇形命名
    const snakeCaseRecord = mapColumnsToSnakeCase(record);
    
    const client = await getSupabaseClient();
    const { data, error } = await client.from(table).insert([snakeCaseRecord]).select().single();
    
    if (error) {
      console.error(`Error creating record in ${table}:`, error);
      console.error('Record data:', snakeCaseRecord);
      throw error;
    }
    
    // 將蛇形命名轉換為駝峰式命名
    return data ? mapColumnsToCamelCase(data) as T : ({} as T);
  },
  
  // 更新記錄
  async update<T>(table: string, id: number, updates: any): Promise<T | null> {
    // 將駝峰式命名轉換為蛇形命名
    const snakeCaseUpdates = mapColumnsToSnakeCase(updates);
    
    const client = await getSupabaseClient();
    const { data, error } = await client.from(table).update(snakeCaseUpdates).eq('id', id).select().single();
    
    if (error) {
      console.error(`Error updating record in ${table}:`, error);
      throw error;
    }
    
    // 將蛇形命名轉換為駝峰式命名
    return data ? mapColumnsToCamelCase(data) as T : null;
  },
  
  // 刪除記錄
  async delete(table: string, id: number): Promise<boolean> {
    const client = await getSupabaseClient();
    const { error } = await client.from(table).delete().eq('id', id);
    
    if (error) {
      console.error(`Error deleting record from ${table}:`, error);
      throw error;
    }
    
    return true;
  },
  
  // 自定義查詢
  async query<T>(table: string, queryFn: (query: any) => any): Promise<T[]> {
    const client = await getSupabaseClient();
    const baseQuery = client.from(table).select('*');
    const { data, error } = await queryFn(baseQuery);
    
    if (error) {
      console.error(`Error executing custom query on ${table}:`, error);
      throw error;
    }
    
    // 將蛇形命名轉換為駝峰式命名
    const transformedData = data ? data.map((item: any) => mapColumnsToCamelCase(item)) : [];
    return transformedData as T[];
  }
};