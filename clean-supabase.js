// 清理 Supabase 數據並準備重新遷移
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readConfig() {
  try {
    const configPath = path.join(__dirname, 'supabase_config.json');
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    }
    return null;
  } catch (error) {
    console.error('Error reading Supabase config:', error);
    return null;
  }
}

async function clearSupabaseTables() {
  try {
    // 讀取 Supabase 配置
    const config = await readConfig();
    if (!config || !config.url || !config.key) {
      console.error('Supabase configuration is missing or incomplete');
      return false;
    }

    // 創建 Supabase 客戶端
    const supabase = createClient(config.url, config.key);

    // 定義要清理的表
    const tables = [
      'temporary_attendance',
      'salary_records',
      'holidays',
      'employees',
      'settings',
      'users'
    ];

    // 清理每個表
    for (const table of tables) {
      console.log(`清理表 ${table}...`);
      
      // 先獲取所有數據
      const { data, error: selectError } = await supabase
        .from(table)
        .select('id');
      
      if (selectError) {
        console.error(`獲取表 ${table} 數據時出錯:`, selectError);
        continue;
      }
      
      if (!data || data.length === 0) {
        console.log(`表 ${table} 中沒有數據，跳過清理。`);
        continue;
      }
      
      // 刪除所有數據
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .in('id', data.map(item => item.id));
      
      if (deleteError) {
        console.error(`清理表 ${table} 時出錯:`, deleteError);
      } else {
        console.log(`成功從表 ${table} 中刪除 ${data.length} 條記錄`);
      }
    }

    console.log('所有 Supabase 表已清理完成，現在可以重新遷移數據');
    return true;
  } catch (error) {
    console.error('清理 Supabase 數據時發生錯誤:', error);
    return false;
  }
}

// 執行清理
clearSupabaseTables().then(success => {
  if (success) {
    console.log('清理操作完成。請通過設置頁面重新遷移數據。');
  } else {
    console.log('清理操作失敗。');
  }
});