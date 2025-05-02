/**
 * 修正四月份薪資記錄數據腳本
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 正確的薪資數據（來自用戶的截圖）
const correctData = {
  id: 11, // 四月份薪資記錄ID
  totalOT1Hours: 40,
  totalOT2Hours: 15,
  totalOvertimePay: 9365, // 正確的加班費
  grossSalary: 40455,  // 應收總額：基本底薪 + 加班費 + 福利津貼
  netSalary: 35054    // 實發金額：應收總額 - 應扣總額
};

// 構建PATCH請求
const updateCommand = `curl -X PATCH -H "Content-Type: application/json" -d '${JSON.stringify(correctData)}' http://localhost:5000/api/salary-records/11 -H "X-Force-Update: true"`;

try {
  // 執行更新
  console.log('正在更新四月份薪資記錄...');
  const result = execSync(updateCommand);
  console.log('更新成功!');
  console.log('回應:', result.toString());
} catch (error) {
  console.error('更新失敗:', error.message);
}