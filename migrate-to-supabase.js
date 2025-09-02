import { neon } from '@neondatabase/serverless';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// 讀取 Supabase 配置
const supabaseConfig = JSON.parse(fs.readFileSync('supabase_config.json', 'utf8'));

// 連接到本地 PostgreSQL (舊資料)
const oldDbUrl = process.env.DATABASE_URL; // Neon database
const oldSql = neon(oldDbUrl);

// 連接到 Supabase (新資料庫)
const supabase = createClient(supabaseConfig.url, supabaseConfig.key);

async function migrateData() {
  try {
    console.log('開始資料遷移...');
    
    // 1. 遷移員工資料
    console.log('遷移員工資料...');
    const employees = await oldSql`SELECT * FROM employees`;
    if (employees.length > 0) {
      const { error: empError } = await supabase
        .from('employees')
        .upsert(employees, { onConflict: 'id' });
      
      if (empError) {
        console.error('員工資料遷移失敗:', empError);
      } else {
        console.log(`成功遷移 ${employees.length} 名員工資料`);
      }
    }
    
    // 2. 遷移設定資料
    console.log('遷移系統設定...');
    const settings = await oldSql`SELECT * FROM settings`;
    if (settings.length > 0) {
      const { error: settingsError } = await supabase
        .from('settings')
        .upsert(settings, { onConflict: 'id' });
      
      if (settingsError) {
        console.error('設定資料遷移失敗:', settingsError);
      } else {
        console.log(`成功遷移 ${settings.length} 筆設定資料`);
      }
    }
    
    // 3. 遷移薪資記錄（最重要）
    console.log('遷移薪資記錄...');
    const salaryRecords = await oldSql`SELECT * FROM salary_records ORDER BY created_at`;
    if (salaryRecords.length > 0) {
      const { error: salaryError } = await supabase
        .from('salary_records')
        .upsert(salaryRecords, { onConflict: 'id' });
      
      if (salaryError) {
        console.error('薪資記錄遷移失敗:', salaryError);
      } else {
        console.log(`成功遷移 ${salaryRecords.length} 筆薪資記錄`);
      }
    }
    
    // 4. 驗證遷移結果
    console.log('驗證遷移結果...');
    const { data: migratedSalary, error: verifyError } = await supabase
      .from('salary_records')
      .select('id, salary_year, salary_month, employee_name, net_salary')
      .order('created_at', { ascending: false });
    
    if (verifyError) {
      console.error('驗證失敗:', verifyError);
    } else {
      console.log('遷移成功！Supabase 中的薪資記錄:');
      migratedSalary.forEach(record => {
        console.log(`ID: ${record.id}, ${record.salary_year}年${record.salary_month}月, ${record.employee_name}, 實發: ${record.net_salary}`);
      });
    }
    
    console.log('資料遷移完成！');
    
  } catch (error) {
    console.error('遷移過程發生錯誤:', error);
  }
}

// 執行遷移
migrateData();