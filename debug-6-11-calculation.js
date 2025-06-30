/**
 * 調試6/11的加班計算問題
 * 分析為何會計算成3.5小時
 */

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function debugCalculation(clockIn, clockOut) {
  console.log(`=== 調試 ${clockIn} - ${clockOut} ===`);
  
  let inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  
  console.log(`原始上班時間: ${clockIn} (${inTime}分鐘)`);
  console.log(`下班時間: ${clockOut} (${outTime}分鐘)`);
  
  // 早到處理
  const WORK_START = timeToMinutes('08:00'); // 480分鐘
  if (inTime < WORK_START) {
    console.log(`早到處理: ${clockIn} → 08:00 (從${inTime}分鐘 → ${WORK_START}分鐘)`);
    inTime = WORK_START;
  }
  
  const STANDARD_END = timeToMinutes('16:00'); // 960分鐘
  const OT1_END = timeToMinutes('18:00'); // 1080分鐘
  
  console.log(`正常下班時間: 16:00 (${STANDARD_END}分鐘)`);
  console.log(`OT1結束時間: 18:00 (${OT1_END}分鐘)`);
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = 10;
  
  console.log(`緩衝時間: ${bufferMinutes}分鐘`);
  
  // 檢查是否超過16:00
  if (outTime > STANDARD_END + bufferMinutes) {
    const totalOvertimeMinutes = outTime - STANDARD_END;
    console.log(`總加班分鐘數: ${outTime} - ${STANDARD_END} = ${totalOvertimeMinutes}分鐘 (${(totalOvertimeMinutes/60).toFixed(2)}小時)`);
    
    // 檢查是否超過18:00
    const ot1EndWithBuffer = 120 + bufferMinutes; // 18:00 + 緩衝
    console.log(`18:00+緩衝 = ${ot1EndWithBuffer}分鐘`);
    
    if (totalOvertimeMinutes <= ot1EndWithBuffer) {
      console.log('不超過18:00，全部算OT1');
      
      // 階梯計算
      if (totalOvertimeMinutes > (100 + bufferMinutes)) {
        ot1 = 2.0;
        console.log(`超過${100 + bufferMinutes}分鐘 → OT1 = 2.0小時`);
      } else if (totalOvertimeMinutes > (70 + bufferMinutes)) {
        ot1 = 1.5;
        console.log(`超過${70 + bufferMinutes}分鐘 → OT1 = 1.5小時`);
      } else if (totalOvertimeMinutes > (40 + bufferMinutes)) {
        ot1 = 1.0;
        console.log(`超過${40 + bufferMinutes}分鐘 → OT1 = 1.0小時`);
      } else if (totalOvertimeMinutes > (10 + bufferMinutes)) {
        ot1 = 0.5;
        console.log(`超過${10 + bufferMinutes}分鐘 → OT1 = 0.5小時`);
      } else {
        console.log(`未超過${10 + bufferMinutes}分鐘 → 無加班`);
      }
    } else {
      console.log('超過18:00，分別計算OT1和OT2');
      ot1 = 2.0;
      const ot2Minutes = totalOvertimeMinutes - 120;
      ot2 = ot2Minutes / 60;
      console.log(`OT1: 16:00-18:00 = 2.0小時`);
      console.log(`OT2: 18:00後 ${ot2Minutes}分鐘 = ${ot2.toFixed(2)}小時`);
    }
  } else {
    console.log('未超過16:00+緩衝，無加班');
  }
  
  console.log(`最終結果: OT1=${ot1.toFixed(1)}h, OT2=${ot2.toFixed(1)}h`);
  console.log(`總加班時數: ${(ot1 + ot2).toFixed(1)}h`);
  
  return { ot1, ot2 };
}

// 測試6/11案例
console.log('6/11案例分析：');
debugCalculation('07:40', '19:08');

console.log('\n手動驗證：');
console.log('07:40上班 → 從08:00開始記薪');
console.log('19:08下班');
console.log('16:00-18:00: 2小時 (OT1)');
console.log('18:00-19:08: 1小時8分鐘 = 68分鐘 = 1.133小時 (OT2)');
console.log('總計: 2 + 1.133 = 3.133小時');
console.log('');
console.log('實際計算應該是約3.1小時，不是3.5小時');