#!/usr/bin/env node
/**
 * PostgreSQL 到 Supabase 數據遷移腳本
 * 
 * 使用方法：
 * 1. 確保 supabase_config.json 已正確設置
 * 2. 運行: node migrate-to-supabase.js
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// 讀取 Supabase 配置
function getSupabaseConfig() {
  try {
    const configPath = path.join(process.cwd(), 'supabase_config.json');
    const data = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading Supabase config:', error);
    throw error;
  }
}

// 遷移每個表的函數
async function migrateTable(pgPool, supabaseClient, tableName, transformFn = null) {
  console.log(`開始遷移資料表 ${tableName}...`);
  
  try {
    // 從 PostgreSQL 獲取數據
    const result = await pgPool.query(`SELECT * FROM ${tableName}`);
    let records = result.rows;
    
    if (records.length === 0) {
      console.log(`資料表 ${tableName} 中沒有數據，跳過遷移。`);
      return 0;
    }
    
    // 對數據進行轉換（如果需要）
    if (transformFn) {
      records = records.map(transformFn);
    }
    
    // 將數據插入 Supabase
    // 首先刪除 Supabase 中的現有數據（如果需要）
    const { error: deleteError } = await supabaseClient
      .from(tableName)
      .delete()
      .neq('id', 0);  // 刪除所有記錄的條件
    
    if (deleteError) {
      console.error(`清除 ${tableName} 現有數據時出錯:`, deleteError);
      throw deleteError;
    }
    
    // 重置 ID 序列（如果需要）
    if (records.length > 0) {
      const maxId = Math.max(...records.map(r => r.id || 0));
      
      // 針對資料表的序列名稱可能需要調整
      const sequenceName = `${tableName}_id_seq`;
      await pgPool.query(`ALTER SEQUENCE IF EXISTS ${sequenceName} RESTART WITH ${maxId + 1}`);
    }
    
    // 插入記錄（批量插入以提高性能）
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      const { error: insertError } = await supabaseClient
        .from(tableName)
        .insert(batch);
      
      if (insertError) {
        console.error(`插入數據到 ${tableName} 時出錯:`, insertError);
        throw insertError;
      }
    }
    
    console.log(`成功遷移 ${records.length} 條記錄到資料表 ${tableName}`);
    return records.length;
  } catch (error) {
    console.error(`遷移資料表 ${tableName} 時發生錯誤:`, error);
    throw error;
  }
}

// 主要遷移函數
async function migrateData() {
  // 獲取 Supabase 配置
  const supabaseConfig = getSupabaseConfig();
  
  if (!supabaseConfig.url || !supabaseConfig.key) {
    console.error('缺少 Supabase URL 或金鑰。請檢查配置。');
    process.exit(1);
  }
  
  // 創建 Supabase 客戶端
  const supabaseClient = createClient(supabaseConfig.url, supabaseConfig.key);
  
  // 創建 PostgreSQL 連接池
  const pgPool = new Pool({ 
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    console.log('開始數據遷移過程...');
    
    // 數據轉換函數（針對列名稱不匹配的情況）
    const transformMap = {
      // 範例轉換函數 - 添加空值處理
      temporary_attendance: (record) => ({
        id: record.id,
        employee_id: record.employeeId || null,
        date: record.date || new Date().toISOString().split('T')[0],
        clock_in: record.clockIn || '00:00:00', // 使用默認值替代空值
        clock_out: record.clockOut || '',
        is_holiday: record.isHoliday || false,
        is_barcode_scanned: record.isBarcodeScanned || false,
        created_at: record.createdAt || new Date().toISOString()
      }),
      // 其他表的轉換函數 - 添加空值處理
      employees: (record) => ({
        id: record.id,
        name: record.name || '未命名員工',
        id_number: record.idNumber || `EMP${record.id || Math.floor(Math.random() * 10000)}`, // 生成臨時ID
        position: record.position || '',
        department: record.department || '',
        email: record.email || '',
        phone: record.phone || '',
        active: record.active ?? true,
        created_at: record.createdAt || new Date().toISOString()
      }),
      settings: (record) => ({
        id: record.id,
        base_hourly_rate: record.baseHourlyRate || 119, // 使用默認值替代空值
        ot1_multiplier: record.ot1Multiplier || 1.34,
        ot2_multiplier: record.ot2Multiplier || 1.67,
        base_month_salary: record.baseMonthSalary || 28590,
        welfare_allowance: record.welfareAllowance || 0,
        deductions: record.deductions || '[]',
        admin_pin: record.adminPin || '123456',
        updated_at: record.updatedAt || new Date().toISOString()
      }),
      salary_records: (record) => ({
        id: record.id,
        salary_year: record.salaryYear || new Date().getFullYear(), // 使用當前年份
        salary_month: record.salaryMonth || new Date().getMonth() + 1, // 使用當前月份
        base_salary: record.baseSalary || 28590, // 使用默認月薪
        housing_allowance: record.housingAllowance || 0,
        welfare_allowance: record.welfareAllowance || 0,
        total_ot1_hours: record.totalOT1Hours || 0,
        total_ot2_hours: record.totalOT2Hours || 0,
        total_overtime_pay: record.totalOvertimePay || 0,
        holiday_days: record.holidayDays || 0,
        holiday_daily_salary: record.holidayDailySalary || 0,
        total_holiday_pay: record.totalHolidayPay || 0,
        gross_salary: record.grossSalary || 28590, // 使用默認總薪資
        deductions: record.deductions || '[]',
        total_deductions: record.totalDeductions || 0,
        net_salary: record.netSalary || 28590, // 使用默認淨薪資
        attendance_data: record.attendanceData || '[]',
        created_at: record.createdAt || new Date().toISOString()
      }),
      holidays: (record) => ({
        id: record.id,
        date: record.date || new Date().toISOString().split('T')[0], // 使用當前日期
        description: record.description || '假日',
        created_at: record.createdAt || new Date().toISOString()
      }),
      users: (record) => ({
        id: record.id,
        username: record.username || `user_${record.id || Math.floor(Math.random() * 10000)}`, // 創建唯一用戶名
        password: record.password || 'password123', // 提供默認密碼（用戶可稍後更改）
        created_at: record.createdAt || new Date().toISOString()
      })
    };
    
    // 遷移每個表
    const tables = [
      'users',
      'employees',
      'settings',
      'holidays',
      'temporary_attendance',
      'salary_records'
    ];
    
    const migrationResults = {};
    
    for (const table of tables) {
      try {
        const count = await migrateTable(
          pgPool, 
          supabaseClient, 
          table, 
          transformMap[table]
        );
        migrationResults[table] = { success: true, count };
      } catch (error) {
        migrationResults[table] = { success: false, error: error.message };
        console.error(`遷移資料表 ${table} 失敗，繼續遷移其他表...`);
      }
    }
    
    console.log('\n遷移完成摘要:');
    for (const [table, result] of Object.entries(migrationResults)) {
      if (result.success) {
        console.log(`✅ ${table}: 成功遷移 ${result.count} 條記錄`);
      } else {
        console.log(`❌ ${table}: 遷移失敗 - ${result.error}`);
      }
    }
    
  } catch (error) {
    console.error('遷移過程中發生錯誤:', error);
  } finally {
    await pgPool.end();
    console.log('數據庫連接已關閉。');
  }
}

// 執行遷移
migrateData()
  .then(() => {
    console.log('遷移腳本執行完成。');
    process.exit(0); // 成功完成
  })
  .catch(err => {
    console.error('遷移腳本執行失敗:', err);
    process.exit(1); // 錯誤退出
  });