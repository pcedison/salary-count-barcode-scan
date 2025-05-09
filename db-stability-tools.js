/**
 * 資料庫穩定性工具
 * 
 * 提供以下功能：
 * 1. 定期檢查資料庫連接
 * 2. 自動備份到外部存儲（如Google Drive或Dropbox）
 * 3. 提供統一、穩定的資料庫連接方式
 * 4. 設置資料庫連接監控和告警
 * 
 * 這個工具應該被設置成一個定時任務，並在系統啟動時自動運行
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import pg from 'pg';
import { fileURLToPath } from 'url';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 創建 PostgreSQL 客戶端
const { Pool } = pg;

// 配置
const config = {
  // 備份設置
  backupDir: path.join(__dirname, 'backups'),
  externalBackupDir: process.env.EXTERNAL_BACKUP_DIR || null, // 外部備份目錄
  backupFrequency: {
    daily: true,   // 每天備份
    weekly: true,  // 每週備份
    monthly: true  // 每月備份
  },
  
  // 監控設置
  monitoringIntervalMinutes: 60, // 每小時檢查一次
  alertEmail: process.env.ALERT_EMAIL || null, // 告警郵箱
  
  // 連接設置
  connectionRetries: 3, // 連接重試次數
  connectionRetryDelayMs: 5000 // 連接重試延遲
};

// 記錄連接狀態歷史
const connectionHistory = [];

/**
 * 檢查資料庫連接
 * @returns {Promise<boolean>} 連接是否成功
 */
async function checkDatabaseConnection() {
  console.log('檢查資料庫連接...');
  const timestamp = new Date();
  let pool = null;
  
  try {
    // 創建新的連接池
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000 // 5秒連接超時
    });
    
    // 嘗試連接
    const client = await pool.connect();
    
    try {
      // 執行簡單查詢
      const result = await client.query('SELECT NOW() as time');
      const status = {
        isConnected: true,
        timestamp,
        time: result.rows[0].time
      };
      
      // 添加到歷史記錄
      connectionHistory.push(status);
      // 只保留最近 100 條記錄
      if (connectionHistory.length > 100) {
        connectionHistory.shift();
      }
      
      console.log(`資料庫連接成功: ${result.rows[0].time}`);
      return true;
    } finally {
      // 釋放客戶端
      client.release();
    }
  } catch (error) {
    // 連接失敗
    const status = {
      isConnected: false,
      timestamp,
      error: error.message || String(error)
    };
    
    // 添加到歷史記錄
    connectionHistory.push(status);
    // 只保留最近 100 條記錄
    if (connectionHistory.length > 100) {
      connectionHistory.shift();
    }
    
    console.error('資料庫連接失敗:', error);
    return false;
  } finally {
    // 關閉連接池
    if (pool) {
      await pool.end();
    }
  }
}

/**
 * 創建資料庫備份
 * @param {string} type 備份類型 (daily, weekly, monthly, manual)
 * @returns {Promise<string>} 備份文件路徑，失敗則返回 null
 */
