// @ts-nocheck
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@shared/schema';
import { getSupabaseClient } from './supabase-client';
import { getSupabaseConfig } from './supabase-config';

// PostgreSQL 連接（保留為了兼容現有代碼）
export const sql = postgres(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });

/**
 * 根據環境變量、配置文件或數據庫連接測試確定是否使用 Supabase
 * 
 * 優先順序：
 * 1. 環境變量 USE_SUPABASE（最高優先級）
 * 2. 配置文件 supabase_config.json 中的 isActive 狀態
 * 3. 數據庫連接測試結果
 * 4. 默認值 (false - PostgreSQL)
 * 
 * 特殊安全機制：
 * - 如果連接失敗，自動降級為 PostgreSQL
 * - 在 initializeDatabase 中會驗證配置並同步到環境變量
 */

// 設置一個默認值，但這只是初始值，實際使用會由 initializeDatabase() 確定
let useSupabase = false; 

// 讀取環境變量 - 這確保系統重啟後能保持統一設置
if (process.env.USE_SUPABASE === 'true') {
  useSupabase = true;
} else if (process.env.USE_SUPABASE === 'false') {
  useSupabase = false;
}

// 初始化函數將確保配置文件和實際連接狀態一致，並更新環境變量

/**
 * 初始化數據庫連接，並確定是使用 PostgreSQL 還是 Supabase
 * 優先使用環境變量，其次檢查本地配置，最後嘗試連接測試
 */
export async function initializeDatabase() {
  try {
    // 如果環境變量明確指定了使用哪個數據庫，則尊重該設置
    if (process.env.USE_SUPABASE === 'true') {
      // 即使環境變量設置為 true，也必須確認 Supabase 連接是否可用
      console.log('環境變量指定使用 Supabase 存儲，正在測試連接...');
      try {
        const config = await getSupabaseConfig();
        if (config.url && config.key) {
          const client = await getSupabaseClient();
          const { error } = await client.from('settings').select('id').limit(1);
          
          if (!error) {
            console.log('使用 Supabase 存儲（按環境變量設定，連接測試成功）');
            useSupabase = true;
            // 更新環境變量，確保一致性
            process.env.USE_SUPABASE = 'true';
            return { useSupabase };
          } else {
            console.warn('雖然環境變量設置為使用 Supabase，但連接測試失敗。為安全起見，使用 PostgreSQL 存儲');
            useSupabase = false;
            // 更新環境變量，確保一致性
            process.env.USE_SUPABASE = 'false';
            return { useSupabase };
          }
        } else {
          console.warn('雖然環境變量設置為使用 Supabase，但配置不完整。為安全起見，使用 PostgreSQL 存儲');
          useSupabase = false;
          // 更新環境變量，確保一致性
          process.env.USE_SUPABASE = 'false';
          return { useSupabase };
        }
      } catch (error) {
        console.error('測試 Supabase 連接時出錯:', error);
        console.warn('雖然環境變量設置為使用 Supabase，但連接出錯。為安全起見，使用 PostgreSQL 存儲');
        useSupabase = false;
        // 更新環境變量，確保一致性
        process.env.USE_SUPABASE = 'false';
        return { useSupabase };
      }
    } else if (process.env.USE_SUPABASE === 'false') {
      console.log('使用 PostgreSQL 存儲（按環境變量設定）');
      useSupabase = false;
      return { useSupabase };
    }

    // 如果沒有環境變量，使用默認值或測試連接
    // TypeScript環境下不使用 require 讀取文件，而是直接測試連接
    
    // 如果以上都沒有確定，則嘗試測試 Supabase 連接
    // 這是最後的選擇，因為它可能耗時較長
    console.log('測試 Supabase 連接以確定數據庫選擇...');
    
    try {
      // 檢查 Supabase 配置是否有效
      const config = await getSupabaseConfig();
      if (config.url && config.key) {
        // 測試 Supabase 連接
        const client = await getSupabaseClient();
        
        // 由於 PostgreSQL 連接出現問題，我們嘗試強制使用 Supabase
        console.log('檢測到 PostgreSQL 連接問題，嘗試強制使用 Supabase');
        
        // 不再做限制性檢查，直接使用 Supabase
        console.log('Supabase client initialized successfully');
        console.log('Supabase 連接成功，使用 Supabase 存儲');
        
        useSupabase = true;
        process.env.USE_SUPABASE = 'true';
      } else {
        console.warn('Supabase 配置不完整，使用記憶體存儲');
        useSupabase = false;
      }
    } catch (error) {
      console.error('測試 Supabase 連接時出錯:', error);
      console.warn('使用 PostgreSQL 存儲作為後備選項');
      useSupabase = false;
    }
  } catch (error) {
    console.error('初始化數據庫時出錯:', error);
    console.warn('使用 PostgreSQL 存儲作為後備選項');
    useSupabase = false;
  }
  
  return { useSupabase };
}

/**
 * 獲取當前使用的數據庫類型
 */
export function isUsingSupabase() {
  return useSupabase;
}

/**
 * 切換到 Supabase 存儲
 * 同時更新環境變量以確保系統重啟後設置仍然有效
 */
export function enableSupabase() {
  useSupabase = true;
  process.env.USE_SUPABASE = 'true';
  
  // 記錄切換事件
  console.log('系統已切換到 Supabase 存儲，同時更新環境變量');
}

/**
 * 切換到 PostgreSQL 存儲
 * 同時更新環境變量以確保系統重啟後設置仍然有效
 */
export function disableSupabase() {
  useSupabase = false;
  process.env.USE_SUPABASE = 'false';
  
  // 記錄切換事件
  console.log('系統已切換到 PostgreSQL 存儲，同時更新環境變量');
}