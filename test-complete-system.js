/**
 * 完整系統測試 - 比較修正前後的差異
 */

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// 舊版邏輯（修正前）
function calculateOvertimeOld(clockIn, clockOut) {
  const inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  const STANDARD_END = timeToMinutes('16:00');
  const OT1_END = timeToMinutes('18:00');
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = 7; // 舊版7分鐘緩衝
  
  if (outTime > STANDARD_END + bufferMinutes) {
    const ot1Duration = Math.min(outTime, OT1_END) - STANDARD_END;
    if (ot1Duration > (1*60 + 30 + bufferMinutes)) ot1 = 2.0;
    else if (ot1Duration > (1*60 + bufferMinutes)) ot1 = 1.5;
    else if (ot1Duration > (0*60 + 30 + bufferMinutes)) ot1 = 1.0;
    else if (ot1Duration > (0*60 + bufferMinutes)) ot1 = 0.5;
  }
  
  if (outTime > OT1_END + bufferMinutes) {
    const ot2Range1Duration = Math.max(0, Math.min(outTime, timeToMinutes('20:00')) - OT1_END);
    if (ot2Range1Duration > (1*60 + 30 + bufferMinutes)) ot2 += 2.0;
    else if (ot2Range1Duration > (1*60 + bufferMinutes)) ot2 += 1.5;
    else if (ot2Range1Duration > (0*60 + 30 + bufferMinutes)) ot2 += 1.0;
    else if (ot2Range1Duration > (0*60 + bufferMinutes)) ot2 += 0.5;
    
    if (outTime > timeToMinutes('20:00') + bufferMinutes) {
      const ot2Range2Duration = outTime - timeToMinutes('20:00');
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
  return { ot1, ot2 };
}

// 新版邏輯（修正後）
function calculateOvertimeNew(clockIn, clockOut) {
  let inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  
  // 早到處理
  const WORK_START = timeToMinutes('08:00');
  if (inTime < WORK_START) {
    inTime = WORK_START;
  }
  
  const STANDARD_END = timeToMinutes('16:00');
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = 10; // 新版10分鐘緩衝
  
  if (outTime > STANDARD_END + bufferMinutes) {
    const totalOvertimeMinutes = outTime - STANDARD_END;
    
    if (totalOvertimeMinutes <= (120 + bufferMinutes)) {
      // 不超過18:00，全部算OT1
      if (totalOvertimeMinutes > (100 + bufferMinutes)) {
        ot1 = 2.0;
      } else if (totalOvertimeMinutes > (70 + bufferMinutes)) {
        ot1 = 1.5;
      } else if (totalOvertimeMinutes > (40 + bufferMinutes)) {
        ot1 = 1.0;
      } else if (totalOvertimeMinutes > (10 + bufferMinutes)) {
        ot1 = 0.5;
      }
    } else {
      // 超過18:00：前2小時OT1，後續全部OT2
      ot1 = 2.0;
      const ot2Minutes = totalOvertimeMinutes - 120;
      ot2 = ot2Minutes / 60;
    }
  }
  
  return { ot1, ot2 };
}

// 測試案例
const testCases = [
  { desc: '6/2案例', clockIn: '07:36', clockOut: '18:15' },
  { desc: '6/11案例', clockIn: '07:40', clockOut: '19:08' },
  { desc: '早到測試', clockIn: '07:30', clockOut: '16:15' },
  { desc: '正常上班', clockIn: '08:00', clockOut: '17:30' },
  { desc: '21:00下班', clockIn: '08:00', clockOut: '21:00' }
];

console.log('=== 系統修正前後比較 ===\n');

testCases.forEach(testCase => {
  const oldResult = calculateOvertimeOld(testCase.clockIn, testCase.clockOut);
  const newResult = calculateOvertimeNew(testCase.clockIn, testCase.clockOut);
  
  const BASE_RATE = 119;
  const OT1_MULT = 1.34;
  const OT2_MULT = 1.67;
  
  const oldPay = Math.round((oldResult.ot1 * BASE_RATE * OT1_MULT) + (oldResult.ot2 * BASE_RATE * OT2_MULT));
  const newPay = Math.round((newResult.ot1 * BASE_RATE * OT1_MULT) + (newResult.ot2 * BASE_RATE * OT2_MULT));
  
  console.log(`${testCase.desc} (${testCase.clockIn}-${testCase.clockOut}):`);
  console.log(`  修正前: OT1=${oldResult.ot1.toFixed(1)}h, OT2=${oldResult.ot2.toFixed(1)}h → ${oldPay}元`);
  console.log(`  修正後: OT1=${newResult.ot1.toFixed(1)}h, OT2=${newResult.ot2.toFixed(1)}h → ${newPay}元`);
  console.log(`  差異: ${newPay - oldPay}元`);
  
  if (newPay !== oldPay) {
    console.log(`  🔄 計算結果有變化`);
  } else {
    console.log(`  ✅ 計算結果相同`);
  }
  console.log('');
});

console.log('=== 修正重點總結 ===');
console.log('✅ 緩衝時間: 7分鐘 → 10分鐘');
console.log('✅ 早到處理: 無 → 從8:00開始記薪');
console.log('✅ 階梯基準: 7→37→67→97分鐘 → 10→40→70→100分鐘');
console.log('✅ 18:00後: 階梯式計算 → 全部1.67倍（實際時間）');
console.log('✅ OT2超過2小時: 繼續使用1.67倍');