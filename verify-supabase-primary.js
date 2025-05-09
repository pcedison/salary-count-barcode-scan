/**
 * Supabase 主數據庫驗證工具
 * 
 * 此工具用於確認系統是否正確地將 Supabase 設置為主要數據庫。
 * 它會檢查配置文件、環境變量和實際數據庫連接，確保整個系統一致地使用 Supabase。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { Pool } = pg;

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = __dirname;

// 配置文件路徑
const CONFIG_FILE = path.join(ROOT_DIR, 'data', 'db-config.json');

// 檢查配置文件
console.log('檢查數據庫配置文件...');
let configCheck = { exists: false, isPrimary: false };

try {
  if (fs.existsSync(CONFIG_FILE)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    configCheck.exists = true;
    configCheck.isPrimary = config.primaryDatabase === 'supabase';
    console.log(`配置文件存在: ${configCheck.exists}`);
    console.log(`配置中的主數據庫是 Supabase: ${configCheck.isPrimary}`);
    
    if (!configCheck.isPrimary) {
      console.log(`配置中的主數據庫是: ${config.primaryDatabase}`);
    }
  } else {
    console.log('配置文件不存在');
  }
} catch (error) {
  console.error('讀取配置文件時出錯:', error);
}

// 檢查環境變量
console.log('\n檢查環境變量...');
const envCheck = {
  supabaseUrl: !!process.env.SUPABASE_URL,
  supabaseKey: !!process.env.SUPABASE_KEY,
  databaseUrl: !!process.env.DATABASE_URL
};

console.log(`SUPABASE_URL 環境變量存在: ${envCheck.supabaseUrl}`);
console.log(`SUPABASE_KEY 環境變量存在: ${envCheck.supabaseKey}`);
console.log(`DATABASE_URL 環境變量存在: ${envCheck.databaseUrl}`);

// 檢查 Supabase 連接
console.log('\n檢查 Supabase 連接...');
let supabaseCheck = { canConnect: false, error: null };

try {
  if (envCheck.supabaseUrl && envCheck.supabaseKey) {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    
    // 嘗試一個簡單查詢
    console.log('嘗試連接到 Supabase...');
    supabase.from('settings').select('id').limit(1)
      .then(response => {
        if (response.error) {
          supabaseCheck.error = response.error.message;
          console.error('Supabase 查詢失敗:', response.error);
        } else {
          supabaseCheck.canConnect = true;
          console.log('Supabase 連接成功!');
        }
        checkPostgres();
      })
      .catch(error => {
        supabaseCheck.error = error.message;
        console.error('Supabase 連接失敗:', error);
        checkPostgres();
      });
  } else {
    console.error('缺少 Supabase 環境變量，無法連接');
    checkPostgres();
  }
} catch (error) {
  supabaseCheck.error = error.message;
  console.error('初始化 Supabase 客戶端時出錯:', error);
  checkPostgres();
}

// 檢查 PostgreSQL 連接
function checkPostgres() {
  console.log('\n檢查 PostgreSQL 連接...');
  let postgresCheck = { canConnect: false, error: null };
  
  try {
    if (envCheck.databaseUrl) {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000
      });
      
      // 嘗試連接
      console.log('嘗試連接到 PostgreSQL...');
      pool.connect()
        .then(client => {
          // 執行簡單查詢
          return client.query('SELECT NOW() as time')
            .then(result => {
              postgresCheck.canConnect = true;
              console.log('PostgreSQL 連接成功!');
              client.release();
              summarizeResults(postgresCheck);
            })
            .catch(error => {
              postgresCheck.error = error.message;
              console.error('PostgreSQL 查詢失敗:', error);
              client.release();
              summarizeResults(postgresCheck);
            });
        })
        .catch(error => {
          postgresCheck.error = error.message;
          console.error('PostgreSQL 連接失敗:', error);
          summarizeResults(postgresCheck);
        })
        .finally(() => {
          pool.end();
        });
    } else {
      console.error('缺少 DATABASE_URL 環境變量，無法連接');
      summarizeResults({ canConnect: false, error: '缺少 DATABASE_URL 環境變量' });
    }
  } catch (error) {
    postgresCheck.error = error.message;
    console.error('初始化 PostgreSQL 連接池時出錯:', error);
    summarizeResults(postgresCheck);
  }
}

// 總結結果
function summarizeResults(postgresCheck) {
  console.log('\n=============== 驗證結果 ===============');
  
  // 配置檢查
  console.log('\n配置檢查:');
  if (configCheck.exists) {
    if (configCheck.isPrimary) {
      console.log('✅ 配置文件正確地將 Supabase 設為主數據庫');
    } else {
      console.log('❌ 配置文件未將 Supabase 設為主數據庫');
    }
  } else {
    console.log('⚠️ 配置文件不存在，無法確認配置');
  }
  
  // 環境變量檢查
  console.log('\n環境變量檢查:');
  if (envCheck.supabaseUrl && envCheck.supabaseKey) {
    console.log('✅ Supabase 環境變量已設置');
  } else {
    console.log('❌ Supabase 環境變量未完全設置');
  }
  
  // 連接檢查
  console.log('\n連接檢查:');
  if (supabaseCheck.canConnect) {
    console.log('✅ Supabase 連接成功');
  } else {
    console.log(`❌ Supabase 連接失敗: ${supabaseCheck.error || '未知錯誤'}`);
  }
  
  if (postgresCheck.canConnect) {
    console.log('✅ PostgreSQL 連接成功');
  } else {
    console.log(`❌ PostgreSQL 連接失敗: ${postgresCheck.error || '未知錯誤'}`);
  }
  
  // 總體結論
  console.log('\n總體結論:');
  if (configCheck.isPrimary && supabaseCheck.canConnect) {
    console.log('✅ 系統正確地配置為使用 Supabase 作為主數據庫');
  } else if (supabaseCheck.canConnect && !postgresCheck.canConnect) {
    console.log('✅ 系統實際上只能使用 Supabase (PostgreSQL 連接失敗)');
  } else if (!supabaseCheck.canConnect && postgresCheck.canConnect) {
    console.log('❌ 系統可能正在使用 PostgreSQL 作為主數據庫 (Supabase 連接失敗)');
  } else if (supabaseCheck.canConnect && postgresCheck.canConnect) {
    if (configCheck.isPrimary) {
      console.log('⚠️ 系統配置為使用 Supabase，但兩種數據庫連接都可用。請確認實際使用的是 Supabase。');
    } else {
      console.log('❌ 兩種數據庫連接都可用，但配置未指定 Supabase 為主數據庫');
    }
  } else {
    console.log('❌ 無法確定主數據庫，兩種連接都失敗');
  }
  
  // 推薦操作
  console.log('\n推薦操作:');
  if (!configCheck.isPrimary) {
    console.log('1. 更新配置文件，將 primaryDatabase 設置為 "supabase"');
  }
  
  if (!supabaseCheck.canConnect) {
    console.log('2. 檢查 Supabase 憑證和連接設置');
  }
  
  if (supabaseCheck.canConnect && postgresCheck.canConnect && !configCheck.isPrimary) {
    console.log('3. 創建或修改 data/db-config.json 文件，確保它包含 {"primaryDatabase": "supabase"} 設置');
  }
  
  console.log('\n=======================================');
}