/**
 * 備份資料恢復腳本 - 使用直接 SQL 恢復
 */

import fs from 'fs';
import pg from 'pg';

// 讀取備份文件
console.log('讀取備份文件...');
const backupData = JSON.parse(fs.readFileSync('./backup.json', 'utf8'));

// 創建 PostgreSQL 客戶端
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function restoreRecords() {
  try {
    // 檢查資料
    if (!backupData.salaryRecords || !Array.isArray(backupData.salaryRecords)) {
      console.error('備份中沒有薪資記錄數據');
      return;
    }
    
    console.log(`找到 ${backupData.salaryRecords.length} 條薪資記錄`);
    
    // 準備資料 - 轉換為資料庫所需格式
    const records = backupData.salaryRecords.map(record => ({
      id: record.id,
      salary_year: record.salaryYear,
      salary_month: record.salaryMonth,
      employee_id: record.employeeId,
      employee_name: record.employeeName,
      base_salary: record.baseSalary,
      housing_allowance: record.housingAllowance || 0,
      welfare_allowance: record.welfareAllowance || 2500,
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
    
    // 連接到資料庫
    const client = await pool.connect();
    console.log('成功連接到資料庫');
    
    try {
      // 逐條插入資料
      console.log('開始恢復薪資記錄...');
      let successCount = 0;
      
      for (const record of records) {
        // 檢查記錄是否已存在
        const checkQuery = 'SELECT id FROM salary_records WHERE id = $1';
        const checkResult = await client.query(checkQuery, [record.id]);
        
        if (checkResult.rows.length > 0) {
          console.log(`記錄 ${record.id} 已存在，跳過`);
          continue;
        }
        
        // 準備插入查詢
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
        
        const values = [
          record.id, record.salary_year, record.salary_month, 
          record.employee_id, record.employee_name, record.base_salary, 
          record.housing_allowance, record.welfare_allowance, 
          record.total_ot1_hours, record.total_ot2_hours, record.total_overtime_pay, 
          record.holiday_days, record.holiday_daily_salary, record.total_holiday_pay, 
          record.gross_salary, record.deductions, record.total_deductions, 
          record.net_salary, record.attendance_data, record.created_at
        ];
        
        try {
          await client.query(insertQuery, values);
          console.log(`成功恢復記錄 ID: ${record.id}, 年月: ${record.salary_year}/${record.salary_month}`);
          successCount++;
        } catch (insertError) {
          console.error(`插入記錄 ${record.id} 時發生錯誤:`, insertError.message || insertError);
        }
      }
      
      console.log(`恢復完成，成功: ${successCount}/${records.length} 條記錄`);
    } finally {
      // 釋放客戶端
      client.release();
    }
  } catch (error) {
    console.error('恢復過程中發生錯誤:', error);
  } finally {
    // 關閉連接池
    pool.end();
  }
}

// 執行恢復
restoreRecords();