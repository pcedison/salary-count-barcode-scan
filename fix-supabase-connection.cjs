// 修復 Supabase 連接並測試所有可能的連接格式
const postgres = require('postgres');

const testConfigs = [
  {
    name: "正確格式（Transaction Pooler）",
    url: "postgresql://postgres.pezkrfptwoudqpruaier:43Marcus43@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
  },
  {
    name: "Session Pooler 格式",
    url: "postgresql://postgres.pezkrfptwoudqpruaier:43Marcus43@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
  },
  {
    name: "直連格式（Legacy）",
    url: "postgresql://postgres:43Marcus43@db.pezkrfptwoudqpruaier.supabase.co:5432/postgres"
  }
];

async function testConnection(config) {
  console.log(`\n測試: ${config.name}`);
  console.log(`URL: ${config.url.replace(/:43Marcus43@/, ':****@')}`);
  
  try {
    const sql = postgres(config.url, {
      ssl: 'require',
      connect_timeout: 10,
      max: 1,
      idle_timeout: 20,
      max_lifetime: 60 * 30
    });
    
    console.log('  → 建立連接...');
    const result = await sql`SELECT current_database(), current_user, version()`;
    
    console.log('  ✅ 連接成功！');
    console.log(`  📊 資料庫: ${result[0].current_database}`);
    console.log(`  👤 用戶: ${result[0].current_user}`);
    console.log(`  📝 版本: ${result[0].version.substring(0, 50)}...`);
    
    // 測試建立資料表
    console.log('  → 測試建立資料表...');
    await sql`CREATE TABLE IF NOT EXISTS connection_test (id SERIAL PRIMARY KEY, test_time TIMESTAMP DEFAULT NOW())`;
    
    // 測試插入資料
    console.log('  → 測試插入資料...');
    await sql`INSERT INTO connection_test DEFAULT VALUES`;
    
    // 測試查詢資料
    console.log('  → 測試查詢資料...');
    const testData = await sql`SELECT COUNT(*) as count FROM connection_test`;
    console.log(`  📈 測試表記錄數: ${testData[0].count}`);
    
    // 清理測試資料
    console.log('  → 清理測試資料...');
    await sql`DROP TABLE connection_test`;
    
    await sql.end();
    
    return {
      success: true,
      config: config,
      details: result[0]
    };
    
  } catch (error) {
    console.log(`  ❌ 失敗: ${error.message}`);
    return {
      success: false,
      config: config,
      error: error.message
    };
  }
}

async function findWorkingConnection() {
  console.log('🔧 開始測試所有 Supabase 連接配置...\n');
  
  const results = [];
  
  for (const config of testConfigs) {
    const result = await testConnection(config);
    results.push(result);
    
    if (result.success) {
      console.log(`\n🎉 找到可用連接！`);
      console.log(`配置名稱: ${result.config.name}`);
      console.log(`連接 URL: ${result.config.url.replace(/:43Marcus43@/, ':****@')}`);
      
      return result.config.url;
    }
    
    // 等待 2 秒再測試下一個
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n❌ 所有連接配置都失敗');
  console.log('\n可能的原因:');
  console.log('1. Supabase 專案已暫停（免費專案 1 週不活動會暫停）');
  console.log('2. 密碼已更改');
  console.log('3. 專案已刪除');
  console.log('4. 需要重新獲取連接字串');
  
  console.log('\n建議解決方案:');
  console.log('1. 登入 Supabase 控制台檢查專案狀態');
  console.log('2. 重新啟動已暫停的專案');
  console.log('3. 重置資料庫密碼');
  console.log('4. 重新複製連接字串');
  
  return null;
}

// 主執行函數
async function main() {
  try {
    const workingUrl = await findWorkingConnection();
    
    if (workingUrl) {
      console.log('\n📝 下一步:');
      console.log('1. 更新 DATABASE_URL 環境變數');
      console.log('2. 更新 server/storage.ts 使用 postgres 驅動');
      console.log('3. 建立 Supabase 資料庫結構');
      console.log('4. 遷移歷史資料');
      
      // 將工作連接保存到檔案
      const fs = require('fs');
      const config = {
        working_connection: workingUrl,
        timestamp: new Date().toISOString(),
        status: 'ready_for_migration'
      };
      fs.writeFileSync('supabase-connection-config.json', JSON.stringify(config, null, 2));
      console.log('\n✅ 連接配置已保存到 supabase-connection-config.json');
      
      return workingUrl;
    } else {
      console.log('\n🔄 需要手動修復 Supabase 專案配置');
      return null;
    }
    
  } catch (error) {
    console.error('測試過程中發生錯誤:', error);
    return null;
  }
}

if (require.main === module) {
  main().then(result => {
    if (result) {
      console.log('\n✅ Supabase 連接測試完成，準備進行遷移');
      process.exit(0);
    } else {
      console.log('\n❌ Supabase 連接測試失敗');
      process.exit(1);
    }
  });
}

module.exports = { findWorkingConnection, testConnection };