/**
 * 日計算加班費用測試
 * 
 * 測試按日計算加班費的方法
 * 依據規定，加班費應該按日計算，每日計算完成後四捨五入，再加總
 */

import { constants } from './shared/constants.js';

const testData = [
  // 測試用的每日加班數據，每個元素代表一天
  // 包含 ot1Hours（第一階段加班時數）和 ot2Hours（第二階段加班時數）
  { ot1Hours: 2, ot2Hours: 0 },   // 日1: 2小時第一階段加班
  { ot1Hours: 1.5, ot2Hours: 0.5 }, // 日2: 1.5小時第一階段 + 0.5小時第二階段
  { ot1Hours: 0, ot2Hours: 2 },   // 日3: 2小時第二階段加班
  { ot1Hours: 2, ot2Hours: 1 },   // 日4: 2小時第一階段 + 1小時第二階段
  { ot1Hours: 0.25, ot2Hours: 0.75 }, // 日5: 0.25小時第一階段 + 0.75小時第二階段
];

// 加班費計算方式一：每日計算後四捨五入再加總
function calculateMonthlyOvertimeMethod1() {
  console.log('方法一：每日計算加班費並四捨五入後加總（正確方法）');
  
  // 日計算結果
  let dailyResults = [];
  let totalOvertime = 0;
  
  // 按日計算
  testData.forEach((day, index) => {
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
      day: index + 1,
      ot1Hours: day.ot1Hours,
      ot2Hours: day.ot2Hours,
      ot1Pay: ot1Pay,
      ot2Pay: ot2Pay,
      dailyTotal: dailyOTRaw,
      dailyRounded: dailyOTRounded
    });
  });
  
  // 詳細輸出
  console.log('日計算明細:');
  dailyResults.forEach(day => {
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
  
  console.log(`總加班時數: ${totalOT1Hours}小時@${constants.OT1_MULTIPLIER}x + ${totalOT2Hours}小時@${constants.OT2_MULTIPLIER}x`);
  console.log(`計算結果: ${rawTotal.toFixed(2)} => ${roundedTotal}`);
  
  return roundedTotal;
}

// 執行測試
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