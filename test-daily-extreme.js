/**
 * 極端情況加班費用測試
 * 
 * 測試更極端情況下兩種加班費計算方法的差異
 * 這將展示為何按日計算是正確的法規要求
 */

import { constants } from './shared/constants.js';

// 測試數據 - 30天數據，每天有微小加班時間（0.1-0.3小時）
// 這種情況可以放大四捨五入的影響
const testData = Array.from({ length: 30 }, (_, index) => {
  // 隨機生成加班時數 (0.1-0.3小時)
  return {
    day: index + 1,
    ot1Hours: 0.1 + (index % 3) * 0.1, // 在0.1, 0.2, 0.3之間循環
    ot2Hours: 0.1 + ((index + 1) % 3) * 0.1 // 在0.1, 0.2, 0.3之間循環但偏移1
  };
});

// 加班費計算方式一：每日計算後四捨五入再加總
function calculateMonthlyOvertimeMethod1() {
  console.log('方法一：每日計算加班費並四捨五入後加總（正確方法）');
  
  // 日計算結果
  let dailyResults = [];
  let totalOvertime = 0;
  
  // 按日計算
  testData.forEach(day => {
    // 計算每階段加班費
    const ot1Pay = day.ot1Hours * constants.BASE_HOURLY_RATE * constants.OT1_MULTIPLIER;
    const ot2Pay = day.ot2Hours * constants.BASE_HOURLY_RATE * constants.OT2_MULTIPLIER;
    
    // 該日總加班費（未四捨五入）
    const dailyOTRaw = ot1Pay + ot2Pay;
    
    // 四捨五入到整數
    const dailyOTRounded = Math.round(dailyOTRaw);
    
    // 加到月總額
    totalOvertime += dailyOTRounded;
    
    // 記錄結果
    dailyResults.push({
      day: day.day,
      ot1Hours: day.ot1Hours,
      ot2Hours: day.ot2Hours,
      ot1Pay: ot1Pay,
      ot2Pay: ot2Pay,
      dailyTotal: dailyOTRaw,
      dailyRounded: dailyOTRounded
    });
  });
  
  // 顯示前5天和後5天的詳細輸出
  console.log('日計算明細 (僅顯示前5天和後5天):');
  
  // 前5天
  dailyResults.slice(0, 5).forEach(day => {
    console.log(
      `日 ${day.day}: ${day.ot1Hours}小時@${constants.OT1_MULTIPLIER}x + ${day.ot2Hours}小時@${constants.OT2_MULTIPLIER}x = ${day.dailyTotal.toFixed(2)} => ${day.dailyRounded}`
    );
  });
  
  console.log('...');
  
  // 後5天
  dailyResults.slice(-5).forEach(day => {
    console.log(
      `日 ${day.day}: ${day.ot1Hours}小時@${constants.OT1_MULTIPLIER}x + ${day.ot2Hours}小時@${constants.OT2_MULTIPLIER}x = ${day.dailyTotal.toFixed(2)} => ${day.dailyRounded}`
    );
  });
  
  console.log(`\n每日計算後四捨五入加總結果: ${totalOvertime}`);
  
  return totalOvertime;
}

// 加班費計算方式二：先加總時數再一次計算（不正確）
function calculateMonthlyOvertimeMethod2() {
  console.log('\n方法二：先加總所有加班時數再一次計算（不正確方法）');
  
  // 加總所有加班時數
  let totalOT1Hours = 0;
  let totalOT2Hours = 0;
  
  testData.forEach(day => {
    totalOT1Hours += day.ot1Hours;
    totalOT2Hours += day.ot2Hours;
  });
  
  // 一次計算加班費
  const totalOT1Pay = totalOT1Hours * constants.BASE_HOURLY_RATE * constants.OT1_MULTIPLIER;
  const totalOT2Pay = totalOT2Hours * constants.BASE_HOURLY_RATE * constants.OT2_MULTIPLIER;
  
  // 總加班費
  const rawTotal = totalOT1Pay + totalOT2Pay;
  const roundedTotal = Math.round(rawTotal);
  
  console.log(`總加班時數: ${totalOT1Hours.toFixed(1)}小時@${constants.OT1_MULTIPLIER}x + ${totalOT2Hours.toFixed(1)}小時@${constants.OT2_MULTIPLIER}x`);
  console.log(`計算結果: ${rawTotal.toFixed(2)} => ${roundedTotal}`);
  
  return roundedTotal;
}

// 執行測試
console.log(`測試員工: 30天每天微小加班`);
console.log(`使用基本時薪: ${constants.BASE_HOURLY_RATE}`);
console.log(`第一階段加班倍率: ${constants.OT1_MULTIPLIER}`);
console.log(`第二階段加班倍率: ${constants.OT2_MULTIPLIER}`);
console.log('-------------------------------------------');

const result1 = calculateMonthlyOvertimeMethod1();
const result2 = calculateMonthlyOvertimeMethod2();

console.log('\n-------------------------------------------');
console.log(`方法一結果: ${result1}`);
console.log(`方法二結果: ${result2}`);
console.log(`差異: ${result1 - result2} (${result1 > result2 ? '方法一較高' : '方法二較高'})`);
console.log('按照法規要求，應該使用方法一：每日計算並四捨五入後加總');