/**
 * 測試修正後的加班計算邏輯
 * 根據最終要求驗證
 */

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 修正後的加班計算邏輯
 * 1. 早到從8:00開始記薪
 * 2. 10分鐘緩衝
 * 3. 階梯：10→40→70→100分鐘
 * 4. 18:00後全部1.67倍
 */
function calculateOvertimeCorrected(clockIn, clockOut) {
  if (!clockIn || !clockOut) return { ot1: 0, ot2: 0 };
  
  let inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  
  // 1. 早到處理：如果早於8:00上班，從8:00開始記薪
  const WORK_START = timeToMinutes('08:00'); // 480分鐘
  if (inTime < WORK_START) {
    inTime = WORK_START;
  }
  
  const STANDARD_END = timeToMinutes('16:00'); // 正常下班時間 16:00
  const OT1_END = timeToMinutes('18:00');     // 第一階段加班結束 18:00
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = 10; // 10分鐘緩衝時間
  
  // 2. 16:00後才開始計算加班
  if (outTime > STANDARD_END + bufferMinutes) {
    const totalOvertimeMinutes = outTime - STANDARD_END;
    
    // 3. 階梯式計算OT1：10→40→70→100分鐘
    if (totalOvertimeMinutes <= (120 + bufferMinutes)) { // 不超過18:00
      // 全部算OT1 (1.34倍)
      if (totalOvertimeMinutes > (100 + bufferMinutes)) {
        ot1 = 2.0; // 超過100分鐘 -> 2.0小時
      } else if (totalOvertimeMinutes > (70 + bufferMinutes)) {
        ot1 = 1.5; // 超過70分鐘 -> 1.5小時
      } else if (totalOvertimeMinutes > (40 + bufferMinutes)) {
        ot1 = 1.0; // 超過40分鐘 -> 1.0小時
      } else if (totalOvertimeMinutes > (10 + bufferMinutes)) {
        ot1 = 0.5; // 超過10分鐘 -> 0.5小時
      }
    } else {
      // 4. 超過18:00：前2小時算OT1，18:00後全部算OT2 (1.67倍)
      ot1 = 2.0; // 16:00-18:00固定2小時OT1
      const ot2Minutes = totalOvertimeMinutes - 120; // 18:00後的分鐘數
      ot2 = ot2Minutes / 60; // 18:00後全部按實際時間計算，使用1.67倍
    }
  }
  
  return { ot1, ot2, totalWorkMinutes: outTime - inTime };
}

// 測試案例
const testCases = [
  {
    desc: '早到測試 (07:30-16:15)',
    clockIn: '07:30',
    clockOut: '16:15'
  },
  {
    desc: '6/2案例 (07:36-18:15)',
    clockIn: '07:36',
    clockOut: '18:15'
  },
  {
    desc: '6/11案例 (07:40-19:08)',
    clockIn: '07:40',
    clockOut: '19:08'
  },
  {
    desc: '正好18:00下班',
    clockIn: '08:00',
    clockOut: '18:00'
  },
  {
    desc: '21:00下班 (OT2超過2小時)',
    clockIn: '08:00',
    clockOut: '21:00'
  },
  {
    desc: '階梯測試-16:50 (40分鐘)',
    clockIn: '08:00',
    clockOut: '16:50'
  },
  {
    desc: '階梯測試-17:20 (80分鐘)',
    clockIn: '08:00',
    clockOut: '17:20'
  }
];

console.log('=== 修正後的加班計算邏輯測試 ===\n');

testCases.forEach(testCase => {
  const result = calculateOvertimeCorrected(testCase.clockIn, testCase.clockOut);
  const totalHours = result.totalWorkMinutes / 60;
  
  console.log(`${testCase.desc}`);
  console.log(`  時間: ${testCase.clockIn} - ${testCase.clockOut}`);
  console.log(`  實際工作時間: ${totalHours.toFixed(1)}小時 (從8:00開始)`);
  console.log(`  加班時數: OT1=${result.ot1.toFixed(1)}h (1.34倍), OT2=${result.ot2.toFixed(1)}h (1.67倍)`);
  
  // 計算加班費
  const BASE_HOURLY_RATE = 119;
  const OT1_MULTIPLIER = 1.34;
  const OT2_MULTIPLIER = 1.67;
  
  const ot1Pay = result.ot1 * BASE_HOURLY_RATE * OT1_MULTIPLIER;
  const ot2Pay = result.ot2 * BASE_HOURLY_RATE * OT2_MULTIPLIER;
  const totalPay = Math.round(ot1Pay + ot2Pay);
  
  console.log(`  加班費: ${Math.round(ot1Pay)}元 + ${Math.round(ot2Pay)}元 = ${totalPay}元`);
  console.log('');
});

console.log('=== 特殊說明 ===');
console.log('✅ 早到從8:00開始記薪');
console.log('✅ 10分鐘緩衝時間');
console.log('✅ 階梯: 10→40→70→100分鐘');
console.log('✅ 18:00後全部使用1.67倍 (不限2小時)');
console.log('✅ OT2超過2小時的部分也是1.67倍');