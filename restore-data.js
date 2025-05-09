/**
 * 備份資料恢復腳本
 * 手動將備份文件中的薪資記錄恢復到資料庫
 */

import fs from 'fs';
import { getSupabaseClient } from './server/supabase-client.js';

// 讀取備份文件
console.log('讀取備份文件...');
const backupData = JSON.parse(fs.readFileSync('./backup.json', 'utf8'));

// 初始化 Supabase 客戶端
async function restoreRecords() {
  try {
    const supabase = await getSupabaseClient();
    
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
      deductions: record.deductions || [],
      total_deductions: record.totalDeductions || 0,
      net_salary: record.netSalary || 0,
      attendance_data: record.attendanceData || [],
      created_at: new Date().toISOString()
    }));
    
    // 逐條插入資料
    console.log('開始恢復薪資記錄...');
    let successCount = 0;
    
    for (const record of records) {
      // 先檢查記錄是否已存在
      const { data: existingRecord, error: checkError } = await supabase
        .from('salary_records')
        .select('id')
        .eq('id', record.id)
        .single();
      
      if (checkError && !checkError.message.includes('No rows found')) {
        console.error(`檢查記錄 ${record.id} 時發生錯誤:`, checkError);
        continue;
      }
      
      // 如果記錄已存在，跳過
      if (existingRecord) {
        console.log(`記錄 ${record.id} 已存在，跳過`);
        continue;
      }
      
      // 插入新記錄
      const { error: insertError } = await supabase
        .from('salary_records')
        .insert([record]);
      
      if (insertError) {
        console.error(`插入記錄 ${record.id} 時發生錯誤:`, insertError);
      } else {
        console.log(`成功恢復記錄 ID: ${record.id}, 年月: ${record.salary_year}/${record.salary_month}`);
        successCount++;
      }
    }
    
    console.log(`恢復完成，成功: ${successCount}/${records.length} 條記錄`);
  } catch (error) {
    console.error('恢復過程中發生錯誤:', error);
  }
}

// 執行恢復
restoreRecords();