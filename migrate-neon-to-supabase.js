import { neon } from '@neondatabase/serverless';

// Neon 資料庫連接（舊資料庫，包含歷史記錄）
const neonUrl = "postgresql://neondb_owner:npg_vueVdsf74JTj@ep-damp-block-a55x8aa5.us-east-2.aws.neon.tech/neondb?sslmode=require";
const neonSql = neon(neonUrl);

// Supabase 資料庫連接（新資料庫，目標）
const supabaseUrl = "postgresql://postgres:43Marcus43@db.pezkrfptwoudqpruaier.supabase.co:5432/postgres";
const supabaseSql = neon(supabaseUrl);

async function migrateFromNeonToSupabase() {
  try {
    console.log('🚀 開始從 Neon 遷移歷史薪資記錄到 Supabase...');
    
    // 1. 確認 Neon 中的歷史資料
    console.log('📊 檢查 Neon 資料庫中的薪資記錄...');
    const neonRecords = await neonSql`
      SELECT * FROM salary_records 
      ORDER BY salary_year DESC, salary_month DESC
    `;
    console.log(`在 Neon 中找到 ${neonRecords.length} 筆薪資記錄`);
    
    if (neonRecords.length === 0) {
      console.log('❌ Neon 資料庫中沒有薪資記錄');
      return;
    }
    
    // 顯示找到的記錄
    neonRecords.forEach(record => {
      console.log(`📅 ${record.salary_year}年${record.salary_month}月 - ${record.employee_name} - 實發: ${record.net_salary}元`);
    });
    
    // 2. 確認 Supabase 目前狀態
    console.log('\n🔍 檢查 Supabase 資料庫目前狀態...');
    const supabaseRecords = await supabaseSql`SELECT COUNT(*) as count FROM salary_records`;
    console.log(`Supabase 中目前有 ${supabaseRecords[0].count} 筆記錄`);
    
    // 3. 開始遷移
    console.log('\n🔄 開始遷移資料...');
    let migratedCount = 0;
    
    for (const record of neonRecords) {
      try {
        // 檢查記錄是否已存在
        const existing = await supabaseSql`
          SELECT id FROM salary_records 
          WHERE salary_year = ${record.salary_year} 
          AND salary_month = ${record.salary_month} 
          AND employee_name = ${record.employee_name}
        `;
        
        if (existing.length > 0) {
          console.log(`⏭️  跳過已存在記錄: ${record.employee_name} ${record.salary_year}年${record.salary_month}月`);
          continue;
        }
        
        // 插入新記錄
        await supabaseSql`
          INSERT INTO salary_records (
            salary_year, salary_month, employee_id, employee_name,
            base_salary, housing_allowance, welfare_allowance,
            total_ot1_hours, total_ot2_hours, total_overtime_pay,
            holiday_days, holiday_daily_salary, total_holiday_pay,
            gross_salary, deductions, total_deductions, net_salary,
            attendance_data, created_at
          ) VALUES (
            ${record.salary_year}, ${record.salary_month}, 
            ${record.employee_id}, ${record.employee_name},
            ${record.base_salary}, ${record.housing_allowance || 0}, ${record.welfare_allowance || 0},
            ${record.total_ot1_hours || 0}, ${record.total_ot2_hours || 0}, ${record.total_overtime_pay || 0},
            ${record.holiday_days || 0}, ${record.holiday_daily_salary || 0}, ${record.total_holiday_pay || 0},
            ${record.gross_salary}, ${record.deductions || '[]'}, ${record.total_deductions || 0}, ${record.net_salary},
            ${record.attendance_data || '[]'}, ${record.created_at}
          )
        `;
        
        migratedCount++;
        console.log(`✅ 遷移成功: ${record.employee_name} ${record.salary_year}年${record.salary_month}月 - 實發: ${record.net_salary}元`);
        
      } catch (error) {
        console.error(`❌ 遷移失敗: ${record.employee_name} ${record.salary_year}年${record.salary_month}月`, error.message);
      }
    }
    
    // 4. 驗證遷移結果
    console.log('\n✅ 遷移完成！驗證結果...');
    const finalCount = await supabaseSql`SELECT COUNT(*) as count FROM salary_records`;
    console.log(`📈 遷移統計:`);
    console.log(`   原始記錄數: ${neonRecords.length}`);
    console.log(`   成功遷移數: ${migratedCount}`);
    console.log(`   Supabase 總記錄數: ${finalCount[0].count}`);
    
    // 5. 顯示遷移後的記錄
    const migratedRecords = await supabaseSql`
      SELECT salary_year, salary_month, employee_name, net_salary, created_at 
      FROM salary_records 
      ORDER BY salary_year DESC, salary_month DESC
    `;
    
    console.log('\n📋 Supabase 中的薪資記錄:');
    migratedRecords.forEach(record => {
      console.log(`   ${record.salary_year}年${record.salary_month}月 - ${record.employee_name} - 實發: ${record.net_salary}元`);
    });
    
    console.log('\n🎉 遷移成功完成！現在您可以在 Supabase Dashboard 中看到所有歷史薪資記錄。');
    
  } catch (error) {
    console.error('❌ 遷移過程發生錯誤:', error);
    if (error.message.includes('ENOTFOUND')) {
      console.log('💡 這看起來是網路連接問題，請稍後再試或檢查網路連接。');
    }
  }
}

// 執行遷移
migrateFromNeonToSupabase();