import { neon } from '@neondatabase/serverless';

const neonUrl = "postgresql://neondb_owner:npg_vueVdsf74JTj@ep-damp-block-a55x8aa5.us-east-2.aws.neon.tech/neondb?sslmode=require";
const supabaseUrl = "postgresql://postgres:43Marcus43@db.pezkrfptwoudqpruaier.supabase.co:5432/postgres";

const neonSql = neon(neonUrl);
const supabaseSql = neon(supabaseUrl);

let retryCount = 0;
const maxRetries = 20;

async function checkConnectionAndMigrate() {
  retryCount++;
  console.log(`\n🔄 嘗試 #${retryCount}: 檢查 Supabase 連接並進行遷移...`);
  
  try {
    // 測試 Supabase 連接
    const testResult = await supabaseSql`SELECT 1 as test`;
    console.log('✅ Supabase 連接成功！');
    
    // 開始遷移
    console.log('📊 獲取 Neon 歷史記錄...');
    const neonRecords = await neonSql`SELECT * FROM salary_records ORDER BY salary_year DESC, salary_month DESC`;
    
    console.log(`找到 ${neonRecords.length} 筆記錄：`);
    neonRecords.forEach(r => console.log(`  📅 ${r.salary_year}年${r.salary_month}月 - ${r.employee_name} - ${r.net_salary}元`));
    
    // 檢查 Supabase 目前狀態
    const existingRecords = await supabaseSql`SELECT * FROM salary_records`;
    console.log(`Supabase 中目前有 ${existingRecords.length} 筆記錄`);
    
    // 遷移資料
    let migrated = 0;
    for (const record of neonRecords) {
      const exists = existingRecords.some(e => 
        e.salary_year === record.salary_year && 
        e.salary_month === record.salary_month && 
        e.employee_name === record.employee_name
      );
      
      if (!exists) {
        await supabaseSql`
          INSERT INTO salary_records (
            salary_year, salary_month, employee_id, employee_name,
            base_salary, housing_allowance, welfare_allowance,
            total_ot1_hours, total_ot2_hours, total_overtime_pay,
            holiday_days, holiday_daily_salary, total_holiday_pay,
            gross_salary, deductions, total_deductions, net_salary,
            attendance_data, created_at
          ) VALUES (
            ${record.salary_year}, ${record.salary_month}, ${record.employee_id}, ${record.employee_name},
            ${record.base_salary}, ${record.housing_allowance || 0}, ${record.welfare_allowance || 0},
            ${record.total_ot1_hours || 0}, ${record.total_ot2_hours || 0}, ${record.total_overtime_pay || 0},
            ${record.holiday_days || 0}, ${record.holiday_daily_salary || 0}, ${record.total_holiday_pay || 0},
            ${record.gross_salary}, ${record.deductions || '[]'}, ${record.total_deductions || 0}, ${record.net_salary},
            ${record.attendance_data || '[]'}, ${record.created_at}
          )
        `;
        migrated++;
        console.log(`✅ 遷移: ${record.employee_name} ${record.salary_year}年${record.salary_month}月`);
      }
    }
    
    // 驗證結果
    const finalRecords = await supabaseSql`SELECT * FROM salary_records ORDER BY salary_year DESC, salary_month DESC`;
    console.log(`\n🎉 遷移完成！`);
    console.log(`📈 統計: 新增 ${migrated} 筆，總共 ${finalRecords.length} 筆記錄`);
    console.log(`\n📋 Supabase 中的記錄:`);
    finalRecords.forEach(r => console.log(`  ${r.salary_year}年${r.salary_month}月 - ${r.employee_name} - ${r.net_salary}元`));
    console.log(`\n✨ 現在您可以在 Supabase Dashboard 中看到所有歷史薪資記錄了！`);
    
    process.exit(0);
    
  } catch (error) {
    if (error.message.includes('ENOTFOUND') || error.message.includes('fetch failed')) {
      console.log(`❌ 網路連接問題 (嘗試 ${retryCount}/${maxRetries})`);
      
      if (retryCount < maxRetries) {
        console.log(`⏳ 30秒後重試...`);
        setTimeout(checkConnectionAndMigrate, 30000);
      } else {
        console.log('❌ 達到最大重試次數。請檢查網路連接或稍後手動重試。');
        process.exit(1);
      }
    } else {
      console.error('❌ 其他錯誤:', error.message);
      process.exit(1);
    }
  }
}

console.log('🚀 啟動自動遷移監控...');
console.log('這個腳本會持續嘗試連接 Supabase 並進行資料遷移');
checkConnectionAndMigrate();