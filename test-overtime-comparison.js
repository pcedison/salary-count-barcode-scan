/**
 * 測試6/2和6/11的加班計算差異
 * 比較不同計算方法的結果
 */

// 測試案例
const testCases = [
  {
    date: '6/2',
    clockIn: '07:36',
    clockOut: '18:15'
  },
  {
    date: '6/11', 
    clockIn: '07:40',
    clockOut: '19:08'
  }
];

// 時間轉換函數
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// 舊版計算方法：總工作時間超過8小時
function calculateOvertimeOld(clockIn, clockOut) {
  const STANDARD_HOURS = 8;
  
  const inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  
  let totalMinutes = outTime - inTime;
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  
  const totalHours = totalMinutes / 60;
  
  let ot1 = 0;
  let ot2 = 0;
  
  if (totalHours > STANDARD_HOURS) {
    const totalOTHours = totalHours - STANDARD_HOURS;
    
    if (totalOTHours <= 2) {
      ot1 = totalOTHours;
    } else {
      ot1 = 2;
      ot2 = totalOTHours - 2;
    }
  }
  
  return { ot1, ot2, totalHours };
}

// 新版計算方法：時間段計算
function calculateOvertimeNew(clockIn, clockOut) {
  const inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  
  const STANDARD_END = timeToMinutes('16:00'); // 960分鐘
  const OT1_END = timeToMinutes('18:00'); // 1080分鐘
  const OT2_END = timeToMinutes('20:00'); // 1200分鐘
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = 7;
  
  // OT1 計算 (16:00 - 18:00)
  if (outTime > STANDARD_END + bufferMinutes) {
    const ot1Duration = Math.min(outTime, OT1_END) - STANDARD_END;
    if (ot1Duration > (1*60 + 30 + bufferMinutes)) ot1 = 2.0;
    else if (ot1Duration > (1*60 + bufferMinutes)) ot1 = 1.5;
    else if (ot1Duration > (0*60 + 30 + bufferMinutes)) ot1 = 1.0;
    else if (ot1Duration > (0*60 + bufferMinutes)) ot1 = 0.5;
  }
  
  // OT2 計算 (18:00後)
  if (outTime > OT1_END + bufferMinutes) {
    const ot2Range1Duration = Math.max(0, Math.min(outTime, OT2_END) - OT1_END);
    if (ot2Range1Duration > (1*60 + 30 + bufferMinutes)) ot2 += 2.0;
    else if (ot2Range1Duration > (1*60 + bufferMinutes)) ot2 += 1.5;
    else if (ot2Range1Duration > (0*60 + 30 + bufferMinutes)) ot2 += 1.0;
    else if (ot2Range1Duration > (0*60 + bufferMinutes)) ot2 += 0.5;
    
    // 20:00後的時間
    if (outTime > OT2_END + bufferMinutes) {
      const ot2Range2Duration = outTime - OT2_END;
      let additionalOt2 = 0;
      if (ot2Range2Duration > bufferMinutes) {
        additionalOt2 = Math.floor((ot2Range2Duration - bufferMinutes) / 30) * 0.5;
        if (((ot2Range2Duration - bufferMinutes) % 30) > 0) {
          additionalOt2 += 0.5;
        }
      }
      ot2 += additionalOt2;
    }
  }
  
  ot1 = Math.min(ot1, 2.0);
  
  const totalMinutes = outTime - inTime;
  const totalHours = totalMinutes / 60;
  
  return { ot1, ot2, totalHours };
}

// 執行測試
console.log('=== 加班計算方法比較 ===\n');

testCases.forEach(testCase => {
  console.log(`${testCase.date} (${testCase.clockIn} - ${testCase.clockOut})`);
  
  const oldResult = calculateOvertimeOld(testCase.clockIn, testCase.clockOut);
  const newResult = calculateOvertimeNew(testCase.clockIn, testCase.clockOut);
  
  console.log(`  總工作時間: ${oldResult.totalHours.toFixed(1)}小時`);
  console.log(`  舊版方法: OT1=${oldResult.ot1.toFixed(1)}h, OT2=${oldResult.ot2.toFixed(1)}h`);
  console.log(`  新版方法: OT1=${newResult.ot1.toFixed(1)}h, OT2=${newResult.ot2.toFixed(1)}h`);
  
  if (oldResult.ot1 !== newResult.ot1 || oldResult.ot2 !== newResult.ot2) {
    console.log(`  ⚠️  計算結果不同！`);
  } else {
    console.log(`  ✅ 計算結果相同`);
  }
  console.log('');
});

// 計算加班費差異
const BASE_HOURLY_RATE = 119;
const OT1_MULTIPLIER = 1.34;
const OT2_MULTIPLIER = 1.67;

console.log('=== 加班費計算差異 ===\n');

testCases.forEach(testCase => {
  const oldResult = calculateOvertimeOld(testCase.clockIn, testCase.clockOut);
  const newResult = calculateOvertimeNew(testCase.clockIn, testCase.clockOut);
  
  const oldPay = (oldResult.ot1 * BASE_HOURLY_RATE * OT1_MULTIPLIER) + 
                 (oldResult.ot2 * BASE_HOURLY_RATE * OT2_MULTIPLIER);
  const newPay = (newResult.ot1 * BASE_HOURLY_RATE * OT1_MULTIPLIER) + 
                 (newResult.ot2 * BASE_HOURLY_RATE * OT2_MULTIPLIER);
  
  console.log(`${testCase.date}:`);
  console.log(`  舊版加班費: ${Math.round(oldPay)}元`);
  console.log(`  新版加班費: ${Math.round(newPay)}元`);
  console.log(`  差異: ${Math.round(newPay - oldPay)}元\n`);
});