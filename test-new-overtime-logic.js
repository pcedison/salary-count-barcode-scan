/**
 * 測試新的加班計算邏輯
 * 根據您提出的正確觀念進行驗證
 */

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 新的加班計算邏輯（按照您的要求）
 */
function calculateOvertimeCorrect(clockIn, clockOut) {
  if (!clockIn || !clockOut) return { ot1: 0, ot2: 0 };
  
  let inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  
  // 1. 早到處理：如果早於8:00上班，從8:00開始記薪
  const WORK_START = timeToMinutes('08:00'); // 480分鐘
  if (inTime < WORK_START) {
    inTime = WORK_START;
  }
  
  // 2. 正常下班時間16:00
  const STANDARD_END = timeToMinutes('16:00'); // 960分鐘
  const OT1_END = timeToMinutes('18:00'); // 1080分鐘
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = 10; // 使用10分鐘緩衝
  
  // 3. 16:00後才開始計算加班
  if (outTime > STANDARD_END + bufferMinutes) {
    const totalOvertimeMinutes = outTime - STANDARD_END;
    
    // 階梯式計算：10分鐘 → 40分鐘 → 70分鐘 → 100分鐘
    if (totalOvertimeMinutes > (100 + bufferMinutes)) {
      // 超過100分鐘：前2小時按正常加班，後續全部1.67倍
      ot1 = 2.0; // 前2小時 (16:00-18:00)
      const extraMinutes = totalOvertimeMinutes - 120; // 超過18:00的時間
      ot2 = extraMinutes / 60; // 全部按1.67倍計算
    } else if (totalOvertimeMinutes > (70 + bufferMinutes)) {
      ot1 = 2.0; // 1.5小時
    } else if (totalOvertimeMinutes > (40 + bufferMinutes)) {
      ot1 = 1.5; // 1.5小時
    } else if (totalOvertimeMinutes > (10 + bufferMinutes)) {
      ot1 = 1.0; // 1.0小時
    } else if (totalOvertimeMinutes > bufferMinutes) {
      ot1 = 0.5; // 0.5小時
    }
  }
  
  return { ot1, ot2, totalWorkMinutes: outTime - inTime };
}

// 測試案例
const testCases = [
  {
    desc: '早到案例',
    clockIn: '07:30',
    clockOut: '16:10'
  },
  {
    desc: '正常上班',
    clockIn: '08:00',
    clockOut: '16:15'
  },
  {
    desc: '6/2案例',
    clockIn: '07:36',
    clockOut: '18:15'
  },
  {
    desc: '6/11案例',
    clockIn: '07:40',
    clockOut: '19:08'
  },
  {
    desc: '超過100分鐘加班',
    clockIn: '08:00',
    clockOut: '18:30'
  }
];

console.log('=== 新的加班計算邏輯測試 ===\n');

testCases.forEach(testCase => {
  const result = calculateOvertimeCorrect(testCase.clockIn, testCase.clockOut);
  const totalHours = result.totalWorkMinutes / 60;
  
  console.log(`${testCase.desc}: ${testCase.clockIn} - ${testCase.clockOut}`);
  console.log(`  實際工作時間: ${totalHours.toFixed(1)}小時 (從8:00開始計算)`);
  console.log(`  加班時數: OT1=${result.ot1.toFixed(1)}h, OT2=${result.ot2.toFixed(1)}h`);
  
  // 計算加班費
  const BASE_HOURLY_RATE = 119;
  const OT1_MULTIPLIER = 1.34;
  const OT2_MULTIPLIER = 1.67;
  
  const ot1Pay = result.ot1 * BASE_HOURLY_RATE * OT1_MULTIPLIER;
  const ot2Pay = result.ot2 * BASE_HOURLY_RATE * OT2_MULTIPLIER;
  const totalPay = Math.round(ot1Pay + ot2Pay);
  
  console.log(`  加班費: OT1=${Math.round(ot1Pay)}元 + OT2=${Math.round(ot2Pay)}元 = ${totalPay}元`);
  console.log('');
});