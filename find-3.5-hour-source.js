/**
 * 尋找3.5小時計算的來源
 * 檢查不同計算方法
 */

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// 總工作時間方法（可能的舊版本）
function calculateOvertimeByTotalHours(clockIn, clockOut) {
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
  
  return { ot1, ot2, totalHours, method: '總工作時間法' };
}

// 舊版時間段方法（7分鐘緩衝）
function calculateOvertimeOldTimeSegment(clockIn, clockOut) {
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
  
  return { ot1, ot2, method: '舊版時間段法(7分鐘緩衝)' };
}

// 新版方法
function calculateOvertimeNew(clockIn, clockOut) {
  let inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  
  const WORK_START = timeToMinutes('08:00');
  if (inTime < WORK_START) {
    inTime = WORK_START;
  }
  
  const STANDARD_END = timeToMinutes('16:00');
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = 10;
  
  if (outTime > STANDARD_END + bufferMinutes) {
    const totalOvertimeMinutes = outTime - STANDARD_END;
    
    if (totalOvertimeMinutes <= (120 + bufferMinutes)) {
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
      ot1 = 2.0;
      const ot2Minutes = totalOvertimeMinutes - 120;
      ot2 = ot2Minutes / 60;
    }
  }
  
  return { ot1, ot2, method: '新版方法(10分鐘緩衝)' };
}

console.log('=== 6/11 (07:40-19:08) 各種計算方法比較 ===\n');

const methods = [
  calculateOvertimeByTotalHours,
  calculateOvertimeOldTimeSegment,
  calculateOvertimeNew
];

methods.forEach(method => {
  const result = method('07:40', '19:08');
  const total = result.ot1 + result.ot2;
  console.log(`${result.method}:`);
  console.log(`  OT1: ${result.ot1.toFixed(1)}h, OT2: ${result.ot2.toFixed(1)}h`);
  console.log(`  總計: ${total.toFixed(1)}h`);
  if (result.totalHours) {
    console.log(`  總工作時間: ${result.totalHours.toFixed(1)}h`);
  }
  
  if (Math.abs(total - 3.5) < 0.1) {
    console.log(`  ⭐ 這個方法得到3.5小時！`);
  }
  console.log('');
});

console.log('分析：如果系統顯示3.5小時，可能還在使用總工作時間法');
console.log('07:40-19:08 總工作11.47小時，減去8小時 = 3.47小時 ≈ 3.5小時');