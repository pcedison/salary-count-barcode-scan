/**
 * 自動系統恢復工具
 * 
 * 功能：
 * 1. 檢測系統是否需要復原（數據表是否為空）
 * 2. 自動從最新備份恢復所有關鍵數據
 * 3. 可以作為系統啟動時的自動檢測和恢復機制
 * 
 * 用法：node auto-recovery.js [--force]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 備份文件路徑
const DEFAULT_BACKUP_PATH = path.join(__dirname, 'backup.json');

// 日誌文件路徑
const LOG_DIR = path.join(__dirname, 'logs');
const RECOVERY_LOG_PATH = path.join(LOG_DIR, 'recovery.log');

// 配置
const config = {
  // 關鍵數據表及其預期至少包含的記錄數
  criticalTables: {
    'employees': 1,        // 至少要有1名員工
    'settings': 1,         // 至少要有1條設定
    'salary_records': 0    // 薪資記錄可以為空
  },
  
  // 強制恢復（忽略檢查）
  forceRecovery: process.argv.includes('--force')
};

// 確保日誌目錄存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 寫入恢復日誌
function logRecovery(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  fs.appendFileSync(RECOVERY_LOG_PATH, logMessage);
  console.log(message);
}

// PostgreSQL 客戶端
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * 讀取備份文件
 * @param {string} backupPath 備份文件路徑
 * @returns {Object|null} 備份數據
 */
function readBackupFile(backupPath = DEFAULT_BACKUP_PATH) {
  try {
    if (!fs.existsSync(backupPath)) {
      logRecovery(`備份文件不存在: ${backupPath}`);
      return null;
    }
    
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    logRecovery(`成功讀取備份文件: ${backupPath}`);
    return backupData;
  } catch (error) {
    logRecovery(`讀取備份文件時出錯: ${error.message}`);
    return null;
  }
}

/**
 * 檢查數據表是否需要恢復
 * @param {pg.PoolClient} client 數據庫客戶端
 * @param {string} table 表名
 * @param {number} minRecords 最少記錄數
 * @returns {Promise<boolean>} 是否需要恢復
 */