async function createDatabaseBackup(type = 'manual') {
  console.log(`創建 ${type} 備份...`);
  
  try {
    // 確保備份目錄存在
    const typeDir = path.join(config.backupDir, type);
    if (!fs.existsSync(typeDir)) {
      fs.mkdirSync(typeDir, { recursive: true });
    }
    
    // 生成備份 ID 和文件名
    const timestamp = new Date();
    const backupId = `${type}_${timestamp.getFullYear()}${(timestamp.getMonth() + 1).toString().padStart(2, '0')}${timestamp.getDate().toString().padStart(2, '0')}_${timestamp.getHours().toString().padStart(2, '0')}${timestamp.getMinutes().toString().padStart(2, '0')}${timestamp.getSeconds().toString().padStart(2, '0')}`;
    const filePath = path.join(typeDir, `${backupId}.json`);
    
    // 連接資料庫並提取數據
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    try {
      // 獲取所有資料表數據
      const client = await pool.connect();
      
      try {
        // 創建備份對象
        const backup = {
          metadata: {
            id: backupId,
            type,
            createdAt: timestamp.toISOString(),
            databaseUrl: process.env.DATABASE_URL ? '[REDACTED]' : null
          },
          // 各種數據
          employees: [],
          salaryRecords: [],
          attendance: [],
          holidays: [],
          settings: null
        };
        
        // 獲取薪資記錄
        const salaryRecordsResult = await client.query('SELECT * FROM salary_records ORDER BY salary_year DESC, salary_month DESC');
        backup.salaryRecords = salaryRecordsResult.rows.map(row => ({
          id: row.id,
          salaryYear: row.salary_year,
          salaryMonth: row.salary_month,
          employeeId: row.employee_id,
          employeeName: row.employee_name,
          baseSalary: parseFloat(row.base_salary),
          housingAllowance: parseFloat(row.housing_allowance || 0),
          welfareAllowance: parseFloat(row.welfare_allowance || 0),
          totalOT1Hours: parseFloat(row.total_ot1_hours || 0),
          totalOT2Hours: parseFloat(row.total_ot2_hours || 0),
          totalOvertimePay: parseFloat(row.total_overtime_pay || 0),
          holidayDays: row.holiday_days || 0,
          holidayDailySalary: parseFloat(row.holiday_daily_salary || 0),
          totalHolidayPay: parseFloat(row.total_holiday_pay || 0),
          grossSalary: parseFloat(row.gross_salary),
          deductions: typeof row.deductions === 'string' ? JSON.parse(row.deductions) : (row.deductions || []),
          totalDeductions: parseFloat(row.total_deductions || 0),
          netSalary: parseFloat(row.net_salary),
          attendanceData: typeof row.attendance_data === 'string' ? JSON.parse(row.attendance_data) : (row.attendance_data || []),
          createdAt: row.created_at
        }));
        
        // 獲取員工
        const employeesResult = await client.query('SELECT * FROM employees ORDER BY id');
        backup.employees = employeesResult.rows.map(row => ({
          id: row.id,
          name: row.name,
          position: row.position,
          department: row.department,
          idNumber: row.id_number,
          contactNumber: row.contact_number,
          email: row.email,
          joinDate: row.join_date,
          status: row.status,
          baseSalary: parseFloat(row.base_salary || 0),
          housingAllowance: parseFloat(row.housing_allowance || 0),
          welfareAllowance: parseFloat(row.welfare_allowance || 0),
          createdAt: row.created_at
        }));
        
        // 獲取考勤
        const attendanceResult = await client.query('SELECT * FROM attendance ORDER BY date DESC, employee_id');
        backup.attendance = attendanceResult.rows.map(row => ({
          id: row.id,
          employeeId: row.employee_id,
          date: row.date,
          checkInTime: row.check_in_time,
          checkOutTime: row.check_out_time,
          regularHours: parseFloat(row.regular_hours || 0),
          ot1Hours: parseFloat(row.ot1_hours || 0),
          ot2Hours: parseFloat(row.ot2_hours || 0),
          notes: row.notes,
          createdAt: row.created_at
        }));
        
        // 獲取假期
        const holidaysResult = await client.query('SELECT * FROM holidays ORDER BY date');
        backup.holidays = holidaysResult.rows.map(row => ({
          id: row.id,
          date: row.date,
          name: row.name,
          type: row.type,
          createdAt: row.created_at
        }));
        
        // 獲取設置
        const settingsResult = await client.query('SELECT * FROM settings WHERE id = 1');
        if (settingsResult.rows.length > 0) {
          const row = settingsResult.rows[0];
          backup.settings = {
            id: row.id,
            baseHourlyRate: parseFloat(row.base_hourly_rate || 0),
            ot1Multiplier: parseFloat(row.ot1_multiplier || 0),
            ot2Multiplier: parseFloat(row.ot2_multiplier || 0),
            regularHours: parseFloat(row.regular_hours || 0),
            updatedAt: row.updated_at
          };
        }
        
        // 寫入文件
        fs.writeFileSync(filePath, JSON.stringify(backup, null, 2));
        console.log(`備份成功保存到 ${filePath}`);
        
        // 如果設置了外部備份目錄，則進行外部備份
        if (config.externalBackupDir) {
          const externalPath = path.join(config.externalBackupDir, `${backupId}.json`);
          fs.copyFileSync(filePath, externalPath);
          console.log(`備份成功保存到外部存儲: ${externalPath}`);
        }
        
        return filePath;
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error('創建備份時出錯:', error);
    return null;
  }
}

/**
 * 發送連接故障告警
 * @param {Object} status 連接狀態對象
 */
function sendConnectionAlert(status) {
  if (!config.alertEmail) {
    console.log('沒有設置告警郵箱，跳過發送告警');
    return;
  }
  
  const subject = '資料庫連接故障告警';
  const message = `
    時間: ${status.timestamp}
    錯誤: ${status.error}
    
    請盡快檢查並解決問題。
  `;
  
  // 在這裡添加發送郵件的代碼
  // 如果使用第三方服務，可能需要 API 密鑰
  console.log(`將告警發送到 ${config.alertEmail}`);
  console.log(`主題: ${subject}`);
  console.log(`消息: ${message}`);
}

/**
 * 啟動監控
 */
function startMonitoring() {
  console.log(`啟動資料庫監控，間隔: ${config.monitoringIntervalMinutes} 分鐘`);
  
  // 立即執行一次檢查
  checkDatabaseConnection().then(isConnected => {
    if (!isConnected) {
      // 連接失敗，發送告警
      sendConnectionAlert(connectionHistory[connectionHistory.length - 1]);
    }
  });
  
  // 設置定期檢查
  setInterval(() => {
    checkDatabaseConnection().then(isConnected => {
      if (!isConnected) {
        // 連接失敗，發送告警
        sendConnectionAlert(connectionHistory[connectionHistory.length - 1]);
      }
    });
  }, config.monitoringIntervalMinutes * 60 * 1000);
  
  // 設置定期備份
  if (config.backupFrequency.daily) {
    // 每天凌晨 1 點執行
    const dailyBackupTime = new Date();
    dailyBackupTime.setHours(1, 0, 0, 0);
    let dailyBackupDelay = dailyBackupTime.getTime() - Date.now();
    if (dailyBackupDelay < 0) {
      dailyBackupDelay += 24 * 60 * 60 * 1000; // 加一天
    }
    
    setTimeout(() => {
      createDatabaseBackup('daily');
      // 之後每 24 小時執行一次
      setInterval(() => createDatabaseBackup('daily'), 24 * 60 * 60 * 1000);
    }, dailyBackupDelay);
  }
  
  if (config.backupFrequency.weekly) {
    // 每週日凌晨 2 點執行
    const weeklyBackupTime = new Date();
    weeklyBackupTime.setHours(2, 0, 0, 0);
    weeklyBackupTime.setDate(weeklyBackupTime.getDate() + (7 - weeklyBackupTime.getDay()) % 7);
    const weeklyBackupDelay = weeklyBackupTime.getTime() - Date.now();
    
    setTimeout(() => {
      createDatabaseBackup('weekly');
      // 之後每 7 天執行一次
      setInterval(() => createDatabaseBackup('weekly'), 7 * 24 * 60 * 60 * 1000);
    }, weeklyBackupDelay);
  }
  
  if (config.backupFrequency.monthly) {
    // 每月 1 日凌晨 3 點執行
    const monthlyBackupTime = new Date();
    monthlyBackupTime.setHours(3, 0, 0, 0);
    monthlyBackupTime.setDate(1);
    monthlyBackupTime.setMonth(monthlyBackupTime.getMonth() + 1);
    const monthlyBackupDelay = monthlyBackupTime.getTime() - Date.now();
    
    setTimeout(() => {
      createDatabaseBackup('monthly');
      // 後續執行需要計算每月天數，這裡簡化為 30 天
      setInterval(() => {
        const now = new Date();
        if (now.getDate() === 1) {
          createDatabaseBackup('monthly');
        }
      }, 24 * 60 * 60 * 1000);
    }, monthlyBackupDelay);
  }
}

/**
 * 獲取連接歷史
 * @returns {Array} 連接歷史記錄
 */
function getConnectionHistory() {
  return connectionHistory;
}

// 如果直接運行此文件，則啟動監控
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // 執行初始備份
  createDatabaseBackup('manual').then(filePath => {
    if (filePath) {
      console.log(`初始備份成功: ${filePath}`);
    } else {
      console.error('初始備份失敗');
    }
    
    // 啟動監控
    startMonitoring();
  });
} else {
  // 作為模塊導入，提供功能但不自動啟動
  console.log('資料庫穩定性工具已加載，但未自動啟動');
}

// 導出功能
export {
  checkDatabaseConnection,
  createDatabaseBackup,
  startMonitoring,
  getConnectionHistory
};