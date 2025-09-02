import { neon } from '@neondatabase/serverless';

// 舊的 Neon 資料庫連接
const oldDbUrl = "postgresql://neondb_owner:npg_vueVdsf74JTj@ep-damp-block-a55x8aa5.us-east-2.aws.neon.tech/neondb?sslmode=require";
const oldSql = neon(oldDbUrl);

// 新的 Supabase 資料庫連接 (現在系統已使用此連接)
const newDbUrl = "postgresql://postgres:43Marcus43@db.pezkrfptwoudqpruaier.supabase.co:5432/postgres";
const newSql = neon(newDbUrl);

async function finalMigration() {
  try {
    console.log('開始從 Neon 遷移到 Supabase...');
    
    // 1. 確認舊資料庫的記錄
    const oldSalaryRecords = await oldSql`SELECT * FROM salary_records ORDER BY created_at`;
    console.log(`舊資料庫中發現 ${oldSalaryRecords.length} 筆薪資記錄`);
    
    // 2. 確認新資料庫目前為空
    const currentRecords = await newSql`SELECT COUNT(*) as count FROM salary_records`;
    console.log(`Supabase 中目前有 ${currentRecords[0].count} 筆記錄`);
    
    // 3. 遷移薪資記錄
    let successCount = 0;
    for (const record of oldSalaryRecords) {
      try {
        await newSql`
          INSERT INTO salary_records (
            salary_year, salary_month, employee_id, employee_name,
            base_salary, housing_allowance, welfare_allowance,
            total_ot1_hours, total_ot2_hours, total_overtime_pay,
            holiday_days, holiday_daily_salary, total_holiday_pay,
            gross_salary, deductions, total_deductions, net_salary,
            attendance_data, created_at
          ) VALUES (
            ${record.salary_year}, ${record.salary_month}, ${record.employee_id}, ${record.employee_name},
            ${record.base_salary}, ${record.housing_allowance}, ${record.welfare_allowance},
            ${record.total_ot1_hours}, ${record.total_ot2_hours}, ${record.total_overtime_pay},
            ${record.holiday_days}, ${record.holiday_daily_salary}, ${record.total_holiday_pay},
            ${record.gross_salary}, ${record.deductions}, ${record.total_deductions}, ${record.net_salary},
            ${record.attendance_data}, ${record.created_at}
          )
        `;
        successCount++;
        console.log(`✓ 遷移: ${record.employee_name} ${record.salary_year}年${record.salary_month}月`);
      } catch (error) {
        console.error(`✗ 失敗: ${record.employee_name} ${record.salary_year}年${record.salary_month}月`, error.message);
      }
    }
    
    // 4. 驗證遷移結果
    const finalRecords = await newSql`SELECT COUNT(*) as count FROM salary_records`;
    console.log(`遷移完成！Supabase 中現在有 ${finalRecords[0].count} 筆記錄`);
    console.log(`成功遷移 ${successCount}/${oldSalaryRecords.length} 筆記錄`);
    
    // 5. 顯示遷移的記錄
    const migratedRecords = await newSql`
      SELECT salary_year, salary_month, employee_name, net_salary, created_at 
      FROM salary_records 
      ORDER BY created_at DESC
    `;
    
    console.log('\nSupabase 中的薪資記錄:');
    migratedRecords.forEach(record => {
      console.log(`${record.salary_year}年${record.salary_month}月 - ${record.employee_name} - 實發: ${record.net_salary}元`);
    });
    
  } catch (error) {
    console.error('遷移失敗:', error);
  }
}

finalMigration();