async function checkTableNeedsRecovery(client, table, minRecords) {
  try {
    // 檢查表是否存在
    const tableExistsQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `;
    
    const tableExistsResult = await client.query(tableExistsQuery, [table]);
    const tableExists = tableExistsResult.rows[0].exists;
    
    if (!tableExists) {
      logRecovery(`表 ${table} 不存在，需要恢復`);
      return true;
    }
    
    // 檢查記錄數
    const countQuery = `SELECT COUNT(*) as count FROM ${table};`;
    const countResult = await client.query(countQuery);
    const recordCount = parseInt(countResult.rows[0].count);
    
    if (recordCount < minRecords) {
      logRecovery(`表 ${table} 包含 ${recordCount} 條記錄，少於所需的 ${minRecords} 條，需要恢復`);
      return true;
    }
    
    logRecovery(`表 ${table} 包含 ${recordCount} 條記錄，不需要恢復`);
    return false;
  } catch (error) {
    logRecovery(`檢查表 ${table} 時出錯: ${error.message}`);
    return true; // 出錯時假設需要恢復
  }
}

/**
 * 恢復員工數據
 * @param {pg.PoolClient} client 數據庫客戶端
 * @param {Array} employees 員工數據
 * @returns {Promise<number>} 恢復的記錄數
 */
async function restoreEmployees(client, employees) {
  if (!employees || !Array.isArray(employees) || employees.length === 0) {
    logRecovery('沒有員工數據可恢復');
    return 0;
  }
  
  logRecovery(`開始恢復 ${employees.length} 名員工數據...`);
  let successCount = 0;
  
  for (const employee of employees) {
    try {
      // 檢查員工是否已存在
      const checkQuery = 'SELECT id FROM employees WHERE id = $1';
      const checkResult = await client.query(checkQuery, [employee.id]);
      
      if (checkResult.rows.length > 0) {
        // 更新員工數據
        const updateQuery = `
          UPDATE employees SET
            name = $2,
            position = $3,
            department = $4,
            id_number = $5,
            email = $6,
            phone = $7,
            active = $8,
            is_encrypted = $9,
            updated_at = NOW()
          WHERE id = $1
        `;
        
        await client.query(updateQuery, [
          employee.id,
          employee.name,
          employee.position,
          employee.department,
          employee.idNumber,
          employee.email || '',
          employee.phone || '',
          employee.active !== undefined ? employee.active : true,
          employee.isEncrypted !== undefined ? employee.isEncrypted : false
        ]);
        
        logRecovery(`已更新員工 ID: ${employee.id}, 姓名: ${employee.name}`);
      } else {
        // 插入員工數據
        const insertQuery = `
          INSERT INTO employees (
            id, name, position, department, id_number, 
            email, phone, active, is_encrypted, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
          )
        `;
        
        await client.query(insertQuery, [
          employee.id,
          employee.name,
          employee.position,
          employee.department,
          employee.idNumber,
          employee.email || '',
          employee.phone || '',
          employee.active !== undefined ? employee.active : true,
          employee.isEncrypted !== undefined ? employee.isEncrypted : false,
          employee.createdAt || new Date().toISOString()
        ]);
        
        logRecovery(`已插入員工 ID: ${employee.id}, 姓名: ${employee.name}`);
      }
      
      successCount++;
    } catch (error) {
      logRecovery(`恢復員工 ID: ${employee.id} 時出錯: ${error.message}`);
    }
  }
  
  logRecovery(`員工數據恢復完成，成功: ${successCount}/${employees.length}`);
  return successCount;
}

/**
 * 恢復設定
 * @param {pg.PoolClient} client 數據庫客戶端
 * @param {Object} settings 設定數據
 * @returns {Promise<boolean>} 是否成功
 */
async function restoreSettings(client, settings) {
  if (!settings) {
    logRecovery('沒有設定數據可恢復');
    return false;
  }
  
  try {
    logRecovery('開始恢復設定數據...');
    
    // 檢查設定是否已存在
    const checkQuery = 'SELECT id FROM settings WHERE id = $1';
    const checkResult = await client.query(checkQuery, [settings.id || 1]);
    
    let deductions = settings.deductions;
    if (typeof deductions !== 'string') {
      deductions = JSON.stringify(deductions);
    }
    
    if (checkResult.rows.length > 0) {
      // 更新設定
      const updateQuery = `
        UPDATE settings SET
          base_hourly_rate = $2,
          ot1_multiplier = $3,
          ot2_multiplier = $4,
          base_month_salary = $5,
          welfare_allowance = $6,
          deductions = $7,
          admin_pin = $8,
          updated_at = NOW()
        WHERE id = $1
      `;
      
      await client.query(updateQuery, [
        settings.id || 1,
        settings.baseHourlyRate,
        settings.ot1Multiplier,
        settings.ot2Multiplier,
        settings.baseMonthSalary || 0,
        settings.welfareAllowance || 0,
        deductions,
        settings.adminPin || 123456
      ]);
      
      logRecovery('已更新設定數據');
    } else {
      // 插入設定
      const insertQuery = `
        INSERT INTO settings (
          id, base_hourly_rate, ot1_multiplier, ot2_multiplier,
          base_month_salary, welfare_allowance, deductions, admin_pin
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
      `;
      
      await client.query(insertQuery, [
        settings.id || 1,
        settings.baseHourlyRate,
        settings.ot1Multiplier,
        settings.ot2Multiplier,
        settings.baseMonthSalary || 0,
        settings.welfareAllowance || 0,
        deductions,
        settings.adminPin || 123456
      ]);
      
      logRecovery('已插入設定數據');
    }
    
    return true;
  } catch (error) {
    logRecovery(`恢復設定時出錯: ${error.message}`);
    return false;
  }
}

/**
 * 恢復薪資記錄
 * @param {pg.PoolClient} client 數據庫客戶端
 * @param {Array} salaryRecords 薪資記錄
 * @returns {Promise<number>} 恢復的記錄數
 */
async function restoreSalaryRecords(client, salaryRecords) {
  if (!salaryRecords || !Array.isArray(salaryRecords) || salaryRecords.length === 0) {
    logRecovery('沒有薪資記錄可恢復');
    return 0;
  }
  
  logRecovery(`開始恢復 ${salaryRecords.length} 條薪資記錄...`);
  let successCount = 0;
  
  for (const record of salaryRecords) {
    try {
      // 檢查記錄是否已存在
      const checkQuery = 'SELECT id FROM salary_records WHERE id = $1';
      const checkResult = await client.query(checkQuery, [record.id]);
      
      let deductions = record.deductions;
      if (typeof deductions !== 'string') {
        deductions = JSON.stringify(deductions);
      }
      
      let attendanceData = record.attendanceData;
      if (typeof attendanceData !== 'string') {
        attendanceData = JSON.stringify(attendanceData || []);
      }
      
      if (checkResult.rows.length > 0) {
        // 更新記錄
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
            deductions = $16,
            total_deductions = $17,
            net_salary = $18,
            attendance_data = $19,
            updated_at = NOW()
          WHERE id = $1
        `;
        
        await client.query(updateQuery, [
          record.id,
          record.salaryYear,
          record.salaryMonth,
          record.employeeId,
          record.employeeName,
          record.baseSalary,
          record.housingAllowance || 0,
          record.welfareAllowance || 0,
          record.totalOT1Hours || 0,
          record.totalOT2Hours || 0,
          record.totalOvertimePay || 0,
          record.holidayDays || 0,
          record.holidayDailySalary || 0,
          record.totalHolidayPay || 0,
          record.grossSalary,
          deductions,
          record.totalDeductions || 0,
          record.netSalary,
          attendanceData
        ]);
        
        logRecovery(`已更新薪資記錄 ID: ${record.id}, 年月: ${record.salaryYear}/${record.salaryMonth}`);
      } else {
        // 插入記錄
        const insertQuery = `
          INSERT INTO salary_records (
            id, salary_year, salary_month, employee_id, employee_name,
            base_salary, housing_allowance, welfare_allowance,
            total_ot1_hours, total_ot2_hours, total_overtime_pay,
            holiday_days, holiday_daily_salary, total_holiday_pay,
            gross_salary, deductions, total_deductions, net_salary,
            attendance_data, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
          )
        `;
        
        await client.query(insertQuery, [
          record.id,
          record.salaryYear,
          record.salaryMonth,
          record.employeeId,
          record.employeeName,
          record.baseSalary,
          record.housingAllowance || 0,
          record.welfareAllowance || 0,
          record.totalOT1Hours || 0,
          record.totalOT2Hours || 0,
          record.totalOvertimePay || 0,
          record.holidayDays || 0,
          record.holidayDailySalary || 0,
          record.totalHolidayPay || 0,
          record.grossSalary,
          deductions,
          record.totalDeductions || 0,
          record.netSalary,
          attendanceData,
          record.createdAt || new Date().toISOString()
        ]);
        
        logRecovery(`已插入薪資記錄 ID: ${record.id}, 年月: ${record.salaryYear}/${record.salaryMonth}`);
      }
      
      successCount++;
    } catch (error) {
      logRecovery(`恢復薪資記錄 ID: ${record.id} 時出錯: ${error.message}`);
    }
  }
  
  logRecovery(`薪資記錄恢復完成，成功: ${successCount}/${salaryRecords.length}`);
  return successCount;
}

