/**
 * 測試極端情況下每日計算加班費與整月計算的差異
 * 這個測試使用極端的小數點加班時數，以顯示兩種方法的差異
 */

// 導入共享常量
import { constants } from './shared/constants.js';

// 使用共享常量建立計算設置
const settings = {
  baseHourlyRate: constants.BASE_HOURLY_RATE,  // 基本時薪
  ot1Multiplier: constants.OT1_MULTIPLIER,  // 第一階段加班倍率 (1.34倍)
  ot2Multiplier: constants.OT2_MULTIPLIER   // 第二階段加班倍率 (1.67倍)
};

// 極端情況下的每日加班記錄 - 大量接近0.5的小數時數
const dailyRecords = [
  { date: '2025-04-01', ot1Hours: 0.51, ot2Hours: 0.49 },
  { date: '2025-04-02', ot1Hours: 0.49, ot2Hours: 0.51 },
  { date: '2025-04-03', ot1Hours: 1.51, ot2Hours: 0.49 },
  { date: '2025-04-04', ot1Hours: 1.49, ot2Hours: 0.51 },
  { date: '2025-04-05', ot1Hours: 0.51, ot2Hours: 1.49 },
  { date: '2025-04-08', ot1Hours: 0.49, ot2Hours: 1.51 },
  { date: '2025-04-10', ot1Hours: 0.51, ot2Hours: 0.49 },
  { date: '2025-04-11', ot1Hours: 0.49, ot2Hours: 0.51 },
  { date: '2025-04-15', ot1Hours: 0.51, ot2Hours: 0.49 },
  { date: '2025-04-16', ot1Hours: 0.49, ot2Hours: 0.51 }
];

// 計算總加班時數
const totalOT1Hours = dailyRecords.reduce((total, record) => total + record.ot1Hours, 0);
const totalOT2Hours = dailyRecords.reduce((total, record) => total + record.ot2Hours, 0);

console.log('=== 加班時數總計 ===');
console.log(`總第一階段加班時數(${constants.OT1_MULTIPLIER}倍): ${totalOT1Hours} 小時`);
console.log(`總第二階段加班時數(${constants.OT2_MULTIPLIER}倍): ${totalOT2Hours} 小時`);
console.log('');

// 方法1: 整月匯總後計算加班費 (不夠準確的方法)
function calculateMonthlyOvertimeMethod1() {
  const { baseHourlyRate, ot1Multiplier, ot2Multiplier } = settings;
  
  // 計算精確時薪
  const ot1HourlyRate = baseHourlyRate * ot1Multiplier;
  const ot2HourlyRate = baseHourlyRate * ot2Multiplier;
  
  // 將月總時數乘以時薪
  const ot1Pay = ot1HourlyRate * totalOT1Hours;
  const ot2Pay = ot2HourlyRate * totalOT2Hours;
  
  // 四捨五入後加總
  const roundedOt1Pay = Math.round(ot1Pay);
  const roundedOt2Pay = Math.round(ot2Pay);
  const totalOvertimePay = roundedOt1Pay + roundedOt2Pay;
  
  return {
    ot1Pay,
    ot2Pay,
    roundedOt1Pay,
    roundedOt2Pay,
    totalOvertimePay
  };
}

// 方法2: 每日單獨計算加班費後加總 (正確的會計方法)
function calculateMonthlyOvertimeMethod2() {
  const { baseHourlyRate, ot1Multiplier, ot2Multiplier } = settings;
  
  // 計算精確時薪
  const ot1HourlyRate = baseHourlyRate * ot1Multiplier;
  const ot2HourlyRate = baseHourlyRate * ot2Multiplier;
  
  let dailyPayments = [];
  let totalOvertimePay = 0;
  
  // 逐日計算
  for (const record of dailyRecords) {
    // 當日各階段加班費
    const dailyOt1Pay = ot1HourlyRate * record.ot1Hours;
    const dailyOt2Pay = ot2HourlyRate * record.ot2Hours;
    
    // 將各階段加班費四捨五入為整數
    const roundedDailyOt1Pay = Math.round(dailyOt1Pay);
    const roundedDailyOt2Pay = Math.round(dailyOt2Pay);
    
    // 當日總加班費
    const dailyTotal = roundedDailyOt1Pay + roundedDailyOt2Pay;
    totalOvertimePay += dailyTotal;
    
    dailyPayments.push({
      date: record.date,
      ot1Hours: record.ot1Hours,
      ot2Hours: record.ot2Hours,
      dailyOt1Pay,
      dailyOt2Pay,
      roundedDailyOt1Pay,
      roundedDailyOt2Pay,
      dailyTotal
    });
  }
  
  return {
    dailyPayments,
    totalOvertimePay
  };
}

// 執行計算並比較結果
const monthlyResult = calculateMonthlyOvertimeMethod1();
const dailyResult = calculateMonthlyOvertimeMethod2();

console.log('=== 方法1: 整月匯總後計算加班費 ===');
console.log(`${constants.OT1_MULTIPLIER}倍時薪: ${settings.baseHourlyRate} * ${settings.ot1Multiplier} = ${settings.baseHourlyRate * settings.ot1Multiplier}`);
console.log(`${constants.OT2_MULTIPLIER}倍時薪: ${settings.baseHourlyRate} * ${settings.ot2Multiplier} = ${settings.baseHourlyRate * settings.ot2Multiplier}`);
console.log(`第一階段加班費(未四捨五入): ${monthlyResult.ot1Pay.toFixed(2)}`);
console.log(`第二階段加班費(未四捨五入): ${monthlyResult.ot2Pay.toFixed(2)}`);
console.log(`第一階段加班費(四捨五入): ${monthlyResult.roundedOt1Pay}`);
console.log(`第二階段加班費(四捨五入): ${monthlyResult.roundedOt2Pay}`);
console.log(`總加班費: ${monthlyResult.totalOvertimePay}`);
console.log('');

console.log('=== 方法2: 每日單獨計算加班費後加總 (正確方法) ===');
console.log('每日詳細計算:');
dailyResult.dailyPayments.forEach(payment => {
  console.log(`${payment.date}: 加班${payment.ot1Hours}小時(${constants.OT1_MULTIPLIER}倍) + ${payment.ot2Hours}小時(${constants.OT2_MULTIPLIER}倍) = ${payment.roundedDailyOt1Pay} + ${payment.roundedDailyOt2Pay} = ${payment.dailyTotal}元`);
});
console.log(`總加班費: ${dailyResult.totalOvertimePay}`);
console.log('');

console.log('=== 兩種方法比較 ===');
console.log(`方法1 (整月計算): ${monthlyResult.totalOvertimePay}元`);
console.log(`方法2 (每日計算): ${dailyResult.totalOvertimePay}元`);
console.log(`差額: ${dailyResult.totalOvertimePay - monthlyResult.totalOvertimePay}元`);
console.log(`結論: 正確的會計方法是每日單獨計算加班費後加總，這與整月匯總計算相比${dailyResult.totalOvertimePay > monthlyResult.totalOvertimePay ? '通常會有些微增加' : '在某些情況下可能會有些微減少'}。`);