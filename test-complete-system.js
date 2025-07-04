/**
 * 完整系統測試 - 比較修正前後的差異
 */

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// 舊版計算方法（7分鐘緩衝，時間段方法）
function calculateOvertimeOld(clockIn, clockOut) {
  const inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  const STANDARD_END = timeToMinutes('16:00');
  const OT1_END = timeToMinutes('18:00');
  const OT2_END = timeToMinutes('20:00');
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = 7; // 舊版7分鐘緩衝
  
  // OT1 計算 (16:00 - 18:00)
  if (outTime > STANDARD_END + bufferMinutes) {
    const ot1Duration = Math.min(outTime, OT1_END) - STANDARD_END;
    if (ot1Duration > (1*60 + 30 + bufferMinutes)) ot1 = 2.0;
    else if (ot1Duration > (1*60 + bufferMinutes)) ot1 = 1.5;
    else if (ot1Duration > (0*60 + 30 + bufferMinutes)) ot1 = 1.0;
    else if (ot1Duration > (0*60 + bufferMinutes)) ot1 = 0.5;
  }
  
  // OT2 計算
  if (outTime > OT1_END + bufferMinutes) {
    const ot2Range1Duration = Math.max(0, Math.min(outTime, OT2_END) - OT1_END);
    if (ot2Range1Duration > (1*60 + 30 + bufferMinutes)) ot2 += 2.0;
    else if (ot2Range1Duration > (1*60 + bufferMinutes)) ot2 += 1.5;
    else if (ot2Range1Duration > (0*60 + 30 + bufferMinutes)) ot2 += 1.0;
    else if (ot2Range1Duration > (0*60 + bufferMinutes)) ot2 += 0.5;
    
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
  
  return { ot1, ot2, total: ot1 + ot2 };
}

// 新版計算方法（10分鐘緩衝，統一方法）
function calculateOvertimeNew(clockIn, clockOut) {
  let inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  
  // 1. 早到處理：如果早於8:00上班，從8:00開始記薪
  const WORK_START = timeToMinutes('08:00');
  if (inTime < WORK_START) {
    inTime = WORK_START;
  }
  
  const STANDARD_END = timeToMinutes('16:00');
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = 10;
  
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
  
  return { ot1, ot2, total: ot1 + ot2 };
}

console.log('=== 完整系統測試：修正前後比較 ===\n');

const testCases = [
  { name: '6/2', clockIn: '07:36', clockOut: '18:15' },
  { name: '6/11', clockIn: '07:40', clockOut: '19:08' },
  { name: '6/3', clockIn: '08:00', clockOut: '16:30' },
  { name: '6/4', clockIn: '07:50', clockOut: '17:00' },
  { name: '6/5', clockIn: '08:10', clockOut: '20:30' }
];

testCases.forEach(testCase => {
  const oldResult = calculateOvertimeOld(testCase.clockIn, testCase.clockOut);
  const newResult = calculateOvertimeNew(testCase.clockIn, testCase.clockOut);
  
  console.log(`${testCase.name} (${testCase.clockIn}-${testCase.clockOut}):`);
  console.log(`  舊版: OT1=${oldResult.ot1.toFixed(1)}h, OT2=${oldResult.ot2.toFixed(1)}h, 總計=${oldResult.total.toFixed(1)}h`);
  console.log(`  新版: OT1=${newResult.ot1.toFixed(1)}h, OT2=${newResult.ot2.toFixed(1)}h, 總計=${newResult.total.toFixed(1)}h`);
  
  const diff = newResult.total - oldResult.total;
  if (Math.abs(diff) > 0.01) {
    console.log(`  差異: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}h`);
  } else {
    console.log(`  ✓ 相同`);
  }
  console.log('');
});

console.log('=== 重點驗證 ===');
console.log('如果6/11的新版計算是3.1小時而不是3.5小時，那麼修正成功！');
const case6_11_new = calculateOvertimeNew('07:40', '19:08');
if (Math.abs(case6_11_new.total - 3.1) < 0.1) {
  console.log('✅ 6/11計算正確: 3.1小時');
} else if (Math.abs(case6_11_new.total - 3.5) < 0.1) {
  console.log('❌ 6/11仍顯示3.5小時，可能有其他地方未修正');
} else {
  console.log(`⚠️  6/11計算結果: ${case6_11_new.total.toFixed(1)}小時`);
}