/**
 * 主恢復流程
 * @returns {Promise<boolean>} 是否成功
 */
async function runRecovery() {
  logRecovery('啟動系統自動恢復過程...');
  
  // 讀取備份文件
  const backupData = readBackupFile();
  
  if (!backupData) {
    logRecovery('無法讀取備份數據，恢復失敗');
    return false;
  }
  
  // 獲取數據庫連接
  let client;
  try {
    client = await pool.connect();
    logRecovery('成功連接到數據庫');
    
    // 檢查是否需要恢復
    let needsRecovery = config.forceRecovery;
    
    if (!needsRecovery) {
      for (const [table, minRecords] of Object.entries(config.criticalTables)) {
        const tableNeedsRecovery = await checkTableNeedsRecovery(client, table, minRecords);
        if (tableNeedsRecovery) {
          needsRecovery = true;
          break;
        }
      }
    }
    
    if (!needsRecovery) {
      logRecovery('系統數據完整，不需要恢復');
      return true;
    }
    
    // 開始恢復
    logRecovery('開始恢復數據...');
    
    // 恢復員工數據
    await restoreEmployees(client, backupData.employees);
    
    // 恢復設定
    await restoreSettings(client, backupData.settings);
    
    // 恢復薪資記錄
    await restoreSalaryRecords(client, backupData.salaryRecords);
    
    logRecovery('系統恢復完成');
    return true;
  } catch (error) {
    logRecovery(`恢復過程中發生錯誤: ${error.message}`);
    return false;
  } finally {
    // 釋放數據庫連接
    if (client) {
      client.release();
    }
    
    // 關閉連接池
    await pool.end();
  }
}

// 執行恢復
runRecovery()
  .then(success => {
    if (success) {
      logRecovery('自動恢復過程成功完成');
    } else {
      logRecovery('自動恢復過程失敗');
      process.exit(1);
    }
  })
  .catch(error => {
    logRecovery(`運行恢復過程時發生異常: ${error.message}`);
    process.exit(1);
  });