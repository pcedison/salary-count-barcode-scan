// 簡單的 Supabase 連接測試
console.log('🎯 開始測試 Supabase 連接...');

// 我們知道的資訊：
// 專案 ID: pezkrfptwoudqpruaier  
// 密碼: 43Marcus43
// 主機: aws-0-us-east-1.pooler.supabase.com

const testConnections = [
  // 測試 1：標準格式
  {
    name: '標準 postgres 用戶',
    url: 'postgresql://postgres:43Marcus43@aws-0-us-east-1.pooler.supabase.com:6543/postgres'
  },
  // 測試 2：用戶名包含專案 ID  
  {
    name: '用戶名包含專案 ID',
    url: 'postgresql://postgres.pezkrfptwoudqpruaier:43Marcus43@aws-0-us-east-1.pooler.supabase.com:6543/postgres'
  },
  // 測試 3：直連模式
  {
    name: '直連 (IPv6)',
    url: 'postgresql://postgres:43Marcus43@db.pezkrfptwoudqpruaier.supabase.co:5432/postgres'
  },
  // 測試 4：Session pooler
  {
    name: 'Session pooler',
    url: 'postgresql://postgres.pezkrfptwoudqpruaier:43Marcus43@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
  }
];

const postgres = require('postgres');

async function testSingleConnection(config) {
  console.log(`\n🔍 測試: ${config.name}`);
  
  try {
    // 建立連接
    const sql = postgres(config.url, {
      ssl: 'require',
      connect_timeout: 8,
      max: 1,
      debug: false
    });
    
    // 測試基本查詢
    console.log('   → 嘗試連接...');
    const result = await sql`SELECT 1 as test, current_user, current_database()`;
    
    console.log('   ✅ 連接成功!');
    console.log(`   📊 資料庫: ${result[0].current_database}`);
    console.log(`   👤 用戶: ${result[0].current_user}`);
    
    // 關閉連接
    await sql.end();
    return true;
    
  } catch (error) {
    console.log(`   ❌ 失敗: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  let successfulConnection = null;
  
  for (const config of testConnections) {
    const success = await testSingleConnection(config);
    if (success && !successfulConnection) {
      successfulConnection = config;
    }
    
    // 暫停一下避免連接太頻繁
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📋 測試結果總結:');
  if (successfulConnection) {
    console.log(`✅ 找到可用的連接方式: ${successfulConnection.name}`);
    console.log(`🔗 連接字串: ${successfulConnection.url.replace(/:43Marcus43@/, ':****@')}`);
    console.log('\n下一步：');
    console.log('1. 更新系統的 DATABASE_URL 為這個格式');
    console.log('2. 重新啟動應用程式'); 
    console.log('3. 將 Neon 的資料匯入 Supabase');
  } else {
    console.log('❌ 所有連接方式都失敗了');
    console.log('可能的原因:');
    console.log('- Supabase 專案已暫停或刪除');
    console.log('- 密碼已更改');
    console.log('- 需要從 Supabase 控制台重新獲取連接字串');
  }
}

// 執行測試
runAllTests().catch(console.error);