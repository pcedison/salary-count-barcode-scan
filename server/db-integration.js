/**
 * 數據庫整合模塊
 * 
 * 功能：
 * 1. 根據配置文件自動選擇主數據庫
 * 2. 提供統一的數據庫接口
 * 3. 處理自動故障轉移
 */

import { getPrimaryDatabase, getConfig } from './db-config.js';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema.js';

// 全局變量
let currentDbType = null;
let pgPool = null;
let supabaseClient = null;
let drizzleDb = null;
let sqlClient = null;

/**
 * 初始化 PostgreSQL 連接
 * @returns {boolean} 是否成功
 */
async function initPostgres() {
  try {
    // 創建連接池
    pgPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    // 測試連接
    const client = await pgPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    // 初始化 Drizzle
    sqlClient = postgres(process.env.DATABASE_URL);
    drizzleDb = drizzle(sqlClient, { schema });
    
    console.log('PostgreSQL 連接初始化成功');
    return true;
  } catch (error) {
    console.error('PostgreSQL 連接初始化失敗:', error);
    
    // 清理資源
    if (pgPool) {
      await pgPool.end();
      pgPool = null;
    }
    
    if (sqlClient) {
      await sqlClient.end();
      sqlClient = null;
    }
    
    drizzleDb = null;
    
    return false;
  }
}

/**
 * 初始化 Supabase 連接
 * @returns {boolean} 是否成功
 */
async function initSupabase() {
  try {
    // 創建 Supabase 客戶端
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    
    // 測試連接
    const { data, error } = await supabaseClient.from('settings').select('id').limit(1);
    
    if (error) {
      throw new Error(`Supabase 連接測試失敗: ${error.message}`);
    }
    
    // 初始化 Drizzle (使用與 Supabase 相同的 PostgreSQL 連接)
    sqlClient = postgres(process.env.DATABASE_URL);
    drizzleDb = drizzle(sqlClient, { schema });
    
    console.log('Supabase 連接初始化成功');
    return true;
  } catch (error) {
    console.error('Supabase 連接初始化失敗:', error);
    
    // 清理資源
    supabaseClient = null;
    
    if (sqlClient) {
      await sqlClient.end();
      sqlClient = null;
    }
    
    drizzleDb = null;
    
    return false;
  }
}

/**
 * 初始化數據庫連接
 * @param {string} preferredType 優先數據庫類型 (可選)
 * @returns {Promise<boolean>} 是否初始化成功
 */
export async function initializeDatabase(preferredType = null) {
  // 獲取主數據庫類型
  const primaryType = preferredType || getPrimaryDatabase();
  const config = getConfig();
  
  console.log(`嘗試初始化主數據庫 (${primaryType})...`);
  
  let success = false;
  
  // 嘗試連接主數據庫
  if (primaryType === 'supabase') {
    success = await initSupabase();
    
    if (success) {
      currentDbType = 'supabase';
    } else if (config.autoFailover) {
      // 故障轉移到 PostgreSQL
      console.log('Supabase 連接失敗，嘗試故障轉移到 PostgreSQL...');
      success = await initPostgres();
      
      if (success) {
        currentDbType = 'postgres';
      }
    }
  } else {
    success = await initPostgres();
    
    if (success) {
      currentDbType = 'postgres';
    } else if (config.autoFailover) {
      // 故障轉移到 Supabase
      console.log('PostgreSQL 連接失敗，嘗試故障轉移到 Supabase...');
      success = await initSupabase();
      
      if (success) {
        currentDbType = 'supabase';
      }
    }
  }
  
  if (!success) {
    console.error('所有數據庫連接都失敗');
    return false;
  }
  
  console.log(`數據庫初始化成功，使用 ${currentDbType} 存儲`);
  return true;
}

/**
 * 獲取當前數據庫類型
 * @returns {string|null} 當前數據庫類型
 */
export function getCurrentDatabaseType() {
  return currentDbType;
}

/**
 * 獲取 Drizzle ORM 實例
 * @returns {Object|null} Drizzle ORM 實例
 */
export function getDb() {
  return drizzleDb;
}

/**
 * 獲取 Supabase 客戶端
 * @returns {Object|null} Supabase 客戶端
 */
export function getSupabaseClient() {
  return supabaseClient;
}

/**
 * 獲取 PostgreSQL 連接池
 * @returns {Object|null} PostgreSQL 連接池
 */
export function getPgPool() {
  return pgPool;
}

/**
 * 獲取 SQL 客戶端
 * @returns {Object|null} SQL 客戶端
 */
export function getSqlClient() {
  return sqlClient;
}

/**
 * 關閉數據庫連接
 */
export async function closeDatabase() {
  try {
    // 關閉 SQL 客戶端
    if (sqlClient) {
      await sqlClient.end();
      sqlClient = null;
    }
    
    // 關閉 PostgreSQL 連接池
    if (pgPool) {
      await pgPool.end();
      pgPool = null;
    }
    
    // 重置變量
    supabaseClient = null;
    drizzleDb = null;
    currentDbType = null;
    
    console.log('數據庫連接已關閉');
  } catch (error) {
    console.error('關閉數據庫連接時出錯:', error);
  }
}

/**
 * 切換數據庫類型
 * @param {string} newType 新的數據庫類型
 * @returns {Promise<boolean>} 是否切換成功
 */
export async function switchDatabaseType(newType) {
  if (newType !== 'supabase' && newType !== 'postgres') {
    console.error('無效的數據庫類型:', newType);
    return false;
  }
  
  // 如果當前已經是指定類型，不需要切換
  if (currentDbType === newType) {
    console.log(`已經使用 ${newType} 存儲，無需切換`);
    return true;
  }
  
  // 關閉當前連接
  await closeDatabase();
  
  // 初始化新連接
  return await initializeDatabase(newType);
}

// 默認導出
export default {
  initializeDatabase,
  getCurrentDatabaseType,
  getDb,
  getSupabaseClient,
  getPgPool,
  getSqlClient,
  closeDatabase,
  switchDatabaseType
};