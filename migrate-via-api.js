import { neon } from '@neondatabase/serverless';

// 連接到舊的 Neon 資料庫
const oldDbUrl = process.env.DATABASE_URL;
const oldSql = neon(oldDbUrl);

// 使用系統的 API 來儲存資料到 Supabase
const API_BASE = 'http://localhost:5000/api';

async function fetchAPI(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  
  if (!response.ok) {
    throw new Error(`API 請求失敗: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function migrateDataViaAPI() {
  try {
    console.log('開始透過 API 遷移資料...');
    
    // 1. 遷移員工資料
    console.log('遷移員工資料...');
    const employees = await oldSql`SELECT * FROM employees`;
    for (const employee of employees) {
      try {
        await fetchAPI('/employees', {
          method: 'POST',
          body: JSON.stringify({
            name: employee.name,
            idNumber: employee.id_number,
            department: employee.department,
            position: employee.position
          })
        });
      } catch (error) {
        console.log(`員工 ${employee.name} 可能已存在，跳過...`);
      }
    }
    console.log(`完成員工資料遷移，共 ${employees.length} 筆`);
    
    // 2. 遷移薪資記錄
    console.log('遷移薪資記錄...');
    const salaryRecords = await oldSql`SELECT * FROM salary_records ORDER BY created_at`;
    let migratedCount = 0;
    
    for (const record of salaryRecords) {
      try {
        await fetchAPI('/salary-records', {
          method: 'POST',
          body: JSON.stringify({
            salaryYear: record.salary_year,
            salaryMonth: record.salary_month,
            employeeId: record.employee_id,
            employeeName: record.employee_name,
            baseSalary: record.base_salary,
            housingAllowance: record.housing_allowance,
            welfareAllowance: record.welfare_allowance,
            totalOT1Hours: record.total_ot1_hours,
            totalOT2Hours: record.total_ot2_hours,
            totalOvertimePay: record.total_overtime_pay,
            holidayDays: record.holiday_days,
            holidayDailySalary: record.holiday_daily_salary,
            totalHolidayPay: record.total_holiday_pay,
            grossSalary: record.gross_salary,
            deductions: record.deductions,
            totalDeductions: record.total_deductions,
            netSalary: record.net_salary,
            attendanceData: record.attendance_data
          })
        });
        migratedCount++;
        console.log(`遷移薪資記錄 ${record.employee_name} ${record.salary_year}年${record.salary_month}月`);
      } catch (error) {
        console.error(`薪資記錄遷移失敗: ${record.employee_name} ${record.salary_year}年${record.salary_month}月`, error.message);
      }
    }
    
    console.log(`完成薪資記錄遷移，成功 ${migratedCount}/${salaryRecords.length} 筆`);
    
    // 3. 驗證遷移結果
    console.log('驗證遷移結果...');
    const migratedRecords = await fetchAPI('/salary-records');
    console.log(`Supabase 中現有 ${migratedRecords.length} 筆薪資記錄:`);
    migratedRecords.forEach(record => {
      console.log(`ID: ${record.id}, ${record.salaryYear}年${record.salaryMonth}月, ${record.employeeName}, 實發: ${record.netSalary}`);
    });
    
    console.log('資料遷移完成！');
    
  } catch (error) {
    console.error('遷移過程發生錯誤:', error);
  }
}

// 等待系統啟動後執行遷移
setTimeout(migrateDataViaAPI, 2000);