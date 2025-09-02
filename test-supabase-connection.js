#!/usr/bin/env node

// 測試不同的 Supabase 連接方法
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
const execAsync = util.promisify(exec);

const CONNECTION_TESTS = [
  {
    name: "直接連接測試",
    url: "postgresql://postgres.pezkrfptwoudqpruaier:43Marcus43@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
  },
  {
    name: "Transaction Mode",
    url: "postgresql://postgres.pezkrfptwoudqpruaier:43Marcus43@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
  },
  {
    name: "Session Mode", 
    url: "postgresql://postgres.pezkrfptwoudqpruaier:43Marcus43@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
  }
];

async function testConnection(config) {
  console.log(`\n🔍 測試: ${config.name}`);
  console.log(`URL: ${config.url.replace(/:[^@]*@/, ':****@')}`);
  
  try {
    // 嘗試使用 Node.js postgres 連接
    const testScript = `
const postgres = require('postgres');
const sql = postgres('${config.url}', { 
  ssl: 'require',
  connect_timeout: 5,
  max: 1
});

async function test() {
  try {
    const result = await sql\`SELECT current_database(), version()\`;
    console.log('✅ 連接成功:', result[0]);
    await sql.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ 連接失敗:', error.message);
    process.exit(1);
  }
}

test();
    `;
    
    // 寫入臨時測試文件
    fs.writeFileSync('/tmp/test_connection.js', testScript);
    
    // 執行測試
    const { stdout, stderr } = await execAsync('cd /home/runner/workspace && node /tmp/test_connection.js', { timeout: 10000 });
    console.log(stdout);
    if (stderr) console.error('警告:', stderr);
    
    return true;
  } catch (error) {
    console.error(`❌ ${config.name} 失敗:`, error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 開始 Supabase 連接測試...\n');
  
  let successCount = 0;
  
  for (const config of CONNECTION_TESTS) {
    const success = await testConnection(config);
    if (success) successCount++;
    
    // 等待一下再測試下一個
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n📊 測試結果: ${successCount}/${CONNECTION_TESTS.length} 個連接成功`);
  
  if (successCount === 0) {
    console.log('\n💡 建議解決方案:');
    console.log('1. 檢查 Replit 網路限制');
    console.log('2. 確認 Supabase 專案狀態');
    console.log('3. 驗證密碼正確性');
    console.log('4. 考慮使用 Supabase HTTP API 而非直連 PostgreSQL');
  }
}

// 執行測試
runAllTests().catch(console.error);