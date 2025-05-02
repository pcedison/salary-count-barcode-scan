/**
 * 測試計算加班費 - 根據指定的時數和時薪
 */

// 導入共享常量
import { constants } from './shared/constants.js';

// 基本時薪
const baseHourlyRate = constants.BASE_HOURLY_RATE;

// 加班倍率
const ot1Multiplier = constants.OT1_MULTIPLIER;  // 134% 加班費率
const ot2Multiplier = constants.OT2_MULTIPLIER;  // 167% 加班費率

// 指定加班時數
const totalOT1Hours = 40;
const totalOT2Hours = 15;

// 計算方法1: 總時數相乘再四捨五入
function calculateOvertimeMethodTotal() {
  // 計算精確時薪
  const ot1HourlyRate = baseHourlyRate * ot1Multiplier;
  const ot2HourlyRate = baseHourlyRate * ot2Multiplier;
  
  // 計算各階段加班費
  const ot1Pay = ot1HourlyRate * totalOT1Hours;
  const ot2Pay = ot2HourlyRate * totalOT2Hours;
  
  // 將各階段加班費四捨五入為整數
  const roundedOt1Pay = Math.round(ot1Pay);
  const roundedOt2Pay = Math.round(ot2Pay);
  
  // 返回總加班費
  return {
    ot1: roundedOt1Pay,
    ot2: roundedOt2Pay,
    total: roundedOt1Pay + roundedOt2Pay
  };
}

// 計算方法2: 每日單獨計算再總和
// 假設一共20天，每天加班時數平均
function calculateOvertimeMethodDaily() {
  // 假設工作天數和每日加班時數
  const workDays = 20;
  const dailyOT1Hours = totalOT1Hours / workDays;
  const dailyOT2Hours = totalOT2Hours / workDays;
  
  let totalOT1Pay = 0;
  let totalOT2Pay = 0;
  
  // 計算每日加班費並累計
  for (let i = 0; i < workDays; i++) {
    // 計算當日加班費
    const dailyOT1Pay = baseHourlyRate * ot1Multiplier * dailyOT1Hours;
    const dailyOT2Pay = baseHourlyRate * ot2Multiplier * dailyOT2Hours;
    
    // 將當日加班費四捨五入為整數後累計
    totalOT1Pay += Math.round(dailyOT1Pay);
    totalOT2Pay += Math.round(dailyOT2Pay);
  }
  
  return {
    ot1: totalOT1Pay,
    ot2: totalOT2Pay,
    total: totalOT1Pay + totalOT2Pay
  };
}

// 執行計算並輸出結果
const methodTotalResult = calculateOvertimeMethodTotal();
const methodDailyResult = calculateOvertimeMethodDaily();

console.log('方法1 (總時數相乘再四捨五入):');
console.log(`- 第一階段 (${totalOT1Hours}小時 × ${baseHourlyRate} × ${ot1Multiplier}): ${methodTotalResult.ot1} 元`);
console.log(`- 第二階段 (${totalOT2Hours}小時 × ${baseHourlyRate} × ${ot2Multiplier}): ${methodTotalResult.ot2} 元`);
console.log(`- 總計: ${methodTotalResult.total} 元`);

console.log('\n方法2 (每日單獨計算再總和):');
console.log(`- 第一階段 (每日平均 ${totalOT1Hours/20} 小時): ${methodDailyResult.ot1} 元`);
console.log(`- 第二階段 (每日平均 ${totalOT2Hours/20} 小時): ${methodDailyResult.ot2} 元`);
console.log(`- 總計: ${methodDailyResult.total} 元`);

// 計算與截圖中9365元的差額
console.log(`\n與截圖中9365元的差額:`);
console.log(`- 方法1差額: ${9365 - methodTotalResult.total} 元`);
console.log(`- 方法2差額: ${9365 - methodDailyResult.total} 元`);