import fs from 'fs';

// 讀取最新的備份檔案
const latestBackup = 'backups/daily/backup-2025-09-02T03-34-30-040Z.json';
const backupData = JSON.parse(fs.readFileSync(latestBackup, 'utf8'));

// 使用系統 API 恢復資料
const API_BASE = 'http://localhost:5000/api';

async function fetchAPI(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`API 請求失敗: ${response.status} ${text}`);
  }
  
  return text ? JSON.parse(text) : {};
}

async function restoreToSupabase() {
  try {
    console.log('開始從備份恢復資料到 Supabase...');
    console.log(`備份檔案: ${latestBackup}`);
    
    // 1. 恢復薪資記錄
    if (backupData.salary_records && backupData.salary_records.length > 0) {
      console.log(`發現 ${backupData.salary_records.length} 筆薪資記錄`);
      
      let successCount = 0;
      for (const record of backupData.salary_records) {
        try {
          await fetchAPI('/salary-records', {
            method: 'POST',
            body: JSON.stringify({
              salaryYear: record.salary_year,
              salaryMonth: record.salary_month,
              employeeId: record.employee_id,
              employeeName: record.employee_name,
              baseSalary: record.base_salary,
              housingAllowance: record.housing_allowance || 0,
              welfareAllowance: record.welfare_allowance || 0,
              totalOT1Hours: record.total_ot1_hours,
              totalOT2Hours: record.total_ot2_hours,
              totalOvertimePay: record.total_overtime_pay,
              holidayDays: record.holiday_days || 0,
              holidayDailySalary: record.holiday_daily_salary || 0,
              totalHolidayPay: record.total_holiday_pay || 0,
              grossSalary: record.gross_salary,
              deductions: record.deductions,
              totalDeductions: record.total_deductions,
              netSalary: record.net_salary,
              attendanceData: record.attendance_data
            })
          });
          successCount++;
          console.log(`✓ 恢復: ${record.employee_name} ${record.salary_year}年${record.salary_month}月`);
        } catch (error) {
          console.error(`✗ 失敗: ${record.employee_name} ${record.salary_year}年${record.salary_month}月`, error.message);
        }
      }
      
      console.log(`薪資記錄恢復完成: ${successCount}/${backupData.salary_records.length}`);
    }
    
    // 2. 驗證恢復結果
    console.log('驗證恢復結果...');
    const restoredRecords = await fetchAPI('/salary-records');
    console.log(`Supabase 中現在有 ${restoredRecords.length} 筆薪資記錄:`);
    
    restoredRecords.forEach(record => {
      console.log(`${record.salaryYear}年${record.salaryMonth}月 - ${record.employeeName} - 實發: ${record.netSalary}元`);
    });
    
    console.log('資料恢復完成！');
    
  } catch (error) {
    console.error('恢復失敗:', error);
  }
}

// 等待系統啟動後執行恢復
setTimeout(restoreToSupabase, 3000);