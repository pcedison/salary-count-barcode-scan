/**
 * 員工數據完整性檢查與修復工具
 * 
 * 功能：
 * 1. 定期檢查員工數據的完整性
 * 2. 在發現問題時自動從備份恢復
 * 3. 維護員工表和相關表之間的關係完整性
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// 備份文件路徑
const DEFAULT_BACKUP_PATH = path.join(ROOT_DIR, 'backup.json');

// 日誌文件路徑
const LOG_DIR = path.join(ROOT_DIR, 'logs');
const INTEGRITY_LOG_PATH = path.join(LOG_DIR, 'employee-integrity.log');

// 確保日誌目錄存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 寫入日誌
function logMessage(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  fs.appendFileSync(INTEGRITY_LOG_PATH, logMessage);
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
      logMessage(`備份文件不存在: ${backupPath}`);
      return null;
    }
    
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    logMessage(`成功讀取備份文件: ${backupPath}`);
    return backupData;
  } catch (error) {
    logMessage(`讀取備份文件時出錯: ${error.message}`);
    return null;
  }
}

/**
 * 檢查員工數據完整性
 * @returns {Promise<Object>} 檢查結果
 */
async function checkEmployeeIntegrity() {
  const client = await pool.connect();
  
  try {
    logMessage('開始檢查員工數據完整性...');
    
    // 檢查員工表是否存在
    const tableExistsQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'employees'
      );
    `;
    
    const tableExistsResult = await client.query(tableExistsQuery);
    const tableExists = tableExistsResult.rows[0].exists;
    
    if (!tableExists) {
      logMessage('員工表不存在，需要恢復');
      return { exists: false, count: 0, issues: ['表不存在'] };
    }
    
    // 檢查員工數量
    const countQuery = 'SELECT COUNT(*) as count FROM employees;';
    const countResult = await client.query(countQuery);
    const employeeCount = parseInt(countResult.rows[0].count);
    
    if (employeeCount === 0) {
      logMessage('員工表為空，需要恢復');
      return { exists: true, count: 0, issues: ['表為空'] };
    }
    
    // 檢查是否有ID為空的員工
    const nullIdQuery = 'SELECT COUNT(*) as count FROM employees WHERE id IS NULL;';
    const nullIdResult = await client.query(nullIdQuery);
    const nullIdCount = parseInt(nullIdResult.rows[0].count);
    
    // 檢查是否有姓名為空的員工
    const nullNameQuery = "SELECT COUNT(*) as count FROM employees WHERE name IS NULL OR name = '';";
    const nullNameResult = await client.query(nullNameQuery);
    const nullNameCount = parseInt(nullNameResult.rows[0].count);
    
    // 檢查是否有重複ID的員工
    const duplicateIdQuery = `
      SELECT id, COUNT(*) as count 
      FROM employees 
      GROUP BY id 
      HAVING COUNT(*) > 1;
    `;
    const duplicateIdResult = await client.query(duplicateIdQuery);
    const duplicateIds = duplicateIdResult.rows;
    
    // 檢查薪資記錄中引用的員工是否存在
    const orphanedSalaryQuery = `
      SELECT sr.id, sr.employee_id, sr.salary_year, sr.salary_month
      FROM salary_records sr
      LEFT JOIN employees e ON sr.employee_id = e.id
      WHERE e.id IS NULL;
    `;
    const orphanedSalaryResult = await client.query(orphanedSalaryQuery);
    const orphanedSalaries = orphanedSalaryResult.rows;
    
    // 檢查考勤記錄中引用的員工是否存在
    const orphanedAttendanceQuery = `
      SELECT a.id, a.employee_id, a.date
      FROM attendance a
      LEFT JOIN employees e ON a.employee_id = e.id
      WHERE e.id IS NULL;
    `;
    const orphanedAttendanceResult = await client.query(orphanedAttendanceQuery);
    const orphanedAttendance = orphanedAttendanceResult.rows;
    
    // 彙總問題
    const issues = [];
    
    if (nullIdCount > 0) {
      issues.push(`${nullIdCount} 名員工缺少ID`);
    }
    
    if (nullNameCount > 0) {
      issues.push(`${nullNameCount} 名員工缺少姓名`);
    }
    
    if (duplicateIds.length > 0) {
      issues.push(`${duplicateIds.length} 個員工ID重複`);
    }
    
    if (orphanedSalaries.length > 0) {
      issues.push(`${orphanedSalaries.length} 條薪資記錄引用了不存在的員工`);
    }
    
    if (orphanedAttendance.length > 0) {
      issues.push(`${orphanedAttendance.length} 條考勤記錄引用了不存在的員工`);
    }
    
    // 記錄結果
    const result = {
      exists: true,
      count: employeeCount,
      issues: issues,
      nullIdCount,
      nullNameCount,
      duplicateIds,
      orphanedSalaries,
      orphanedAttendance
    };
    
    if (issues.length === 0) {
      logMessage(`員工數據完整性檢查通過，共有 ${employeeCount} 名員工`);
    } else {
      logMessage(`員工數據完整性檢查發現 ${issues.length} 個問題: ${issues.join(', ')}`);
    }
    
    return result;
  } catch (error) {
    logMessage(`檢查員工數據完整性時出錯: ${error.message}`);
    return { exists: false, count: 0, issues: [`檢查出錯: ${error.message}`] };
  } finally {
    client.release();
  }
}

/**
 * 從備份恢復員工數據
 * @param {Array} employees 員工數據
 * @returns {Promise<number>} 恢復的記錄數
 */
async function restoreEmployeesFromBackup(employees) {
  if (!employees || !Array.isArray(employees) || employees.length === 0) {
    logMessage('沒有員工數據可恢復');
    return 0;
  }
  
  const client = await pool.connect();
  
  try {
    logMessage(`開始從備份恢復 ${employees.length} 名員工...`);
    let successCount = 0;
    
    for (const employee of employees) {
      try {
        // 檢查員工是否已存在
        const checkQuery = 'SELECT id FROM employees WHERE id = $1';
        const checkResult = await client.query(checkQuery, [employee.id]);
        
        if (checkResult.rows.length > 0) {
          // 更新員工
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
          
          logMessage(`已更新員工 ID: ${employee.id}, 姓名: ${employee.name}`);
        } else {
          // 插入員工
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
          
          logMessage(`已插入員工 ID: ${employee.id}, 姓名: ${employee.name}`);
        }
        
        successCount++;
      } catch (error) {
        logMessage(`恢復員工 ID: ${employee.id} 時出錯: ${error.message}`);
      }
    }
    
    logMessage(`員工恢復完成，成功: ${successCount}/${employees.length}`);
    return successCount;
  } catch (error) {
    logMessage(`從備份恢復員工時出錯: ${error.message}`);
    return 0;
  } finally {
    client.release();
  }
}

/**
 * 修復孤立的薪資記錄
 * @param {Array} orphanedSalaries 孤立的薪資記錄
 * @param {Array} employees 員工數據
 * @returns {Promise<number>} 修復的記錄數
 */
async function fixOrphanedSalaries(orphanedSalaries, employees) {
  if (!orphanedSalaries || orphanedSalaries.length === 0) {
    return 0;
  }
  
  const client = await pool.connect();
  
  try {
    logMessage(`開始修復 ${orphanedSalaries.length} 條孤立的薪資記錄...`);
    let fixedCount = 0;
    
    for (const record of orphanedSalaries) {
      // 查找備份中對應的員工
      const matchingEmployee = employees.find(e => e.id === record.employee_id);
      
      if (matchingEmployee) {
        // 如果找到對應的員工，先恢復這個員工
        try {
          const insertQuery = `
            INSERT INTO employees (
              id, name, position, department, id_number, 
              email, phone, active, is_encrypted, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            )
          `;
          
          await client.query(insertQuery, [
            matchingEmployee.id,
            matchingEmployee.name,
            matchingEmployee.position,
            matchingEmployee.department,
            matchingEmployee.idNumber,
            matchingEmployee.email || '',
            matchingEmployee.phone || '',
            matchingEmployee.active !== undefined ? matchingEmployee.active : true,
            matchingEmployee.isEncrypted !== undefined ? matchingEmployee.isEncrypted : false,
            matchingEmployee.createdAt || new Date().toISOString()
          ]);
          
          logMessage(`已恢復被引用的員工 ID: ${matchingEmployee.id}, 姓名: ${matchingEmployee.name}`);
          
          // 更新薪資記錄中的員工姓名
          await client.query(
            'UPDATE salary_records SET employee_name = $1 WHERE id = $2',
            [matchingEmployee.name, record.id]
          );
          
          fixedCount++;
        } catch (error) {
          logMessage(`修復薪資記錄 ID: ${record.id} 時出錯: ${error.message}`);
        }
      } else {
        // 如果找不到對應的員工，標記薪資記錄
        try {
          await client.query(
            "UPDATE salary_records SET employee_name = CONCAT('[已刪除員工] ', employee_id::text) WHERE id = $1",
            [record.id]
          );
          
          logMessage(`已標記孤立的薪資記錄 ID: ${record.id}`);
          fixedCount++;
        } catch (error) {
          logMessage(`標記薪資記錄 ID: ${record.id} 時出錯: ${error.message}`);
        }
      }
    }
    
    logMessage(`孤立薪資記錄修復完成，成功: ${fixedCount}/${orphanedSalaries.length}`);
    return fixedCount;
  } catch (error) {
    logMessage(`修復孤立薪資記錄時出錯: ${error.message}`);
    return 0;
  } finally {
    client.release();
  }
}

/**
 * 主函數：檢查並修復員工數據
 */
export async function checkAndFixEmployeeData() {
  try {
    logMessage('開始員工數據檢查與修復過程...');
    
    // 檢查員工數據完整性
    const integrityCheck = await checkEmployeeIntegrity();
    
    // 如果沒有問題，直接返回
    if (integrityCheck.exists && integrityCheck.count > 0 && integrityCheck.issues.length === 0) {
      logMessage('員工數據完整，無需修復');
      return {
        success: true,
        message: '員工數據完整，無需修復',
        employeeCount: integrityCheck.count
      };
    }
    
    // 如果有問題，嘗試從備份恢復
    logMessage('員工數據存在問題，嘗試從備份恢復');
    
    // 讀取備份文件
    const backup = readBackupFile();
    
    if (!backup || !backup.employees || backup.employees.length === 0) {
      logMessage('無法從備份恢復：備份不存在或不包含員工數據');
      return {
        success: false,
        message: '無法從備份恢復：備份不存在或不包含員工數據',
        issues: integrityCheck.issues
      };
    }
    
    // 從備份恢復員工數據
    const restoredCount = await restoreEmployeesFromBackup(backup.employees);
    
    // 如果有孤立的薪資記錄，嘗試修復
    let fixedSalaries = 0;
    if (integrityCheck.orphanedSalaries && integrityCheck.orphanedSalaries.length > 0) {
      fixedSalaries = await fixOrphanedSalaries(integrityCheck.orphanedSalaries, backup.employees);
    }
    
    // 再次檢查員工數據完整性
    const finalCheck = await checkEmployeeIntegrity();
    
    // 返回結果
    return {
      success: restoredCount > 0,
      message: `已恢復 ${restoredCount} 名員工，修復 ${fixedSalaries} 條薪資記錄`,
      initialIssues: integrityCheck.issues,
      remainingIssues: finalCheck.issues,
      employeeCount: finalCheck.count
    };
  } catch (error) {
    logMessage(`員工數據檢查與修復過程中出錯: ${error.message}`);
    return {
      success: false,
      message: `檢查與修復過程中出錯: ${error.message}`,
      error: error.message
    };
  } finally {
    // 關閉連接池
    await pool.end();
  }
}

/**
 * 設置定期檢查
 * @param {number} intervalHours 檢查間隔（小時）
 * @returns {NodeJS.Timeout} 定時器ID
 */
export function schedulePeriodicCheck(intervalHours = 24) {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  
  logMessage(`設置定期員工數據檢查，間隔 ${intervalHours} 小時`);
  
  // 立即執行一次
  checkAndFixEmployeeData()
    .catch(error => {
      logMessage(`首次檢查時出錯: ${error.message}`);
    });
  
  // 設置定期任務
  return setInterval(() => {
    checkAndFixEmployeeData()
      .catch(error => {
        logMessage(`定期檢查時出錯: ${error.message}`);
      });
  }, intervalMs);
}

// 如果直接運行腳本，執行一次檢查和修復
if (process.argv[1].endsWith('employee-integrity.js')) {
  checkAndFixEmployeeData()
    .then(result => {
      console.log('檢查與修復結果:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('執行過程中發生錯誤:', error);
      process.exit(1);
    });
}