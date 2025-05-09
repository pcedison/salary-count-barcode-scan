/**
 * 資料庫健康檢查與自動修復工具
 * 
 * 用途：
 * 1. 檢查資料庫連接狀態
 * 2. 如果發現問題，嘗試自動修復或發送警告
 * 3. 若無法修復，可從最近的備份恢復
 * 
 * 執行方式: node db-health-check.js [--restore-if-needed]
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 創建 PostgreSQL 客戶端
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// 檢查是否要在必要時恢復備份
const shouldRestoreIfNeeded = process.argv.includes('--restore-if-needed');

// 讀取備份目錄中的所有備份
async function getAvailableBackups() {
  const backupsDir = path.join(__dirname, 'backups');
  
  try {
    if (!fs.existsSync(backupsDir)) {
      console.warn('備份目錄不存在：', backupsDir);
      return [];
    }
    
    // 讀取所有備份文件
    const backupTypes = ['daily', 'weekly', 'monthly', 'manual'];
    let allBackups = [];
    
    for (const type of backupTypes) {
      const typeDir = path.join(backupsDir, type);
      if (fs.existsSync(typeDir)) {
        const files = fs.readdirSync(typeDir)
          .filter(file => file.endsWith('.json'))
          .map(file => {
            const filePath = path.join(typeDir, file);
            const stats = fs.statSync(filePath);
            return {
              id: file.replace('.json', ''),
              path: filePath,
              type,
              createdAt: stats.mtime,
              size: stats.size
            };
          });
        
        allBackups = [...allBackups, ...files];
      }
    }
    
    // 按建立時間排序，最新的在前
    return allBackups.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error('讀取備份文件時出錯：', error);
    return [];
  }
}

// 從備份恢復資料
async function restoreFromBackup(backupPath) {
  try {
    console.log(`開始從備份恢復：${backupPath}`);
    
    // 讀取備份文件
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    
    if (!backupData.salaryRecords || !Array.isArray(backupData.salaryRecords)) {
      console.error('備份格式無效或不包含薪資記錄');
      return false;
    }
    
    // 連接到資料庫
    const client = await pool.connect();
    console.log('資料庫連接成功，準備恢復資料');
    
    try {
      // 準備薪資記錄資料
      const records = backupData.salaryRecords.map(record => ({
        id: record.id,
        salary_year: record.salaryYear,
        salary_month: record.salaryMonth,
        employee_id: record.employeeId,
        employee_name: record.employeeName,
        base_salary: record.baseSalary,
        housing_allowance: record.housingAllowance || 0,
        welfare_allowance: record.welfareAllowance || 0,
        total_ot1_hours: record.totalOT1Hours || 0,
        total_ot2_hours: record.totalOT2Hours || 0,
        total_overtime_pay: record.totalOvertimePay || 0,
        holiday_days: record.holidayDays || 0,
        holiday_daily_salary: record.holidayDailySalary || 0,
        total_holiday_pay: record.totalHolidayPay || 0,
        gross_salary: record.grossSalary || 0,
        deductions: JSON.stringify(record.deductions || []),
        total_deductions: record.totalDeductions || 0,
        net_salary: record.netSalary || 0,
        attendance_data: JSON.stringify(record.attendanceData || []),
        created_at: new Date().toISOString()
      }));
      
      // 開始事務
      await client.query('BEGIN');
      
      // 檢查資料表是否存在
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'salary_records'
        );
      `);
      
      if (!tableExists.rows[0].exists) {
        console.log('資料表不存在，創建資料表');
        
        // 如果資料表不存在，嘗試從備份中創建
        await client.query(`
          CREATE TABLE salary_records (
            id SERIAL PRIMARY KEY,
            salary_year INTEGER NOT NULL,
            salary_month INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            employee_name TEXT NOT NULL,
            base_salary NUMERIC(10, 2) NOT NULL,
            housing_allowance NUMERIC(10, 2) DEFAULT 0,
            welfare_allowance NUMERIC(10, 2) DEFAULT 0,
            total_ot1_hours NUMERIC(10, 2) DEFAULT 0,
            total_ot2_hours NUMERIC(10, 2) DEFAULT 0,
            total_overtime_pay NUMERIC(10, 2) DEFAULT 0,
            holiday_days INTEGER DEFAULT 0,
            holiday_daily_salary NUMERIC(10, 2) DEFAULT 0,
            total_holiday_pay NUMERIC(10, 2) DEFAULT 0,
            gross_salary NUMERIC(10, 2) NOT NULL,
            deductions JSONB DEFAULT '[]',
            total_deductions NUMERIC(10, 2) DEFAULT 0,
            net_salary NUMERIC(10, 2) NOT NULL,
            attendance_data JSONB DEFAULT '[]',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(employee_id, salary_year, salary_month)
          );
        `);
      }
      
      // 插入所有記錄
      let success = 0;
      let skipped = 0;
      
      for (const record of records) {
        // 檢查記錄是否存在
        const existingRecordResult = await client.query(
          'SELECT id FROM salary_records WHERE id = $1',
          [record.id]
        );
        
        if (existingRecordResult.rows.length > 0) {
          // 記錄已存在，進行更新
          const updateQuery = `
            UPDATE salary_records SET
              salary_year = $2,
              salary_month = $3,
              employee_id = $4,
              employee_name = $5,
              base_salary = $6,
              housing_allowance = $7,
              welfare_allowance = $8,
              total_ot1_hours = $9,
              total_ot2_hours = $10,
              total_overtime_pay = $11,
              holiday_days = $12,
              holiday_daily_salary = $13,
              total_holiday_pay = $14,
              gross_salary = $15,
              deductions = $16::jsonb,
              total_deductions = $17,
              net_salary = $18,
              attendance_data = $19::jsonb
            WHERE id = $1
          `;
          
          await client.query(updateQuery, [
            record.id, record.salary_year, record.salary_month,
            record.employee_id, record.employee_name, record.base_salary,
            record.housing_allowance, record.welfare_allowance,
            record.total_ot1_hours, record.total_ot2_hours, record.total_overtime_pay,
            record.holiday_days, record.holiday_daily_salary, record.total_holiday_pay,
            record.gross_salary, record.deductions, record.total_deductions,
            record.net_salary, record.attendance_data
          ]);
          
          console.log(`更新記錄 ID: ${record.id}, 年月: ${record.salary_year}/${record.salary_month}`);
          success++;
        } else {
          // 記錄不存在，進行插入
          const insertQuery = `
            INSERT INTO salary_records(
              id, salary_year, salary_month, employee_id, employee_name, 
              base_salary, housing_allowance, welfare_allowance, 
              total_ot1_hours, total_ot2_hours, total_overtime_pay, 
              holiday_days, holiday_daily_salary, total_holiday_pay, 
              gross_salary, deductions, total_deductions, net_salary, 
              attendance_data, created_at
            ) VALUES(
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
              $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
            )
          `;
          
          await client.query(insertQuery, [
            record.id, record.salary_year, record.salary_month,
            record.employee_id, record.employee_name, record.base_salary,
            record.housing_allowance, record.welfare_allowance,
            record.total_ot1_hours, record.total_ot2_hours, record.total_overtime_pay,
            record.holiday_days, record.holiday_daily_salary, record.total_holiday_pay,
            record.gross_salary, record.deductions, record.total_deductions,
            record.net_salary, record.attendance_data, record.created_at
          ]);
          
          console.log(`插入記錄 ID: ${record.id}, 年月: ${record.salary_year}/${record.salary_month}`);
          success++;
        }
      }
      
      // 提交事務
      await client.query('COMMIT');
      console.log(`恢復完成，成功: ${success}, 跳過: ${skipped}`);
      return true;
    } catch (error) {
      // 回滾事務
      await client.query('ROLLBACK');
      console.error('恢復過程中發生錯誤:', error);
      return false;
    } finally {
      // 釋放客戶端
      client.release();
    }
  } catch (error) {
    console.error('嘗試恢復備份時出錯:', error);
    return false;
  }
}

// 主函數：檢查資料庫
async function checkDatabase() {
  console.log('開始檢查資料庫健康狀態...');
  let isHealthy = false;
  
  try {
    // 嘗試連接資料庫
    const client = await pool.connect();
    
    try {
      // 執行簡單查詢
      const result = await client.query('SELECT NOW() as time');
      console.log(`資料庫連接正常：${result.rows[0].time}`);
      
      // 檢查關鍵表是否存在並有數據
      const tablesCheck = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'salary_records') > 0 as has_salary_records,
          (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employees') > 0 as has_employees
      `);
      
      if (tablesCheck.rows[0].has_salary_records && tablesCheck.rows[0].has_employees) {
        // 檢查是否有數據
        const dataCheck = await client.query(`
          SELECT 
            (SELECT COUNT(*) FROM salary_records) as salary_records_count,
            (SELECT COUNT(*) FROM employees) as employees_count
        `);
        
        console.log(`薪資記錄數量: ${dataCheck.rows[0].salary_records_count}`);
        console.log(`員工數量: ${dataCheck.rows[0].employees_count}`);
        
        if (dataCheck.rows[0].salary_records_count > 0 && dataCheck.rows[0].employees_count > 0) {
          console.log('資料庫健康狀態良好：所有表格都存在並且包含數據');
          isHealthy = true;
        } else {
          console.warn('資料庫表格存在但數據不完整');
          if (dataCheck.rows[0].salary_records_count === 0) {
            console.warn('薪資記錄表為空');
          }
          if (dataCheck.rows[0].employees_count === 0) {
            console.warn('員工表為空');
          }
        }
      } else {
        console.warn('資料庫缺少關鍵表格');
        if (!tablesCheck.rows[0].has_salary_records) {
          console.warn('缺少薪資記錄表');
        }
        if (!tablesCheck.rows[0].has_employees) {
          console.warn('缺少員工表');
        }
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('資料庫連接或查詢出錯:', error);
  }
  
  // 如果資料庫不健康，考慮恢復
  if (!isHealthy && shouldRestoreIfNeeded) {
    console.log('資料庫不健康，嘗試從最新備份恢復');
    
    // 獲取可用備份
    const backups = await getAvailableBackups();
    
    if (backups.length > 0) {
      console.log(`找到 ${backups.length} 個備份，嘗試從最新的備份恢復`);
      const latestBackup = backups[0];
      console.log(`最新備份: ${latestBackup.id} (${latestBackup.type}), 創建於 ${latestBackup.createdAt}`);
      
      const success = await restoreFromBackup(latestBackup.path);
      if (success) {
        console.log('成功從備份恢復資料庫');
      } else {
        console.error('從備份恢復資料庫失敗');
      }
    } else {
      console.error('沒有找到可用的備份');
    }
  }
  
  // 關閉連接池
  await pool.end();
}

// 執行主函數
checkDatabase();