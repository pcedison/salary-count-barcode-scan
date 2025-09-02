import { neon } from '@neondatabase/serverless';

// Neon 資料庫連接
const neonUrl = "postgresql://neondb_owner:npg_vueVdsf74JTj@ep-damp-block-a55x8aa5.us-east-2.aws.neon.tech/neondb?sslmode=require";
const neonSql = neon(neonUrl);

// API 基礎 URL
const API_BASE = 'http://localhost:5000/api';

async function apiRequest(method, endpoint, data) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 請求失敗 ${response.status}: ${error}`);
  }
  
  return response.text().then(text => text ? JSON.parse(text) : {});
}

async function migrateViaAPI() {
  try {
    console.log('🚀 透過 API 從 Neon 遷移歷史薪資記錄...');
    
    // 1. 從 Neon 讀取歷史資料
    console.log('📊 讀取 Neon 中的薪資記錄...');
    const neonRecords = await neonSql`
      SELECT * FROM salary_records 
      ORDER BY salary_year DESC, salary_month DESC
    `;
    console.log(`找到 ${neonRecords.length} 筆歷史記錄`);
    
    // 顯示記錄
    neonRecords.forEach(record => {
      console.log(`📅 ${record.salary_year}年${record.salary_month}月 - ${record.employee_name} - 實發: ${record.net_salary}元`);
    });
    
    // 2. 檢查目前 Supabase 中的記錄
    console.log('\n🔍 檢查目前 Supabase 狀態...');
    let existingRecords = [];
    try {
      existingRecords = await apiRequest('GET', '/salary-records');
      console.log(`目前 Supabase 中有 ${existingRecords.length} 筆記錄`);
    } catch (error) {
      console.log('API 連接檢查失敗，繼續遷移...');
    }
    
    // 3. 開始透過 API 遷移
    console.log('\n🔄 開始透過 API 遷移...');
    let migratedCount = 0;
    
    for (const record of neonRecords) {
      try {
        // 檢查是否已存在
        const exists = existingRecords.some(existing => 
          existing.salaryYear === record.salary_year && 
          existing.salaryMonth === record.salary_month && 
          existing.employeeName === record.employee_name
        );
        
        if (exists) {
          console.log(`⏭️  跳過已存在: ${record.employee_name} ${record.salary_year}年${record.salary_month}月`);
          continue;
        }
        
        // 透過 API 建立記錄
        await apiRequest('POST', '/salary-records', {
          salaryYear: record.salary_year,
          salaryMonth: record.salary_month,
          employeeId: record.employee_id,
          employeeName: record.employee_name,
          baseSalary: record.base_salary,
          housingAllowance: record.housing_allowance || 0,
          welfareAllowance: record.welfare_allowance || 0,
          totalOT1Hours: record.total_ot1_hours || 0,
          totalOT2Hours: record.total_ot2_hours || 0,
          totalOvertimePay: record.total_overtime_pay || 0,
          holidayDays: record.holiday_days || 0,
          holidayDailySalary: record.holiday_daily_salary || 0,
          totalHolidayPay: record.total_holiday_pay || 0,
          grossSalary: record.gross_salary,
          deductions: record.deductions || '[]',
          totalDeductions: record.total_deductions || 0,
          netSalary: record.net_salary,
          attendanceData: record.attendance_data || '[]'
        });
        
        migratedCount++;
        console.log(`✅ 遷移成功: ${record.employee_name} ${record.salary_year}年${record.salary_month}月`);
        
      } catch (error) {
        console.error(`❌ 遷移失敗: ${record.employee_name} ${record.salary_year}年${record.salary_month}月`, error.message);
      }
    }
    
    // 4. 驗證結果
    console.log('\n✅ 驗證遷移結果...');
    try {
      const finalRecords = await apiRequest('GET', '/salary-records');
      console.log(`📈 遷移統計:`);
      console.log(`   原始記錄: ${neonRecords.length} 筆`);
      console.log(`   成功遷移: ${migratedCount} 筆`);
      console.log(`   目前總數: ${finalRecords.length} 筆`);
      
      console.log('\n📋 Supabase 中的記錄:');
      finalRecords.forEach(record => {
        console.log(`   ${record.salaryYear}年${record.salaryMonth}月 - ${record.employeeName} - 實發: ${record.netSalary}元`);
      });
      
      console.log('\n🎉 遷移完成！現在您可以在 Supabase Dashboard 中看到所有歷史記錄。');
      
    } catch (error) {
      console.error('驗證失敗:', error.message);
    }
    
  } catch (error) {
    console.error('❌ 遷移過程發生錯誤:', error);
  }
}

// 等待 API 服務啟動後執行
setTimeout(migrateViaAPI, 5000);